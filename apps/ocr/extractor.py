"""CPU-only purchase capture reader using Tesseract and OpenCV cell segmentation.
No fixture imports, truth labels or persistence.
"""
import datetime as dt
import io
import os
import re
import sys
import unicodedata
import uuid

import cv2
import numpy as np
from PIL import Image, ImageOps
import pytesseract

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None

VERSION = 'tesseract5-spa-grid8-layout-v1'
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000
HEADER = 'requestNumber oracleId sender recipient sentDate sentTime description totalAmount taxAmount attachmentReference'.split()
LINES = 'description provider costCenter lineUnit quantity price amount chargeAccount universityCode campusCode unitCode projectCode accountingCode'.split()
ADMIN = 'document documentType bi rut unitName item paymentSituation'.split()
COLUMNS = [('description', 'descripcion'), ('provider', 'proveedor'), ('costCenter', 'centro de costos'),
           ('lineUnit', 'unidad'), ('quantity', 'cantidad'), ('price', 'precio'), ('amount', 'importe'), ('chargeAccount', 'cuenta de cargo')]
WEIGHTS = {}


class _SimpleTable:
    def __init__(self, rows, columns):
        self._rows = [list(r) for r in rows]
        self.columns = list(columns)
        self.attrs = {}

    @property
    def empty(self):
        return len(self._rows) == 0

    def __len__(self):
        return len(self._rows)

    def to_numpy(self):
        return self._rows


def _make_dataframe(rows, columns):
    if pd is not None:
        return pd.DataFrame(rows, columns=columns) if columns else pd.DataFrame()
    return _SimpleTable(rows, columns)


class ProcessingError(Exception):
    def __init__(self, code, status):
        self.code, self.status = code, status


class TesseractEngine:
    """Adapter representing the verified local Tesseract OCR runtime."""
    is_tesseract = True


def load_engine(_model_dir=None):
    try:
        pytesseract.get_tesseract_version()
        langs = pytesseract.get_languages(config='')
    except Exception as error:
        raise RuntimeError('Tesseract runtime unavailable') from error
    if 'spa' not in langs:
        raise RuntimeError('Spanish language pack (spa) missing in Tesseract')
    return TesseractEngine()


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


def _agrupar_coordenadas_1d(coords, gap=5):
    """Agrupa coordenadas 1D cercanas en su posición media."""
    clusters = []
    for c in coords:
        if not clusters or c - clusters[-1][-1] > gap:
            clusters.append([int(c)])
        else:
            clusters[-1].append(int(c))
    return [int(np.mean(cl)) for cl in clusters]


def collapse(values):
    return _agrupar_coordenadas_1d(values, gap=5)


def _limpiar_tooltip_en_celda(gray):
    """
    Si una celda tiene un cuadro flotante (tooltip de Oracle con fondo gris más oscuro
    que el fondo de la celda), lo enmascara al color del fondo para no contaminar el OCR.
    """
    if gray.size == 0:
        return gray
    local_bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, np.ones((9, 15), np.uint8))
    cell_bg = float(np.percentile(local_bg, 85))
    if cell_bg < 238:
        return gray
    tooltip_mask = (local_bg <= cell_bg - 7).astype(np.uint8) * 255
    if np.sum(tooltip_mask > 0) > 100:
        tooltip_mask = cv2.dilate(tooltip_mask, np.ones((5, 5), np.uint8))
        limpia = gray.copy()
        limpia[tooltip_mask > 0] = int(cell_bg)
        return limpia
    return gray


def ocr_celda(celda_bgr, recortar_borde=True):
    """
    Preprocesa el recorte de una celda individual y extrae su texto con Tesseract.
    Usa el mínimo de los canales BGR para que enlaces azules ('Anexos') tengan igual
    contraste que el texto negro.
    """
    if celda_bgr is None or celda_bgr.size == 0:
        return ""

    h, w = celda_bgr.shape[:2]
    if recortar_borde and h > 6 and w > 6:
        pad = 2
        crop = celda_bgr[pad : h - pad, pad : w - pad]
    else:
        crop = celda_bgr

    if crop.size == 0:
        return ""

    gray = np.min(crop, axis=2) if crop.ndim == 3 else crop.copy()
    gray = _limpiar_tooltip_en_celda(gray)

    if np.min(gray) > 185 or np.sum(gray < 165) < 5 or float(np.percentile(gray, 85)) < 180:
        return ""

    scale = 3.0 if h < 60 else 2.0
    big = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    bg = float(np.percentile(big, 85))
    hi = max(225.0, bg - 3.0)
    norm = np.clip((big.astype(np.float32) - 20.0) * (255.0 / (hi - 20.0)), 0, 255).astype(np.uint8)
    norm = cv2.copyMakeBorder(norm, 16, 16, 16, 16, cv2.BORDER_CONSTANT, value=255)

    config_custom = r"--oem 3 --psm 6"
    texto = pytesseract.image_to_string(norm, lang="spa", config=config_custom)
    return " ".join(texto.split())


