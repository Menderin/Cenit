import io
import unittest
from unittest.mock import patch
import cv2
import numpy as np
from PIL import Image, ImageDraw
from extractor import (
    MAX_BYTES,
    VERSION,
    ProcessingError,
    _agrupar_coordenadas_1d,
    _detectar_lineas_horizontales,
    _limpiar_tooltip_en_celda,
    _particionar_cabecera,
    _particionar_tablas_grilla,
    add_region,
    candidates,
    capture_layout,
    decode,
    extract,
    extraer_tablas_solicitud,
    formatear_tabla_ascii,
    grouped,
    header,
    money,
    ocr_celda,
    read_cell,
    sent,
    table,
    tokens,
)


def image_bytes(size=(20, 20), mode='PNG'):
    output = io.BytesIO()
    Image.new('RGB', size, 'white').save(output, format=mode)
    return output.getvalue()


def build_synthetic_oracle_image():
    """
    Construye una imagen sintética de 1085x658 con la geometría real de una
    Solicitud Interna de Compra (líneas divisorias horizontales en y=92, 211,
    grilla de 8 columnas en y=249..341, y bloques de tinta en cabecera y celdas)
    para ejercitar la segmentación morfológica de OpenCV sin requerir binarios externos.
    """
    image = Image.new('RGB', (1085, 658), 'white')
    draw = ImageDraw.Draw(image)

    # Borde lateral de marco de página (debe ignorarse por margin_x)
    draw.line((1, 0, 1, 658), fill='#204d6b', width=2)

    # Reglas horizontales de cabecera (y=92 a y=211 -> altura 119px)
    draw.line((20, 92, 1069, 92), fill='#c4c9d0', width=1)
    draw.line((20, 211, 1069, 211), fill='#c4c9d0', width=1)

    # Tinta del título sobre la primera regla horizontal (y=68..80)
    draw.rectangle((25, 68, 320, 80), fill='#1c1f24')

    # Bloque izquierdo de cabecera (bx1=10..bx2=310): etiquetas en x=45..78, hueco en 79..92, valores en x=93..210
    for ry in [102, 121, 140, 159]:
        draw.rectangle((45, ry, 78, ry + 8), fill='#1c1f24')
        draw.rectangle((93, ry, 210, ry + 8), fill='#1c1f24')

    # Bloque derecho de cabecera (bx1=310..bx2=1063): etiquetas en x=430..486, hueco en 487..502, valores en x=503..720
    # Fila 0: Descripción multilínea
    draw.rectangle((430, 102, 486, 110), fill='#1c1f24')
    draw.rectangle((503, 102, 740, 120), fill='#1c1f24')
    # Fila 1: Total
    draw.rectangle((450, 132, 486, 140), fill='#1c1f24')
    draw.rectangle((503, 132, 610, 140), fill='#1c1f24')
    # Fila 2: Impuesto
    draw.rectangle((380, 151, 486, 159), fill='#1c1f24')
    draw.rectangle((503, 151, 580, 159), fill='#1c1f24')
    # Fila 3: Anexos (enlace azul #1d5ea8)
    draw.rectangle((440, 170, 486, 178), fill='#1c1f24')
    draw.rectangle((503, 170, 710, 178), fill='#1d5ea8')

    # Grilla de 8 columnas (9 divisores verticales) con barra de herramientas previa (226..249)
    xs = [20, 364, 452, 721, 766, 822, 864, 914, 1069]
    draw.rectangle((21, 249, 1068, 284), fill='#f1f3f6')
    for y in [226, 249, 285, 341]:
        draw.line((20, y, 1069, y), fill='#c4c9d0', width=1)
    for x in xs:
        draw.line((x, 249, x, 341), fill='#c4c9d0', width=1)

    # Tinta en encabezados de columna (y=260..272) y en celdas de datos (y=302..314)
    for x1, x2 in zip(xs[:-1], xs[1:]):
        draw.rectangle((x1 + 6, 260, min(x2 - 6, x1 + 36), 270), fill='#1c1f24')
        draw.rectangle((x1 + 6, 302, min(x2 - 6, x1 + 36), 314), fill='#1c1f24')

    return image


