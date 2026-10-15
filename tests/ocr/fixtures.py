"""Entirely fictional, eight-column Oracle-style captures; evaluator-only labels."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def font(size):
    paths = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf']
    return ImageFont.truetype(next(p for p in paths if Path(p).exists()), size)


def generate(directory, split='development'):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    cases = []
    labels = ['Descripción', 'Proveedor', 'Centro de Costos', 'Unidad', 'Cantidad', 'Precio (CLP)', 'Importe (CLP)', 'Cuenta de Cargo']
    widths = [350, 160, 260, 65, 80, 110, 115, 240]
    for index, case in enumerate(['clear', 'multiline', 'jpeg', 'small', 'margin', 'zero', 'partial', 'no-grid']):
        number = str((904300 if split == 'holdout' else 803100) + index)
        date = f'{11+index:02d}-Oct-2026 10:23:45'
        description = f'MATERIALES DOCENTES FICTICIOS LOTE {index+3}'
        total = str(71000+index*2300)
        provider = f'PROVEEDOR DEMO {index+3}'
        row = {'description': description, 'provider': provider, 'costCenter': '270101-FACULTAD DEMO',
               'lineUnit': '1', 'quantity': '2', 'price': str(int(total)//2), 'amount': total, 'chargeAccount': f'01.02.270101.00000{index:02d}.420405'}
        if case == 'zero':
            row.update(price='0', amount='0'); total = '0'
        rows = [row]
        if case == 'multiline':
            rows.append({**row, 'provider': 'OTRO PROVEEDOR DEMO', 'description': 'SERVICIOS DE APOYO\nDOCENTE FICTICIO'})
        image = Image.new('RGB', (sum(widths)+40, 650+(len(rows)-1)*85), 'white')
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, image.width, 35), fill='#1b4b68')
        draw.text((20, 7), 'ORACLE Workflow - DEMOSTRACION FICTICIA', font=font(18), fill='white')
        draw.text((20, 55), f'Solicitud Interna de Compra {number} para PERSONA DEMO ({total} CLP)', font=font(19), fill='black')
        left = [('Desde', 'PERSONA DEMO'), ('A', 'DESTINATARIO DEMO'), ('Enviado', date), ('ID', '00325987')]
        right = [('Descripción', description), ('Total', total+' CLP'), ('Impuesto (No Recuperable)', '0 CLP'), ('Anexos', '2026_10_ANEXO_DEMO.pdf')]
        for i, ((label, value), (label2, value2)) in enumerate(zip(left, right)):
            y = 105+i*27
            draw.text((25, y), label, font=font(14), fill='black')
            draw.text((105, y), value, font=font(14), fill='black')
            draw.text((600, y), label2, font=font(14), fill='black')
            draw.text((825, y), value2, font=font(14), fill='black')
        draw.text((20, 225), 'Líneas de Solicitud Interna', font=font(18), fill='black')
        xs = [20]
        for width in widths:
            xs.append(xs[-1]+width)
        top = 265
        draw.rectangle((20, top, xs[-1], top+45), fill='#f1f3f6')
        for i, label in enumerate(labels):
            draw.text((xs[i]+7, top+12), label, font=font(13), fill='black')
        ys = [top, top+45]+[top+45+(i+1)*85 for i in range(len(rows))]
        if case != 'no-grid':
            for x in xs:
                draw.line((x, top, x, ys[-1]), fill='#a5b8cc', width=1)
            for y in ys:
                draw.line((20, y, xs[-1], y), fill='#a5b8cc', width=1)
        for n, row_data in enumerate(rows):
            for i, value in enumerate(row_data.values()):
                # Explicit line breaks only in this fictitious source; no coordinates reach extraction.
                if i in [0, 1, 2] and len(value) > widths[i]//8:
                    words = value.split(); chunks = []; line = ''
                    for word in words:
                        if len(line+' '+word) > widths[i]//8:
                            chunks.append(line); line = word
                        else:
                            line = (line+' '+word).strip()
                    chunks.append(line); value = '\n'.join(chunks)
                draw.multiline_text((xs[i]+7, ys[n+1]+15), value, font=font(13), fill='black', spacing=4)
        draw.text((20, ys[-1]+30), 'Secuencia de Aprobación', font=font(18), fill='black')
        draw.text((20, ys[-1]+85), 'PERSONA DEMO - Pendiente - SIN EFECTOS INSTITUCIONALES', font=font(14), fill='black')
        if case == 'partial':
            image = image.crop((0, 0, image.width, 250))
        if case == 'small':
            image = image.resize((round(image.width*.8), round(image.height*.8)))
        if case == 'margin':
            from PIL import ImageOps
            image = ImageOps.expand(image, (70, 40, 30, 25), 'white')
        suffix = '.jpg' if case == 'jpeg' else '.png'
        path = directory/(split+'-'+case+suffix)
        image.save(path, quality=78)
        expected = {'header': {'requestNumber': number, 'oracleId': '00325987', 'sender': 'PERSONA DEMO',
            'recipient': 'DESTINATARIO DEMO', 'sentDate': '2026-10-'+str(11+index), 'sentTime': '10:23:45',
            'description': description, 'totalAmount': total, 'taxAmount': '0', 'attachmentReference': '2026_10_ANEXO_DEMO.pdf'},
            'lines': [] if case == 'partial' else [{k: v.replace('\n', ' ') for k, v in r.items()} for r in rows]}
        cases.append({'case': case, 'path': str(path), 'expected': expected})
    return cases
