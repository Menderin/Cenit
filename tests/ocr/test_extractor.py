import io
import unittest
from PIL import Image
from extractor import decode, candidates, money, sent, capture_layout, header, grouped, table, add_region, ProcessingError, MAX_BYTES
from unittest.mock import patch
from PIL import ImageDraw


def image_bytes(size=(20, 20), mode='PNG'):
    output = io.BytesIO()
    Image.new('RGB', size, 'white').save(output, format=mode)
    return output.getvalue()


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
            decode(b'x'*(MAX_BYTES+1), 'image/png')
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
        Image.new('RGB', (20, 20), 'white').save(output, format='PNG', save_all=True, append_images=[Image.new('RGB', (20, 20), 'black')], duration=100, loop=0)
        with self.assertRaises(ProcessingError):
            decode(output.getvalue(), 'image/png')


class CandidateMapping(unittest.TestCase):
    def test_header_columns_have_independent_multiline_flow(self):
        def word(text, x, y, width=35):
            return dict(text=text,x=x,y=y,w=width,h=10)
        words = [word('Solicitud Interna de Compra 001',20,20,220),
                 word('Desde',40,50),word('ALFA',90,50),word('Descripción',400,50,80),word('SERVICIO',500,50),
                 word('A',65,65,10),word('BETA',90,65),word('MULTILÍNEA',500,65,85),
                 word('Enviado',30,80,45),word('08-Dec-2025 16:35:54',90,80,130),
                 word('Total',450,80),word('440.000 CLP',500,80,90),
                 word('ID',65,95,10),word('00325486',90,95,80),
                 word('Impuesto',340,95,65),word('(No Recuperable)',410,95,80),word('0 CLP',500,95),
                 word('Anexos',440,110,45),word('DEMO.pdf',500,110,80),
                 word('Líneas de Solicitud Interna',20,140,220)]
        regions = []
        result = header(grouped(words), image=Image.new('RGB', (1000, 200)), regions=regions)
        self.assertEqual(result['recipient'],'BETA')
        self.assertEqual(result['description'],'SERVICIO MULTILÍNEA')
        self.assertEqual(result['oracleId'],'00325486')
        self.assertEqual(result['sentDate'],'08-Dec-2025 16:35:54')
        self.assertEqual(result['taxAmount'],'0 CLP')
        description = next(r for r in regions if r['path'] == '/header/description')
        self.assertEqual(description, {'path': '/header/description', 'x': .5, 'y': .25, 'width': .085, 'height': .125})
        self.assertFalse(any(r['path'].startswith('/administrative/') for r in regions))

    def test_grid_skips_toolbar_and_page_frame(self):
        image=Image.new('RGB',(1085,658),'white')
        draw=ImageDraw.Draw(image)
        draw.line((1,0,1,658),fill='#204d6b',width=2)
        xs=[20,364,452,721,766,822,864,914,1069]
        for y in [211,226,249,285,341]:
            draw.line((20,y,1069,y),fill='#d5e0eb')
        for x in xs:
            draw.line((x,249,x,341),fill='#d5e0eb')
        groups=[dict(center=198,text='Líneas de Solicitud Interna',words=[dict(x=20,h=14)]),
                dict(center=380,text='Secuencia de Aprobación',words=[dict(x=20,h=14)])]
        labels=['Descripción','Proveedor','Centro de Costos','Unidad','Cantidad','Precio (CLP)','Importe (CLP)','Cuenta de Cargo']
        # Unknown toolbar rows stay unknown; only all eight verified labels admit the body.
        def cell(engine,crop,detect=False):
            if crop.height<25:
                return None
            if crop.height<40:
                return labels.pop(0)
            return '001'
        class Reading:
            txts=[]
        regions = []
        with patch('extractor.read_cell',side_effect=cell):
            result=table(lambda *args,**kwargs:Reading(),image,groups,regions)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['chargeAccount'],'001')
        self.assertEqual(len(regions), 8)
        self.assertEqual({r['path'] for r in regions}, {'/lines/0/'+key for key in ['description','provider','costCenter','lineUnit','quantity','price','amount','chargeAccount']})
        self.assertTrue(all(0 <= r['x'] < r['x']+r['width'] <= 1 and 0 <= r['y'] < r['y']+r['height'] <= 1 for r in regions))

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
        for raw in ['44O.000', '3,50', '4.50', '-3', '50 USD', 'NaN']:
            self.assertIsNone(money(raw))

    def test_calendar(self):
        self.assertEqual(sent('08-Dic-2025 16:35:54'), ('2025-12-08', '16:35:54'))
        self.assertEqual(sent('08-Dec-2025'), ('2025-12-08', None))
        for raw in ['31-Feb-2026 10:00:00', '08-Dec-2025 25:00:00', '01/01/0000', 'unknown']:
            self.assertEqual(sent(raw), (None, None))

    def test_missing_ambiguous_limits_and_structure(self):
        result = candidates({'requestNumber': '000125', 'sentDate': '31-Feb-2026', 'totalAmount': '44O CLP', 'description': 'x'*1001}, None, {})['data']
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


if __name__ == '__main__':
    unittest.main()
