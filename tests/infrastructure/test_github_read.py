"""Read credentials must not escape to redirects or error messages."""
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "deploy/scripts"))
import github_read as github


class GitHubReadTests(unittest.TestCase):
    def client_with_body(self, body):
        client = github.GitHubClient("fixture-token-not-a-real-credential")
        client.opener = Mock()
        client.opener.open.return_value = io.BytesIO(body)
        return client

    def test_json_is_read_from_fixed_repository(self):
        client = self.client_with_body(b'{"full_name":"Menderin/Cenit"}')
        self.assertEqual(client.get()["full_name"], github.REPOSITORY)
        request = client.opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.github.com/repos/Menderin/Cenit")

    def test_arbitrary_urls_cannot_receive_the_token(self):
        client = self.client_with_body(b'{}')
        for path in ("https://example.com", "//example.com"):
            with self.subTest(path=path), self.assertRaises(github.GitHubReadError):
                client.get(path)
        client.opener.open.assert_not_called()

    def test_redirect_does_not_forward_authenticated_request(self):
        request = urllib.request.Request(github.API_ROOT, headers={"Authorization":"Bearer fixture"})
        redirected = github.NoRedirect().redirect_request(
            request, None, 302, "Found", {}, "https://example.com"
        )
        self.assertIsNone(redirected)

    def test_http_errors_do_not_include_response_body_or_token(self):
        client = self.client_with_body(b'{}')
        client.opener.open.side_effect = urllib.error.HTTPError(
            github.API_ROOT, 401, "secret-response-detail", {}, io.BytesIO(b'secret-body')
        )
        with self.assertRaises(github.GitHubReadError) as result:
            client.get()
        self.assertIn("HTTP 401", str(result.exception))
        for sensitive in ("secret-response-detail", "secret-body", client.token):
            self.assertNotIn(sensitive, str(result.exception))

    def test_oversized_response_is_rejected(self):
        client = self.client_with_body(b'x' * (github.MAX_RESPONSE_BYTES + 1))
        with self.assertRaisesRegex(github.GitHubReadError, "demasiado grande"):
            client.get()

    def test_invalid_json_is_rejected(self):
        with self.assertRaisesRegex(github.GitHubReadError, "JSON"):
            self.client_with_body(b'not-json').get()

    def test_private_token_can_be_read(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "token"
            path.write_text("fixture-token\n", encoding="ascii")
            path.chmod(0o600)
            self.assertEqual(github.read_token(path), "fixture-token")

    def test_empty_releases_are_valid_for_preparation(self):
        client = Mock()
        client.get.side_effect = [
            {"full_name":"Menderin/Cenit"}, {"type":"file"}, {"workflow_runs":[]}, []
        ]
        self.assertEqual(github.inspect_repository(client), [])

    def test_wrong_repository_is_rejected(self):
        client = Mock()
        client.get.return_value = {"full_name":"other/repository"}
        with self.assertRaises(github.GitHubReadError):
            github.inspect_repository(client)
        self.assertEqual(client.get.call_count, 1)


if __name__ == "__main__":
    unittest.main()
