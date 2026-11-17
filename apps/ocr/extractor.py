"""CPU-only purchase capture reader. No fixture imports, truth labels or persistence."""
import datetime as dt
import hashlib
import io
import re
import unicodedata
import uuid
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

VERSION = 'ppocr5-latin-grid8-layout-v4'
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000
HEADER = 'requestNumber oracleId sender recipient sentDate sentTime description totalAmount taxAmount attachmentReference'.split()
LINES = 'description provider costCenter lineUnit quantity price amount chargeAccount universityCode campusCode unitCode projectCode accountingCode'.split()
ADMIN = 'document documentType bi rut unitName item paymentSituation'.split()
COLUMNS = [('description', 'descripcion'), ('provider', 'proveedor'), ('costCenter', 'centro de costos'),
           ('lineUnit', 'unidad'), ('quantity', 'cantidad'), ('price', 'precio'), ('amount', 'importe'), ('chargeAccount', 'cuenta de cargo')]
WEIGHTS = {
    'ch_PP-OCRv5_det_mobile.onnx': '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae',
    'latin_PP-OCRv5_rec_mobile.onnx': 'b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a',
}


class ProcessingError(Exception):
    def __init__(self, code, status):
        self.code, self.status = code, status


def load_engine(model_dir):
    for name, expected in WEIGHTS.items():
        if hashlib.sha256((Path(model_dir) / name).read_bytes()).hexdigest() != expected:
            raise RuntimeError('Model hash mismatch')
    from rapidocr import RapidOCR, LangRec, ModelType, OCRVersion
    return RapidOCR(params={'Rec.lang_type': LangRec.LATIN, 'Rec.model_type': ModelType.MOBILE,
        'Rec.ocr_version': OCRVersion.PPOCRV5, 'Det.model_type': ModelType.MOBILE,
        'Det.model_path': str(Path(model_dir) / 'ch_PP-OCRv5_det_mobile.onnx'),
        'Rec.model_path': str(Path(model_dir) / 'latin_PP-OCRv5_rec_mobile.onnx'),
        'Global.use_cls': False, 'EngineConfig.onnxruntime.intra_op_num_threads': 1,
        'EngineConfig.onnxruntime.inter_op_num_threads': 1})


def decode(content, mime):
    if len(content) > MAX_BYTES:
        raise ProcessingError('PAYLOAD_TOO_LARGE', 413)
    if not content:
        raise ProcessingError('INVALID_IMAGE', 422)
    try:
        with Image.open(io.BytesIO(content)) as original:
            actual = {'PNG': 'image/png', 'JPEG': 'image/jpeg'}.get(original.format)
            if not actual or actual != mime:
                raise ProcessingError('UNSUPPORTED_MEDIA_TYPE', 415)
            if original.width * original.height > MAX_PIXELS:
                raise ProcessingError('IMAGE_DIMENSIONS_EXCEEDED', 422)
            if getattr(original, 'n_frames', 1) != 1:
                raise ProcessingError('INVALID_IMAGE', 422)
            original.verify()
        with Image.open(io.BytesIO(content)) as original:
            original.load()  # Reject truncated streams before inference.
            image = ImageOps.exif_transpose(original).convert('RGB')
        return image
    except ProcessingError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ProcessingError('IMAGE_DIMENSIONS_EXCEEDED', 422) from None
    except Exception:
        raise ProcessingError('INVALID_IMAGE', 422) from None


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if not unicodedata.combining(c))


def grouped(words):
    groups = []
    for word in sorted(words, key=lambda w: w['y'] + w['h'] / 2):
        center = word['y'] + word['h'] / 2
        group = next((g for g in groups if abs(g['center'] - center) < max(4, word['h'] * .55)), None)
        if group is None:
            group = {'center': center, 'words': []}
            groups.append(group)
        group['words'].append(word)
    for group in groups:
        group['words'].sort(key=lambda w: w['x'])
        group['text'] = ' '.join(w['text'] for w in group['words'])
    return groups


