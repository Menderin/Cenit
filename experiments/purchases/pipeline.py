"""Experimental OCR geometries. No truth labels, filenames or fixture coordinates used."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'baseline'))
from benchmark import grouped, normalize, parse
import cv2
import numpy as np
import re
from PIL import Image


def tokens(engine,image,scale=1,word_boxes=False):
    image=image.convert('RGB')
    if scale != 1:
        image=image.resize((image.width*scale,image.height*scale),Image.Resampling.LANCZOS)
    result=engine(image,use_det=True,use_cls=False,use_rec=True,return_word_box=word_boxes)
    output=[]
    if result.boxes is None:
        return output
    entries=[]
    if word_boxes and result.word_results:
        for line in result.word_results:
            for text,score,box in line:
                if box is not None:
                    entries.append((box,text))
    if not entries:
        entries=list(zip(result.boxes,result.txts))
    for box,text in entries:
        x,y=np.min(box,axis=0)/scale; right,bottom=np.max(box,axis=0)/scale
        for match in re.finditer(r'\S+',text):
            output.append({'text':match.group(),'x':float(x+(right-x)*match.start()/len(text)),
                           'y':float(y),'w':float((right-x)*(match.end()-match.start())/len(text)),
                           'h':float(bottom-y)})
    return output


def clusters(values):
    groups=[]
    for value in sorted(values):
        if not groups or value-groups[-1][-1]>3:
            groups.append([int(value)])
        else:
            groups[-1].append(int(value))
    return [int(np.mean(g)) for g in groups]


def grid(image,words):
    groups=grouped(words)
    start=next((g for g in groups if 'lineas de solicitud' in normalize(g['text'])),None)
    end=next((g for g in groups if 'secuencia de aprobacion' in normalize(g['text'])),None)
    if not start or not end:
        return None
    gray=np.array(image.convert('L'))
    edge=cv2.Canny(gray,3,15)
    edge[:int(start['center']),:]=0; edge[int(end['center']):,:]=0
    horizontal=cv2.morphologyEx(edge,cv2.MORPH_CLOSE,np.ones((1,9),np.uint8))
    horizontal=cv2.morphologyEx(horizontal,cv2.MORPH_OPEN,np.ones((1,max(30,int(image.width*.4))),np.uint8))
    ys=clusters(np.flatnonzero((horizontal>0).sum(axis=1)>image.width*.5))
    if len(ys)<3:
        return None
    top,bottom=ys[0],ys[-1]
    vertical=cv2.morphologyEx(edge,cv2.MORPH_CLOSE,np.ones((7,1),np.uint8))
    vertical=cv2.morphologyEx(vertical,cv2.MORPH_OPEN,np.ones((max(15,int((bottom-top)*.4)),1),np.uint8))
    xs=clusters(np.flatnonzero((vertical[top:bottom]>0).sum(axis=0)>(bottom-top)*.5))
    if len(xs)!=8:
        return None
    # Seven observed columns are a research format restriction, not universal Oracle geometry.
    return xs,ys


def cell_text(engine,image,numeric=False):
    if image.width<3 or image.height<3:
        return None
    scaled=image.resize((image.width*3,image.height*3),Image.Resampling.LANCZOS)
    if numeric:
        # A numeric cell is one line: skip text detection instead of losing a lone digit.
        recognized=engine(scaled,use_det=False,use_cls=False,use_rec=True,return_word_box=False)
        text=' '.join(recognized.txts or ()).strip() or None
        if text and re.fullmatch(r'\d+',text):
            return text
    words=tokens(engine,scaled)
    text=' '.join(g['text'] for g in grouped(words)) or None
    # Re-read questionable numbers; never directly substitute O with 0.
    if numeric and (text is None or not re.fullmatch(r'\d+',text)):
        gray=cv2.cvtColor(np.array(scaled),cv2.COLOR_RGB2GRAY)
        contrast=cv2.createCLAHE(clipLimit=2,tileGridSize=(4,4)).apply(gray)
        retry=tokens(engine,Image.fromarray(contrast))
        candidate=' '.join(g['text'] for g in grouped(retry)) or None
        if candidate and re.fullmatch(r'\d+',candidate):
            text=candidate
    return text


def extract(engine,path,variant):
    image=Image.open(path).convert('RGB')
    words=tokens(engine,image,scale=1 if variant=='baseline' else 2,word_boxes=variant!='baseline')
    result=parse(path,words)
    if variant!='cells':
        return result
    geometry=grid(image,words)
    if not geometry:
        result['lines']=[]
        result['issues']=list(dict.fromkeys(result['issues']+['GRID_NOT_RESOLVED']))
        return result
    xs,ys=geometry
    keys=['description','provider','costCenter','quantity','price','amount','chargeAccount']
    rows=[]
    for top,bottom in zip(ys[1:],ys[2:]):
        row={}
        for index,key in enumerate(keys):
            crop=image.crop((xs[index]+3,top+3,xs[index+1]-3,bottom-3))
            text=cell_text(engine,crop,numeric=key in ['quantity','price','amount'])
            if key=='chargeAccount' and text:
                text=text.replace(' ','')
            row[key]=text
        rows.append(row)
    result['lines']=rows
    result['issues']=[issue for issue in result['issues'] if not issue.startswith('TABLE_')]
    return result