def _detectar_lineas_horizontales(gray, scale):
    """Detecta las líneas divisorias horizontales de la interfaz y tablas."""
    h, w = gray.shape
    margin_x = int(w * 0.008)
    bg_v = cv2.dilate(gray, np.ones((7, 1), np.uint8))
    diff_h = bg_v - gray
    diff_h[:, :margin_x] = 0
    diff_h[:, w - margin_x :] = 0

    bw_h = (diff_h >= 3.5).astype(np.uint8) * 255
    horiz = cv2.morphologyEx(
        bw_h,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(1, w // 25), 1)),
    )
    ys = np.where(np.sum(horiz > 0, axis=1) > w * 0.45)[0]
    return _agrupar_coordenadas_1d(ys, gap=max(4, int(4 * scale)))


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
    arr = np.array(image)
    gray = np.min(arr, axis=2) if arr.ndim == 3 else arr
    if np.min(gray) > 200 or np.sum(gray < 180) < 5:
        return []
    scale = 2.0 if image.width >= 1000 else 2.5
    big = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    data = pytesseract.image_to_data(big, lang='spa', config='--oem 3 --psm 6', output_type=pytesseract.Output.DICT)
    words = []
    for i, text in enumerate(data.get('text', [])):
        clean = text.strip()
        try:
            conf = float(data['conf'][i])
        except (ValueError, TypeError):
            conf = -1.0
        if clean and conf >= 0:
            words.append({
                'text': clean,
                'x': float(data['left'][i]) / scale,
                'y': float(data['top'][i]) / scale,
                'w': float(data['width'][i]) / scale,
                'h': float(data['height'][i]) / scale,
            })
    return words


def read_cell(engine, image, detect=False):
    arr = cv2.cvtColor(np.array(image.convert('RGB')), cv2.COLOR_RGB2BGR)
    text = ocr_celda(arr, recortar_borde=False)
    return text.strip() or None


def add_region(regions, path, bounds, image):
    if regions is None or image is None:
        return
    left, top, right, bottom = bounds
    left, right = max(0, left), min(image.width, right)
    top, bottom = max(0, top), min(image.height, bottom)
    if right > left and bottom > top:
        regions.append({'path': path, 'x': left / image.width, 'y': top / image.height,
                        'width': (right - left) / image.width, 'height': (bottom - top) / image.height})


def word_region(regions, path, words, image):
    if words and image is not None:
        add_region(regions, path, (min(w['x'] for w in words), min(w['y'] for w in words),
                                  max(w['x'] + w['w'] for w in words), max(w['y'] + w['h'] for w in words)), image)


def _ink_bounds(crop_bgr, fallback_bounds):
    if crop_bgr is None or crop_bgr.size == 0:
        return fallback_bounds
    gray = np.min(crop_bgr, axis=2) if crop_bgr.ndim == 3 else crop_bgr
    ys, xs = np.where(gray < 185)
    if len(xs) == 0:
        return fallback_bounds
    x0, y0, _, _ = fallback_bounds
    return (x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1)


def _particionar_cabecera(img, line_ys, scale, groups=None, regions=None, image=None):
    """
    Particiona la sección superior de datos generales en celdas (Campo, Valor),
    separando el bloque izquierdo (Desde, A, Enviado, ID) y el bloque derecho
    (Descripción, Total, Impuesto, Anexos).
    """
    h, w = img.shape[:2]
    filas_cabecera = []
    celdas_ubicadas = []

    title = next((g for g in (groups or []) if 'interna de compra' in normalize(g['text'])), None)
    start = next((g for g in (groups or []) if 'lineas de solicitud' in normalize(g['text'])), None)

    band = None
    for y1, y2 in zip(line_ys[:-1], line_ys[1:]):
        if int(105 * scale) < (y2 - y1) < int(240 * scale) and y1 < max(int(h * 0.25), int(180 * scale)):
            band = (y1, y2, True)
            break
    if band is None and title is not None:
        y1 = int(max(wd['y'] + wd['h'] for wd in title['words'])) + 4
        y2 = int(min(wd['y'] for wd in start['words'])) - 4 if start else h - 4
        if y2 - y1 > 30:
            band = (y1, y2, False)

    if band is not None:
        y1, y2, has_rule = band
        left_margin = int(w * 0.01)
        if not has_rule and title is not None:
            left_margin = max(left_margin, int(min(wd['x'] for wd in title['words'])) - 10)
        ty1 = max(0, y1 - max(30, int(45 * scale))) if has_rule else max(0, int(min(wd['y'] for wd in title['words'])) - 4)
        ty2 = max(1, y1 - 2)
        tx1, tx2 = max(int(w * 0.008), left_margin), int(w * 0.78)
        titulo_crop = img[ty1:ty2, tx1:tx2]
        titulo = ocr_celda(titulo_crop, recortar_borde=False)
        if titulo:
            filas_cabecera.append(["Título", titulo])
            celdas_ubicadas.append(("Título", titulo, _ink_bounds(titulo_crop, (tx1, ty1, tx2, ty2))))

        by2_left = y1 + int((y2 - y1) * 0.76) if has_rule else y2
        split_col = left_margin + int((w - left_margin) * 0.28)
        bloques = [
            (left_margin, split_col, y1 + (4 if has_rule else 0), by2_left),
            (split_col, int(w * 0.98), y1 + (4 if has_rule else 0), y2 - (4 if has_rule else 0)),
        ]
        for bx1, bx2, by1, by2 in bloques:
            sub = img[by1:by2, bx1:bx2]
            if sub.size == 0:
                continue
            sub_dark = (np.min(sub, axis=2) < 175).astype(np.uint8)
            col_sum = np.sum(sub_dark, axis=0)
            text_xs = np.where(col_sum > 0)[0]
            if len(text_xs) == 0:
                continue

            max_x = min(sub.shape[1], int(text_xs[0]) + max(235, int(275 * scale)))
            runs = []
            run_start = None
            for x in range(int(text_xs[0]), max_x):
                if col_sum[x] == 0:
                    if run_start is None:
                        run_start = x
                else:
                    if run_start is not None:
                        runs.append((x - run_start, run_start, x))
                        run_start = None
            if not runs:
                continue
            runs.sort(reverse=True)
            _, g_start, g_end = runs[0]
            split_x = (g_start + g_end) // 2

            lbl_dark = sub_dark[:, :split_x]
            rys = np.where(np.sum(lbl_dark, axis=1) > 0)[0]
            r_clusters = []
            for ry in rys:
                if not r_clusters or ry - r_clusters[-1][-1] > max(3, int(5 * scale)):
                    r_clusters.append([ry])
                else:
                    r_clusters[-1].append(ry)

            for ri, rc in enumerate(r_clusters):
                ry1 = max(0, rc[0] - int(4 * scale))
                if ri + 1 < len(r_clusters):
                    ry2 = max(
                        rc[-1] + int(5 * scale),
                        r_clusters[ri + 1][0] - int(3 * scale),
                    )
                else:
                    ry2 = sub.shape[0]

                val_crop = sub[ry1:ry2, split_x:]
                campo = ocr_celda(sub[ry1:ry2, :split_x], recortar_borde=False)
                valor = ocr_celda(val_crop, recortar_borde=False)
                if campo or valor:
                    filas_cabecera.append([campo, valor])
                    bounds = _ink_bounds(val_crop, (bx1 + split_x, by1 + ry1, bx2, by1 + ry2))
                    celdas_ubicadas.append((campo, valor, bounds))

    df = _make_dataframe(filas_cabecera, ["Campo", "Valor"])
    df.attrs["celdas_ubicadas"] = celdas_ubicadas
    return df


def _particionar_tablas_grilla(img, gray, line_ys, scale):
    """
    Detecta todas las tablas con bordes de grilla en la imagen, las segmenta
    en celdas individuales [fila, columna] y aplica OCR a cada celda.
    """
    h, w = gray.shape
    margin_x = int(w * 0.008)

    bg_h = cv2.dilate(gray, np.ones((1, 7), np.uint8))
    diff_v = bg_h - gray
    diff_v[:, :margin_x] = 0
    diff_v[:, w - margin_x :] = 0
    bw_v = (diff_v >= 2.5).astype(np.uint8)

    bandas = []
    for y1, y2 in zip(line_ys[:-1], line_ys[1:]):
        if y2 - y1 < h * 0.015 or y2 - y1 > h * 0.18:
            continue
        col_score = np.mean(bw_v[y1:y2, :], axis=0)
        xs = _agrupar_coordenadas_1d(
            np.where(col_score > 0.85)[0], gap=max(4, int(5 * scale))
        )
        internal_xs = [x for x in xs if w * 0.03 < x < w * 0.95]
        if len(internal_xs) < 3:
            xs = _agrupar_coordenadas_1d(
                np.where(col_score > 0.6)[0], gap=max(4, int(5 * scale))
            )
            internal_xs = [x for x in xs if w * 0.03 < x < w * 0.95]
        if len(internal_xs) >= 3:
            bandas.append((y1, y2, xs))

    tablas_raw = []
    for y1, y2, xs in bandas:
        if not tablas_raw or abs(y1 - tablas_raw[-1]["rows"][-1][1]) > max(
            6, int(6 * scale)
        ):
            tablas_raw.append({"rows": [(y1, y2)], "all_xs": [xs]})
        else:
            tablas_raw[-1]["rows"].append((y1, y2))
            tablas_raw[-1]["all_xs"].append(xs)

    nombres_tablas = [
        "Líneas de Solicitud Interna",
        "Secuencia de Aprobación",
    ]
    dataframes = {}

    for ti, t in enumerate(tablas_raw):
        row_xs = sorted([x for r in t["all_xs"] for x in r])
        clusters = []
        for x in row_xs:
            if not clusters or x - clusters[-1][-1] > max(5, int(6 * scale)):
                clusters.append([x])
            else:
                clusters[-1].append(x)

        min_count = max(2, (len(t["rows"]) + 1) // 2) if len(t["rows"]) > 1 else 1
        valid_xs = [int(np.mean(c)) for c in clusters if len(c) >= min_count]

        hy1, hy2 = t["rows"][0]
        h_xs = _agrupar_coordenadas_1d(
            np.where(np.mean(bw_v[hy1:hy2, :], axis=0) > 0.5)[0],
            gap=max(4, int(5 * scale)),
        )
        if h_xs and h_xs[-1] > w * 0.9 and (not valid_xs or h_xs[-1] - valid_xs[-1] > 20):
            valid_xs.append(h_xs[-1])
        if h_xs and h_xs[0] < w * 0.05 and (not valid_xs or valid_xs[0] - h_xs[0] > 20):
            valid_xs.insert(0, h_xs[0])

        matriz_celdas = []
        for y1, y2 in t["rows"]:
            fila = [
                ocr_celda(img[y1:y2, x1:x2], recortar_borde=True)
                for x1, x2 in zip(valid_xs[:-1], valid_xs[1:])
            ]
            matriz_celdas.append(fila)

        if matriz_celdas:
            encabezados = [
                col if col else f"Col_{i+1}" for i, col in enumerate(matriz_celdas[0])
            ]
            filas_datos = matriz_celdas[1:]
            df = _make_dataframe(filas_datos, encabezados)
        else:
            df = _make_dataframe([], [])

        nombre = (
            nombres_tablas[ti] if ti < len(nombres_tablas) else f"Tabla_{ti + 1}"
        )
        dataframes[nombre] = df

    return dataframes


def table(engine, image, groups, regions=None):
    start = next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])), None)
    end = next((g for g in groups if 'secuencia de aprobacion' in normalize(g['text'])), None)
    if not start and not end and groups:
        return None

    img = cv2.cvtColor(np.array(image.convert('RGB')), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = gray.shape
    scale = w / 1700.0
    line_ys = _detectar_lineas_horizontales(gray, scale)
    if start:
        line_ys = [y for y in line_ys if y >= int(start['center'])]
    if end:
        line_ys = [y for y in line_ys if y <= int(end['center'])]
    if len(line_ys) < 3:
        return None

    margin_x = max(5, int(w * 0.008))
    bg_h = cv2.dilate(gray, np.ones((1, 7), np.uint8))
    diff_v = bg_h - gray
    diff_v[:, :margin_x] = 0
    diff_v[:, w - margin_x :] = 0
    bw_v = (diff_v >= 2.5).astype(np.uint8)

    section_left = min((wd['x'] for wd in start['words']), default=0) if start else 0
    tolerance = max(5, max((wd['h'] for wd in start['words']), default=12) * .4) if start else 5

    bandas = []
    for y1, y2 in zip(line_ys[:-1], line_ys[1:]):
        if y2 - y1 < h * 0.015 or y2 - y1 > h * 0.25:
            continue
        col_score = np.mean(bw_v[y1:y2, :], axis=0)
        xs = _agrupar_coordenadas_1d(np.where(col_score > 0.85)[0], gap=max(4, int(5 * scale)))
        xs = [x for x in xs if x >= section_left - tolerance]
        internal_xs = [x for x in xs if w * 0.03 < x < w * 0.95]
        if len(internal_xs) < 3:
            xs = _agrupar_coordenadas_1d(np.where(col_score > 0.6)[0], gap=max(4, int(5 * scale)))
            xs = [x for x in xs if x >= section_left - tolerance]
            internal_xs = [x for x in xs if w * 0.03 < x < w * 0.95]
        if len(internal_xs) >= 3:
            bandas.append((y1, y2, xs))

    if not bandas:
        return None

    tablas_raw = []
    for y1, y2, xs in bandas:
        if not tablas_raw or abs(y1 - tablas_raw[-1]["rows"][-1][1]) > max(6, int(6 * scale)):
            tablas_raw.append({"rows": [(y1, y2)], "all_xs": [xs]})
        else:
            tablas_raw[-1]["rows"].append((y1, y2))
            tablas_raw[-1]["all_xs"].append(xs)

    selected = None
    for t in tablas_raw:
        row_xs = sorted([x for r in t["all_xs"] for x in r])
        clusters = []
        for x in row_xs:
            if not clusters or x - clusters[-1][-1] > max(5, int(6 * scale)):
                clusters.append([x])
            else:
                clusters[-1].append(x)
        min_count = max(2, (len(t["rows"]) + 1) // 2) if len(t["rows"]) > 1 else 1
        valid_xs = [int(np.mean(c)) for c in clusters if len(c) >= min_count]
        hy1, hy2 = t["rows"][0]
        h_xs = [x for x in _agrupar_coordenadas_1d(np.where(np.mean(bw_v[hy1:hy2, :], axis=0) > 0.5)[0], gap=max(4, int(5 * scale))) if x >= section_left - tolerance]
        if h_xs and h_xs[-1] > w * 0.9 and (not valid_xs or h_xs[-1] - valid_xs[-1] > 20):
            valid_xs.append(h_xs[-1])
        if h_xs and h_xs[0] < w * 0.08 and (not valid_xs or valid_xs[0] - h_xs[0] > 20):
            valid_xs.insert(0, h_xs[0])
        if len(valid_xs) == 9 and not any(b - a < 7 for a, b in zip(valid_xs, valid_xs[1:])):
            selected = (t["rows"], valid_xs)
            break

    if selected is None:
        return None

    table_rows, xs = selected
    if len(table_rows) < 2:
        return None
    body_rows = table_rows[1:]
    if len(body_rows) > 100:
        raise ProcessingError('LINE_LIMIT_EXCEEDED', 422)

    rows = []
    for position, (top, bottom) in enumerate(body_rows):
        row = {}
        for i, (key, _) in enumerate(COLUMNS):
            bounds = (xs[i] + 2, top + 2, xs[i + 1] - 2, bottom - 2)
            row[key] = read_cell(engine, image.crop(bounds), detect=i < 3)
            if row[key]:
                add_region(regions, f'/lines/{position}/{key}', bounds, image)
        rows.append(row)
    return rows


def _map_header_label(label_text):
    norm = normalize(label_text).strip(' :.')
    if not norm:
        return None
    if norm == 'titulo':
        return 'title'
    if norm == 'desde':
        return 'sender'
    if norm == 'a':
        return 'recipient'
    if norm.startswith('enviado'):
        return 'sentDate'
    if norm in ('id', '1d', '|d', 'ld'):
        return 'oracleId'
    if 'descripcion' in norm:
        return 'description'
    if norm.startswith('total'):
        return 'totalAmount'
    if 'impuesto' in norm:
        return 'taxAmount'
    if 'anexo' in norm:
        return 'attachmentReference'
    return None


def header(groups, engine=None, image=None, regions=None):
    result = {}
    recorded_paths = set()

    # 1. When image is available, run cell-level header partitioning
    if image is not None:
        img = cv2.cvtColor(np.array(image.convert('RGB')), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        scale = gray.shape[1] / 1700.0
        line_ys = _detectar_lineas_horizontales(gray, scale)
        df_cab = _particionar_cabecera(img, line_ys, scale, groups=groups, regions=regions, image=image)
        for campo, valor, bounds in df_cab.attrs.get('celdas_ubicadas', []):
            mapped = _map_header_label(campo)
            if mapped == 'title' and valor:
                match = re.search(r'compra\s+(\S+)', valor, re.I)
                if match:
                    result['requestNumber'] = match.group(1)
                    add_region(regions, '/header/requestNumber', bounds, image)
                    recorded_paths.add('/header/requestNumber')
            elif mapped and valor:
                clean_val = valor.strip()
                if mapped == 'taxAmount':
                    clean_val = re.sub(r'^\(?No\s+Recuperable\)?\s*', '', clean_val, flags=re.I).strip()
                if mapped == 'attachmentReference':
                    clean_val = re.sub(r'\s+\.(pdf|jpg|png)$', r'.\1', clean_val, flags=re.I)
                    clean_val = re.sub(r'\.\s+(pdf|jpg|png)$', r'.\1', clean_val, flags=re.I)
                if clean_val:
                    result[mapped] = clean_val
                    path = '/header/' + mapped
                    add_region(regions, path, bounds, image)
                    recorded_paths.add(path)
                    if mapped == 'sentDate' and re.search(r'\d{2}:\d{2}:\d{2}', clean_val):
                        add_region(regions, '/header/sentTime', bounds, image)
                        recorded_paths.add('/header/sentTime')

    # 2. Fallback / word-group extraction for any fields not yet populated (or unit tests without real image)
    title = next((g for g in groups if 'interna de compra' in normalize(g['text'])), None)
    if not title:
        return result
    if not result.get('requestNumber'):
        match = re.search(r'compra\s+(\S+)', title['text'], re.I)
        result['requestNumber'] = match.group(1) if match else None
        if match and '/header/requestNumber' not in recorded_paths:
            used = [w for w in title['words'] if re.search(r'(?<!\w)' + re.escape(match.group(1)) + r'(?!\w)', w['text'])]
            word_region(regions, '/header/requestNumber', used, image)
            recorded_paths.add('/header/requestNumber')
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
    split = min((w['x'] for key, _, w in anchors if key not in left_keys), default=None)
    for key, group, word in anchors:
        if result.get(key):
            continue
        same_column = [(k, g, w) for k, g, w in anchors if (k in left_keys) == (key in left_keys)]
        center = word['y'] + word['h'] / 2
        next_word = min((w for _, _, w in same_column if w['y'] + w['h'] / 2 > center + 2), key=lambda w: w['y'] + w['h'] / 2, default=None)
        next_center = next_word['y'] + next_word['h'] / 2 if next_word else None
        previous_center = max((w['y'] + w['h'] / 2 for _, _, w in same_column if w['y'] + w['h'] / 2 < center - 2), default=None)
        next_y = next_center - min(next_word['h'] / 2, (next_center - center) * .35) if next_word else start['center'] if start else center + word['h']
        top = center - min(word['h'] / 2, (center - previous_center) * .35) if previous_center is not None else center - word['h'] / 2
        right = split - 3 if key in left_keys and split is not None else float('inf')
        left = word['x'] + word['w'] - 1
        found = [w for g in region for w in g['words'] if top <= w['y'] + w['h'] / 2 < next_y and left < w['x'] < right]
        raw = ' '.join(w['text'] for w in found)
        if key == 'sentDate' and found and engine is not None and image is not None:
            bounds = (max(0, int(min(w['x'] for w in found)) - 2), max(0, int(min(w['y'] for w in found)) - 2),
                      min(image.width, int(max(w['x'] + w['w'] for w in found)) + 2),
                      min(image.height, int(max(w['y'] + w['h'] for w in found)) + 2))
            raw = read_cell(engine, image.crop(bounds)) or raw
        if key == 'taxAmount':
            raw = re.sub(r'^\(No Recuperable\)\s*', '', raw, flags=re.I)
        result[key] = raw.strip() or None
        if result[key]:
            path = '/header/' + key
            if path not in recorded_paths:
                word_region(regions, path, found, image)
            if key == 'sentDate' and re.search(r'\d{2}:\d{2}:\d{2}', raw) and '/header/sentTime' not in recorded_paths:
                word_region(regions, '/header/sentTime', found, image)
    return result


def capture_layout(groups, lines, table_verified=False, header_fields_count=0):
    title = next((g for g in groups if 'solicitud interna de compra' in normalize(g['text'])), None)
    section = next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])), None)
    labels = set()
    if title:
        for group in groups:
            if group['center'] <= title['center'] or (section and group['center'] >= section['center']):
                continue
            labels.update(normalize(word['text']).strip(':') for word in group['words'] if normalize(word['text']).strip(':') in ['desde', 'enviado', 'id', '1d', 'total'])
    signals = []
    if title:
        signals.append('request_title')
    if len(labels) >= 2 or header_fields_count >= 2:
        signals.append('header_fields')
    if section:
        signals.append('line_section')
    if lines is not None or table_verified:
        signals.append('eight_column_table')
    if not ((title and 'header_fields' in signals) or (section and 'eight_column_table' in signals)):
        raise ProcessingError('UNSUPPORTED_CAPTURE_LAYOUT', 422)
    return {'status': 'compatible' if len(signals) == 4 else 'partial', 'signals': signals}