def tokens(engine, image):
    result = engine(image, use_det=True, use_cls=False, return_word_box=True)
    words = []
    if result.boxes is None:
        return words
    # Use recognizer alignment: proportional character offsets misplace narrow labels
    # and can make the first word of a value overlap its label.
    entries = [(box, text) for line in result.word_results for text, _, box in line] if result.word_results else zip(result.boxes, result.txts)
    for box, text in entries:
        x, y = np.min(box, axis=0)
        right, bottom = np.max(box, axis=0)
        words.append({'text': text, 'x': float(x), 'y': float(y), 'w': float(right-x), 'h': float(bottom-y)})
    return words


def read_cell(engine, image, detect=False):
    if detect:
        enlarged = ImageOps.expand(image.resize((image.width*3, image.height*3), Image.Resampling.LANCZOS), border=12, fill='white')
        reading = engine(enlarged, use_det=True, use_cls=False, return_word_box=False)
        return ' '.join(reading.txts or []).strip() or None
    ink = np.array(image.convert('L')) < 150
    active = np.flatnonzero(ink.sum(axis=1) > 0)
    bands = []
    for y in active:
        if not bands or y - bands[-1][-1] > 3:
            bands.append([int(y)])
        else:
            bands[-1].append(int(y))
    # Tightly stacked text can merge into a single ink band. Compare its height
    # with the connected glyphs before sending several lines to the recognizer.
    _, _, components, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), 8)
    heights = components[1:, cv2.CC_STAT_HEIGHT]
    heights = heights[heights >= 4]
    if bands and len(heights) and max(len(band) for band in bands) > np.median(heights)*1.8:
        return read_cell(engine, image, detect=True)
    texts = []
    for band in bands:
        crop = image.crop((0, band[0], image.width, band[-1]+1))
        ys, xs = np.where(np.array(crop.convert('L')) < 150)
        if not len(xs):
            continue
        crop = ImageOps.expand(crop.crop((int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1)), border=3, fill='white')
        crop = crop.resize((max(3, round(crop.width*48/crop.height)), 48), Image.Resampling.LANCZOS)
        result = engine(crop, use_det=False, use_cls=False, return_word_box=False)
        texts.extend(result.txts or [])
    return ' '.join(texts).strip() or None


def collapse(values):
    groups = []
    for value in values:
        if not groups or value - groups[-1][-1] > 5:
            groups.append([int(value)])
        else:
            groups[-1].append(int(value))
    return [round(np.mean(g)) for g in groups]


def add_region(regions, path, bounds, image):
    if regions is None:
        return
    left, top, right, bottom = bounds
    left, right = max(0, left), min(image.width, right)
    top, bottom = max(0, top), min(image.height, bottom)
    if right > left and bottom > top:
        regions.append({'path': path, 'x': left/image.width, 'y': top/image.height,
                        'width': (right-left)/image.width, 'height': (bottom-top)/image.height})


def word_region(regions, path, words, image):
    if words and image is not None:
        add_region(regions, path, (min(w['x'] for w in words), min(w['y'] for w in words),
                                  max(w['x']+w['w'] for w in words), max(w['y']+w['h'] for w in words)), image)


