"""Research only: real OCR + dynamic anchors, no API/DB or saved purchases.

Expected values are read ONLY by score(), never by the OCR or parser.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import resource
import subprocess
import tempfile
import time
import unicodedata
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from fixtures import generate


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower())
                   if unicodedata.category(c) != 'Mn')


def tesseract(path, upscale=False):
    with tempfile.TemporaryDirectory() as directory:
        target = path
        if upscale:
            image = Image.open(path).convert('RGB')
            image = image.resize((image.width*2, image.height*2), Image.Resampling.LANCZOS)
            target = Path(directory)/'scaled.png'; image.save(target)
        output = subprocess.run(['tesseract', str(target), 'stdout', '-l', 'spa+eng', '--psm', '11', 'tsv'],
                                capture_output=True, text=True, check=True, timeout=60).stdout
    tokens = []
    for row in csv.DictReader(io.StringIO(output), delimiter='\t'):
        if row['text'].strip():
            x, y, w, h = [float(row[key]) for key in ['left', 'top', 'width', 'height']]
            if upscale:
                x, y, w, h = x/2, y/2, w/2, h/2
            tokens.append({'text': row['text'], 'x': x, 'y': y, 'w': w, 'h': h})
    return tokens


def rapid(engine, path):
    result = engine(str(path))
    tokens = []
    if result.boxes is None:
        return tokens
    for box, text in zip(result.boxes, result.txts):
        x, y = np.min(box, axis=0); right, bottom = np.max(box, axis=0)
        # Approximate word positions within a detected text line, not a confidence claim.
        for match in re.finditer(r'\S+', text):
            tokens.append({'text': match.group(), 'x': float(x+(right-x)*match.start()/len(text)),
                           'y': float(y), 'w': float((right-x)*(match.end()-match.start())/len(text)),
                           'h': float(bottom-y)})
    return tokens


def grouped(tokens):
    groups = []
    for token in sorted(tokens, key=lambda t: t['y'] + t['h']/2):
        center = token['y'] + token['h']/2
        target = next((g for g in groups if abs(g['center']-center) < max(4, token['h']*.55)), None)
        if target is None:
            target = {'center': center, 'tokens': []}; groups.append(target)
        target['tokens'].append(token)
    for group in groups:
        group['tokens'].sort(key=lambda t: t['x'])
        group['text'] = ' '.join(t['text'] for t in group['tokens'])
    return groups


def parse(path, tokens):
    groups = grouped(tokens)
    result = {'header': {}, 'lines': [], 'issues': []}
    title = next((g for g in groups if 'interna de compra' in normalize(g['text'])), None)
    match = re.search(r'compra\s+(\d+)', normalize(title['text'])) if title else None
    result['header']['requestNumber'] = match.group(1) if match else None
    start = next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])), None)
    end = next((g for g in groups if 'secuencia de aprobacion' in normalize(g['text'])), None)
    fields = {'sender': 'desde', 'recipient': 'a', 'sentDate': 'enviado', 'oracleId': 'id',
              'description': 'descripcion', 'totalAmount': 'total', 'taxAmount': 'impuesto',
              'attachmentReference': 'anexos'}
    for key, label in fields.items():
        result['header'][key] = None
        if not title:
            continue
        for group in groups:
            if start and group['center'] >= start['center']:
                continue
            row = group['tokens']
            index = next((i for i, token in enumerate(row) if normalize(token['text']).strip(':') == label), None)
            if index is None:
                continue
            anchor = row[index]
            following = []
            # Stop at a large gap to avoid crossing from the left header into its right half.
            previous = anchor
            for token in row[index+1:]:
                gap = token['x'] - previous['x'] - previous['w']
                if following and gap > max(55, anchor['h']*5):
                    break
                following.append(token['text']); previous = token
            result['header'][key] = ' '.join(following) or None
            break
    if not start or not end:
        result['issues'].append('TABLE_ANCHOR_MISSING')
        return result
    headers = next((g for g in groups if start['center'] < g['center'] < end['center']
                    and 'proveedor' in normalize(g['text']) and 'cantidad' in normalize(g['text'])), None)
    if not headers:
        result['issues'].append('TABLE_COLUMNS_MISSING'); return result
    columns = [('description', 'descripcion'), ('provider', 'proveedor'), ('costCenter', 'centro'),
               ('quantity', 'cantidad'), ('price', 'precio'), ('amount', 'importe'), ('chargeAccount', 'cuenta')]
    positions = []
    for key, word in columns:
        token = next((t for t in headers['tokens'] if normalize(t['text']) == word), None)
        if not token:
            result['issues'].append('TABLE_COLUMNS_MISSING'); return result
        positions.append((key, token['x']))
    image = np.array(Image.open(path).convert('L'))
    binary = (image < 225).astype(np.uint8)*255
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN,
                                 np.ones((1, max(20, int(image.shape[1]*.65))), np.uint8))
    ys = np.flatnonzero((horizontal > 0).sum(axis=1) > image.shape[1]*.65)
    separators = []
    for y in ys:
        if headers['center'] < y < end['center'] and (not separators or y-separators[-1] > 3):
            separators.append(int(y))
    if len(separators) < 2:
        result['issues'].append('TABLE_ROWS_UNRESOLVED'); return result
    for top, bottom in zip(separators, separators[1:]):
        row = {}
        for i, (key, left) in enumerate(positions):
            right = positions[i+1][1]-3 if i+1 < len(positions) else image.shape[1]
            words = [t for t in tokens if top < t['y']+t['h']/2 < bottom
                     and left-5 <= t['x'] < right]
            row[key] = ' '.join(g['text'] for g in grouped(words)) or None
            if key == 'chargeAccount' and row[key]:
                row[key] = row[key].replace(' ', '')
        result['lines'].append(row)
    return result


def score(actual, expected):
    checks = []
    for key, value in expected['header'].items():
        checks.append({'path': 'header/'+key, 'expected': value,
                       'actual': actual['header'].get(key), 'exact': actual['header'].get(key) == value})
    for i, row in enumerate(expected['lines']):
        for key, value in row.items():
            found = actual['lines'][i].get(key) if i < len(actual['lines']) else None
            checks.append({'path': f'lines/{i}/{key}', 'expected': value, 'actual': found, 'exact': found == value})
    return {'exact': sum(c['exact'] for c in checks), 'fields': len(checks),
            'rowsCorrect': len(actual['lines']) == len(expected['lines']), 'checks': checks}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['tesseract', 'tesseract-upscale', 'rapid'], default='tesseract')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    cases = generate(args.output/'fixtures')
    started = time.perf_counter(); engine = None
    if args.engine == 'rapid':
        from rapidocr import RapidOCR, LangRec, ModelType, OCRVersion
        engine = RapidOCR(params={'Rec.lang_type': LangRec.LATIN,
                                  'Rec.model_type': ModelType.MOBILE,
                                  'Rec.ocr_version': OCRVersion.PPOCRV5,
                                  'Det.model_type': ModelType.MOBILE,
                                  'Det.ocr_version': OCRVersion.PPOCRV5,
                                  'EngineConfig.onnxruntime.intra_op_num_threads': 1,
                                  'EngineConfig.onnxruntime.inter_op_num_threads': 1})
    initialization = time.perf_counter()-started
    measurements = []
    for case in cases:
        path = args.output/'fixtures'/case['file']
        for run in range(3):
            started = time.perf_counter()
            try:
                tokens = rapid(engine, path) if engine else tesseract(path, args.engine == 'tesseract-upscale')
                actual = parse(path, tokens)
                measurement = {'case': case['id'], 'run': run+1, 'seconds': time.perf_counter()-started,
                               'result': actual, 'evaluation': score(actual, case['expected'])}
            except Exception as error:
                measurement = {'case': case['id'], 'run': run+1, 'seconds': time.perf_counter()-started,
                               'error': type(error).__name__+': '+str(error)}
            measurements.append(measurement)
            print(json.dumps({k: v for k, v in measurement.items() if k not in ['result', 'evaluation']}), flush=True)
    models = [{'file': p.name, 'bytes': p.stat().st_size,
               'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
              for p in Path('/opt/research').rglob('*.onnx')]
    report = {'engine': args.engine, 'initializationSecondsIncludingDownloads': initialization,
              'pythonPeakRssKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
              'largestChildPeakRssKiB': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
              'models': models, 'measurements': measurements,
              'dependencies': subprocess.check_output(['pip', 'freeze'], text=True).splitlines(),
              'tesseractVersion': subprocess.check_output(['tesseract', '--version'], text=True).splitlines()[0]}
    memory = Path('/sys/fs/cgroup/memory.peak')
    report['containerMemoryPeakBytes'] = int(memory.read_text()) if memory.exists() else None
    (args.output/(args.engine+'.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()