class ImageValidation(unittest.TestCase):
    def test_exif_orientation_defines_region_coordinates(self):
        output = io.BytesIO()
        image = Image.new('RGB', (80, 40), 'white')
        exif = image.getexif()
        exif[274] = 6
        image.save(output, format='JPEG', exif=exif)
        oriented = decode(output.getvalue(), 'image/jpeg')
        self.assertEqual(oriented.size, (40, 80))
        regions = []
        add_region(regions, '/header/description', (20, 20, 40, 60), oriented)
        self.assertEqual(regions, [{'path': '/header/description', 'x': .5, 'y': .25, 'width': .5, 'height': .5}])

    def test_png_and_jpeg(self):
        for fmt, mime in [('PNG', 'image/png'), ('JPEG', 'image/jpeg')]:
            self.assertEqual(decode(image_bytes(mode=fmt), mime).size, (20, 20))

    def test_size_limit(self):
        with self.assertRaises(ProcessingError) as error:
            decode(b'x' * (MAX_BYTES + 1), 'image/png')
        self.assertEqual(error.exception.status, 413)

    def test_dimensions_inclusive(self):
        self.assertEqual(decode(image_bytes((5000, 4000)), 'image/png').size, (5000, 4000))
        with self.assertRaises(ProcessingError) as error:
            decode(image_bytes((5001, 4000)), 'image/png')
        self.assertEqual(error.exception.code, 'IMAGE_DIMENSIONS_EXCEEDED')

    def test_invalid_and_truncated(self):
        for value in [b'', b'not a png', image_bytes()[:40], image_bytes(mode='JPEG')[:-100]]:
            with self.assertRaises(ProcessingError):
                decode(value, 'image/png' if not value.startswith(b'\xff\xd8') else 'image/jpeg')

    def test_fake_mime(self):
        with self.assertRaises(ProcessingError) as error:
            decode(image_bytes(), 'image/jpeg')
        self.assertEqual(error.exception.status, 415)

    def test_animated_png(self):
        output = io.BytesIO()
        Image.new('RGB', (20, 20), 'white').save(
            output, format='PNG', save_all=True, append_images=[Image.new('RGB', (20, 20), 'black')], duration=100, loop=0
        )
        with self.assertRaises(ProcessingError):
            decode(output.getvalue(), 'image/png')


