"""The AWS boundary rejects PRs, foreign images and untrusted branches; names come from one configuration."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('aws_delivery', ROOT/'deploy/aws/run-command-aws.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)
CONFIG = json.loads((ROOT/'deploy/aws/config.json').read_text())


class AwsDeliveryTests(unittest.TestCase):
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
        staging = delivery.deployment({**self.environment, 'GITHUB_REF_NAME': 'develop'})
        self.assertIn('CENIT_ENV=production', production)
        self.assertIn('CENIT_ORIGIN=https://cenit.dpdns.org', production)
        self.assertIn('CENIT_HTTP_PORT=8081', production)
        self.assertIn('CENIT_ENV=staging', staging)
        self.assertIn('CENIT_ORIGIN=https://develop.cenit.dpdns.org', staging)
        self.assertIn('CENIT_HTTP_PORT=8082', staging)
        self.assertNotIn('GH_TOKEN', production)

    def test_untrusted_identity_or_mutable_image_is_rejected(self):
        for key, value in [('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_REF_NAME', 'feat/aws-deploy'),
                           ('GITHUB_REPOSITORY', 'other/Cenit'), ('GITHUB_SHA', 'bad'),
                           ('GITHUB_RUN_NUMBER', '0'), ('CENIT_APP_IMAGE', 'ghcr.io/menderin/cenit:latest'),
                           ('CENIT_OCR_IMAGE', 'ghcr.io/other/ocr@sha256:'+'c'*64)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                delivery.deployment({**self.environment, key: value})

    def test_caddyfile_is_generated_from_the_single_configuration(self):
        caddy = delivery.caddyfile(CONFIG)
        for name, port in (('production', 8081), ('staging', 8082)):
            for host in CONFIG['environments'][name]['hosts']:
                self.assertIn(host, caddy)
            self.assertIn('reverse_proxy 127.0.0.1:%d' % port, caddy)
        self.assertEqual(caddy.count('X-Robots-Tag'), 1)
        self.assertNotIn('azure.com', caddy)

    def test_names_are_not_hardcoded_outside_the_configuration(self):
        for path in ('deploy/aws/run-command-aws.py', 'deploy/aws/deploy.sh', 'deploy/aws/cloud-init.yaml'):
            text = (ROOT/path).read_text()
            self.assertNotIn('dpdns.org', text, path)
            self.assertNotIn('cloudapp.azure.com', text, path)

    def test_workflow_keeps_azure_by_default_and_aws_behind_selector(self):
        workflow = (ROOT/'.github/workflows/release.yml').read_text()
        azure = workflow.split('  deploy:\n', 1)[1].split('\n  deploy-aws:\n', 1)[0]
        aws = workflow.split('\n  deploy-aws:\n', 1)[1]
        self.assertIn("vars.CENIT_DEPLOY_TARGET != 'aws'", azure)
        self.assertIn("vars.CENIT_DEPLOY_TARGET == 'aws'", aws)
        self.assertNotIn('id-token: write', aws)
        self.assertIn('aws-actions/configure-aws-credentials@', aws)
        self.assertIn('secrets.CENIT_AWS_SECRET_ACCESS_KEY', aws)
        self.assertNotIn('AWS_SECRET_ACCESS_KEY:', aws)

    def test_registry_token_is_read_from_parameter_store_not_the_command(self):
        deploy = (ROOT/'deploy/aws/deploy.sh').read_text()
        self.assertIn('aws ssm get-parameter', deploy)
        self.assertIn('--with-decryption', deploy)
        self.assertNotIn('registry_token=$CENIT', deploy)


if __name__ == '__main__':
    unittest.main()