def money(raw):
    value = re.sub(r'\s*(?:CLP|\$)\s*', '', raw, flags=re.I).strip()
    if re.fullmatch(r'\d+', value):
        return str(int(value))
    if re.fullmatch(r'[1-9]\d{0,2}(?:\.\d{3})+', value):
        return value.replace('.', '')
    return None


MONTHS = {name: i + 1 for i, names in enumerate(['ene jan', 'feb', 'mar', 'abr apr', 'may', 'jun', 'jul', 'ago aug', 'sep sept', 'oct', 'nov', 'dic dec']) for name in names.split()}


def sent(raw):
    match = re.fullmatch(r'(\d{2})[-/](\d{2}|[A-Za-z]{3,4})[-/](\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?', raw)
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
    head = {k: field(k, raw_header.get(k), '/header/' + k) for k in HEADER}
    lines = [{k: field(k, row.get(k), f'/lines/{i}/{k}') for k in LINES} for i, row in enumerate(raw_lines or [])]
    if raw_lines is None:
        issues.append({'path': '/lines', 'code': 'TABLE_STRUCTURE_UNRECOGNIZED', 'message': 'No se pudo reconstruir la tabla de ocho columnas. Revisa o reemplaza la captura.'})
    if not any(v['status'] == 'recovered' for fields in [head, *lines] for v in fields.values()):
        raise ProcessingError('EXTRACTION_NO_DATA', 422)
    return {'data': {'extractionId': str(uuid.uuid4()), 'status': 'reviewRequired', 'input': metadata,
                     'header': head, 'lines': lines, 'administrative': {k: field(k, None, '/administrative/' + k) for k in ADMIN}, 'issues': issues}}


