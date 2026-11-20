"""Deliver the checked commit through Azure's agent, without an inbound SSH port."""
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


def deployment(environment):
    branch = environment['GITHUB_REF_NAME']
    if environment['GITHUB_REPOSITORY'] != 'Menderin/Cenit' or branch not in ('main', 'develop') or environment['GITHUB_EVENT_NAME'] != 'push':
        raise ValueError('Only protected main/develop pushes can deploy.')
    commit = environment['GITHUB_SHA']
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Invalid commit.')
    values = {'COMMIT': commit, 'RUN_NUMBER': str(int(environment['GITHUB_RUN_NUMBER'])),
              'ACTOR': environment['GITHUB_ACTOR']}
    if int(values['RUN_NUMBER']) < 1:
        raise ValueError('Invalid run number.')
    for name, repository in [('APP_IMAGE', 'cenit'), ('OCR_IMAGE', 'cenit-ocr')]:
        image = environment['CENIT_'+name]
        if not re.fullmatch(r'ghcr\.io/menderin/'+repository+r'@sha256:[0-9a-f]{64}', image):
            raise ValueError('Images must be from Cenit and pinned by digest.')
        values[name] = image
    production = branch == 'main'
    values.update(ENV='production' if production else 'staging',
                  ORIGIN='https://cenit.dpdns.org' if production else 'https://develop.cenit.dpdns.org',
                  HTTP_PORT='8081' if production else '8082')
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as bundle:
        files = [('deploy/azure/compose.yaml','compose.yaml'),
                 ('deploy/azure/deploy.sh','deploy.sh'),
                 ('deploy/local/init-db.sh','init-db.sh'),
                 ('deploy/scripts/setup-local.py','setup-local.py')]
        if not production:
            files.append(('deploy/azure/compose.sheets.yaml','compose.sheets.yaml'))
        for source, destination in files:
            bundle.add(ROOT/source, arcname=destination)
    exports = '\n'.join('export CENIT_'+key+'='+shlex.quote(value) for key,value in values.items())
    return '\n'.join(['#!/bin/bash', 'set -euo pipefail', exports,
        'export BUNDLE_ROOT=$(mktemp -d /run/cenit-bundle.XXXXXX)',
        'trap \'rm -rf -- "$BUNDLE_ROOT"\' EXIT',
        "printf '%s' "+shlex.quote(base64.b64encode(stream.getvalue()).decode())+' | base64 -d | tar -xz -C "$BUNDLE_ROOT"',
        'bash "$BUNDLE_ROOT/deploy.sh"'])


def main():
    config = json.loads((ROOT/'deploy/azure/config.json').read_text())
    script = deployment(os.environ)
    # Identifiers in config.json are public; only this short-lived GHCR token is secret.
    body = {'location': config['location'], 'properties': {
        'source': {'script': script}, 'timeoutInSeconds': 1200,
        'asyncExecution': False, 'treatFailureAsDeploymentFailure': True,
        'protectedParameters': [{'name': 'registry_token', 'value': os.environ['GH_TOKEN']}]}}
    vm = '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Compute/virtualMachines/{vmName}'.format(**config)
    run_id, attempt = (int(os.environ[key]) for key in ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'))
    if run_id < 1 or attempt < 1:
        raise ValueError('Invalid workflow attempt.')
    # A unique resource prevents reading the previous invocation's successful instanceView.
    url = f'https://management.azure.com{vm}/runCommands/cenit-{run_id}-{attempt}?api-version=2024-11-01'
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)/'command.json'
        path.write_text(json.dumps(body))
        path.chmod(0o600)
        subprocess.run(['az','rest','--method','put','--url',url,'--body','@'+str(path),'-o','none'], check=True)
    # ARM provisioning success alone does not prove the script completed successfully.
    deadline = time.monotonic()+1260
    while time.monotonic() < deadline:
        result = subprocess.run(['az','rest','--method','get','--url',url+'&$expand=instanceView','-o','json'], check=True, capture_output=True, text=True)
        properties = json.loads(result.stdout)['properties']
        view = properties.get('instanceView', {})
        state = view.get('executionState')
        if state in ('Succeeded','Failed','TimedOut','Canceled') or properties.get('provisioningState') == 'Failed':
            if state != 'Succeeded' or view.get('exitCode') != 0:
                raise RuntimeError('Azure deployment failed; inspect the private Run Command output in Azure.')
            subprocess.run(['az','rest','--method','delete','--url',url,'-o','none'], check=True)
            print('Azure verified successful script execution.')
            return
        time.sleep(10)
    raise TimeoutError('Azure did not confirm deployment within its deadline.')


if __name__ == '__main__':
    main()