def table(engine, image, groups, regions=None):
    start = next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])), None)
    end = next((g for g in groups if 'secuencia de aprobacion' in normalize(g['text'])), None)
    if not start or not end:
        return None
    edge = cv2.Canny(np.array(image.convert('L')), 3, 15)
    edge[:int(start['center']), :] = 0
    edge[int(end['center']):, :] = 0
    horizontal = cv2.morphologyEx(edge, cv2.MORPH_CLOSE, np.ones((1, 9), np.uint8))
    horizontal = cv2.morphologyEx(horizontal, cv2.MORPH_OPEN, np.ones((1, max(30, int(image.width*.4))), np.uint8))
    ys = collapse(np.flatnonzero((horizontal > 0).sum(axis=1) > image.width*.5))
    if len(ys) < 3:
        return None
    vertical = cv2.morphologyEx(edge, cv2.MORPH_CLOSE, np.ones((7, 1), np.uint8))
    vertical = cv2.morphologyEx(vertical, cv2.MORPH_OPEN, np.ones((max(15, int((ys[-1]-ys[0])*.4)), 1), np.uint8))
    xs = collapse(np.flatnonzero((vertical[ys[0]:ys[-1]] > 0).sum(axis=0) > (ys[-1]-ys[0])*.5))
    # Canny can place edges beside a collapsed center. Use all visible rules so
    # a tooltip covering part of the bottom border does not shorten the table.
    span = np.flatnonzero(np.any(horizontal[max(0, ys[0]-2):ys[-1]+3] > 0, axis=0))
    if len(span):
        # Exclude page/frame borders outside the table's horizontal extent.
        xs = [x for x in xs if span[0]-2 <= x <= span[-1]+2]
        # An open table can end with a horizontal rule instead of a vertical border.
        # Use the visible rule endpoints; all eight column labels are still required.
        for boundary in [int(span[0]), int(span[-1])]:
            if all(abs(boundary-x) > 3 for x in xs):
                xs.append(boundary)
        xs.sort()
    section_left = min(w['x'] for w in start['words'])
    tolerance = max(5, max(w['h'] for w in start['words'])*.4)
    xs = [x for x in xs if x >= section_left-tolerance]
    if len(xs) != 9 or any(b-a < 7 for a, b in zip(xs, xs[1:])):
        return None
    # Oracle adds a full-width controls row above the actual column headers.
    # Locate the header by its eight labels, rather than treating the first band as headers.
    header_index = None
    for band in range(min(3, len(ys)-1)):
        matches = True
        for index, (_, label) in enumerate(COLUMNS):
            crop = image.crop((xs[index]+3, ys[band]+3, xs[index+1]-3, ys[band+1]-3))
            text = read_cell(engine, crop)
            clean = re.sub(r'\s*\(clp\)', '', normalize(text or ''))
            if ' '.join(clean.split()) != label:
                # Descenders can bridge tightly stacked header lines in the ink mask.
                # Re-detect lines in the enlarged cell instead of guessing a label.
                enlarged = ImageOps.expand(crop.resize((crop.width*3, crop.height*3)), border=12, fill='white')
                reading = engine(enlarged, use_det=True, use_cls=False, return_word_box=False)
                clean = re.sub(r'\s*\(clp\)', '', normalize(' '.join(reading.txts or [])))
                if ' '.join(clean.split()) != label:
                    matches = False
                    break
        if matches:
            header_index = band
            break
    if header_index is None:
        return None
    body = ys[header_index+1:]
    if len(body)-1 > 100:
        raise ProcessingError('LINE_LIMIT_EXCEEDED', 422)
    rows = []
    for position, (top, bottom) in enumerate(zip(body, body[1:])):
        row = {}
        for i, (key, _) in enumerate(COLUMNS):
            bounds = (xs[i]+1, top+1, xs[i+1]-1, bottom-1)
            # Providers wrap into horizontal text lines. Re-detecting words in
            # an enlarged narrow cell can duplicate fragments of those lines.
            row[key] = read_cell(engine, image.crop(bounds), detect=i in [0, 2])
            if row[key]:
                add_region(regions, f'/lines/{position}/{key}', bounds, image)
        rows.append(row)
    return rows


