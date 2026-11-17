"""Adaptado del aporte de ihelo en d19e41e (SCRUM-134).

Unit tests for bounded OCR HTTP server adapter (apps/ocr/server.py).
Evaluates server handlers, slot limits, timeouts, cancellation, and cleanup.
"""
import json
import multiprocessing as mp
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from server import Handler, slot, MAX_BYTES
from http.server import ThreadingHTTPServer


class ServerRobustnessAndLifecycle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Bind server to ephemeral port 0 on loopback
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def _raw_request(self, method, path, headers=None, body=b'', close_write=True):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        sock.connect(('127.0.0.1', self.port))
        req = f'{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n'
        if headers:
            for k, v in headers.items():
                req += f'{k}: {v}\r\n'
        req += '\r\n'
        sock.sendall(req.encode('utf-8') + body)
        if close_write:
            try:
                sock.shutdown(socket.SHUT_WR)
            except OSError:
                pass
        data = b''
        try:
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                data += chunk
        finally:
            sock.close()
        head, _, body_res = data.partition(b'\r\n\r\n')
        status_line = head.decode('latin1').split('\r\n')[0]
        status_code = int(status_line.split()[1]) if status_line else 0
        parsed_body = json.loads(body_res.decode('utf-8')) if body_res else None
        return status_code, parsed_body

    def test_live_health_endpoint(self):
        status, body = self._raw_request('GET', '/health/live')
        self.assertEqual(status, 200)
        self.assertEqual(body, {'status': 'live'})

    def test_not_found_routes(self):
        status_get, body_get = self._raw_request('GET', '/other')
        self.assertEqual(status_get, 404)
        self.assertEqual(body_get, {'status': 'not_found'})

        status_post, body_post = self._raw_request('POST', '/other')
        self.assertEqual(status_post, 404)
        self.assertEqual(body_post, {'code': 'NOT_FOUND'})

    def test_rejects_payload_too_large(self):
        oversized = MAX_BYTES + 1
        status, body = self._raw_request('POST', '/extract', {'Content-Length': str(oversized)})
        self.assertEqual(status, 413)
        self.assertEqual(body, {'code': 'PAYLOAD_TOO_LARGE'})

    def test_rejects_invalid_content_length(self):
        status, body = self._raw_request('POST', '/extract', {'Content-Length': 'invalid_num'})
        self.assertEqual(status, 400)
        self.assertEqual(body, {'code': 'INVALID_IMAGE'})

    def test_rejects_transfer_encoding_chunked(self):
        status, body = self._raw_request('POST', '/extract', {'Transfer-Encoding': 'chunked', 'Content-Length': '10'})
        self.assertEqual(status, 400)
        self.assertEqual(body, {'code': 'INVALID_IMAGE'})

    def test_rejects_empty_or_too_long_filename(self):
        status_empty, body_empty = self._raw_request('POST', '/extract', {'Content-Length': '10', 'X-File-Name': ''})
        self.assertEqual(status_empty, 400)
        self.assertEqual(body_empty, {'code': 'INVALID_IMAGE'})

        too_long = 'a' * 256
        status_long, body_long = self._raw_request('POST', '/extract', {'Content-Length': '10', 'X-File-Name': too_long})
        self.assertEqual(status_long, 400)
        self.assertEqual(body_long, {'code': 'INVALID_IMAGE'})

    def test_rejects_truncated_content(self):
        status, body = self._raw_request('POST', '/extract', {'Content-Length': '10'}, body=b'123')
        self.assertEqual(status, 422)
        self.assertEqual(body, {'code': 'INVALID_IMAGE'})

    def test_busy_processor_returns_503(self):
        # Simulate slot being held by an active extraction
        acquired = slot.acquire(blocking=False)
        self.assertTrue(acquired)
        try:
            status, body = self._raw_request('POST', '/extract', {'Content-Length': '4'}, body=b'test')
            self.assertEqual(status, 503)
            self.assertEqual(body, {'code': 'EXTRACTION_UNAVAILABLE'})
        finally:
            slot.release()

    def test_client_cancellation_terminates_subprocess_and_releases_slot(self):
        started, terminated = threading.Event(), threading.Event()
        with patch('server.mp.Process') as factory, \
             patch('multiprocessing.connection.Connection.poll', return_value=False):
            worker = factory.return_value
            worker.start.side_effect = started.set
            worker.is_alive.side_effect = lambda: not terminated.is_set()
            worker.terminate.side_effect = terminated.set
            with socket.create_connection(('127.0.0.1', self.port), timeout=3) as sock:
                request = 'POST /extract HTTP/1.1\r\nHost: localhost\r\nContent-Length: 4\r\nContent-Type: image/png\r\n\r\n'
                sock.sendall(request.encode() + b'test')
                self.assertTrue(started.wait(3), 'Worker did not start')
            self.assertTrue(terminated.wait(3), 'Disconnect did not terminate worker')
            deadline = time.monotonic() + 3
            while not slot.acquire(blocking=False):
                self.assertLess(time.monotonic(), deadline, 'Slot remained occupied')
                time.sleep(.01)
            slot.release()
            worker.terminate.assert_called_once()
            worker.join.assert_called()

    def test_timeout_handling_aborts_and_returns_503(self):
        # Simulate worker that has not finished (parent.poll returns False) and deadline expires
        real_monotonic = time.monotonic
        start_time = real_monotonic()
        calls = [0]

        def fake_monotonic():
            calls[0] += 1
            if calls[0] >= 2:
                return start_time + 100.0
            return start_time

        with patch('server.mp.Process') as factory, \
             patch('multiprocessing.connection.Connection.poll', return_value=False), \
             patch('server.time.monotonic', side_effect=fake_monotonic):
            worker = factory.return_value
            worker.is_alive.return_value = True
            worker.terminate.side_effect = lambda: setattr(worker.is_alive, 'return_value', False)
            status, body = self._raw_request('POST', '/extract', {'Content-Length': '4'}, body=b'test')
            self.assertEqual(status, 503)
            self.assertEqual(body, {'code': 'EXTRACTION_UNAVAILABLE'})
            worker.terminate.assert_called_once()
            worker.join.assert_called()

        # Verify slot was released cleanly after timeout
        can_acquire = slot.acquire(blocking=False)
        self.assertTrue(can_acquire)
        slot.release()

    def test_temporary_files_are_not_leaked(self):
        # Verify /tmp contains no lingering capture files before and after
        tmp_before = set(Path(tempfile.gettempdir()).glob('*'))
        with patch('server.load_engine', return_value=None):
            status, body = self._raw_request('POST', '/extract',
                                           {'Content-Length': '4', 'Content-Type': 'image/png'}, b'test')
        self.assertEqual(status, 422)
        self.assertEqual(body, {'code': 'INVALID_IMAGE'})
        tmp_after = set(Path(tempfile.gettempdir()).glob('*'))
        new_files = tmp_after - tmp_before
        self.assertEqual(len(new_files), 0, f'Residual files created in tempdir: {new_files}')

    def test_run_worker_handles_processing_error(self):
        from server import run, ProcessingError
        parent, child = mp.Pipe(duplex=False)
        with patch('server.extract', side_effect=ProcessingError('UNSUPPORTED_CAPTURE_LAYOUT', 422)):
            run(child, b'fake', 'test.png', 'image/png')
        status, payload = parent.recv()
        parent.close()
        self.assertEqual(status, 422)
        self.assertEqual(payload, {'code': 'UNSUPPORTED_CAPTURE_LAYOUT'})

    def test_run_worker_handles_unexpected_exception(self):
        from server import run
        parent, child = mp.Pipe(duplex=False)
        with patch('server.extract', side_effect=RuntimeError('Unexpected failure')):
            run(child, b'fake', 'test.png', 'image/png')
        status, payload = parent.recv()
        parent.close()
        self.assertEqual(status, 503)
        self.assertEqual(payload, {'code': 'EXTRACTION_UNAVAILABLE'})


if __name__ == '__main__':
    unittest.main()