class MorphologicalSegmentationAndCellOcr(unittest.TestCase):
    def test_agrupar_coordenadas_1d_clusters_within_gap(self):
        self.assertEqual(_agrupar_coordenadas_1d(np.array([], dtype=int), gap=5), [])
        coords = np.array([20, 21, 22, 90, 93, 95, 210])
        self.assertEqual(_agrupar_coordenadas_1d(coords, gap=4), [21, 92, 210])

    def test_limpiar_tooltip_en_celda_removes_floating_box_preserving_ink(self):
        gray = np.full((60, 180), 255, dtype=np.uint8)
        # Trazos de texto real oscuro (< 9px de grosor, deben conservarse tras MORPH_CLOSE(9, 15))
        gray[22:25, 12:70] = 25
        gray[30:33, 12:70] = 25
        # Tooltip flotante de Oracle (bloque de fondo gris 225 >= 9x15 con borde oscuro 150)
        gray[15:48, 95:165] = 225
        gray[15:17, 95:165] = 150
        gray[46:48, 95:165] = 150
        gray[15:48, 95:97] = 150
        gray[15:48, 163:165] = 150

        cleaned = _limpiar_tooltip_en_celda(gray)
        # El texto real sigue intacto
        self.assertEqual(int(np.min(cleaned[22:33, 12:70])), 25)
        # El interior del tooltip fue reemplazado por el color de fondo de la celda (255)
        self.assertGreaterEqual(int(np.min(cleaned[20:42, 102:158])), 250)

    def test_ocr_celda_normalizes_blue_links_skips_blank_and_calls_tesseract(self):
        # 1. Celda blanca vacía o negra sólida no invoca a pytesseract
        blank = np.full((40, 120, 3), 255, dtype=np.uint8)
        solid_black = np.zeros((40, 120, 3), dtype=np.uint8)
        with patch('extractor.pytesseract.image_to_string') as mocked_ocr:
            self.assertEqual(ocr_celda(blank), '')
            self.assertEqual(ocr_celda(solid_black), '')
            mocked_ocr.assert_not_called()

        # 2. Celda con trazos de enlace azul (#1d5ea8 -> BGR (168, 94, 29)) se contrasta por canal mínimo, escala 3x y añade borde 16px
        blue_cell = np.full((30, 90, 3), 255, dtype=np.uint8)
        blue_cell[12:15, 15:75] = (168, 94, 29)
        blue_cell[18:21, 15:60] = (168, 94, 29)
        captured = {}

        def fake_image_to_string(norm_img, lang=None, config=None):
            captured['shape'] = norm_img.shape
            captured['min_ink'] = int(np.min(norm_img))
            captured['border_val'] = int(norm_img[0, 0])
            captured['lang'] = lang
            captured['config'] = config
            return '  ANEXO_SI908640_DEMO.pdf \n '

        with patch('extractor.pytesseract.image_to_string', side_effect=fake_image_to_string):
            text = ocr_celda(blue_cell, recortar_borde=True)

        self.assertEqual(text, 'ANEXO_SI908640_DEMO.pdf')
        self.assertEqual(captured['lang'], 'spa')
        self.assertEqual(captured['config'], '--oem 3 --psm 6')
        # (30 - 4)*3 + 32 = 110 de alto; (90 - 4)*3 + 32 = 290 de ancho
        self.assertEqual(captured['shape'], (110, 290))
        self.assertEqual(captured['border_val'], 255)
        self.assertLess(captured['min_ink'], 30)

    def test_detectar_lineas_and_particionar_cabecera_extracts_fields_and_regions(self):
        image = build_synthetic_oracle_image()
        img_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        scale = gray.shape[1] / 1700.0

        line_ys = _detectar_lineas_horizontales(gray, scale)
        self.assertTrue(any(abs(y - 92) <= 2 for y in line_ys))
        self.assertTrue(any(abs(y - 211) <= 2 for y in line_ys))

        respuestas_cabecera = iter([
            'Solicitud Interna de Compra 908640',
            'Desde', 'PERSONA FICTICIA, ALFA',
            'A', 'PERSONA SINTÉTICA, BETA',
            'Enviado', '12-Oct-2026 16:35:54',
            'ID', '00329000',
            'Descripción', 'SERVICIO MULTILÍNEA DE PRUEBA',
            'Total', '440.000 CLP',
            'Impuesto', '(No Recuperable) 0 CLP',
            'Anexos', '2026-10-12 ANEXO_DEMO .pdf',
        ])

        regions = []
        with patch('extractor.ocr_celda', side_effect=lambda *args, **kwargs: next(respuestas_cabecera, '')):
            result = header([], image=image, regions=regions)

        self.assertEqual(result['requestNumber'], '908640')
        self.assertEqual(result['sender'], 'PERSONA FICTICIA, ALFA')
        self.assertEqual(result['recipient'], 'PERSONA SINTÉTICA, BETA')
        self.assertEqual(result['sentDate'], '12-Oct-2026 16:35:54')
        self.assertEqual(result['oracleId'], '00329000')
        self.assertEqual(result['description'], 'SERVICIO MULTILÍNEA DE PRUEBA')
        self.assertEqual(result['totalAmount'], '440.000 CLP')
        self.assertEqual(result['taxAmount'], '0 CLP')
        self.assertEqual(result['attachmentReference'], '2026-10-12 ANEXO_DEMO.pdf')

        paths = {r['path'] for r in regions}
        self.assertEqual(
            paths,
            {
                '/header/requestNumber',
                '/header/sender',
                '/header/recipient',
                '/header/sentDate',
                '/header/sentTime',
                '/header/oracleId',
                '/header/description',
                '/header/totalAmount',
                '/header/taxAmount',
                '/header/attachmentReference',
            },
        )
        self.assertTrue(all(0 <= r['x'] < r['x'] + r['width'] <= 1 and 0 <= r['y'] < r['y'] + r['height'] <= 1 for r in regions))
        self.assertFalse(any(r['path'].startswith('/administrative/') for r in regions))

    def test_grid_partitioning_skips_toolbar_and_page_frame_and_maps_eight_columns(self):
        image = build_synthetic_oracle_image()
        groups = [
            dict(center=198, text='Líneas de Solicitud Interna', words=[dict(x=20, h=14)]),
            dict(center=380, text='Secuencia de Aprobación', words=[dict(x=20, h=14)]),
        ]
        cell_values = iter([
            'SERVICIO DOCENTE',
            'PROVEEDOR DEMO SPA',
            '270101-Facultad Demo / 0000000-Sin Proyecto',
            '1',
            '2',
            '220000',
            '440000',
            '01.02.270101.0000000.410103',
        ])
        regions = []
        with patch('extractor.ocr_celda', side_effect=lambda *args, **kwargs: next(cell_values, '')):
            rows = table(None, image, groups, regions)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['description'], 'SERVICIO DOCENTE')
        self.assertEqual(rows[0]['provider'], 'PROVEEDOR DEMO SPA')
        self.assertEqual(rows[0]['costCenter'], '270101-Facultad Demo / 0000000-Sin Proyecto')
        self.assertEqual(rows[0]['lineUnit'], '1')
        self.assertEqual(rows[0]['quantity'], '2')
        self.assertEqual(rows[0]['price'], '220000')
        self.assertEqual(rows[0]['amount'], '440000')
        self.assertEqual(rows[0]['chargeAccount'], '01.02.270101.0000000.410103')
        self.assertEqual(len(regions), 8)
        self.assertEqual(
            {r['path'] for r in regions},
            {'/lines/0/' + key for key in ['description', 'provider', 'costCenter', 'lineUnit', 'quantity', 'price', 'amount', 'chargeAccount']},
        )
        self.assertTrue(all(0 <= r['x'] < r['x'] + r['width'] <= 1 and 0 <= r['y'] < r['y'] + r['height'] <= 1 for r in regions))

    def test_extraer_tablas_solicitud_and_ascii_formatter(self):
        image = build_synthetic_oracle_image()
        img_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        respuestas = iter([
            # Cabecera
            'Solicitud Interna de Compra 908640',
            'Desde', 'PERSONA FICTICIA, ALFA',
            'A', 'PERSONA SINTÉTICA, BETA',
            'Enviado', '12-Oct-2026 16:35:54',
            'ID', '00329000',
            'Descripción', 'SERVICIO MULTILÍNEA',
            'Total', '440.000 CLP',
            'Impuesto', '0 CLP',
            'Anexos', 'ANEXO.pdf',
            # Encabezados de grilla (8 columnas) + 1 fila de datos
            'Descripción', 'Proveedor', 'Centro de Costos', 'Unidad', 'Cantidad', 'Precio (CLP)', 'Importe (CLP)', 'Cuenta de Cargo',
            'ITEM 1', 'PROV 1', '270101-Demo', '1', '1', '440000', '440000', '01.02.270101',
        ])
        with patch('extractor.ocr_celda', side_effect=lambda *args, **kwargs: next(respuestas, '')):
            tablas = extraer_tablas_solicitud(img_bgr)

        self.assertIn('Cabecera de Solicitud', tablas)
        self.assertIn('Líneas de Solicitud Interna', tablas)
        ascii_box = formatear_tabla_ascii(tablas['Líneas de Solicitud Interna'])
        self.assertIn('Centro de Costos', ascii_box)
        self.assertIn('270101-Demo', ascii_box)