def header(groups, engine=None, image=None, regions=None):
    result = {}
    title = next((g for g in groups if 'interna de compra' in normalize(g['text'])), None)
    if not title:
        return result
    match = re.search(r'compra\s+(\S+)', title['text'], re.I)
    result['requestNumber'] = match.group(1) if match else None
    if match:
        used = [w for w in title['words'] if re.search(r'(?<!\w)'+re.escape(match.group(1))+r'(?!\w)', w['text'])]
        word_region(regions, '/header/requestNumber', used, image)
    start = next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])), None)
    region = [g for g in groups if g['center'] > title['center'] and (not start or g['center'] < start['center'])]
    labels = {'sender': 'desde', 'recipient': 'a', 'sentDate': 'enviado', 'oracleId': 'id',
              'description': 'descripcion', 'totalAmount': 'total', 'taxAmount': 'impuesto', 'attachmentReference': 'anexos'}
    anchors = []
    for key, label in labels.items():
        for group in region:
            word = next((w for w in group['words'] if normalize(w['text']).strip(':') == label), None)
            if word:
                anchors.append((key, group, word))
                break
    left_keys = {'sender', 'recipient', 'sentDate', 'oracleId'}
    # Independent vertical flows: a recipient row must not consume a description continuation.
    split = min((w['x'] for key, _, w in anchors if key not in left_keys), default=None)
    for key, group, word in anchors:
        same_column = [(k, g, w) for k, g, w in anchors if (k in left_keys) == (key in left_keys)]
        center = word['y']+word['h']/2
        next_word = min((w for _, _, w in same_column if w['y']+w['h']/2 > center+2), key=lambda w:w['y']+w['h']/2, default=None)
        next_center = next_word['y']+next_word['h']/2 if next_word else None
        previous_center = max((w['y']+w['h']/2 for _, _, w in same_column if w['y']+w['h']/2 < center-2), default=None)
        next_y = next_center-min(next_word['h']/2,(next_center-center)*.35) if next_word else start['center'] if start else center+word['h']
        top = center-min(word['h']/2,(center-previous_center)*.35) if previous_center is not None else center-word['h']/2
        right = split-3 if key in left_keys and split is not None else float('inf')
        left = word['x']+word['w']-1
        found = [w for g in region for w in g['words'] if top <= w['y']+w['h']/2 < next_y and left < w['x'] < right]
        # Right-column labels share a right edge; the long tax label includes its qualifier.
        raw = ' '.join(w['text'] for w in found)
        if key == 'sentDate' and found and engine is not None and image is not None:
            # Re-read the actual date pixels at larger scale; never substitute O/0 or guess a month.
            bounds = (max(0, int(min(w['x'] for w in found))-2), max(0, int(min(w['y'] for w in found))-2),
                      min(image.width, int(max(w['x']+w['w'] for w in found))+2),
                      min(image.height, int(max(w['y']+w['h'] for w in found))+2))
            raw = read_cell(engine, image.crop(bounds)) or raw
        if key == 'taxAmount':
            raw = re.sub(r'^\(No Recuperable\)\s*', '', raw, flags=re.I)
        result[key] = raw.strip() or None
        if result[key]:
            word_region(regions, '/header/'+key, found, image)
            if key == 'sentDate' and re.search(r'\d{2}:\d{2}:\d{2}', raw):
                word_region(regions, '/header/sentTime', found, image)
    return result


def image_right(group):
    return max(w['x']+w['w'] for w in group['words'])+2


def capture_layout(groups, lines, table_verified=False):
    title = next((g for g in groups if 'solicitud interna de compra' in normalize(g['text'])), None)
    section = next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])), None)
    labels = set()
    if title:
        for group in groups:
            if group['center'] <= title['center'] or (section and group['center'] >= section['center']):
                continue
            labels.update(normalize(word['text']).strip(':') for word in group['words'] if normalize(word['text']).strip(':') in ['desde', 'enviado', 'id', 'total'])
    signals = []
    if title:
        signals.append('request_title')
    if len(labels) >= 2:
        signals.append('header_fields')
    if section:
        signals.append('line_section')
    if lines is not None or table_verified:
        signals.append('eight_column_table')
    if not ((title and len(labels) >= 2) or (section and 'eight_column_table' in signals)):
        raise ProcessingError('UNSUPPORTED_CAPTURE_LAYOUT', 422)
    return {'status': 'compatible' if len(signals) == 4 else 'partial', 'signals': signals}


def money(raw):
    value = re.sub(r'\s*(?:CLP|\$)\s*', '', raw, flags=re.I).strip()
    if re.fullmatch(r'\d+', value):
        return str(int(value))
    if re.fullmatch(r'[1-9]\d{0,2}(?:\.\d{3})+', value):
        return value.replace('.', '')
    return None


