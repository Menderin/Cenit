"""Geometry-first table reconstruction with independently recognized column labels."""
import re
import cv2
import numpy as np
from PIL import Image
from pipeline import tokens
from pipeline_v3 import recognize,check_tesseract
from baseline.benchmark import parse,grouped,normalize


def collapse(values,gap=5):
    groups=[]
    for value in values:
        if not groups or value-groups[-1][-1]>gap:
            groups.append([int(value)])
        else:
            groups[-1].append(int(value))
    return [round(np.mean(g)) for g in groups]


def locate(image,words):
    groups=grouped(words)
    start=next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])),None)
    end=next((g for g in groups if 'secuencia de aprobacion' in normalize(g['text'])),None)
    if not start or not end:
        return None
    edge=cv2.Canny(np.array(image.convert('L')),3,15)
    edge[:int(start['center']),:]=0; edge[int(end['center']):,:]=0
    horizontal=cv2.morphologyEx(edge,cv2.MORPH_CLOSE,np.ones((1,9),np.uint8))
    horizontal=cv2.morphologyEx(horizontal,cv2.MORPH_OPEN,np.ones((1,max(30,int(image.width*.4))),np.uint8))
    ys=collapse(np.flatnonzero((horizontal>0).sum(axis=1)>image.width*.5))
    if len(ys)<3:
        return None
    vertical=cv2.morphologyEx(edge,cv2.MORPH_CLOSE,np.ones((7,1),np.uint8))
    vertical=cv2.morphologyEx(vertical,cv2.MORPH_OPEN,np.ones((max(15,int((ys[-1]-ys[0])*.4)),1),np.uint8))
    xs=collapse(np.flatnonzero((vertical[ys[0]:ys[-1]]>0).sum(axis=0)>(ys[-1]-ys[0])*.5))
    return (xs,ys) if len(xs)==8 else None


def read_lines(engine,image):
    ink=np.array(image.convert('L'))<150
    active=np.flatnonzero(ink.sum(axis=1)>0)
    if not len(active):
        return None
    bands=[]
    for y in active:
        if not bands or y-bands[-1][-1]>4:
            bands.append([int(y)])
        else:
            bands[-1].append(int(y))
    output=[]
    for band in bands:
        text,_=recognize(engine,image.crop((0,band[0],image.width,band[-1]+1)))
        if text:
            output.append(text)
    return ' '.join(output) or None


def extract(engine,path,variant):
    image=Image.open(path).convert('RGB')
    words=tokens(engine,image,word_boxes=False)
    result=parse(path,words)
    if variant=='baseline':
        return result
    geometry=locate(image,words)
    if not geometry:
        result['issues'].append('VERIFIED_GRID_UNAVAILABLE')
        return result
    xs,ys=geometry
    expected=[('description','descripcion'),('provider','proveedor'),('costCenter','centro de costos'),
              ('quantity','cantidad'),('price','precio'),('amount','importe'),('chargeAccount','cuenta de cargo')]
    headers=[]
    for index,(key,label) in enumerate(expected):
        crop=image.crop((xs[index]+3,ys[0]+3,xs[index+1]-3,ys[1]-3))
        read=read_lines(engine,crop)
        headers.append(read)
        if read is None or ' '.join(normalize(read).split())!=label:
            result['issues'].append('COLUMN_HEADER_UNVERIFIED:'+key)
            result['headerReadings']=headers
            return result
    rows=[]
    for row_index,(top,bottom) in enumerate(zip(ys[1:],ys[2:])):
        row={}
        for index,(key,_) in enumerate(expected):
            crop=image.crop((xs[index]+3,top+3,xs[index+1]-3,bottom-3))
            text=read_lines(engine,crop)
            if key=='chargeAccount' and text:
                text=text.replace(' ','')
            if key not in ['quantity','price','amount','chargeAccount'] and len(result['lines'])==len(ys)-2:
                original=result['lines'][row_index].get(key)
                if text and original and re.sub(r'\s+','',text)==re.sub(r'\s+','',original):
                    # Reuse observed word spacing only when both readings have identical characters.
                    if original.count(' ')>text.count(' '):
                        text=original
            if key in ['quantity','price','amount']:
                if variant=='verified':
                    _,trimmed=recognize(engine,crop)
                    second=check_tesseract(trimmed)
                    if not text or not re.fullmatch(r'\d+',text) or text!=second:
                        result.setdefault('observations',[]).append({'path':f'lines/{row_index}/{key}',
                                                                   'model':text,'tesseract':second})
                        result['issues'].append(f'AMBIGUOUS_NUMERIC:{row_index}/{key}')
                        text=None
                elif not text or not re.fullmatch(r'\d+',text):
                    result['issues'].append(f'INVALID_NUMERIC:{row_index}/{key}')
                    text=None
            row[key]=text
        rows.append(row)
    result['lines']=rows
    result['issues']=[issue for issue in result['issues'] if not issue.startswith('TABLE_')]
    return result
