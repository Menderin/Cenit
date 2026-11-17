"""Generate fictitious captures or evaluate an explicitly supplied private manifest.

Only image bytes reach the local processor; expected values stay in the evaluator.
Run from the repository root; private captures/reports stay in ignored .local/.
"""
import argparse
import hashlib
import json
import statistics
import platform
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


BLUE = '#204d6b'
GRID = '#d5e0eb'
INK = '#242424'
LINK = '#1760a5'
FONT_DIR = Path('C:/Windows/Fonts')
if not (FONT_DIR / 'arial.ttf').exists():
    FONT_DIR = Path('/usr/share/fonts/truetype/msttcorefonts')


def font(size, bold=False):
    path = FONT_DIR / ('arialbd.ttf' if bold else 'arial.ttf')
    if not path.exists():
        raise RuntimeError('Arial required to reproduce the reference. Do not substitute fonts silently.')
    return ImageFont.truetype(str(path), size)


def render(index, count=1):
    """Coordinates reproduce the visual reference, never used by extraction."""
    number = str(908640 + index)
    description = ('SERVICIOS PROFESIONALES FICTICIOS, 44 HRS. APOYO DOCENTE EN LABORATORIO '
                   'DE NUTRICIÓN, SEDE DEMOSTRACIÓN, OCTUBRE, PERSONA SINTÉTICA_0000000')
    provider = 'EMPRESA SINTÉTICA ALFA DEMO E.I.R.L.'
    rows = []
    for n in range(count):
        rows.append(dict(description=description if n == 0 else 'SUMINISTRO FICTICIO DE MATERIAL DOCENTE PARA LABORATORIO, LOTE BETA',
                         provider=provider if n == 0 else 'PROVEEDOR SINTÉTICO BETA SPA',
                         costCenter='270101-Decanatura Facultad de Demostración / 0000000-Sin Proyecto / 410103-Servicios de Apoyo Docente Ficticios',
                         lineUnit='1', quantity='1', price=str(440000+n*12500),
                         amount=str(440000+n*12500), chargeAccount='01.02.270101.0000000.410103'))
    total = str(sum(int(r['amount']) for r in rows))
    header = dict(requestNumber=number, oracleId=f'00329{index:03d}', sender='PERSONA FICTICIA, ALFA',
                  recipient='PERSONA SINTÉTICA, BETA', sentDate=f'2026-10-{12+index:02d}', sentTime='16:35:54',
                  description=description, totalAmount=total, taxAmount='0',
                  attachmentReference=f'2026-10-{12+index:02d} 16:35:43 ANEXO_SI{number}_DEMO_DOCUMENTO.pdf')
    extra = (count-1)*56
    image = Image.new('RGB', (1085, 658+extra), 'white')
    d = ImageDraw.Draw(image)

    def text(x, y, value, size=11, bold=False, color=INK):
        d.text((x, y), value, font=font(size, bold), fill=color)

    def rule(y, x=20, end=1069):
        d.line((x, y, end, y), fill=GRID)

    def wrap(value, width, size=11):
        lines, current = [], ''
        for word in value.split():
            trial = (current+' '+word).strip()
            if current and d.textlength(trial, font=font(size)) > width:
                lines.append(current)
                current = word
            else:
                current = trial
        return lines+[current]

    def block(x, y, value, width, size=11, leading=12):
        for n, line in enumerate(wrap(value, width, size)):
            text(x, y+n*leading, line, size)

    def right(x, y, value):
        text(x-d.textlength(value, font=font(11, True)), y, value, bold=True, color='#555555')

    d.rectangle((0, 0, 1084, 43), fill=BLUE)
    d.line((1, 44, 1, image.height), fill=BLUE, width=2)
    for y in [7, 12, 17]:
        d.line((14, y, 31, y), fill='white', width=2)
    text(53, 3, 'ORACLE', 20, color='white')
    text(139, 9, 'Workflow', 14, True, 'white')
    # Small navigation glyphs; geometry matters, not vendor assets.
    for x in [638, 689, 739, 790]:
        d.rectangle((x-5, 9, x+5, 18), outline='white', width=2)
        d.line((x-7, 9, x, 3, x+7, 9), fill='white', width=2)
    text(850, 9, 'Conectado Como DEMO', 10, True, 'white')
    text(1005, 3, '?', 20, True, 'white')
    d.arc((1058,5,1073,21),-45,225,fill='white',width=2)
    d.line((1066,3,1066,13),fill='white',width=2)
    grouped = lambda s: f'{int(s):,}'.replace(',', '.')
    text(20, 65, f'Solicitud Interna de Compra {number} para PERSONA FICTICIA, ALFA ({grouped(total)} CLP)', 16, True)
    for x, width, label in [(739,54,'Aprobar'), (802,59,'Rechazar'), (871,64,'Reasignar'), (945,118,'Solicitar Información')]:
        d.rectangle((x, 61, x+width, 77), fill='#eff2f5', outline='#c6d2de')
        text(x+5, 63, label, 10, True)
    rule(92)
    for label, value, y in [('Desde',header['sender'],99), ('A',header['recipient'],118),
                             ('Enviado',f'{12+index:02d}-Oct-2026 16:35:54',137), ('ID',header['oracleId'],156)]:
        right(80, y, label)
        text(90, y, value)
    right(488, 99, 'Descripción')
    block(503, 99, description, 563)
    for label, value, y in [('Total',grouped(total)+' CLP',130), ('Impuesto (No Recuperable)','0 CLP',149)]:
        right(488, y, label)
        text(503, y, value)
    right(488, 168, 'Anexos')
    text(499, 168, header['attachmentReference'], color=LINK)
    text(20, 190, 'Líneas de Solicitud Interna', 14, True)
    rule(211)
    xs = [20, 364, 452, 721, 766, 822, 864, 914, 1069]
    top, head, bottom = 226, 249, 285+56*count
    d.rectangle((20, top, 1069, bottom), outline=GRID)
    text(27, top+2, '•••', color=LINK)
    d.rectangle((21, head, 1068, 284), fill='#f1f3f6')
    labels = ['Descripción','Proveedor','Centro de Costos','Unidad','Cantidad','Precio\n(CLP)','Importe\n(CLP)','Cuenta de Cargo']
    for x in xs[1:-1]:
        d.line((x, head, x, bottom), fill=GRID)
    rule(head)
    rule(285)
    for n, label in enumerate(labels):
        d.multiline_text((xs[n]+3, 255 if n in [5,6] else 262), label, font=font(12, True), fill=INK, spacing=1)
    for n, row in enumerate(rows):
        y = 285+n*56
        for col, (key, value) in enumerate(row.items()):
            if key == 'amount':
                value = grouped(value)
            # Clip text at the cell edge like the original table, without leaking into neighbours.
            tile = Image.new('RGB', (xs[col+1]-xs[col]-2, 54), 'white')
            td = ImageDraw.Draw(tile)
            lines = wrap(value, tile.width-4, 11) if col < 3 else [value]
            if col < 3 and len(lines)*12 > tile.height:
                raise ValueError('Synthetic ground truth would contain invisible clipped text: '+key)
            yy = max(3, (54-len(lines)*12)//2)
            for line in lines:
                td.text((2, yy), line, font=font(11), fill=INK)
                yy += 12
            image.paste(tile, (xs[col]+1, y+1))
        rule(y+56)
    shift = bottom-341
    text(20, 371+shift, 'Secuencia de Aprobación', 14, True)
    rule(392+shift)
    d.rectangle((65,407+shift,248,463+shift), outline='#2559dc')
    d.rectangle((66,408+shift,247,427+shift), fill='#c5d8e8')
    d.ellipse((75,412+shift,85,422+shift),outline='#c69c22')
    d.line((80,413+shift,80,418+shift,83,418+shift),fill=LINK)
    for x in [169,175]:
        d.ellipse((x,412+shift,x+3,415+shift),outline=LINK)
        d.rectangle((x,417+shift,x+3,422+shift),outline=LINK)
    text(75,440+shift,'Grupos de Aprobación Demo',10)
    for start, end in [(42,64),(249,290)]:
        d.line((start,434+shift,end,434+shift), fill='#2559dc')
        d.polygon([(end,434+shift),(end-6,431+shift),(end-6,437+shift)],fill='#2559dc')
    d.rectangle((31,429+shift,39,441+shift),outline='#93b5e2')
    for y in [432,435,438]:
        d.line((33,y+shift,37,y+shift),fill='#93b5e2')
    text(301,431+shift,'En Proceso',color=LINK)
    a = 477+shift
    d.rectangle((20,a,1069,a+97),outline=GRID)
    text(27,a+2,'•••',color=LINK)
    d.rectangle((21,a+23,1068,a+43),fill='#f1f3f6')
    ax = [20,42,728,822,1016,1069]
    for x in ax[1:-1]:
        d.line((x,a+23,x,a+97),fill=GRID)
    for x,label in zip(ax,['Nro','Nombre','Acción','Fecha de Acción','Nota']):
        text(x+3,a+28,label,11,True)
    for n,(name,state,date) in enumerate([
        ('PERSONA SINTÉTICA, BETA (Grupos de Aprobación Demo)','Pendiente',''),
        ('PERSONA FICTICIA, GAMMA (Grupos de Aprobación Demo)','Aprobada','13-Oct-2026 10:49:23'),
        ('PERSONA FICTICIA, ALFA','Ejecutado',f'{12+index:02d}-Oct-2026 16:35:54')]):
        y=a+44+n*17
        for x,value in zip(ax,[str(3-n),name,state,date,'']):
            text(x+3,y+2,value,10)
        rule(y+17)
    text(20,604+shift,'Aplicaciones Relacionadas',14,True)
    rule(625+shift)
    d.rectangle((35,642+shift,43,654+shift),outline='#93b5e2')
    text(53,645+shift,'Editar Solicitud Interna',10,color=LINK)
    text(827, image.height-11, 'DATOS SINTÉTICOS · SIN EFECTO INSTITUCIONAL',9,color='#666666')
    # Account text is deliberately clipped as in the reference. Do not score invisible suffixes.
    return image, {'header':header, 'lines':rows}, ['/lines/*/chargeAccount']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('tmp/ocr-oracle-format'))
    parser.add_argument('--evaluate', action='store_true')
    parser.add_argument('--url', default='http://127.0.0.1:8090')
    parser.add_argument('--manifest', type=Path, help='Evaluar capturas existentes con etiquetas privadas, sin generar imágenes')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.manifest:
        if not args.evaluate:
            parser.error('--manifest requiere --evaluate')
        manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
        cases = []
        root = args.manifest.resolve().parent
        for sample in manifest['samples']:
            if not re.fullmatch(r'[A-Za-z0-9_-]+', sample['case']):
                raise ValueError('El identificador de muestra debe ser un nombre de archivo simple')
            path = (root / sample['file']).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                raise ValueError('La captura debe estar dentro de la carpeta del manifiesto')
            if hashlib.sha256(path.read_bytes()).hexdigest() != sample['sha256']:
                raise ValueError('La captura no coincide con su hash')
            cases.append({**sample, 'path': str(path)})
        if not cases:
            raise ValueError('El manifiesto debe contener al menos una captura')
        evaluate(args, cases, manifest)
        return
    cases = []
    variants = [('01-completa',1,1,'png'),('02-dos-items',2,1,'png'),('03-tres-items',3,1,'png'),
                ('04-jpeg',1,1,'jpg'),('05-reducida',1,.85,'png'),('06-ampliada',2,1.25,'png'),
                ('07-grises',1,1,'gray'),('08-cabecera-recortada',1,1,'crop')]
    for index,(name,count,scale,kind) in enumerate(variants):
        image, expected, excluded = render(index,count)
        if kind == 'gray':
            image = image.convert('L').convert('RGB')
        if kind == 'crop':
            image = image.crop((0,44,image.width,image.height))
        if scale != 1:
            image = image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
        path = args.output / (name+('.jpg' if kind == 'jpg' else '.png'))
        image.save(path,quality=78)
        cases.append(dict(case=name,path=str(path),width=image.width,height=image.height,
                          imageSha256=hashlib.sha256(path.read_bytes()).hexdigest(),expected=expected,excluded=excluded))
    manifest = dict(reference='Manual reconstruction of supplied Oracle Workflow layout; entirely fictitious content',
                    fontSha256=hashlib.sha256((FONT_DIR/'arial.ttf').read_bytes()).hexdigest(),
                    generatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),samples=cases)
    (args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Generated {len(cases)} images in {args.output}')
    if args.evaluate:
        evaluate(args, cases, manifest)


def evaluate(args, cases, manifest):
    sources = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('apps/ocr').glob('*.py')}
    results = []
    for case in cases:
        path = Path(case['path'])
        req = urllib.request.Request(args.url+'/extract',path.read_bytes(),
                                     {'Content-Type':'image/jpeg' if path.suffix=='.jpg' else 'image/png','X-File-Name':path.name})
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(req,timeout=65) as response:
                status, payload = response.status, json.load(response)
        except urllib.error.HTTPError as error:
            status, payload = error.code, json.load(error)
        actual = payload.get('data',{})
        checks = []
        for group, expected in case['expected'].items():
            entries = [(None,expected)] if group=='header' else list(enumerate(expected))
            for n, fields in entries:
                values = actual.get(group,{}) if n is None else (actual.get(group,[])[n] if n<len(actual.get(group,[])) else {})
                for key, value in fields.items():
                    field_path = f'/{group}/'+('' if n is None else str(n)+'/')+key
                    excluded = case.get('excluded', ['/lines/*/chargeAccount'])
                    wildcard = f'/{group}/*/{key}' if n is not None else field_path
                    if field_path in excluded or wildcard in excluded:
                        continue
                    found = values.get(key,{}).get('value')
                    exact = ' '.join(value.split()) == ' '.join(found.split()) if isinstance(value, str) and isinstance(found, str) else value == found
                    checks.append(dict(path=field_path, expected=value,actual=found,
                                       outcome='exact' if exact else 'missing' if found is None else 'wrong'))
        results.append(dict(case=case['case'],httpStatus=status,seconds=round(time.perf_counter()-started,3),
                            imageSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                            memoryPeakBytes=read_cgroup('memory.peak'),
                            rowsExpected=len(case['expected']['lines']),rowsActual=len(actual.get('lines',[])),checks=checks))
        (args.output/(case['case']+'-response.json')).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
        print(case['case'], status, results[-1]['rowsActual'], 'items', flush=True)
    if sources != {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('apps/ocr').glob('*.py')}:
        raise RuntimeError('Extractor changed during evaluation')
    summary = dict(sourceHashes=sources,generatorSha256=manifest.get('generatorSha256'),samples=results,
                   evaluatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                   environment=dict(python=platform.python_version(),platform=platform.platform(),
                                    cpuMax=read_cgroup('cpu.max'),memoryMax=read_cgroup('memory.max'),
                                    memoryMeasurement='Cgroup cumulative high-water mark including evaluation client'),
                   maxSeconds=max(r['seconds'] for r in results),
                   medianSeconds=statistics.median(r['seconds'] for r in results),
                   counts={k:sum(c['outcome']==k for r in results for c in r['checks']) for k in ['exact','wrong','missing']})
    (args.output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary['counts']))


def read_cgroup(name):
    path = Path('/sys/fs/cgroup') / name
    if not path.exists():
        return None
    value = path.read_text().strip()
    return int(value) if value.isdigit() else value


if __name__ == '__main__':
    main()