MONTHS = {name: i+1 for i, names in enumerate(['ene jan', 'feb', 'mar', 'abr apr', 'may', 'jun', 'jul', 'ago aug', 'sep sept', 'oct', 'nov', 'dic dec']) for name in names.split()}


def sent(raw):
    match = re.fullmatch(r'(?::\s*)?(\d{2})[-/](\d{2}|[A-Za-z]{3,4})[-/](\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?', raw)
    if not match:
        return None, None
    day, month, year, time = match.groups()
    month = int(month) if month.isdigit() else MONTHS.get(month.lower())
    try:
        date = dt.date(int(year), month, int(day)).isoformat()
        if time:
            dt.time.fromisoformat(time)
        return date, time
    except (ValueError, TypeError):
        return None, None


def candidates(raw_header, raw_lines, metadata):
    issues = []
    def field(key, raw, path, override=None):
        if raw is None or not raw.strip():
            return {'status': 'missing', 'value': None, 'rawText': None}
        raw = raw.strip()
        limit = 1000 if key == 'description' else 255
        if len(raw) > limit:
            issues.append({'path': path, 'code': 'FIELD_LIMIT_EXCEEDED', 'message': 'El texto recuperado supera el límite; revisa la captura.'})
            return {'status': 'invalid', 'value': None, 'rawText': None}
        value = override if override is not None else raw
        if key in ['totalAmount', 'taxAmount', 'price', 'amount']:
            value = money(raw)
        if key in ['sentDate', 'sentTime']:
            date, time = sent(raw)
            value = date if key == 'sentDate' else time
        if value is None:
            issues.append({'path': path, 'code': 'AMBIGUOUS_VALUE', 'message': 'No se pudo interpretar el valor sin ambigüedad.'})
            return {'status': 'ambiguous', 'value': None, 'rawText': raw}
        return {'status': 'recovered', 'value': value, 'rawText': raw}
    raw_header['sentTime'] = raw_header.get('sentDate') if raw_header.get('sentDate') and re.search(r'\d{2}:\d{2}:\d{2}', raw_header['sentDate']) else None
    head = {k: field(k, raw_header.get(k), '/header/'+k) for k in HEADER}
    lines = [{k: field(k, row.get(k), f'/lines/{i}/{k}') for k in LINES} for i, row in enumerate(raw_lines or [])]
    if raw_lines is None:
        issues.append({'path': '/lines', 'code': 'TABLE_STRUCTURE_UNRECOGNIZED', 'message': 'No se pudo reconstruir la tabla de ocho columnas. Revisa o reemplaza la captura.'})
    if not any(v['status'] == 'recovered' for fields in [head, *lines] for v in fields.values()):
        raise ProcessingError('EXTRACTION_NO_DATA', 422)
    return {'data': {'extractionId': str(uuid.uuid4()), 'status': 'reviewRequired', 'input': metadata,
                     'header': head, 'lines': lines, 'administrative': {k: field(k, None, '/administrative/'+k) for k in ADMIN}, 'issues': issues}}


def extract(engine, content, name, mime):
    image = decode(content, mime)
    groups = grouped(tokens(engine, image))
    regions = []
    try:
        lines = table(engine, image, groups, regions)
    except ProcessingError as error:
        if error.code != 'LINE_LIMIT_EXCEEDED':
            raise
        result = candidates(header(groups, engine, image, regions), None, {'name': name, 'mimeType': mime, 'bytes': len(content), 'width': image.width, 'height': image.height})
        result['data']['regions'] = regions
        result['data']['captureLayout'] = capture_layout(groups, None, table_verified=True)
        result['data']['issues'].append({'path': '/lines', 'code': 'LINE_LIMIT_EXCEEDED', 'message': 'La tabla supera 100 ítems; no se han truncado silenciosamente.'})
        return result
    layout = capture_layout(groups, lines)
    result = candidates(header(groups, engine, image, regions), lines, {'name': name, 'mimeType': mime, 'bytes': len(content), 'width': image.width, 'height': image.height})
    result['data']['regions'] = regions
    result['data']['captureLayout'] = layout
    return result
