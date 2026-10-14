"""Fourth-round held-out values and geometry. Never consumed by the parser."""
import json
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from baseline.fixtures import generate


def wrap(draw, text, font, width):
    output, line = [], ''
    for word in text.split():
        chunks, part = [], ''
        for char in word:
            if part and draw.textlength(part+char, font=font) > width:
                chunks.append(part); part = char
            else:
                part += char
        chunks.append(part)
        for chunk in chunks:
            if line and draw.textlength(line+' '+chunk, font=font) > width:
                output.append(line); line = chunk
            else:
                line = (line+' '+chunk).strip()
    return output+[line]


def build(directory):
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    original = generate(directory/'development')
    cases = [{**c, 'split': 'development', 'file': 'development/'+c['file']}
             for c in original if c['id'] in ['single', 'long', 'zeros', 'small']]
    rng = random.Random(470016)
    configs = [('clear', 1400, 16, 1, False), ('multiline', 1560, 17, 3, False),
               ('jpeg', 1400, 16, 2, False), ('zero', 1400, 16, 1, False),
               ('small', 1400, 16, 2, False), ('serif', 1400, 16, 1, True),
               ('margin', 1560, 17, 2, False), ('no-grid', 1400, 16, 1, False)]
    for name, width, size, count, serif in configs:
        root = '/usr/share/fonts/truetype/dejavu/'
        font = ImageFont.truetype(root+('DejaVuSerif.ttf' if serif else 'DejaVuSansMono.ttf'), size)
        bold = ImageFont.truetype(root+('DejaVuSerif-Bold.ttf' if serif else 'DejaVuSansMono-Bold.ttf'), size)
        image = Image.new('RGB', (width, 820), 'white'); draw = ImageDraw.Draw(image)
        number = '009'+str(rng.randint(10000, 99999)); amount = '0' if name == 'zero' else str(rng.randint(100, 999)*1000)
        header = {'requestNumber': number, 'sender': 'PERSONA FICTICIA ALFA', 'recipient': 'PERSONA FICTICIA BETA',
                  'sentDate': '02-Dic-2026 12:17:09', 'oracleId': '000'+str(rng.randint(1000000, 9999999)),
                  'description': 'INSUMOS PARA PRACTICAS DE NUTRICION', 'totalAmount': amount+' CLP',
                  'taxAmount': '0 CLP', 'attachmentReference': None if name == 'margin' else 'ARCHIVO FICTICIO'}
        draw.rectangle((0, 0, width, 36), fill='#264c68')
        draw.text((24, 8), 'MUESTRA FICTICIA DE EVALUACION', font=bold, fill='white')
        draw.text((24, 57), 'Solicitud Interna de Compra '+number, font=bold, fill='black')
        for i, (key, label) in enumerate([('sender','Desde'), ('recipient','A'), ('sentDate','Enviado'), ('oracleId','ID')]):
            draw.text((30, 95+28*i), label, font=bold, fill='black')
            draw.text((125, 95+28*i), header[key], font=font, fill='black')
        for i, (key, label) in enumerate([('description','Descripción'), ('totalAmount','Total'), ('taxAmount','Impuesto'), ('attachmentReference','Anexos')]):
            draw.text((int(width*.45), 95+28*i), label, font=bold, fill='black')
            if header[key] is not None:
                draw.text((int(width*.45)+135, 95+28*i), header[key], font=font, fill='black')
        draw.text((24, 230), 'Líneas de Solicitud Interna', font=bold, fill='black')
        names = [('description','Descripción'), ('provider','Proveedor'), ('costCenter','Centro de Costos'),
                 ('quantity','Cantidad'), ('price','Precio'), ('amount','Importe'), ('chargeAccount','Cuenta de Cargo')]
        fractions = [0, .26, .44, .63, .70, .78, .86, 1]
        bounds = [24+int((width-48)*f) for f in fractions]
        draw.rectangle((bounds[0],260,bounds[-1],300), fill='#edf1f5')
        for i, (_, label) in enumerate(names):
            draw.text((bounds[i]+5, 268), label, font=bold, fill='black')
        lines = []
        y = 300
        for i in range(count):
            row = {'description': f'MATERIAL DE LABORATORIO PARA DOCENCIA {i+1}',
                   'provider': f'EMPRESA FICTICIA NUMERO {i+1}', 'costCenter': '270202 / 0000142 / 420405',
                   'quantity': str(i+4), 'price': '0' if name == 'zero' else str(54000+i*4000),
                   'amount': '0' if name == 'zero' else str((54000+i*4000)*(i+4)),
                   'chargeAccount': '01.03.270202.0000142.420405'}
            for j, (key, _) in enumerate(names):
                for k, text in enumerate(wrap(draw,row[key],font,bounds[j+1]-bounds[j]-10)):
                    draw.text((bounds[j]+5,y+12+k*(size+4)),text,font=font,fill='black')
            if name != 'no-grid':
                draw.line((bounds[0],y,bounds[-1],y),fill='#acbac5',width=1)
            y += 90; lines.append(row)
        if name != 'no-grid':
            draw.line((bounds[0],y,bounds[-1],y),fill='#acbac5',width=1)
            for x in bounds:
                draw.line((x,260,x,y),fill='#acbac5',width=1)
        draw.text((24,y+30),'Secuencia de Aprobación',font=bold,fill='black')
        draw.text((24,y+62),'PERSONA FICTICIA BETA - Pendiente',font=font,fill='black')
        if name == 'small':
            image = image.resize((int(width*.7),574),Image.Resampling.LANCZOS)
        if name == 'margin':
            padded = Image.new('RGB',(width+180,940),'white'); padded.paste(image,(90,60)); image=padded
        filename = 'holdout-'+name+('.jpg' if name == 'jpeg' else '.png')
        image.save(directory/filename,quality=50) if name == 'jpeg' else image.save(directory/filename)
        cases.append({'id': name, 'split': 'holdout', 'file': filename, 'expected': {'header':header,'lines':lines}})
    (directory/'manifest.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2),encoding='utf8')
    return cases
