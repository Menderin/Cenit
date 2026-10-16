"""Trim real ink before recognition; cross-check numbers without automatic O/0 repair."""
import subprocess
import tempfile
from pathlib import Path
import re
import numpy as np
from PIL import Image,ImageOps
from pipeline import tokens,grid
from baseline.benchmark import parse


def tight_crop(image):
    gray=np.array(image.convert('L'))
    ys,xs=np.where(gray<150)
    if not len(xs):
        return None
    # The cell borders have already been excluded. Preserve aspect ratio and add white padding.
    crop=image.crop((int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1))
    crop=ImageOps.expand(crop,border=3,fill='white')
    scale=48/crop.height
    return crop.resize((max(3,round(crop.width*scale)),48),Image.Resampling.LANCZOS)


def recognize(engine,image):
    crop=tight_crop(image)
    if crop is None:
        return None,None
    result=engine(crop,use_det=False,use_cls=False,use_rec=True,return_word_box=False)
    return (' '.join(result.txts or ()).strip() or None),crop


def check_tesseract(image):
    if image is None:
        return None
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'cell.png'; image.save(path)
        result=subprocess.run(['tesseract',str(path),'stdout','-l','eng','--psm','7'],
                              capture_output=True,text=True,check=True,timeout=10)
    return result.stdout.strip() or None


def ambiguous_numbers(result,reason):
    for index,row in enumerate(result['lines']):
        for key in ['quantity','price','amount']:
            result.setdefault('observations',[]).append({'path':f'lines/{index}/{key}',
                                                       'global':row[key],'reason':reason})
            row[key]=None
            result['issues'].append(f'AMBIGUOUS_NUMERIC:{index}/{key}')
    return result


def extract(engine,path,variant):
    image=Image.open(path).convert('RGB')
    words=tokens(engine,image,word_boxes=False)
    result=parse(path,words)
    if variant=='baseline':
        return result
    geometry=grid(image,words)
    if not geometry:
        result['issues'].append('CELL_RECHECK_UNAVAILABLE')
        if variant=='consensus':
            return ambiguous_numbers(result,'No numeric region could be verified')
        return result
    xs,ys=geometry
    if len(ys)-2 != len(result['lines']):
        result['issues'].append('ROW_SEGMENTATION_DISAGREEMENT')
        if variant=='consensus':
            return ambiguous_numbers(result,'Row segmentation differs between methods')
        return result
    # Target only the problematic numeric cells; leave global text/headers unchanged.
    for row_index,(top,bottom) in enumerate(zip(ys[1:],ys[2:])):
        for key,column in [('quantity',3),('price',4),('amount',5)]:
            crop=image.crop((xs[column]+3,top+3,xs[column+1]-3,bottom-3))
            candidate,trimmed=recognize(engine,crop)
            original=result['lines'][row_index][key]
            if variant=='tight':
                if candidate and re.fullmatch(r'\d+',candidate):
                    result['lines'][row_index][key]=candidate
                else:
                    result['issues'].append(f'NUMERIC_RECHECK_INVALID:{row_index}/{key}')
                continue
            alternative=check_tesseract(trimmed)
            valid=lambda value: value is not None and re.fullmatch(r'\d+',value) is not None
            # Require agreement with a second OCR engine, not just repeated passes of one model.
            if valid(candidate) and candidate==alternative:
                result['lines'][row_index][key]=candidate
            elif valid(original) and original==alternative:
                result['lines'][row_index][key]=original
            else:
                result.setdefault('observations',[]).append({'path':f'lines/{row_index}/{key}',
                  'global':original,'tight':candidate,'tesseract':alternative})
                result['lines'][row_index][key]=None
                result['issues'].append(f'AMBIGUOUS_NUMERIC:{row_index}/{key}')
    return result