class CandidateMapping(unittest.TestCase):
    def test_header_word_group_fallback_when_image_is_blank(self):
        def word(text, x, y, width=35):
            return dict(text=text, x=x, y=y, w=width, h=10)
        words = [
            word('Solicitud Interna de Compra 001', 20, 20, 220),
            word('Desde', 40, 50), word('ALFA', 90, 50), word('Descripción', 400, 50, 80), word('SERVICIO', 500, 50),
            word('A', 65, 65, 10), word('BETA', 90, 65), word('MULTILÍNEA', 500, 65, 85),
            word('Enviado', 30, 80, 45), word('08-Dec-2025 16:35:54', 90, 80, 130),
            word('Total', 450, 80), word('440.000 CLP', 500, 80, 90),
            word('ID', 65, 95, 10), word('00325486', 90, 95, 80),
            word('Impuesto', 340, 95, 65), word('(No Recuperable)', 410, 95, 80), word('0 CLP', 500, 95),
            word('Anexos', 440, 110, 45), word('DEMO.pdf', 500, 110, 80),
            word('Líneas de Solicitud Interna', 20, 140, 220),
        ]
        regions = []
        result = header(grouped(words), image=Image.new('RGB', (1000, 200), 'white'), regions=regions)
        self.assertEqual(result['recipient'], 'BETA')
        self.assertEqual(result['description'], 'SERVICIO MULTILÍNEA')
        self.assertEqual(result['oracleId'], '00325486')
        self.assertEqual(result['sentDate'], '08-Dec-2025 16:35:54')
        self.assertEqual(result['taxAmount'], '0 CLP')
        description = next(r for r in regions if r['path'] == '/header/description')
        self.assertEqual(description, {'path': '/header/description', 'x': .5, 'y': .25, 'width': .085, 'height': .125})

    def test_layout_requires_structural_signals_not_oracle_or_blue(self):
        def group(text, center):
            return {'text': text, 'center': center, 'words': [{'text': word} for word in text.split()]}
        title = group('Solicitud Interna de Compra 0001', 10)
        head = group('Desde PERSONA DEMO Enviado 14-Oct-2026', 20)
        section = group('Lineas de Solicitud Interna', 30)
        self.assertEqual(capture_layout([title, head, section], [])['status'], 'compatible')
        self.assertEqual(capture_layout([title, head], None)['status'], 'partial')
        self.assertEqual(capture_layout([section], [])['status'], 'partial')
        for groups in [[], [group('ORACLE Workflow', 1)], [title], [group('Paisaje azul', 1)]]:
            with self.assertRaises(ProcessingError) as error:
                capture_layout(groups, None)
            self.assertEqual(error.exception.code, 'UNSUPPORTED_CAPTURE_LAYOUT')

    def test_exact_money(self):
        for raw, expected in [('0 CLP', '0'), ('440.000 CLP', '440000'), ('$ 000125', '125'), ('12345678901234567890', '12345678901234567890')]:
            self.assertEqual(money(raw), expected)
        for raw in ['44O.000', 'O CLP', '3,50', '4.50', '-3', '50 USD', 'NaN']:
            self.assertIsNone(money(raw))

    def test_calendar(self):
        self.assertEqual(sent('08-Dic-2025 16:35:54'), ('2025-12-08', '16:35:54'))
        self.assertEqual(sent('08-Dec-2025'), ('2025-12-08', None))
        for raw in ['31-Feb-2026 10:00:00', '08-Dec-2025 25:00:00', '01/01/0000', 'unknown']:
            self.assertEqual(sent(raw), (None, None))

    def test_missing_ambiguous_limits_and_structure(self):
        result = candidates({'requestNumber': '000125', 'sentDate': '31-Feb-2026', 'totalAmount': '44O CLP', 'description': 'x' * 1001}, None, {})['data']
        self.assertEqual(result['header']['requestNumber']['value'], '000125')
        self.assertEqual(result['header']['sentDate']['status'], 'ambiguous')
        self.assertEqual(result['header']['totalAmount']['rawText'], '44O CLP')
        self.assertEqual(result['header']['description']['status'], 'invalid')
        self.assertIsNone(result['header']['description']['rawText'])
        self.assertEqual(result['administrative']['paymentSituation']['status'], 'missing')
        self.assertEqual(result['lines'], [])
        self.assertIn('TABLE_STRUCTURE_UNRECOGNIZED', [i['code'] for i in result['issues']])

    def test_multiple_providers_and_no_inferred_account_components(self):
        result = candidates({'requestNumber': '0001'}, [{'provider': 'ONE', 'chargeAccount': '01.02.000125.00000.0001'}, {'provider': 'TWO'}], {})['data']
        self.assertEqual([line['provider']['value'] for line in result['lines']], ['ONE', 'TWO'])
        self.assertEqual(result['lines'][0]['chargeAccount']['value'], '01.02.000125.00000.0001')
        self.assertIsNone(result['lines'][0]['unitCode']['value'])

    def test_no_data(self):
        with self.assertRaises(ProcessingError) as error:
            candidates({}, None, {})
        self.assertEqual(error.exception.code, 'EXTRACTION_NO_DATA')

    def test_extract_end_to_end_pipeline_with_patched_tesseract(self):
        image = build_synthetic_oracle_image()
        buf = io.BytesIO()
        image.save(buf, format='PNG')
        raw_bytes = buf.getvalue()

        fake_data = {
            'text': ['Solicitud', 'Interna', 'de', 'Compra', '908640', 'Desde', 'Enviado', 'Líneas', 'de', 'Solicitud', 'Interna'],
            'conf': ['95', '95', '95', '95', '95', '95', '95', '95', '95', '95', '95'],
            'left': [40, 120, 200, 240, 320, 90, 90, 40, 120, 160, 260],
            'top': [136, 136, 136, 136, 136, 204, 280, 380, 380, 380, 380],
            'width': [70, 70, 30, 70, 70, 50, 60, 70, 30, 70, 70],
            'height': [24, 24, 24, 24, 24, 20, 20, 24, 24, 24, 24],
        }
        cell_outputs = iter([
            # 8 celdas de fila 0 en table() (se ejecuta primero en extract())
            'SERVICIO DE PRUEBA',
            'PROVEEDOR DEMO SPA',
            '270101-Facultad Demo',
            '1',
            '1',
            '440000',
            '440000',
            '01.02.270101.0000000.410103',
            # Cabecera (se ejecuta después en extract())
            'Solicitud Interna de Compra 908640',
            'Desde', 'PERSONA FICTICIA, ALFA',
            'A', 'PERSONA SINTÉTICA, BETA',
            'Enviado', '12-Oct-2026 16:35:54',
            'ID', '00329000',
            'Descripción', 'SERVICIO DE PRUEBA',
            'Total', '440.000 CLP',
            'Impuesto', '0 CLP',
            'Anexos', 'ANEXO_DEMO.pdf',
        ])

        with patch('extractor.pytesseract.image_to_data', return_value=fake_data), \
             patch('extractor.ocr_celda', side_effect=lambda *args, **kwargs: next(cell_outputs, '')):
            response = extract(None, raw_bytes, 'solicitud.png', 'image/png')

        data = response['data']
        self.assertEqual(VERSION, 'tesseract5-spa-grid8-layout-v1')
        self.assertEqual(data['status'], 'reviewRequired')
        self.assertEqual(data['captureLayout'], {
            'status': 'compatible',
            'signals': ['request_title', 'header_fields', 'line_section', 'eight_column_table'],
        })
        self.assertEqual(data['header']['requestNumber']['value'], '908640')
        self.assertEqual(data['header']['totalAmount']['value'], '440000')
        self.assertEqual(data['header']['taxAmount']['value'], '0')
        self.assertEqual(len(data['lines']), 1)
        self.assertEqual(data['lines'][0]['costCenter']['value'], '270101-Facultad Demo')
        self.assertEqual(len(data['regions']), 18)


if __name__ == '__main__':
    unittest.main()