def extract(engine, content, name, mime):
    try:
        image = decode(content, mime)
    except ProcessingError as error:
        if error.code == 'UNSUPPORTED_MEDIA_TYPE' and name and name.lower().endswith(('.jpg', '.jpeg', '.png')) and mime in ('image/jpeg', 'image/png'):
            alt_mime = 'image/png' if mime == 'image/jpeg' else 'image/jpeg'
            image = decode(content, alt_mime)
        else:
            raise
    groups = grouped(tokens(engine, image))
    regions = []
    try:
        lines = table(engine, image, groups, regions)
    except ProcessingError as error:
        if error.code != 'LINE_LIMIT_EXCEEDED':
            raise
        raw_head = header(groups, engine, image, regions)
        h_count = sum(1 for k in ('sender', 'sentDate', 'oracleId', 'totalAmount') if raw_head.get(k))
        result = candidates(raw_head, None, {'name': name, 'mimeType': mime, 'bytes': len(content), 'width': image.width, 'height': image.height})
        result['data']['regions'] = regions
        result['data']['captureLayout'] = capture_layout(groups, None, table_verified=True, header_fields_count=h_count)
        result['data']['issues'].append({'path': '/lines', 'code': 'LINE_LIMIT_EXCEEDED', 'message': 'La tabla supera 100 ítems; no se han truncado silenciosamente.'})
        return result
    raw_head = header(groups, engine, image, regions)
    h_count = sum(1 for k in ('sender', 'sentDate', 'oracleId', 'totalAmount') if raw_head.get(k))
    layout = capture_layout(groups, lines, header_fields_count=h_count)
    result = candidates(raw_head, lines, {'name': name, 'mimeType': mime, 'bytes': len(content), 'width': image.width, 'height': image.height})
    result['data']['regions'] = regions
    result['data']['captureLayout'] = layout
    return result


