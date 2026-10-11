"""Publisher/consumer compatibility and preservation of local DB credentials."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).resolve().parents[2] / 'deploy/scripts'
sys.path.insert(0, str(SCRIPTS))
from cd_release import artifact_manifest
from github_read import GitHubReadError


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


publisher = load('publisher', 'make-release-manifest.py')
local = load('local_setup', 'setup-local.py')


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            'GITHUB_REPOSITORY': 'Menderin/Cenit', 'GITHUB_REF_NAME': 'main',
            'GITHUB_SHA': 'a' * 40, 'GITHUB_RUN_ID': '42', 'GITHUB_RUN_ATTEMPT': '2',
            'GITHUB_RUN_NUMBER': '7', 'GITHUB_EVENT_NAME': 'push',
        }
        self.image = 'ghcr.io/menderin/cenit@sha256:' + 'b' * 64

    def test_publisher_manifest_is_accepted_by_vm_consumer(self):
        manifest = publisher.make_manifest(self.env, self.image)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as bundle:
            bundle.writestr('cenit-release.json', json.dumps(manifest))
        raw = stream.getvalue()
        decoded = artifact_manifest(raw, 'sha256:' + hashlib.sha256(raw).hexdigest())
        self.assertEqual(decoded['workflowRunAttempt'], 2)
        self.assertEqual(decoded['image'], self.image)

    def test_wrong_event_branch_or_repository_cannot_publish(self):
        for key, value in [('GITHUB_EVENT_NAME', 'pull_request'),
                           ('GITHUB_REF_NAME', 'develop'), ('GITHUB_REF_NAME', 'produccion'),
                           ('GITHUB_REPOSITORY', 'someone/Cenit')]:
            with self.subTest(key=key):
                env = {**self.env, key: value}
                with self.assertRaises((ValueError, GitHubReadError)):
                    publisher.make_manifest(env, self.image)

    def test_mutable_image_and_invalid_run_identity_are_rejected(self):
        with self.assertRaises(GitHubReadError):
            publisher.make_manifest(self.env, 'ghcr.io/menderin/cenit:latest')
        with self.assertRaises(GitHubReadError):
            publisher.make_manifest({**self.env, 'GITHUB_RUN_ATTEMPT': '0'}, self.image)


class LocalSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / '.env.example').write_text('CENIT_DB_PORT=55432\n', encoding='utf-8')

    def test_repeated_setup_preserves_credentials_and_custom_environment(self):
        local.prepare(self.root)
        directory = self.root / '.local/secrets'
        before = {file.name: file.read_text() for file in directory.iterdir()}
        (self.root / '.env').write_text('CENIT_DB_PORT=55433\n', encoding='utf-8')
        local.prepare(self.root)
        self.assertEqual(before, {file.name: file.read_text() for file in directory.iterdir()})
        self.assertEqual((self.root / '.env').read_text(), 'CENIT_DB_PORT=55433\n')
        self.assertIn('cenit_app:', before['app-url'])
        self.assertIn('cenit_migrator:', before['migrator-url'])
        self.assertNotEqual(before['app-password'], before['migrator-password'])

    def test_unexpected_credential_is_not_silently_rotated(self):
        local.prepare(self.root)
        path = self.root / '.local/secrets/postgres-password'
        path.write_text('unexpected-value', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'no password was changed'):
            local.prepare(self.root)
        self.assertEqual(path.read_text(), 'unexpected-value')


if __name__ == '__main__':
    unittest.main()
