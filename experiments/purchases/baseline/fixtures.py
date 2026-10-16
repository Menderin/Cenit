"""Generate wholly fictional screenshots. Never edit or OCR a real document here."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont


def generate(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
    cases = []
    for name in ['single', 'multiple', 'long', 'zeros', 'missing', 'jpeg', 'small', 'scaled', 'margins', 'cropped', 'blank']:
        image = Image.new('RGB', (1200, 720), 'white')
        draw = ImageDraw.Draw(image)
        expected = {'header': {}, 'lines': []}
        if name != 'blank':
            draw.rectangle((0, 0, 1200, 40), fill='#214965')
            draw.text((20, 12), 'DEMO FICTICIA - NO ES ORACLE', font=bold, fill='white')
            draw.text((25, 60), 'Solicitud Interna de Compra 00125644', font=bold, fill='black')
            expected['header']['requestNumber'] = '00125644'
            header = [('sender', 'Desde', 'PERSONA DEMO UNO'), ('recipient', 'A', 'PERSONA DEMO DOS'),
                      ('sentDate', 'Enviado', '08-Dic-2025 16:35:54'), ('oracleId', 'ID', '003254486')]
            for i, (key, label, value) in enumerate(header):
                draw.text((30, 95 + 28*i), label, font=bold, fill='black')
                draw.text((110, 95 + 28*i), value, font=font, fill='black')
                expected['header'][key] = value
            for i, (key, label, value) in enumerate([
                ('description', 'Descripción', 'SERVICIOS DE DEMOSTRACION'),
                ('totalAmount', 'Total', '0 CLP' if name == 'zeros' else '440.000 CLP'),
                ('taxAmount', 'Impuesto', '0 CLP'), ('attachmentReference', 'Anexos', 'REFERENCIA FICTICIA')]):
                draw.text((490, 95 + 28*i), label, font=bold, fill='black')
                if not (name == 'missing' and key == 'attachmentReference'):
                    draw.text((610, 95 + 28*i), value, font=font, fill='black')
                    expected['header'][key] = value
                else:
                    expected['header'][key] = None
            draw.text((25, 220), 'Líneas de Solicitud Interna', font=bold, fill='black')
            columns = [('description', 'Descripción', 25, 345), ('provider', 'Proveedor', 345, 525),
                       ('costCenter', 'Centro de Costos', 525, 740), ('quantity', 'Cantidad', 740, 825),
                       ('price', 'Precio', 825, 920), ('amount', 'Importe', 920, 1010),
                       ('chargeAccount', 'Cuenta de Cargo', 1010, 1180)]
            n = 3 if name == 'multiple' else 1
            heights = [86 if name == 'long' else 56] * n
            draw.rectangle((25, 250, 1180, 285), fill='#f1f3f5')
            for _, label, x, _ in columns:
                draw.text((x + 5, 258), label, font=bold, fill='black')
            y = 285
            for i, h in enumerate(heights):
                values = {'description': f'SERVICIO FICTICIO {i+1}', 'provider': f'PROVEEDOR DEMO {i+1}',
                          'costCenter': '270101 / 0000000 / 410103', 'quantity': '1',
                          'price': '0' if name == 'zeros' else '440000',
                          'amount': '0' if name == 'zeros' else '440000',
                          'chargeAccount': '01.02.270101.0000000.410103'}
                if name == 'long':
                    values['description'] = 'SERVICIOS PROFESIONALES PARA EVALUACION NUTRICIONAL DE DEMOSTRACION'
                    values['provider'] = 'EMPRESA FICTICIA DE SERVICIOS LIMITADA'
                for key, _, x, right in columns:
                    text = values[key]
                    words, line, wrapped = text.split(), '', []
                    # Split long references visibly; every expected character must be rendered.
                    expanded = []
                    for word in words:
                        part = ''
                        for char in word:
                            if part and draw.textlength(part+char, font=font) > right-x-10:
                                expanded.append(part); part = char
                            else:
                                part += char
                        if part:
                            expanded.append(part)
                    words = expanded
                    for word in words:
                        candidate = (line + ' ' + word).strip()
                        if draw.textlength(candidate, font=font) > right-x-10 and line:
                            wrapped.append(line); line = word
                        else:
                            line = candidate
                    wrapped.append(line)
                    for j, part in enumerate(wrapped):
                        draw.text((x+5, y+12+j*18), part, font=font, fill='black')
                expected['lines'].append(values)
                draw.line((25, y, 1180, y), fill='#b8c4ce', width=1)
                y += h
            draw.line((25, y, 1180, y), fill='#b8c4ce', width=1)
            for _, _, x, _ in columns:
                draw.line((x, 250, x, y), fill='#b8c4ce', width=1)
            draw.line((1180, 250, 1180, y), fill='#b8c4ce', width=1)
            draw.text((25, y+35), 'Secuencia de Aprobación', font=bold, fill='black')
            draw.text((25, y+65), 'PERSONA DEMO DOS - Pendiente', font=font, fill='black')
        if name == 'small':
            image = image.resize((720, 432), Image.Resampling.LANCZOS)
        if name == 'scaled':
            image = image.resize((1800, 1080), Image.Resampling.LANCZOS)
        if name == 'margins':
            padded = Image.new('RGB', (1320, 840), 'white')
            padded.paste(image, (60, 60)); image = padded
        if name == 'cropped':
            image = image.crop((0, 190, 1200, 600))
            expected['header'] = {key: None for key in expected['header']}
        path = directory / (name + ('.jpg' if name == 'jpeg' else '.png'))
        image.save(path, quality=45) if name == 'jpeg' else image.save(path)
        cases.append({'id': name, 'file': path.name, 'expected': expected})
    (directory / 'expected.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding='utf8')
    return cases
