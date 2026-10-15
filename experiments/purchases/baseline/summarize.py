"""Keep compact, auditable benchmark evidence; raw generated files stay in tmp."""
import argparse
import hashlib
import json
import statistics
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
summaries = []
for name in ['tesseract', 'tesseract-upscale', 'rapid']:
    report = json.loads((args.directory/(name+'.json')).read_text(encoding='utf8'))
    runs = report['measurements']
    samples = []
    for case in dict.fromkeys(m['case'] for m in runs):
        measurements = [m for m in runs if m['case'] == case]
        first = measurements[0]
        checks = first.get('evaluation', {}).get('checks', [])
        present = [c for c in checks if c['expected'] is not None]
        absent = [c for c in checks if c['expected'] is None]
        samples.append({'case': case, 'medianSeconds': statistics.median(m['seconds'] for m in measurements),
                        'presentExact': sum(c['exact'] for c in present), 'presentFields': len(present),
                        'absencesCorrect': sum(c['exact'] for c in absent), 'absences': len(absent),
                        'rowsCorrect': first.get('evaluation', {}).get('rowsCorrect'),
                        'failures': [c for c in checks if not c['exact']],
                        'issues': first.get('result', {}).get('issues'),
                        'errors': [m['error'] for m in measurements if 'error' in m],
                        'repeatable': all(m.get('result') == first.get('result') for m in measurements)})
    summaries.append({'engine': name, 'runs': len(runs), 'samples': samples,
                      'medianSeconds': statistics.median(m['seconds'] for m in runs),
                      'maxSeconds': max(m['seconds'] for m in runs),
                      'loadedModelFiles': [m for m in report['models'] if name == 'rapid' and m['file'] in
                          ['ch_PP-OCRv5_det_mobile.onnx', 'ch_ppocr_mobile_v2.0_cls_mobile.onnx',
                           'latin_PP-OCRv5_rec_mobile.onnx']],
                      **{k: report[k] for k in ['containerMemoryPeakBytes', 'pythonPeakRssKiB',
                         'largestChildPeakRssKiB', 'initializationSecondsIncludingDownloads',
                         'dependencies', 'tesseractVersion']}})
root = Path(__file__).parent
result = {'date': '2026-10-14', 'environment': 'Podman Linux amd64, CPU-only, quota 1 CPU / 1 GiB per engine, sequential runs',
          'limitations': ['Synthetic template, not independent customer samples',
                          'Exact raw visible-text comparison, not all fields of the public extraction contract',
                          'No API, database, VM or production endpoint exercised'],
          'sourceHashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in [root/'fixtures.py', root/'benchmark.py']}, 'engines': summaries}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
for engine in summaries:
    count = sum(s['presentFields'] for s in engine['samples'])
    correct = sum(s['presentExact'] for s in engine['samples'])
    print(engine['engine'], f'{correct}/{count} visible fields exact',
          f"median={engine['medianSeconds']:.3f}s max={engine['maxSeconds']:.3f}s",
          f"container peak={engine['containerMemoryPeakBytes']/1048576:.1f} MiB")
