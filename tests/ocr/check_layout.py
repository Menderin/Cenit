"""Explicit visual-layout regression with real OCR, not an accuracy holdout."""
import hashlib
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
from fixtures import generate, font

root = Path('tmp/ocr-layout-v2')
root.mkdir(parents=True, exist_ok=True)
cases = generate(root/'sources', 'development')
source = Image.open(cases[0]['path']).convert('RGB')
blue = Image.new('RGB', source.size, '#1b4b68')
logo = Image.new('RGB', source.size, 'white')
ImageDraw.Draw(logo).text((30, 30), 'ORACLE Workflow', font=font(25), fill='#1b4b68')
landscape = Image.new('RGB', source.size, '#9cd8ed')
draw = ImageDraw.Draw(landscape)
draw.ellipse((900, 40, 1050, 190), fill='#fff2aa')
draw.polygon([(0, 500), (400, 160), (900, 650), (0, 650)], fill='#637f72')
draw.polygon([(400, 650), (1050, 200), (1420, 650)], fill='#526c5c')
title = Image.new('RGB', source.size, 'white')
ImageDraw.Draw(title).text((30, 30), 'Solicitud Interna de Compra 999', font=font(22), fill='black')
samples = [
    ('full', source, 'compatible'), ('grayscale', ImageOps.grayscale(source), 'compatible'),
    ('without-branding', source.crop((0, 40, source.width, source.height)), 'compatible'),
    ('header-only', Image.open(next(c['path'] for c in cases if c['case'] == 'partial')), 'partial'),
    ('table-only', source.crop((0, 215, source.width, source.height)), 'partial'),
    ('no-grid', Image.open(next(c['path'] for c in cases if c['case'] == 'no-grid')), 'partial'),
    ('blue-only', blue, 'UNSUPPORTED_CAPTURE_LAYOUT'), ('logo-only', logo, 'UNSUPPORTED_CAPTURE_LAYOUT'),
    ('landscape', landscape, 'UNSUPPORTED_CAPTURE_LAYOUT'), ('title-only', title, 'UNSUPPORTED_CAPTURE_LAYOUT'),
]
results = []
for name, image, expected in samples:
    path = root/(name+'.png')
    image.save(path)
    request = urllib.request.Request('http://127.0.0.1:8090/extract', path.read_bytes(), {'Content-Type': 'image/png', 'X-File-Name': path.name})
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=65) as response:
            body = json.load(response)
        actual = body['data']['captureLayout']['status']
        status = 200
    except urllib.error.HTTPError as error:
        status = error.code
        body = json.load(error)
        actual = body['code']
    results.append({'case': name, 'expected': expected, 'actual': actual, 'status': status,
                    'matches': actual == expected, 'seconds': time.perf_counter()-started,
                    'imageSha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    print(name, status, actual, flush=True)
report = {'date': '2026-10-14', 'purpose': 'Real OCR layout regression; not an independent accuracy holdout',
          'sourceHashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('apps/ocr').glob('*.py')}, 'cases': results}
(root/'summary.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
raise SystemExit(0 if all(r['matches'] for r in results) else 1)
