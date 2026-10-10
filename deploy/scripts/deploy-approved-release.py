# Managed by Cenit automatic deployment
"""Rootless CD: immutable image, backup, migration, readiness, app/proxy recovery."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

from cd_release import approved_release
from cd_runtime import (STATE, QUADLET, MARKER, DeployError, atomic_write,
                        bootstrap_present, command, owned, private_file, sql)
from github_read import GitHubClient, GitHubReadError, read_token

APP_UNIT = QUADLET / 'cenit-app.container'
PROXY_CONFIG = STATE / 'nginx/default.conf'
PROXY_DEPENDENCY = QUADLET / 'cenit-nginx.container.d/20-cenit-app.conf'
CD = STATE / 'cd'
STATUS = CD / 'status.json'
CURRENT = CD / 'current.json'
ATTEMPT = CD / 'attempt.json'
HEALTH_JS = "fetch('http://127.0.0.1:3000/health/ready',{signal:AbortSignal.timeout(3000)}).then(async r=>process.exit(r.ok&&(await r.json()).status==='ready'?0:1)).catch(()=>process.exit(1))"


def write_status(state, **details):
    atomic_write(STATUS, json.dumps({'state': state, 'checkedAt': datetime.now(timezone.utc).isoformat(), **details}) + '\n')


def previous(path):
    return json.loads(private_file(path)) if path.exists() else None


def order(manifest):
    return manifest['runNumber'], manifest['workflowRunAttempt']


def should_deploy(manifest, current, attempt):
    if current and manifest['commit'] == current['commit']:
        return False
    if current and order(manifest) <= order(current):
        return False
    if attempt and order(manifest) <= order(attempt):
        raise DeployError('Esta entrega ya falló o fue interrumpida; publicar un nuevo intento validado.')
    return True


def verify_image(manifest):
    command(['podman', 'pull', '--authfile', str(STATE / 'registry/auth.json'), manifest['image']], timeout=300)
    info = json.loads(command(['podman', 'image', 'inspect', manifest['image']]))[0]
    labels = info.get('Labels') or {}
    if info.get('Architecture') != 'amd64' or info.get('Os') != 'linux':
        raise DeployError('Imagen incompatible con la VM.')
    if labels.get('org.opencontainers.image.revision') != manifest['commit'] or labels.get('org.opencontainers.image.source') != 'https://github.com/Menderin/Cenit':
        raise DeployError('Las etiquetas OCI no corresponden a la entrega.')


def backup_database(manifest):
    # Retain every backup. Stop on insufficient space rather than deleting another project's files.
    directory = CD / 'backups'
    directory.mkdir(mode=0o700, exist_ok=True)
    destination = directory / f"{manifest['workflowRunId']}-{manifest['workflowRunAttempt']}.dump"
    if destination.exists() or destination.is_symlink():
        raise DeployError('Ya existe el respaldo de este intento.')
    with destination.open('xb') as output:
        os.chmod(destination, 0o600)
        try:
            result = subprocess.run(['podman', 'exec', 'cenit-db', 'pg_dump', '-U', 'cenit_admin',
                                     '-d', 'cenit_demo', '--format=custom'], stdout=output,
                                    stderr=subprocess.DEVNULL, timeout=120)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise DeployError('No se pudo completar el respaldo.') from error
    if result.returncode or destination.stat().st_size == 0:
        raise DeployError('El respaldo falló; no se ejecutaron migraciones.')


def migrate(manifest):
    if command(['podman', 'ps', '-a', '--filter', 'name=^cenit-migrate$', '--format', '{{.Names}}']).strip():
        raise DeployError('Existe cenit-migrate; revisar la operación anterior antes de continuar.')
    with tempfile.TemporaryDirectory(prefix='cenit-migration-', dir=CD) as temporary:
        cidfile = Path(temporary) / 'container.id'
        try:
            command(['podman', 'run', '--rm', '--name', 'cenit-migrate', '--cidfile', str(cidfile),
             '--label', 'io.cenit.managed-by=automatic-deployment',
             '--pull=never', '--network', 'cenit-net', '--user', '1000:1000',
             '--cap-drop=all', '--security-opt=no-new-privileges', '--memory=512m', '--cpus=1',
             '--secret', 'cenit-migration-database-url,type=mount,target=database-url,uid=1000,gid=1000,mode=0400',
             '--env', 'NODE_ENV=production', '--env', 'APP_ENV=demo',
             '--env', 'DATABASE_URL_FILE=/run/secrets/database-url', '--entrypoint', 'node',
             manifest['image'], '/app/deploy/migrate.cjs'], timeout=180)
        finally:
            # Remove only the ID created by this run, never a name collision from another operation.
            if cidfile.is_file():
                container_id = cidfile.read_text(encoding='ascii').strip()
                if re.fullmatch(r'[0-9a-f]{64}', container_id):
                    subprocess.run(['podman', 'rm', '-f', '--ignore', container_id],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)


def wait_for_app():
    for _ in range(30):
        try:
            command(['podman', 'exec', 'cenit-app', 'node', '-e', HEALTH_JS], timeout=5)
            return
        except DeployError:
            time.sleep(2)
    raise DeployError('La aplicación no alcanzó readiness.')


def check_proxy():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(10):
        try:
            with opener.open('http://172.16.13.103:8081/health/ready', timeout=4) as response:
                ready = json.loads(response.read(4096))
                if response.status != 200 or ready != {'status': 'ready'}:
                    raise ValueError('readiness')
            for route in ('/', '/compras', '/academico'):
                with opener.open('http://172.16.13.103:8081' + route, timeout=4) as response:
                    if response.status != 200 or 'text/html' not in response.headers.get('Content-Type', ''):
                        raise ValueError('frontend')
            return
        except (OSError, ValueError):
            time.sleep(2)
    raise DeployError('Falló la verificación HTTP de la entrega.')


def restore(path, content):
    if content is None:
        if path.exists():
            if path.is_symlink():
                raise DeployError('No se puede recuperar un destino enlazado.')
            path.unlink()
    else:
        atomic_write(path, content)


def recover(snapshot):
    command(['systemctl', '--user', 'stop', 'cenit-app.service'])
    for path, content in snapshot.items():
        restore(path, content)
    command(['systemctl', '--user', 'daemon-reload'])
    if snapshot[APP_UNIT] is not None:
        command(['systemctl', '--user', 'restart', 'cenit-app.service'])
        wait_for_app()
    command(['systemctl', '--user', 'restart', 'cenit-nginx.service'])
    if snapshot[APP_UNIT] is not None:
        check_proxy()


def deploy(manifest, client, current):
    bootstrap_present()
    if APP_UNIT.exists():
        owned(APP_UNIT, MARKER)
        if not current:
            raise DeployError('Existe una aplicación sin registro de versión; revisar antes de sustituirla.')
    elif command(['podman', 'ps', '-a', '--filter', 'name=^cenit-app$', '--format', '{{.Names}}']).strip():
        raise DeployError('Existe un contenedor cenit-app ajeno al ejecutor.')
    if PROXY_DEPENDENCY.exists():
        owned(PROXY_DEPENDENCY, MARKER)
    if PROXY_CONFIG.is_symlink():
        raise DeployError('Configuración Nginx enlazada.')
    if current:
        comparison = client.get(f"/compare/{current['commit']}...{manifest['commit']}")
        if comparison.get('status') != 'ahead' or comparison.get('merge_base_commit', {}).get('sha') != current['commit']:
            raise DeployError('La entrega no avanza desde la versión instalada.')
    if shutil.disk_usage(STATE).free < 2 * 1024**3:
        raise DeployError('Quedan menos de 2 GiB libres; no se descargará otra imagen.')
    verify_image(manifest)
    if shutil.disk_usage(STATE).free < 1024**3:
        raise DeployError('Queda menos de 1 GiB libre después del pull; liberar espacio antes de migrar.')
    database_size = int(sql("SELECT pg_database_size('cenit_demo');"))
    if shutil.disk_usage(STATE).free < 2 * database_size + 512 * 1024**2:
        raise DeployError('No hay margen de disco para respaldar la base; no se ejecutarán migraciones.')
    snapshot = {p: p.read_text(encoding='utf-8') if p.exists() else None
                for p in (APP_UNIT, PROXY_CONFIG, PROXY_DEPENDENCY)}
    # Persist BEFORE migrations: interrupted/nonzero migrations must not be blindly retried.
    atomic_write(ATTEMPT, json.dumps(manifest) + '\n')
    backup_database(manifest)
    migrate(manifest)
    app_text = (CD / 'cenit-app.container.in').read_text(encoding='utf-8').replace('@APP_IMAGE@', manifest['image']).replace('@STATE_DIR@', str(STATE))
    try:
        atomic_write(APP_UNIT, app_text)
        command(['systemctl', '--user', 'daemon-reload'])
        command(['systemctl', '--user', 'restart', 'cenit-app.service'], timeout=200)
        wait_for_app()
        nginx_image = (STATE / 'images/nginx.ref').read_text(encoding='ascii').strip()
        if not re.fullmatch(r'(docker.io/)?library/nginx@sha256:[0-9a-f]{64}', nginx_image):
            raise DeployError('Imagen Nginx bootstrap inválida.')
        command(['podman', 'run', '--rm', '--pull=never', '--network', 'cenit-net',
                 '--memory=128m', '--cpus=0.5', '-v', str(CD / 'cenit.conf') + ':/etc/nginx/conf.d/default.conf:ro,Z',
                 nginx_image, 'nginx', '-t'])
        atomic_write(PROXY_CONFIG, (CD / 'cenit.conf').read_text(encoding='utf-8'))
        atomic_write(PROXY_DEPENDENCY, MARKER + '\n[Unit]\nRequires=cenit-app.service\nAfter=cenit-app.service\n')
        command(['systemctl', '--user', 'daemon-reload'])
        command(['systemctl', '--user', 'restart', 'cenit-nginx.service'], timeout=200)
        check_proxy()
    except (DeployError, OSError) as error:
        try:
            recover(snapshot)
        except (DeployError, OSError) as recovery_error:
            raise DeployError('Falló la entrega y su recuperación; revisar servicios Cenit. No se restauró la base.') from recovery_error
        raise DeployError('Entrega fallida; recuperados aplicación/proxy anteriores. No se restauró la base.') from error
    atomic_write(CURRENT, json.dumps(manifest) + '\n')


def main():
    import fcntl  # Linux only; importing the other helpers is safe in Windows tests.
    if os.getuid() == 0:
        raise DeployError('Ejecutar sin sudo.')
    CD.mkdir(mode=0o700, exist_ok=True)
    with (CD / 'deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        client = GitHubClient(read_token())
        manifest = approved_release(client)
        if manifest is None:
            write_status('waiting-for-release')
            print('Cenit: esperando una release aprobada; servicios actuales conservados.')
            return
        current = previous(CURRENT)
        if not should_deploy(manifest, current, previous(ATTEMPT)):
            write_status('up-to-date', commit=current['commit'])
            return
        write_status('deploying', commit=manifest['commit'])
        deploy(manifest, client, current)
        write_status('deployed', commit=manifest['commit'], image=manifest['image'])
        print('Cenit: entrega verificada y desplegada.')


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (DeployError, GitHubReadError) as error:
        write_status('failed', reason=str(error))
        print('ERROR:', str(error))
        raise SystemExit(1)
    except Exception:
        write_status('failed', reason='Error inesperado; revisar instalación y contrato de entrega.')
        print('ERROR: operación incompleta. Revisar status.json y servicios Cenit.')
        raise SystemExit(1)
