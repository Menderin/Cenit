"""The Azure boundary rejects PRs, foreign images and untrusted branches."""
import importlib.util
from pathlib import Path
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


if __name__ == '__main__':
    unittest.main()
