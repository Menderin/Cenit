"""Third experiment: prior cases are development; new renderer is held out."""
import argparse
import hashlib
import json
from pathlib import Path
import resource
import time
import dataset
import dataset_v3
from pipeline_v3 import extract
from baseline.benchmark import score
from rapidocr import RapidOCR,LangRec,ModelType,OCRVersion

parser=argparse.ArgumentParser()
parser.add_argument('--variant',choices=['baseline','tight','consensus'],required=True)
parser.add_argument('--split',choices=['development','holdout'],required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--repeats',type=int,default=2)
args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
cases=(dataset if args.split=='development' else dataset_v3).build(args.output/'fixtures')
cases=[c for c in cases if c['split']=='holdout' and (args.split=='holdout' or c['id'] in ['clear','zero','multiline','jpeg'])]
root=Path(__file__).parent
files=[root/n for n in ['dataset.py','dataset_v3.py','pipeline.py','pipeline_v3.py','round3.py']]
source_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
started=time.perf_counter()
engine=RapidOCR(params={'Rec.lang_type':LangRec.LATIN,'Rec.model_type':ModelType.MOBILE,
 'Rec.ocr_version':OCRVersion.PPOCRV5,'Det.model_type':ModelType.MOBILE,'Det.ocr_version':OCRVersion.PPOCRV5,
 'EngineConfig.onnxruntime.intra_op_num_threads':1,'EngineConfig.onnxruntime.inter_op_num_threads':1})
initialization=time.perf_counter()-started
measurements=[]
for case in cases:
    for run in range(args.repeats):
        started=time.perf_counter()
        result=extract(engine,args.output/'fixtures'/case['file'],args.variant)
        measurement={'case':case['id'],'run':run+1,'seconds':time.perf_counter()-started,
                     'result':result,'evaluation':score(result,case['expected'])}
        measurements.append(measurement)
        print(json.dumps({k:v for k,v in measurement.items() if k not in ['result','evaluation']}),flush=True)
assert source_hashes=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'Sources changed during execution'
report={'variant':args.variant,'split':args.split,'initializationSeconds':initialization,
 'sourceHashes':source_hashes,
 'fixtureHashes':{c['id']:hashlib.sha256((args.output/'fixtures'/c['file']).read_bytes()).hexdigest() for c in cases},
 'measurements':measurements,'processPeakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
 'containerMemoryPeakBytes':int(Path('/sys/fs/cgroup/memory.peak').read_text()),
 'models':[{'name':name,'sha256':hashlib.sha256((Path('/opt/research/lib/python3.11/site-packages/rapidocr/models')/name).read_bytes()).hexdigest()}
           for name in ['ch_PP-OCRv5_det_mobile.onnx','latin_PP-OCRv5_rec_mobile.onnx']]}
(args.output/(args.variant+'-'+args.split+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
