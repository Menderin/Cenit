"""Smoke-test the actual release image with separate migration/runtime roles.

Does not replace application unit/integration/E2E tests. Temporary resources are
limited to this invocation; never prune, seed or access the VM database.
"""
import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]


class ImageCheck:
    def __init__(self, engine, image, revision):
        self.engine, self.image, self.revision = engine, image, revision
        self.prefix = 'cenit-check-' + uuid.uuid4().hex[:12]
        self.network = self.prefix + '-net'
        self.database = self.prefix + '-db'
        self.application = self.prefix + '-app'
        self.proxy = self.prefix + '-proxy'
        self.phase = 'metadata'

    def run(self, *args, input_text=None, timeout=120):
        result = subprocess.run([self.engine, *args], input=input_text, text=True,
                                capture_output=True, timeout=timeout)
        if result.returncode:
            # Never echo SQL, database URLs, complete container logs or credentials.
            raise RuntimeError('Image verification command failed: ' + args[0] + ' (' + self.phase + ')')
        return result.stdout

    def wait_database(self):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                # Authentication and schema existence, not just accepting TCP connections.
                result = self.run('exec', self.database, 'psql', '-U', 'cenit_admin',
                                  '-d', 'cenit_demo', '-Atc',
                                  "SELECT has_schema_privilege('cenit_app','cenit','USAGE')", timeout=10)
                if result.strip() == 't':
                    return
            except RuntimeError:
                pass
            time.sleep(1)
        raise RuntimeError('Temporary PostgreSQL did not initialize its limited roles.')

    def check_http(self):
        self.run('exec', self.application, 'node', '-e', """
(async () => {
 const r = await fetch('http://127.0.0.1:3000/health/ready', {signal:AbortSignal.timeout(4000)});
 if (r.status !== 200 || JSON.stringify(await r.json()) !== '{"status":"ready"}') process.exit(1);
 for (const path of ['/', '/login', '/compras', '/academico', '/administracion/compras/nueva']) {
  const page = await fetch('http://127.0.0.1:3000' + path, {signal:AbortSignal.timeout(4000)});
  if (page.status !== 200 || !page.headers.get('content-type')?.includes('text/html')) process.exit(1);
 }
})().catch(() => process.exit(1));
""", timeout=25)

    def verify(self):
        metadata = json.loads(self.run('image', 'inspect', self.image))[0]
        labels = metadata['Config'].get('Labels') or {}
        if metadata.get('Os') != 'linux' or metadata.get('Architecture') != 'amd64':
            raise RuntimeError('Release image must be linux/amd64.')
        if metadata['Config'].get('User') != '1000:1000':
            raise RuntimeError('Runtime must use UID/GID 1000:1000.')
        if labels.get('org.opencontainers.image.source') != 'https://github.com/Menderin/Cenit':
            raise RuntimeError('Image source label does not match Cenit.')
        if labels.get('org.opencontainers.image.revision') != self.revision:
            raise RuntimeError('Image revision does not match the tested commit.')
        images = json.loads((ROOT / 'deploy/images.lock.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory(prefix=self.prefix) as directory:
            files = Path(directory)
            files.chmod(0o700)
            for name in ('postgres', 'app', 'migrator'):
                value = secrets.token_hex(32)
                (files / (name + '-password')).write_text(value, encoding='utf-8')
                if name != 'postgres':
                    (files / (name + '-url')).write_text(
                        f'postgresql://cenit_{name}:{value}@db:5432/cenit_demo', encoding='utf-8')
            for file in files.iterdir():
                file.chmod(0o644)
            try:
                self.run('network', 'create', self.network)
                self.run('run', '-d', '--name', self.database, '--network', self.network,
                         '--network-alias', 'db', '--memory=512m', '--cpus=1',
                         '-e', 'POSTGRES_USER=cenit_admin', '-e', 'POSTGRES_DB=cenit_demo',
                         '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password',
                         # Keep the host directory private (0700), but mount each
                         # file separately: PostgreSQL drops to its own UID and
                         # cannot traverse a host-owned 0700 directory on Linux.
                         '-v', f'{files / "postgres-password"}:/run/secrets/postgres-password:ro',
                         '-v', f'{files / "app-password"}:/run/secrets/app-password:ro',
                         '-v', f'{files / "migrator-password"}:/run/secrets/migrator-password:ro',
                         '-v', f'{ROOT / "deploy/local/init-db.sh"}:/docker-entrypoint-initdb.d/10-cenit.sh:ro',
                         images['postgres'])
                self.wait_database()
                permission = self.run('exec', self.database, 'psql', '-U', 'cenit_admin',
                                      '-d', 'cenit_demo', '-Atc',
                                      "SELECT has_schema_privilege('cenit_app','cenit','CREATE')")
                if permission.strip() != 'f':
                    raise RuntimeError('Runtime must not create schema objects.')
                for _ in range(2):
                    self.run('run', '--rm', '--network', self.network, '--memory=512m',
                             '--cpus=1', '-e', 'DATABASE_URL_FILE=/run/secrets/database-url',
                             '-v', f'{files / "migrator-url"}:/run/secrets/database-url:ro',
                             self.image, 'node', '/app/deploy/migrate.cjs', timeout=180)
                self.run('run', '-d', '--name', self.application, '--network', self.network,
                         '--network-alias', 'cenit-app',
                         '--memory=512m', '--cpus=1', '-e', 'DATABASE_URL_FILE=/run/secrets/database-url',
                         '-v', f'{files / "app-url"}:/run/secrets/database-url:ro', self.image)
                deadline = time.monotonic() + 90
                while True:
                    try:
                        self.check_http()
                        break
                    except RuntimeError:
                        if time.monotonic() >= deadline:
                            raise RuntimeError('Release image did not satisfy HTTP readiness/HTML contract.')
                        time.sleep(2)
                self.run('run', '-d', '--name', self.proxy, '--network', self.network,
                         '--network-alias', 'proxy', '--user', '101:101', '--read-only',
                         '--tmpfs', '/var/cache/nginx:rw,size=64m,mode=1777',
                         '--tmpfs', '/var/run:rw,size=1m,mode=1777', '--memory=128m',
                         '-v', f'{ROOT / "deploy/nginx/cenit.conf"}:/etc/nginx/conf.d/default.conf:ro',
                         '--entrypoint', 'nginx', images['nginx'], '-g', 'daemon off;')
                self.phase = 'nginx configuration'
                self.run('exec', self.proxy, 'nginx', '-t')
                self.phase = 'nginx body limits'
                self.run('exec', self.application, 'node', '-e', """
const http = require('node:http');
async function request(path, method, bytes) {
 return new Promise((resolve,reject) => {
  const r=http.request({hostname:'proxy',port:8080,path,method,
    headers:{'Content-Type':'application/json','Content-Length':bytes}}, response => {
      response.resume(); response.on('end',()=>resolve(response.statusCode));
    });
  r.on('error',reject); r.setTimeout(4000,()=>r.destroy(new Error('timeout')));
  r.end('x'.repeat(bytes));
 });
}
(async()=>{
 // No session: a permitted-size purchase POST reaches authentication (401), not 413.
 if(await request('/api/v1/purchases','POST',200*1024)!==401) process.exit(1);
 if(await request('/api/v1/purchases/extractions','POST',2*1024*1024)!==401) process.exit(1);
 for(const [path,method,bytes] of [
  ['/api/v1/purchases','POST',513*1024],
  ['/api/v1/purchases/extractions','POST',6*1024*1024+1],
  ['/api/v1/purchases','GET',200*1024],
  ['/api/v1/auth/login','POST',200*1024]]) {
   if(await request(path,method,bytes)!==413) process.exit(1);
 }
})().catch(()=>process.exit(1));
""", timeout=30)
                self.run('stop', '--time', '10', self.database)
                self.phase = 'database disconnect'
                # Allow pools to observe disconnects, then require readiness to reject DB failure.
                self.run('exec', self.application, 'node', '-e', """
(async () => {
 for (let i=0; i<10; i++) {
  const r = await fetch('http://127.0.0.1:3000/health/ready',{signal:AbortSignal.timeout(4000)});
  if (r.status === 503) return;
  await new Promise(resolve => setTimeout(resolve, 1000));
 }
 process.exit(1);
})().catch(() => process.exit(1));
""", timeout=50)
                self.run('start', self.database)
                self.phase = 'database recovery'
                self.wait_database()
                self.check_http()
            finally:
                for name in (self.proxy, self.application, self.database):
                    subprocess.run([self.engine, 'rm', '-f', '-v', name], capture_output=True, timeout=30)
                subprocess.run([self.engine, 'network', 'rm', self.network], capture_output=True, timeout=30)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=['docker', 'podman'], default='docker')
    parser.add_argument('--image', required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.revision):
        parser.error('revision must be a full lowercase Git commit SHA')
    try:
        ImageCheck(args.engine, args.image, args.revision).verify()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print('Image verification failed: ' + str(error) if isinstance(error, RuntimeError)
              else 'Image verification failed; check runtime and image configuration.')
        return 1
    print('Image verified with limited roles, repeatable migration and database-dependent readiness.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