def crear_borrador_formulario(response):
    """
    Transforma el contrato `ExtractionResponse` (`{"data": ...}`) en el borrador
    editable del formulario de compras (`ExtractionReviewDraft`: `header`, `lines`,
    `administrative`), equivalente a `createReviewDraft` en `@cenit/contracts/purchases`.
    """
    data = response['data'] if isinstance(response, dict) and 'data' in response else response
    return {
        'header': {k: data['header'][k]['value'] for k in HEADER},
        'lines': [{k: row[k]['value'] for k in LINES} for row in data.get('lines', [])],
        'administrative': {k: data['administrative'][k]['value'] for k in ADMIN},
    }



def formatear_tabla_ascii(df, max_ancho_col=48):
    """Devuelve una representación en tabla con bordes Unicode de cada celda del DataFrame."""
    if df is None or ( df.empty and len(df.columns) == 0 ):
        return "(Tabla vacía)"

    columnas = [str(c) for c in df.columns]
    filas = [[str(v) if v is not None else "" for v in row] for row in df.to_numpy()]

    def envolver(texto, ancho):
        if not texto:
            return [""]
        palabras = texto.split(" ")
        lineas, actual = [], ""
        for p in palabras:
            while len(p) > ancho:
                if actual:
                    lineas.append(actual)
                    actual = ""
                lineas.append(p[:ancho])
                p = p[ancho:]
            if not actual:
                actual = p
            elif len(actual) + 1 + len(p) <= ancho:
                actual += " " + p
            else:
                lineas.append(actual)
                actual = p
        if actual or not lineas:
            lineas.append(actual)
        return lineas

    anchos = []
    for ci, col in enumerate(columnas):
        max_len = len(col)
        for f in filas:
            max_len = max(max_len, len(f[ci]))
        anchos.append(min(max(max_len, 3), max_ancho_col))

    def linea_sep(izq, med, der, relleno="─"):
        return izq + med.join(relleno * (a + 2) for a in anchos) + der

    def render_fila(celdas):
        envueltas = [envolver(celdas[ci], anchos[ci]) for ci in range(len(columnas))]
        alto = max(len(e) for e in envueltas)
        out = []
        for li in range(alto):
            partes = []
            for ci in range(len(columnas)):
                val = envueltas[ci][li] if li < len(envueltas[ci]) else ""
                partes.append(" " + val.ljust(anchos[ci]) + " ")
            out.append("│" + "│".join(partes) + "│")
        return "\n".join(out)

    bloques = [
        linea_sep("┌", "┬", "┐"),
        render_fila(columnas),
        linea_sep("├", "┼", "┤", "═"),
    ]
    for fi, f in enumerate(filas):
        bloques.append(render_fila(f))
        if fi + 1 < len(filas):
            bloques.append(linea_sep("├", "┼", "┤"))
    bloques.append(linea_sep("└", "┴", "┘"))
    return "\n".join(bloques)


