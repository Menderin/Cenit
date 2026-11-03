"""Private, bounded HTTP adapter; no database, uploads on disk or remote models."""
import json
import multiprocessing as mp
import os
import select
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote
from extractor import extract, load_engine, ProcessingError, MAX_BYTES


def run(connection, content, name, mime):
    try:
        result = extract(load_engine('/models'), content, name, mime)
        connection.send((200, result))
    except ProcessingError as error:
        connection.send((error.status, {'code': error.code}))
    except Exception:
        connection.send((503, {'code': 'EXTRACTION_UNAVAILABLE'}))
    finally:
        connection.close()


slot = threading.BoundedSemaphore(1)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *_args):
        pass  # Never log captures, names, candidates or request bodies.

    def reply(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(data)
        self.close_connection = True

    def do_GET(self):
        self.reply(200 if self.path == '/health/live' else 404, {'status': 'live' if self.path == '/health/live' else 'not_found'})

    def do_POST(self):
        if self.path != '/extract':
            return self.reply(404, {'code': 'NOT_FOUND'})
        if not slot.acquire(blocking=False):
            return self.reply(503, {'code': 'EXTRACTION_UNAVAILABLE'})
        process = None
        parent = child = None
        owns_slot = True
        try:
            length = self.headers.get('Content-Length', '')
            if not length.isdigit() or self.headers.get('Transfer-Encoding'):
                return self.reply(400, {'code': 'INVALID_IMAGE'})
            if int(length) > MAX_BYTES:
                return self.reply(413, {'code': 'PAYLOAD_TOO_LARGE'})
            name = unquote(self.headers.get('X-File-Name', 'capture.png'))
            if not 1 <= len(name) <= 255:
                return self.reply(400, {'code': 'INVALID_IMAGE'})
            content = self.rfile.read(int(length))
            if len(content) != int(length):
                return self.reply(422, {'code': 'INVALID_IMAGE'})
            parent, child = mp.Pipe(duplex=False)
            process = mp.Process(target=run, args=(child, content, name, self.headers.get('Content-Type', '')))
            process.start()
            child.close()
            deadline = time.monotonic()+58
            while not parent.poll(.1):
                if time.monotonic() >= deadline or not process.is_alive():
                    return self.reply(503, {'code': 'EXTRACTION_UNAVAILABLE'})
                if select.select([self.connection], [], [], 0)[0] and not self.connection.recv(1, socket.MSG_PEEK):
                    return  # API cancelled; terminate inference and release all image memory.
            status, result = parent.recv()
            process.join(2)
            if process.is_alive():
                process.terminate()
                process.join()
            process = None
            slot.release()
            owns_slot = False
            self.reply(status, result)
        except (OSError, ValueError, EOFError):
            self.close_connection = True
        finally:
            if process:
                if process.is_alive():
                    process.terminate()
                process.join(2)
                if process.is_alive():
                    process.kill()
                    process.join()
            if parent:
                parent.close()
            if child:
                child.close()
            if owns_slot:
                slot.release()


if __name__ == '__main__':
    # Fail startup on absent/altered OCR runtime or models, before accepting any capture.
    from extractor import WEIGHTS, load_engine
    import hashlib
    from pathlib import Path
    for name, expected in WEIGHTS.items():
        if hashlib.sha256((Path('/models')/name).read_bytes()).hexdigest() != expected:
            raise RuntimeError('Model hash mismatch')
    load_engine('/models')
    mp.set_start_method('spawn')
    server = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8090'))), Handler)
    server.daemon_threads = True
    server.serve_forever()
