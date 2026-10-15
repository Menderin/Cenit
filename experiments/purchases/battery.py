"""Comparison on development and frozen synthetic holdout sets; no application writes."""
import argparse
import hashlib
import json
from pathlib import Path
import resource
import statistics
import time
from dataset import build
from pipeline import extract
from baseline.benchmark import score
from rapidocr import RapidOCR,LangRec,ModelType,OCRVersion

parser=argparse.ArgumentParser()
parser.add_argument('--variant',choices=['baseline','upscale','cells'],required=True)
parser.add_argument('--split',choices=['development','holdout','all'],default='all')
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--repeats',type=int,default=2)
args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
cases=build(args.output/'fixtures')
started=time.perf_counter()
engine=RapidOCR(params={'Rec.lang_type':LangRec.LATIN,'Rec.model_type':ModelType.MOBILE,
 'Rec.ocr_version':OCRVersion.PPOCRV5,'Det.model_type':ModelType.MOBILE,'Det.ocr_version':OCRVersion.PPOCRV5,
 'EngineConfig.onnxruntime.intra_op_num_threads':1,'EngineConfig.onnxruntime.inter_op_num_threads':1})
initialization=time.perf_counter()-started
measurements=[]
for case in cases:
    if args.split!='all' and case['split']!=args.split:
        continue
    for run in range(args.repeats):
        started=time.perf_counter()
        try:
            result=extract(engine,args.output/'fixtures'/case['file'],args.variant)
            evaluation=score(result,case['expected'])
            measurement={'case':case['id'],'split':case['split'],'run':run+1,
              'seconds':time.perf_counter()-started,'result':result,'evaluation':evaluation}
        except Exception as error:
            measurement={'case':case['id'],'split':case['split'],'run':run+1,
              'seconds':time.perf_counter()-started,'error':type(error).__name__+': '+str(error)}
        measurements.append(measurement)
        print(json.dumps({k:v for k,v in measurement.items() if k not in ['result','evaluation']}),flush=True)
root=Path(__file__).parent
report={'variant':args.variant,'split':args.split,'initializationSeconds':initialization,
 'fixtureHashes':{c['split']+'/'+c['id']:hashlib.sha256((args.output/'fixtures'/c['file']).read_bytes()).hexdigest() for c in cases},
 'models':[{'name':name,'sha256':hashlib.sha256((Path('/opt/research/lib/python3.11/site-packages/rapidocr/models')/name).read_bytes()).hexdigest()}
           for name in ['ch_PP-OCRv5_det_mobile.onnx','latin_PP-OCRv5_rec_mobile.onnx']],
 'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'dataset.py',root/'pipeline.py',root/'battery.py']},
 'measurements':measurements,'processPeakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
 'containerMemoryPeakBytes':int(Path('/sys/fs/cgroup/memory.peak').read_text())}
(args.output/(args.variant+'-'+args.split+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('Finished',args.variant,args.split,flush=True)