def extraer_tablas_solicitud(ruta_imagen):
    """
    Particiona la imagen en sus tablas constitutivas (Cabecera, Líneas de Solicitud
    Interna y Secuencia de Aprobación), aplica OCR celda por celda y retorna un
    diccionario de tablas.
    """
    img = ruta_imagen.copy() if isinstance(ruta_imagen, np.ndarray) else cv2.imread(str(ruta_imagen))
    if img is None:
        raise FileNotFoundError(f"No se pudo cargar la imagen: {ruta_imagen}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    scale = gray.shape[1] / 1700.0

    line_ys = _detectar_lineas_horizontales(gray, scale)
    df_cabecera = _particionar_cabecera(img, line_ys, scale)
    tablas_grilla = _particionar_tablas_grilla(img, gray, line_ys, scale)

    resultado = {"Cabecera de Solicitud": df_cabecera}
    resultado.update(tablas_grilla)
    return resultado


def leer_solicitud(ruta_imagen):
    """
    Ejecuta la partición por celdas y devuelve el reporte tabular formateado con
    cada una de las tablas y celdas detectadas en la imagen.
    """
    tablas = extraer_tablas_solicitud(ruta_imagen)
    secciones = []
    for nombre_tabla, df in tablas.items():
        secciones.append(f"[{nombre_tabla}] ({len(df)} filas x {len(df.columns)} columnas)")
        secciones.append(formatear_tabla_ascii(df))
    return "\n\n".join(secciones)
