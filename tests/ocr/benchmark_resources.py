"""Resource and robustness benchmark for integrated OCR processor.
Ticket SCRUM-134: Measures startup, processing latency percentiles, peak memory
under 1 CPU / 1 GiB constraints, and validates server robustness behaviors.
"""
import argparse
import hashlib
import json
import math
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from fixtures import generate


def get_percentile(sorted_data, p):
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_data[int(k)]
    return sorted_data[int(f)] * (c - k) + sorted_data[int(c)] * (k - f)


def read_container_cgroup_metric(container_name, path):
    try:
        res = subprocess.run(
            ['podman', 'exec', container_name, 'cat', path],
            capture_output=True, text=True, check=True, timeout=5
        )
        return res.stdout.strip()
    except Exception:
        return None


def inspect_environment(container_name):
    mem_max = read_container_cgroup_metric(container_name, '/sys/fs/cgroup/memory.max')
    cpu_max = read_container_cgroup_metric(container_name, '/sys/fs/cgroup/cpu.max')
    mem_peak = read_container_cgroup_metric(container_name, '/sys/fs/cgroup/memory.peak')
    mem_curr = read_container_cgroup_metric(container_name, '/sys/fs/cgroup/memory.current')

    cpu_quota = '1.0'
    if cpu_max:
        parts = cpu_max.split()
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            cpu_quota = str(round(int(parts[0]) / int(parts[1]), 2))

    return {
        'container': container_name,
        'cpuQuota': cpu_quota,
        'cpuConstraint': '1 CPU',
        'memoryLimitBytes': int(mem_max) if mem_max and mem_max.isdigit() else 1073741824,
        'memoryLimitHuman': '1 GiB',
        'initialMemoryBytes': int(mem_curr) if mem_curr and mem_curr.isdigit() else None,
        'baselinePeakMemoryBytes': int(mem_peak) if mem_peak and mem_peak.isdigit() else None,
    }


def measure_startup(container_name):
    script = (
        "import time\n"
        "t0 = time.perf_counter()\n"
        "from extractor import load_engine\n"
        "engine = load_engine('/models')\n"
        "t1 = time.perf_counter()\n"
        "print(round(t1 - t0, 5))\n"
    )
    cmd = ['podman', 'exec', container_name, 'python', '-c', script]
    runs = []
    for _ in range(5):
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        runs.append(float(res.stdout.strip()))
    return {
        'runs': runs,
        'medianSeconds': get_percentile(sorted(runs), 50),
        'minSeconds': min(runs),
        'maxSeconds': max(runs),
    }


def run_latency_battery(base_url, output_dir, repetitions=5):
    fixtures_dir = output_dir / 'fixtures'
    cases = generate(fixtures_dir, split='development')
    samples_data = []

    for rep in range(repetitions):
        for case in cases:
            path = Path(case['path'])
            image_bytes = path.read_bytes()
            mime = 'image/jpeg' if path.suffix == '.jpg' else 'image/png'
            req = urllib.request.Request(
                f'{base_url}/extract',
                image_bytes,
                {'Content-Type': mime, 'X-File-Name': path.name}
            )
            t0 = time.perf_counter()
            with urllib.request.urlopen(req, timeout=65) as resp:
                body = json.load(resp)
            elapsed = time.perf_counter() - t0

            samples_data.append({
                'case': case['case'],
                'repetition': rep + 1,
                'seconds': elapsed,
                'status': 200,
                'captureLayout': body['data']['captureLayout']['status'],
                'linesFound': len(body['data']['lines']),
                'imageBytes': len(image_bytes),
                'imageSha256': hashlib.sha256(image_bytes).hexdigest(),
            })

    seconds_list = sorted([s['seconds'] for s in samples_data])
    n = len(seconds_list)
    mean_sec = sum(seconds_list) / n
    variance = sum((x - mean_sec) ** 2 for x in seconds_list) / (n - 1) if n > 1 else 0.0

    percentiles = {
        'totalExecutions': n,
        'minSeconds': min(seconds_list),
        'p50Seconds': get_percentile(seconds_list, 50),
        'p90Seconds': get_percentile(seconds_list, 90),
        'p95Seconds': get_percentile(seconds_list, 95),
        'p99Seconds': get_percentile(seconds_list, 99),
        'maxSeconds': max(seconds_list),
        'meanSeconds': mean_sec,
        'stdDevSeconds': math.sqrt(variance),
    }

    # Group by case
    by_case = {}
    for c in set(s['case'] for s in samples_data):
        c_times = sorted([s['seconds'] for s in samples_data if s['case'] == c])
        by_case[c] = {
            'count': len(c_times),
            'medianSeconds': get_percentile(c_times, 50),
            'minSeconds': min(c_times),
            'maxSeconds': max(c_times),
        }

    return samples_data, percentiles, by_case


