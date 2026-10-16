"""Explicit real-inference evaluation; never imported by application or extractor."""
import argparse
import hashlib
import json
import statistics
import time
import urllib.request
from pathlib import Path
from fixtures import generate

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8090')
parser.add_argument('--split', choices=['development', 'holdout'], default='development')
parser.add_argument('--output', type=Path, default=Path('tmp/ocr-adapter'))
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
sources = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('apps/ocr').glob('*.py')}
rows = []
for case in generate(args.output/'fixtures', args.split):
    path = Path(case['path']); image = path.read_bytes()
    mime = 'image/jpeg' if path.suffix == '.jpg' else 'image/png'
    request = urllib.request.Request(args.url+'/extract', image, {'Content-Type': mime, 'X-File-Name': path.name})
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=65) as response:
        result = json.load(response)
    elapsed = time.perf_counter()-started
    checks = []
    for key, value in case['expected']['header'].items():
        actual = result['data']['header'][key]['value']
        checks.append({'path': '/header/'+key, 'expected': value, 'actual': actual, 'exact': actual == value})
    for i, line in enumerate(case['expected']['lines']):
        for key, value in line.items():
            actual = result['data']['lines'][i][key]['value'] if i < len(result['data']['lines']) else None
            checks.append({'path': f'/lines/{i}/{key}', 'expected': value, 'actual': actual, 'exact': actual == value})
    rows.append({'case': case['case'], 'seconds': elapsed, 'checks': checks, 'issues': result['data']['issues'],
                 'imageSha256': hashlib.sha256(image).hexdigest(), 'rowsExpected': len(case['expected']['lines']), 'rowsActual': len(result['data']['lines'])})
    (args.output/(case['case']+'.json')).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
summary = {'split': args.split, 'sourceHashes': sources, 'samples': rows,
           'exact': sum(c['exact'] for r in rows for c in r['checks']), 'fields': sum(len(r['checks']) for r in rows),
           'medianSeconds': statistics.median(r['seconds'] for r in rows), 'maxSeconds': max(r['seconds'] for r in rows)}
fields = {}
for row in rows:
    for check in row['checks']:
        field = check['path'].split('/')[-1]
        totals = fields.setdefault(field, {'exact': 0, 'missing': 0, 'wrong': 0})
        totals['exact' if check['exact'] else 'missing' if check['actual'] is None else 'wrong'] += 1
summary['byField'] = fields
(args.output/'summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({k: v for k, v in summary.items() if k not in ['samples', 'sourceHashes']}, indent=2))
