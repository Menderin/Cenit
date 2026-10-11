"""Generate local-only credentials without rotating existing PostgreSQL passwords."""
import os
from pathlib import Path
import re
import secrets
import shutil


def prepare(root):
    state = root / '.local'
    secret_dir = state / 'secrets'
    if state.is_symlink() or secret_dir.is_symlink():
        raise ValueError('Refusing symlinks for local private directories.')
    secret_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(state, 0o700)
    os.chmod(secret_dir, 0o700)
    values = {}
    for name in ('postgres-password', 'app-password', 'migrator-password'):
        path = secret_dir / name
        if path.is_symlink():
            raise ValueError('Refusing a symlink in local secrets.')
        if not path.exists():
            # 0644 allows the container UID to read a mounted file. Its host parent is private.
            with path.open('x', encoding='utf-8') as stream:
                stream.write(secrets.token_hex(32))
            os.chmod(path, 0o644)
        value = path.read_text(encoding='utf-8').strip()
        if not re.fullmatch(r'[0-9a-f]{64}', value):
            raise ValueError('Unexpected local credential format; no password was changed.')
        values[name] = value
    for name, role in (('app', 'cenit_app'), ('migrator', 'cenit_migrator')):
        url = f"postgresql://{role}:{values[name + '-password']}@db:5432/cenit_demo"
        path = secret_dir / (name + '-url')
        if path.is_symlink():
            raise ValueError('Refusing a symlink in local secrets.')
        path.write_text(url, encoding='utf-8')
        os.chmod(path, 0o644)
    env = root / '.env'
    if not env.exists():
        shutil.copyfile(root / '.env.example', env)


if __name__ == '__main__':
    prepare(Path(__file__).resolve().parents[2])
    print('Local configuration prepared. Credentials were not printed or rotated.')
