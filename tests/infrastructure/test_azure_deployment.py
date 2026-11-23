"""The Azure boundary rejects PRs, foreign images and untrusted branches."""
import importlib.util
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('azure_delivery', ROOT/'deploy/azure/run-command.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


class AzureDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.environment = {
            'GITHUB_REF_NAME': 'main', 'GITHUB_REPOSITORY': 'Menderin/Cenit',
            'GITHUB_EVENT_NAME': 'push', 'GITHUB_SHA': 'a'*40,
            'GITHUB_RUN_NUMBER': '12', 'GITHUB_ACTOR': 'example',
            'CENIT_APP_IMAGE': 'ghcr.io/menderin/cenit@sha256:'+'b'*64,
            'CENIT_OCR_IMAGE': 'ghcr.io/menderin/cenit-ocr@sha256:'+'c'*64,
        }

    def test_branch_maps_to_exact_origin_and_environment(self):
        production = delivery.deployment(self.environment)
        staging = delivery.deployment({**self.environment, 'GITHUB_REF_NAME':'develop'})
        self.assertIn('CENIT_ENV=production', production)
        self.assertIn('CENIT_ORIGIN=https://cenit.dpdns.org', production)
        self.assertIn('CENIT_ENV=staging', staging)
        self.assertIn('CENIT_ORIGIN=https://develop.cenit.dpdns.org,https://cenit-famed.chilecentral.cloudapp.azure.com', staging)
        self.assertNotIn('cenit-famed.chilecentral.cloudapp.azure.com', production)
        self.assertNotIn('GH_TOKEN', production)

    def test_untrusted_identity_or_mutable_image_is_rejected(self):
        for key,value in [('GITHUB_EVENT_NAME','pull_request'), ('GITHUB_REF_NAME','feat/azure-deploy'),
                          ('GITHUB_REPOSITORY','other/Cenit'), ('GITHUB_SHA','bad'),
                          ('GITHUB_RUN_NUMBER','0'), ('CENIT_APP_IMAGE','ghcr.io/menderin/cenit:latest'),
                          ('CENIT_OCR_IMAGE','ghcr.io/other/ocr@sha256:'+'c'*64)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                delivery.deployment({**self.environment, key:value})

    def test_caddy_bootstrap_matches_deployed_configuration(self):
        cloud_init = (ROOT/'deploy/azure/cloud-init.yaml').read_text()
        inline = cloud_init.split('    content: |\n', 1)[1].split('runcmd:\n', 1)[0]
        self.assertEqual(''.join(line[6:] for line in inline.splitlines(keepends=True)),
                         (ROOT/'deploy/azure/Caddyfile').read_text())

    def test_google_configuration_is_optional_and_environment_local(self):
        compose = (ROOT/'deploy/azure/compose.yaml').read_text()
        app = compose.split('  app:\n', 1)[1].split('\nvolumes:', 1)[0]
        self.assertIn('path: ./.local/google.env\n        required: false', app)
        self.assertNotIn('AUTH_GOOGLE_ENABLED:', app)
        self.assertNotIn('AUTH_GOOGLE_CLIENT_ID:', app)
        deploy = (ROOT/'deploy/azure/deploy.sh').read_text()
        self.assertNotIn('> .local/google.env', deploy)


class AzureRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT/'deploy/azure/deploy.sh').read_text()
        self.bash = (str(Path(os.environ.get('ProgramFiles', 'C:/Program Files'))/'Git/bin/bash.exe')
                     if os.name == 'nt' else shutil.which('bash'))
        self.assertTrue(self.bash and Path(self.bash).is_file(), 'Bash is required for deployment tests')

    def test_failed_activation_restores_configuration_with_or_without_sheets(self):
        functions = '\n'.join(re.search(r'^'+name+r'\(\) \{.*?^\}', self.source,
                                       re.M | re.S)[0] for name in ('dc', 'recover'))
        for environment, previous_overlay in [('staging', False), ('staging', True), ('production', False)]:
            with self.subTest(environment=environment, previous_overlay=previous_overlay), tempfile.TemporaryDirectory() as temporary:
                fixture = Path(temporary)
                (fixture/'registry').mkdir()
                for name in ('previous.env', 'previous.compose.yaml'):
                    (fixture/name).write_text('previous\n')
                for name in ('.env', 'compose.yaml', 'compose.sheets.yaml'):
                    (fixture/name).write_text('candidate\n')
                if previous_overlay:
                    (fixture/'previous.compose.sheets.yaml').write_text('previous sheets\n')
                script = '''set -u
registry="$PWD/registry"
configured=true
activated=true
caddy_configured=false
docker() {
  printf '%s\\n' "$@" > calls.txt
  while (( $# )); do
    if [[ $1 == -f ]]; then
      shift
      [[ -f $1 ]] || return 17
    fi
    shift
  done
}
''' + functions + '\nfalse\nrecover\n'
                result = subprocess.run([self.bash], input=script, text=True, cwd=fixture,
                                        env={**os.environ, 'CENIT_ENV': environment}, capture_output=True)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertNotIn('Recovery requires inspection.', result.stderr)
                calls = (fixture/'calls.txt').read_text().splitlines()
                self.assertIn('app', calls)
                self.assertEqual('compose.sheets.yaml' in calls, previous_overlay)
                self.assertEqual((fixture/'.env').read_text(), 'previous\n')
                self.assertEqual((fixture/'compose.yaml').read_text(), 'previous\n')
                self.assertEqual((fixture/'compose.sheets.yaml').exists(), previous_overlay)
                if previous_overlay:
                    self.assertEqual((fixture/'compose.sheets.yaml').read_text(), 'previous sheets\n')

    def test_snapshot_does_not_reuse_an_overlay_from_an_older_delivery(self):
        start = self.source.index('if [[ -f .env && -f compose.yaml ]]; then')
        snapshot = self.source[start:self.source.index('\nconfigured=true', start)]
        for overlay in (False, True):
            with self.subTest(overlay=overlay), tempfile.TemporaryDirectory() as temporary:
                fixture = Path(temporary)
                for name in ('.env', 'compose.yaml'):
                    (fixture/name).write_text('installed\n')
                (fixture/'previous.compose.sheets.yaml').write_text('stale\n')
                if overlay:
                    (fixture/'compose.sheets.yaml').write_text('installed sheets\n')
                result = subprocess.run([self.bash], input='set -eu\n'+snapshot, text=True,
                                        cwd=fixture, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((fixture/'previous.compose.sheets.yaml').exists(), overlay)
                if overlay:
                    self.assertEqual((fixture/'previous.compose.sheets.yaml').read_text(), 'installed sheets\n')


if __name__ == '__main__':
    unittest.main()