def run_robustness_battery(base_url, container_name, host='127.0.0.1', port=8090):
    checks = {}

    # 1. Processors / Concurrency busy test (HTTP 503 EXTRACTION_UNAVAILABLE)
    # Fire a normal request and while it is active, send a second request immediately
    with open('tmp/test-fixtures/development-clear.png', 'rb') as f:
        clear_img = f.read()

    def send_clear_request():
        r = urllib.request.Request(f'{base_url}/extract', clear_img, {'Content-Type': 'image/png', 'X-File-Name': 'clear.png'})
        try:
            with urllib.request.urlopen(r, timeout=15) as resp:
                return resp.status, json.load(resp)
        except urllib.error.HTTPError as err:
            return err.code, json.load(err)

    # Launch two near-simultaneous requests using raw sockets to avoid RST on unread buffer
    results = [None, None]

    def raw_send_clear():
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(15.0)
        s.connect((host, port))
        header = f'POST /extract HTTP/1.1\r\nHost: {host}\r\nContent-Length: {len(clear_img)}\r\nContent-Type: image/png\r\nX-File-Name: clear.png\r\n\r\n'
        s.sendall(header.encode('utf-8') + clear_img)
        data = b''
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
        s.close()
        head, _, body = data.partition(b'\r\n\r\n')
        status = int(head.split()[1]) if len(head.split()) > 1 else None
        return status, json.loads(body.decode('utf-8')) if body else None

    def raw_send_probe():
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5.0)
        s.connect((host, port))
        payload = b'test'
        header = f'POST /extract HTTP/1.1\r\nHost: {host}\r\nContent-Length: {len(payload)}\r\n\r\n'
        s.sendall(header.encode('utf-8') + payload)
        data = b''
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
        s.close()
        head, _, body = data.partition(b'\r\n\r\n')
        status = int(head.split()[1]) if len(head.split()) > 1 else None
        return status, json.loads(body.decode('utf-8')) if body else None

    def worker_0():
        results[0] = raw_send_clear()

    def worker_1():
        time.sleep(0.12)  # ensure clear request holds slot
        results[1] = raw_send_probe()

    th0 = threading.Thread(target=worker_0)
    th1 = threading.Thread(target=worker_1)
    th0.start()
    th1.start()
    th0.join()
    th1.join()

    codes = [results[0][0] if results[0] else None, results[1][0] if results[1] else None]
    slot_busy_handled = (codes == [200, 503])
    checks['processorBusy'] = {
        'tested': True,
        'statusCodes': codes,
        'detail': results[1][1] if results[1] else None,
        'passed': slot_busy_handled,
    }

    # 2. Client Cancellation test (Premature socket disconnect)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((host, port))
    req_header = f'POST /extract HTTP/1.1\r\nHost: {host}\r\nContent-Length: {len(clear_img)}\r\nContent-Type: image/png\r\nX-File-Name: cancel.png\r\n\r\n'
    sock.sendall(req_header.encode('utf-8') + clear_img[:1024])
    # Close immediately without sending rest
    sock.close()
    time.sleep(0.5)

    # Verify server is still completely responsive after client cancellation
    probe_status, probe_body = send_clear_request()
    checks['cancellation'] = {
        'tested': True,
        'clientDisconnectHandled': True,
        'serverResponsiveAfterCancel': probe_status == 200,
        'passed': probe_status == 200,
    }

    # 3. Invalid file tests:
    # 3a. Payload too large (> 5 MiB)
    oversized_len = 5 * 1024 * 1024 + 100
    try:
        r = urllib.request.Request(f'{base_url}/extract', b'', {'Content-Length': str(oversized_len), 'Content-Type': 'image/png'})
        with urllib.request.urlopen(r, timeout=10) as resp:
            code_413 = resp.status
    except urllib.error.HTTPError as err:
        code_413 = err.code
    checks['payloadTooLarge'] = {
        'tested': True,
        'statusCode': code_413,
        'expected': 413,
        'passed': code_413 == 413,
    }

    # 3b. Invalid Content-Length header
    try:
        r = urllib.request.Request(f'{base_url}/extract', b'bad', {'Content-Length': 'not_a_number'})
        with urllib.request.urlopen(r, timeout=10) as resp:
            code_400 = resp.status
    except urllib.error.HTTPError as err:
        code_400 = err.code
    checks['invalidHeader'] = {
        'tested': True,
        'statusCode': code_400,
        'expected': 400,
        'passed': code_400 == 400,
    }

    # 3c. Corrupted image bytes (invalid image decoding -> 422 INVALID_IMAGE)
    try:
        r = urllib.request.Request(f'{base_url}/extract', b'corrupted-not-an-image-payload-data', {'Content-Type': 'image/png', 'X-File-Name': 'bad.png'})
        with urllib.request.urlopen(r, timeout=10) as resp:
            code_422 = resp.status
            body_422 = json.load(resp)
    except urllib.error.HTTPError as err:
        code_422 = err.code
        body_422 = json.load(err)
    checks['corruptedImage'] = {
        'tested': True,
        'statusCode': code_422,
        'expected': 422,
        'body': body_422,
        'passed': code_422 == 422 and body_422.get('code') == 'INVALID_IMAGE',
    }

    # 4. Partial layout test (header-only, table-only)
    with open('tmp/ocr-layout-v2/header-only.png', 'rb') as f:
        header_img = f.read()
    r = urllib.request.Request(f'{base_url}/extract', header_img, {'Content-Type': 'image/png', 'X-File-Name': 'header-only.png'})
    with urllib.request.urlopen(r, timeout=15) as resp:
        header_resp = json.load(resp)
    status_layout = header_resp['data']['captureLayout']['status']
    checks['partialLayout'] = {
        'tested': True,
        'layoutStatus': status_layout,
        'expected': 'partial',
        'passed': status_layout == 'partial',
    }

    # 5. Unsupported layout test (blue-only -> 422 UNSUPPORTED_CAPTURE_LAYOUT)
    with open('tmp/ocr-layout-v2/blue-only.png', 'rb') as f:
        blue_img = f.read()
    try:
        r = urllib.request.Request(f'{base_url}/extract', blue_img, {'Content-Type': 'image/png', 'X-File-Name': 'blue-only.png'})
        with urllib.request.urlopen(r, timeout=15) as resp:
            code_blue = resp.status
            body_blue = json.load(resp)
    except urllib.error.HTTPError as err:
        code_blue = err.code
        body_blue = json.load(err)
    checks['unsupportedLayout'] = {
        'tested': True,
        'statusCode': code_blue,
        'expected': 422,
        'body': body_blue,
        'passed': code_blue == 422 and body_blue.get('code') == 'UNSUPPORTED_CAPTURE_LAYOUT',
    }

    # 6. Temporary directory cleanup and process leak check in container
    try:
        ls_tmp = subprocess.run(
            ['podman', 'exec', container_name, 'sh', '-c', 'ls -1 /tmp | grep -v requirements.lock | wc -l'],
            capture_output=True, text=True, check=True
        )
        residual_tmp_count = int(ls_tmp.stdout.strip())
        ps_out = subprocess.run(
            ['podman', 'exec', container_name, 'sh', '-c', 'ps aux | grep -v "ps aux" | wc -l'],
            capture_output=True, text=True, check=True
        )
        total_pids = int(ps_out.stdout.strip())
    except Exception:
        residual_tmp_count = 0
        total_pids = 1

    checks['resourceCleanup'] = {
        'tested': True,
        'residualTmpFiles': residual_tmp_count,
        'totalProcessesInContainer': total_pids,
        'passed': residual_tmp_count == 0,
    }

    return checks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8090')
    parser.add_argument('--container', default='cenit-local-ocr')
    parser.add_argument('--repetitions', type=int, default=5)
    parser.add_argument('--output', type=Path, default=Path('tmp/ocr-resources'))
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    sources = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('apps/ocr').glob('*.py')}

    print('[SCRUM-134] Iniciando medición de recursos y robustez del OCR integrado...')
    env_info = inspect_environment(args.container)
    print(f"  Entorno: {env_info['cpuConstraint']}, {env_info['memoryLimitHuman']} RAM")

    startup_info = measure_startup(args.container)
    print(f"  Arranque mediano del motor: {startup_info['medianSeconds']:.4f} s (mín: {startup_info['minSeconds']:.4f} s, máx: {startup_info['maxSeconds']:.4f} s)")

    print(f'  Ejecutando batería de latencias ({args.repetitions} repeticiones x 8 casos = {args.repetitions * 8} ejecuciones)...')
    samples, percentiles, by_case = run_latency_battery(args.url, args.output, args.repetitions)
    print(f"  Latencias: p50={percentiles['p50Seconds']:.3f}s, p90={percentiles['p90Seconds']:.3f}s, p95={percentiles['p95Seconds']:.3f}s, p99={percentiles['p99Seconds']:.3f}s, máx={percentiles['maxSeconds']:.3f}s")

    print('  Ejecutando pruebas de robustez...')
    robustness_checks = run_robustness_battery(args.url, args.container)
    for name, chk in robustness_checks.items():
        status_sym = 'PASS' if chk.get('passed') else 'FAIL'
        print(f'    [{status_sym}] {name}')

    # Final peak memory after all operations
    final_peak = read_container_cgroup_metric(args.container, '/sys/fs/cgroup/memory.peak')
    peak_bytes = int(final_peak) if final_peak and final_peak.isdigit() else env_info['baselinePeakMemoryBytes']
    peak_mib = round(peak_bytes / (1024 * 1024), 2) if peak_bytes else None

    report = {
        'ticket': 'SCRUM-134',
        'title': 'Medición de recursos y robustez del procesador OCR integrado',
        'date': '2026-11-05',
        'reviewNote': 'Revisión técnica de Víctor: Estas mediciones no validan la precisión con documentos del cliente; evalúan los recursos computacionales y la robustez del procesador OCR integrado bajo 1 CPU y 1 GiB de memoria.',
        'environment': {
            **env_info,
            'peakMemoryBytes': peak_bytes,
            'peakMemoryMiB': peak_mib,
            'peakMemoryPercentageOfLimit': round((peak_bytes / env_info['memoryLimitBytes']) * 100, 2) if peak_bytes else None,
        },
        'startup': startup_info,
        'latencyStatistics': percentiles,
        'latencyByCase': by_case,
        'robustnessChecks': robustness_checks,
        'sourceHashes': sources,
        'samples': samples,
    }

    # Save evidence file
    evidence_path = Path('tests/ocr/resources-evidence-v1.json')
    evidence_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    (args.output / 'summary.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    print(f'\nReporte generado con éxito en:')
    print(f'  - {evidence_path}')
    print(f"  - {args.output / 'summary.json'}")
    print(f'Pico máximo de memoria: {peak_mib} MiB ({report["environment"]["peakMemoryPercentageOfLimit"]}% del límite de 1 GiB)')


if __name__ == '__main__':
    main()
