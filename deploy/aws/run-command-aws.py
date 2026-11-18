"""Deliver the checked commit through AWS Systems Manager, without an inbound SSH port."""
import base64
import io
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]


def caddyfile(config):
    """The public names come only from deploy/aws/config.json."""
    blocks = []
    for name in ('production', 'staging'):
        environment = config['environments'][name]
        lines = [', '.join(environment['hosts']) + ' {']
        if name == 'staging':
            lines.append('  header X-Robots-Tag "noindex, nofollow"')
        lines += ['  reverse_proxy 127.0.0.1:%d' % environment['httpPort'], '}']
        blocks.append('\n'.join(lines))
    return '\n'.join(blocks) + '\n'


def deployment(environment, config=None):
    config = config or json.loads((ROOT/'deploy/aws/config.json').read_text())
    branch = environment['GITHUB_REF_NAME']
    if environment['GITHUB_REPOSITORY'] != 'Menderin/Cenit' or branch not in ('main', 'develop') or environment['GITHUB_EVENT_NAME'] != 'push':
        raise ValueError('Only protected main/develop pushes can deploy.')
    commit = environment['GITHUB_SHA']
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Invalid commit.')
    values = {'COMMIT': commit, 'RUN_NUMBER': str(int(environment['GITHUB_RUN_NUMBER'])),
              'ACTOR': environment['GITHUB_ACTOR'], 'AWS_REGION': config['region'],
              'GHCR_PARAMETER': config['ghcrTokenParameter']}
    if int(values['RUN_NUMBER']) < 1:
        raise ValueError('Invalid run number.')
    for name, repository in [('APP_IMAGE', 'cenit'), ('OCR_IMAGE', 'cenit-ocr')]:
        image = environment['CENIT_'+name]
        if not re.fullmatch(r'ghcr\.io/menderin/'+repository+r'@sha256:[0-9a-f]{64}', image):
            raise ValueError('Images must be from Cenit and pinned by digest.')
        values[name] = image
    name = 'production' if branch == 'main' else 'staging'
    selected = config['environments'][name]
    values.update(ENV=name, ORIGIN=','.join('https://'+host for host in selected['hosts']),
                  HTTP_PORT=str(selected['httpPort']))
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as bundle:
        for source, destination in [('deploy/azure/compose.yaml', 'compose.yaml'),
                                    ('deploy/aws/deploy.sh', 'deploy.sh'),
                                    ('deploy/local/init-db.sh', 'init-db.sh'),
                                    ('deploy/scripts/setup-local.py', 'setup-local.py')]:
            bundle.add(ROOT/source, arcname=destination)
        data = caddyfile(config).encode()
        info = tarfile.TarInfo('Caddyfile')
        info.size = len(data)
        bundle.addfile(info, io.BytesIO(data))
    exports = '\n'.join('export CENIT_'+key+'='+shlex.quote(value) for key, value in values.items())
    return '\n'.join(['#!/bin/bash', 'set -euo pipefail', exports,
        'export BUNDLE_ROOT=$(mktemp -d /run/cenit-bundle.XXXXXX)',
        'trap \'rm -rf -- "$BUNDLE_ROOT"\' EXIT',
        "printf '%s' "+shlex.quote(base64.b64encode(stream.getvalue()).decode())+' | base64 -d | tar -xz -C "$BUNDLE_ROOT"',
        'bash "$BUNDLE_ROOT/deploy.sh"'])


def aws(*arguments, region):
    return subprocess.run(['aws', '--region', region, *arguments], check=True, capture_output=True, text=True).stdout


def main():
    config = json.loads((ROOT/'deploy/aws/config.json').read_text())
    region = config['region']
    script = deployment(os.environ, config)
    # The short-lived workflow token goes to Parameter Store; the node reads it, the command text never carries it.
    aws('ssm', 'put-parameter', '--name', config['ghcrTokenParameter'], '--type', 'SecureString',
        '--overwrite', '--value', os.environ['GH_TOKEN'], '--output', 'text', region=region)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)/'parameters.json'
        path.write_text(json.dumps({'commands': [script]}))
        path.chmod(0o600)
        tag = config['nodeTag']
        command = json.loads(aws('ssm', 'send-command', '--document-name', 'AWS-RunShellScript',
            '--targets', 'Key=tag:%s,Values=%s' % (tag['key'], tag['value']),
            '--parameters', 'file://'+str(path), '--timeout-seconds', '1200',
            '--comment', 'Cenit %s run %s' % (os.environ['GITHUB_REF_NAME'], os.environ['GITHUB_RUN_ID']),
            '--output', 'json', region=region))['Command']
    command_id = command['CommandId']
    # SendCommand accepting the request does not prove the script completed successfully.
    deadline = time.monotonic()+1260
    while time.monotonic() < deadline:
        invocations = json.loads(aws('ssm', 'list-command-invocations', '--command-id', command_id,
                                     '--output', 'json', region=region))['CommandInvocations']
        states = [item['Status'] for item in invocations]
        if invocations and all(state in ('Success', 'Failed', 'TimedOut', 'Cancelled', 'Cancelling') for state in states):
            if len(invocations) != 1 or states != ['Success']:
                raise RuntimeError('AWS deployment failed; inspect the private Run Command output in Systems Manager.')
            print('AWS verified successful script execution.')
            return
        time.sleep(10)
    raise TimeoutError('AWS did not confirm deployment within its deadline.')


if __name__ == '__main__':
    main()
