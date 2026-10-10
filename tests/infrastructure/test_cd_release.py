"""Negative authorization gates, immutable artifact integrity and recovery decisions."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error
import zipfile

SCRIPTS = Path(__file__).resolve().parents[2] / 'deploy/scripts'
sys.path.insert(0, str(SCRIPTS))
import cd_release as release
import cd_runtime as runtime
from cd_runtime import DeployError
from github_read import GitHubReadError

spec = importlib.util.spec_from_file_location('cd_worker', SCRIPTS / 'deploy-approved-release.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def manifest():
    return {'schemaVersion': 1, 'repository': 'Menderin/Cenit', 'branch': 'produccion',
            'commit': 'a' * 40, 'image': 'ghcr.io/menderin/cenit@sha256:' + 'b' * 64,
            'workflowRunId': 12, 'workflowRunAttempt': 1, 'runNumber': 3,
            'migrationPolicy': 'backward-compatible'}


def archive(data, name='cenit-release.json'):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as bundle:
        bundle.writestr(name, json.dumps(data))
    raw = buffer.getvalue()
    return raw, 'sha256:' + hashlib.sha256(raw).hexdigest()


class ReleaseTests(unittest.TestCase):
    def fixture(self):
        data = manifest()
        raw, digest = archive(data)
        responses = {
            '/releases?per_page=20': [{'tag_name': 'cenit-' + data['commit'], 'draft': False,
                'prerelease': False, 'created_at': '2026-10-10T00:00:00Z',
                'body': json.dumps({'workflowRunId': 12, 'workflowRunAttempt': 1})}],
            '/actions/workflows/release.yml': {'id': 7, 'path': release.WORKFLOW_PATH},
            '/actions/runs/12': {'workflow_id': 7, 'event': 'push', 'head_branch': 'produccion',
                'head_sha': data['commit'], 'run_attempt': 1, 'run_number': 3,
                'head_repository': {'full_name': 'Menderin/Cenit'},
                'status': 'completed', 'conclusion': 'success'},
            '/compare/' + data['commit'] + '...produccion': {'status': 'identical',
                'merge_base_commit': {'sha': data['commit']}},
            '/actions/runs/12/attempts/1/jobs?per_page=100': {'total_count': 3,
                'jobs': [{'name': n, 'conclusion': 'success'} for n in release.REQUIRED_JOBS]},
            '/actions/runs/12/artifacts?per_page=100': {'total_count': 1, 'artifacts': [{
                'name': 'cenit-release-1', 'expired': False, 'id': 9, 'digest': digest,
                'workflow_run': {'id': 12, 'head_sha': data['commit'], 'head_branch': 'produccion'}}]},
        }
        client = Mock()
        client.get.side_effect = lambda path: responses[path]
        return client, responses, raw

    def test_full_verified_chain_selects_digest(self):
        client, _, raw = self.fixture()
        with patch.object(release, 'download_artifact', return_value=raw):
            self.assertEqual(release.approved_release(client), manifest())

    def test_no_release_is_normal_waiting_state(self):
        client = Mock()
        client.get.return_value = []
        self.assertIsNone(release.approved_release(client))

    def test_main_pr_wrong_workflow_or_failed_run_cannot_deploy(self):
        for field, value in [('head_branch', 'main'), ('event', 'pull_request'),
                             ('workflow_id', 8), ('conclusion', 'failure'), ('run_attempt', 2),
                             ('head_repository', {'full_name': 'Other/Cenit'})]:
            with self.subTest(field=field):
                client, responses, raw = self.fixture()
                responses['/actions/runs/12'][field] = value
                with patch.object(release, 'download_artifact', return_value=raw) as download:
                    with self.assertRaises(GitHubReadError):
                        release.approved_release(client)
                    download.assert_not_called()

    def test_skipped_application_is_not_a_successful_gate(self):
        client, responses, raw = self.fixture()
        for job in responses['/actions/runs/12/attempts/1/jobs?per_page=100']['jobs']:
            if job['name'] == 'CI / Application':
                job['conclusion'] = 'skipped'
        with patch.object(release, 'download_artifact', return_value=raw):
            with self.assertRaises(GitHubReadError):
                release.approved_release(client)

    def test_commit_outside_branch_history_is_rejected(self):
        client, responses, raw = self.fixture()
        responses['/compare/' + manifest()['commit'] + '...produccion']['status'] = 'diverged'
        with patch.object(release, 'download_artifact', return_value=raw):
            with self.assertRaises(GitHubReadError):
                release.approved_release(client)

    def test_artifact_replacement_and_extra_zip_files_rejected(self):
        raw, digest = archive(manifest())
        with self.assertRaises(GitHubReadError):
            release.artifact_manifest(raw + b'tampered', digest)
        raw, digest = archive(manifest(), '../execute.sh')
        with self.assertRaises(GitHubReadError):
            release.artifact_manifest(raw, digest)

    def test_mutable_images_wrong_registry_or_contract_are_rejected(self):
        for field, value in [('image', 'ghcr.io/menderin/cenit:latest'),
                             ('image', 'ghcr.io/other/cenit@sha256:' + 'b' * 64),
                             ('schemaVersion', True), ('workflowRunId', True),
                             ('migrationPolicy', 'destructive')]:
            data = manifest()
            data[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(GitHubReadError):
                release.validate_manifest(data)

    def test_signed_download_does_not_receive_api_credential(self):
        client = Mock(token='fixture-private-token')
        client.opener.open.side_effect = [
            urllib.error.HTTPError('api', 302, 'Found',
                {'Location': 'https://storage.example/artifact?signature=fixture'}, None),
            io.BytesIO(b'zip'),
        ]
        self.assertEqual(release.download_artifact(client, 9), b'zip')
        first, second = [call.args[0] for call in client.opener.open.call_args_list]
        self.assertIn('Authorization', first.headers)
        self.assertNotIn('Authorization', second.headers)


class DeploymentTests(unittest.TestCase):
    def test_same_or_older_release_is_not_redeployed(self):
        data = manifest()
        self.assertFalse(worker.should_deploy(data, data, data))
        older = {**data, 'runNumber': 2}
        self.assertFalse(worker.should_deploy(older, data, data))

    def test_failed_or_interrupted_migration_is_not_retried(self):
        data = manifest()
        with self.assertRaises(DeployError):
            worker.should_deploy(data, None, data)
        self.assertTrue(worker.should_deploy({**data, 'workflowRunAttempt': 2}, None, data))

    def test_first_failed_app_restores_bootstrap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cd = root / 'cd'
            cd.mkdir()
            (cd / 'cenit-app.container.in').write_text('# fixture\nImage=@APP_IMAGE@\n', encoding='utf-8')
            proxy = root / 'proxy.conf'
            proxy.write_text('bootstrap config', encoding='utf-8')
            app = root / 'app.container'
            dependency = root / 'nginx.d/app.conf'
            with patch.multiple(worker, CD=cd, APP_UNIT=app, PROXY_CONFIG=proxy,
                                PROXY_DEPENDENCY=dependency, ATTEMPT=cd / 'attempt.json'), \
                 patch.object(worker, 'bootstrap_present'), \
                 patch.object(worker, 'command', return_value=''), \
                 patch.object(worker, 'verify_image'), \
                 patch.object(worker, 'backup_database'), \
                 patch.object(worker, 'sql', return_value='1024'), \
                 patch.object(worker, 'migrate'), \
                 patch.object(worker.shutil, 'disk_usage', return_value=Mock(free=4 * 1024**3)), \
                 patch.object(worker, 'wait_for_app', side_effect=DeployError('unready')):
                with self.assertRaisesRegex(DeployError, 'recuperados'):
                    worker.deploy(manifest(), Mock(), None)
                self.assertFalse(app.exists())
                self.assertFalse(dependency.exists())
                self.assertEqual(proxy.read_text(encoding='utf-8'), 'bootstrap config')
                self.assertTrue((cd / 'attempt.json').exists())

    def test_migration_failure_never_switches_app_or_proxy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            proxy = root / 'proxy.conf'
            proxy.write_text('bootstrap', encoding='utf-8')
            with patch.multiple(worker, APP_UNIT=root / 'app.container', PROXY_CONFIG=proxy,
                                PROXY_DEPENDENCY=root / 'dep.conf', ATTEMPT=root / 'attempt.json'), \
                 patch.object(worker, 'bootstrap_present'), \
                 patch.object(worker, 'command', return_value='') as commands, \
                 patch.object(worker, 'verify_image'), \
                 patch.object(worker, 'backup_database'), \
                 patch.object(worker, 'sql', return_value='1024'), \
                 patch.object(worker, 'migrate', side_effect=DeployError('migration failed')), \
                 patch.object(worker.shutil, 'disk_usage', return_value=Mock(free=4 * 1024**3)):
                with self.assertRaises(DeployError):
                    worker.deploy(manifest(), Mock(), None)
                self.assertEqual(proxy.read_text(encoding='utf-8'), 'bootstrap')
                self.assertFalse(any(c.args[0][0] == 'systemctl' for c in commands.call_args_list))


class DatabasePreparationTests(unittest.TestCase):
    def test_foreign_role_blocks_preparation_before_modification(self):
        metadata = {'roles': {'cenit_app': 'other project'}, 'schema': None}
        with patch.object(runtime, 'bootstrap_present'), \
             patch.object(runtime, 'sql', return_value=json.dumps(metadata)) as sql, \
             patch.object(runtime, 'command') as commands:
            with self.assertRaises(DeployError):
                runtime.prepare_database()
            self.assertEqual(sql.call_count, 1)
            commands.assert_not_called()

    def test_reinstall_preserves_passwords_and_does_not_recreate_roles(self):
        marker = 'Managed by Cenit automatic deployment'
        metadata = {'roles': {'cenit_app': marker, 'cenit_migrator': marker},
                    'schema': {'owner': 'cenit_migrator', 'comment': marker}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'secrets').mkdir()
            for name in ('cenit_app', 'cenit_migrator'):
                (root / 'secrets' / (name + '-password')).write_text('a' * 64, encoding='ascii')
            with patch.object(runtime, 'STATE', root), \
                 patch.object(runtime, 'bootstrap_present'), \
                 patch.object(runtime, 'private_file', return_value='a' * 64), \
                 patch.object(runtime, 'sql', side_effect=[json.dumps(metadata), '']) as sql, \
                 patch.object(runtime, 'command', return_value=''), \
                 patch.object(runtime, 'atomic_write') as writes:
                runtime.prepare_database()
                statements = sql.call_args_list[1].args[0]
                self.assertNotIn('CREATE ROLE', statements)
                self.assertNotIn('PASSWORD', statements)
                self.assertIn('NOSUPERUSER NOCREATEDB NOCREATEROLE', statements)
                writes.assert_not_called()


if __name__ == '__main__':
    unittest.main()
