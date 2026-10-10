# Managed by Cenit automatic deployment
"""Fixed local operations. Never run commands obtained from a release body."""
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile

STATE = Path.home() / '.local/share/cenit'
QUADLET = Path.home() / '.config/containers/systemd'
MARKER = '# Managed by Cenit automatic deployment'
BOOTSTRAP_MARKER = '# Managed by Cenit bootstrap-vm.sh'


class DeployError(Exception):
    pass


def command(args, *, input=None, timeout=120):
    try:
        result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise DeployError('No se pudo completar ' + args[0] + '.') from error
    if result.returncode:
        # SQL and application output can contain credentials; never echo them.
        raise DeployError('Falló la operación: ' + args[0] + ' ' + args[1] + '.')
    return result.stdout


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise DeployError('Destino enlazado: revisar instalación.')
    descriptor, name = tempfile.mkstemp(prefix='.cenit-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def private_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise DeployError('Archivo privado inválido; comprobar propietario y permisos 600.')
    return path.read_text(encoding='utf-8')


def owned(path, marker):
    if path.is_symlink() or not path.is_file() or not path.read_text(encoding='utf-8').startswith(marker + '\n'):
        raise DeployError('Recurso no gestionado por Cenit: ' + path.name)


def bootstrap_present():
    for name in ('cenit-db.container', 'cenit-nginx.container', 'cenit.network'):
        owned(QUADLET / name, BOOTSTRAP_MARKER)
    private_file(STATE / 'registry/auth.json')
    command(['podman', 'exec', 'cenit-db', 'pg_isready', '-U', 'cenit_admin', '-d', 'cenit_demo'])


def validate_quadlet(template):
    """Compile a temporary unit without installing it, pulling an image or starting an app."""
    generator = '/usr/lib/systemd/system-generators/podman-system-generator'
    with tempfile.TemporaryDirectory(prefix='cenit-quadlet-') as directory:
        temporary = Path(directory)
        shutil_source = QUADLET / 'cenit.network'
        (temporary / 'cenit.network').write_text(shutil_source.read_text(encoding='utf-8'), encoding='utf-8')
        rendered = template.read_text(encoding='utf-8').replace('@APP_IMAGE@', 'ghcr.io/menderin/cenit@sha256:' + '0' * 64).replace('@STATE_DIR@', str(STATE))
        (temporary / 'cenit-app.container').write_text(rendered, encoding='utf-8')
        result = subprocess.run([generator, '--user', '--dryrun'], capture_output=True, text=True,
                                env={**os.environ, 'QUADLET_UNIT_DIRS': directory}, timeout=30)
        if result.returncode or 'cenit-app.service' not in result.stdout or 'ExecStart=' not in result.stdout:
            raise DeployError('El generador Quadlet rechazó el servicio de aplicación.')


def sql(statement):
    return command(['podman', 'exec', '-i', 'cenit-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                    '-U', 'cenit_admin', '-d', 'cenit_demo', '-At'], input=statement, timeout=60).strip()


def prepare_database():
    """Dedicated schema and roles. Re-running never rotates existing passwords."""
    bootstrap_present()
    owner_marker = 'Managed by Cenit automatic deployment'
    metadata = json.loads(sql("""SELECT json_build_object(
      'roles', coalesce((SELECT json_object_agg(rolname, shobj_description(oid,'pg_authid'))
        FROM pg_roles WHERE rolname IN ('cenit_app','cenit_migrator')), '{}'::json),
      'schema', (SELECT json_build_object('owner', pg_get_userbyid(nspowner),
        'comment', obj_description(oid,'pg_namespace')) FROM pg_namespace WHERE nspname='cenit'));
    """))
    for name in ('cenit_app', 'cenit_migrator'):
        if name in metadata['roles'] and metadata['roles'][name] != owner_marker:
            raise DeployError('Rol existente sin marcador Cenit: ' + name)
    schema = metadata['schema']
    if schema and (schema['owner'] != 'cenit_migrator' or schema['comment'] != owner_marker):
        raise DeployError('El esquema cenit pertenece a otra instalación.')
    statements = ['BEGIN;']
    passwords = {}
    for name in ('cenit_app', 'cenit_migrator'):
        path = STATE / 'secrets' / (name + '-password')
        if path.exists():
            password = private_file(path).strip()
            if not re.fullmatch(r'[0-9a-f]{64}', password):
                raise DeployError('Formato de contraseña local inválido.')
        else:
            if name in metadata['roles']:
                raise DeployError('Falta la contraseña de un rol existente; no se rotará automáticamente.')
            password = secrets.token_hex(32)
            atomic_write(path, password + '\n')
        passwords[name] = password
        if name not in metadata['roles']:
            statements += [f"CREATE ROLE {name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{password}';",
                           f"COMMENT ON ROLE {name} IS '{owner_marker}';"]
        statements += [f'ALTER ROLE {name} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;']
    if not schema:
        statements += ['CREATE SCHEMA cenit AUTHORIZATION cenit_migrator;',
                       f"COMMENT ON SCHEMA cenit IS '{owner_marker}';"]
    # This database is the dedicated, bootstrap-created demo database.
    statements += [
        'REVOKE ALL ON DATABASE cenit_demo FROM PUBLIC;',
        'GRANT CONNECT ON DATABASE cenit_demo TO cenit_app, cenit_migrator;',
        'REVOKE CREATE ON SCHEMA public FROM PUBLIC;',
        'GRANT USAGE ON SCHEMA cenit TO cenit_app;',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cenit TO cenit_app;',
        'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cenit TO cenit_app;',
        'ALTER DEFAULT PRIVILEGES FOR ROLE cenit_migrator IN SCHEMA cenit GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cenit_app;',
        'ALTER DEFAULT PRIVILEGES FOR ROLE cenit_migrator IN SCHEMA cenit GRANT USAGE, SELECT ON SEQUENCES TO cenit_app;',
        "ALTER ROLE cenit_app IN DATABASE cenit_demo SET search_path TO cenit, public;",
        "ALTER ROLE cenit_migrator IN DATABASE cenit_demo SET search_path TO cenit, public;",
        'COMMIT;',
    ]
    sql('\n'.join(statements))
    for role, secret_name in (('cenit_app', 'cenit-app-database-url'), ('cenit_migrator', 'cenit-migration-database-url')):
        listed = command(['podman', 'secret', 'ls', '--format', '{{.Name}}']).splitlines()
        if secret_name in listed:
            info = json.loads(command(['podman', 'secret', 'inspect', secret_name]))[0]
            if info.get('Spec', {}).get('Labels', {}).get('io.cenit.managed-by') != 'automatic-deployment':
                raise DeployError('Secreto existente no gestionado por este instalador.')
        command(['podman', 'secret', 'create', '--replace', '--label',
                 'io.cenit.managed-by=automatic-deployment', secret_name, '-'],
                input=f'postgresql://{role}:{passwords[role]}@cenit-db:5432/cenit_demo')


if __name__ == '__main__':
    try:
        if os.getuid() == 0:
            raise DeployError('Ejecutar sin sudo, bajo adminc.')
        if len(sys.argv) == 3 and sys.argv[1] == '--validate-quadlet':
            validate_quadlet(Path(sys.argv[2]))
            print('Quadlet de aplicación validado sin iniciar contenedores.')
        elif len(sys.argv) == 1:
            prepare_database()
            print('Roles limitados y secretos preparados. No se desplegó ninguna aplicación.')
        else:
            raise DeployError('Argumentos no reconocidos.')
    except (DeployError, OSError, ValueError):
        print('ERROR: preparación incompleta; revisar roles/secretos Cenit. No compartir credenciales.')
        raise SystemExit(1)
