"""Summarize frozen holdout results without changing extractors or truth labels."""
import argparse
import hashlib
import json
import statistics
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('directory',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
summaries=[]; source_hashes=None; fixture_hashes=None
baseline_path=Path(__file__).parent/'baseline'/'evidence.json'
history=json.loads(baseline_path.read_text(encoding='utf8'))
known_models={m['file']:m['sha256'] for e in history['engines'] if e['engine']=='rapid' for m in e['loadedModelFiles']}
for variant in ['baseline','upscale','cells']:
    report=json.loads((args.directory/(variant+'-holdout.json')).read_text(encoding='utf8'))
    if source_hashes is None:
        source_hashes=report['sourceHashes']; fixture_hashes=report['fixtureHashes']
    assert source_hashes==report['sourceHashes'],'Variants were not frozen consistently'
    assert fixture_hashes==report['fixtureHashes'],'Different images compared'
    assert all(known_models.get(m['name'])==m['sha256'] for m in report['models']),'Model weights changed'
    runs=report['measurements']; samples=[]
    for name in dict.fromkeys(m['case'] for m in runs):
        group=[m for m in runs if m['case']==name]; first=group[0]
        assert not any('error' in m for m in group), 'Processing error: '+name
        checks=first['evaluation']['checks']; visible=[c for c in checks if c['expected'] is not None]
        numeric=[c for c in visible if c['path'].endswith(('/requestNumber','/oracleId','/quantity','/price','/amount','/chargeAccount'))]
        samples.append({'case':name,'visibleExact':sum(c['exact'] for c in visible),'visibleFields':len(visible),
          'numericExact':sum(c['exact'] for c in numeric),'numericFields':len(numeric),
          'headerExact':sum(c['exact'] for c in visible if c['path'].startswith('header/')),
          'headerFields':sum(c['path'].startswith('header/') for c in visible),
          'lineExact':sum(c['exact'] for c in visible if c['path'].startswith('lines/')),
          'lineFields':sum(c['path'].startswith('lines/') for c in visible),
          'wrongNonNull':sum(not c['exact'] and c['actual'] is not None for c in checks),
          'absencesCorrect':sum(c['exact'] for c in checks if c['expected'] is None),
          'absences':sum(c['expected'] is None for c in checks),
          'rowsCorrect':first['evaluation']['rowsCorrect'],
          'medianSeconds':statistics.median(m['seconds'] for m in group),
          'maxSeconds':max(m['seconds'] for m in group),
          'repeatable':all(m['result']==first['result'] for m in group),
          'issues':first['result']['issues'],'failures':[c for c in checks if not c['exact']]})
    summary={'variant':variant,'runs':len(runs),'samples':samples,
      'visibleExact':sum(s['visibleExact'] for s in samples),'visibleFields':sum(s['visibleFields'] for s in samples),
      'medianSeconds':statistics.median(m['seconds'] for m in runs),'maxSeconds':max(m['seconds'] for m in runs),
      'processPeakRssKiB':report['processPeakRssKiB'],'containerMemoryPeakBytes':report['containerMemoryPeakBytes'],
      'initializationSeconds':report['initializationSeconds'],'models':report['models']}
    summaries.append(summary)
    print(variant,summary['visibleExact'],summary['visibleFields'],round(summary['medianSeconds'],3),
          round(summary['maxSeconds'],3),round(summary['containerMemoryPeakBytes']/1048576,1))
output={'date':'2026-10-14','environment':'Notebook / rootless Podman Linux CPU-only, 1 CPU / 1 GiB, sequential, network disabled',
 'baselineEvidenceSha256':hashlib.sha256(baseline_path.read_bytes()).hexdigest(), 'samePretrainedWeights':True,
 'developmentExecutions':16,'holdoutExecutions':sum(s['runs'] for s in summaries),
 'sourceHashes':source_hashes,'fixtureHashes':fixture_hashes,'variants':summaries,
 'limitations':['Synthetic held-out configurations, not independent customer screenshots',
                'Raw text exact match for a subset of the public contract',
                'Seven-column bordered tables only; no-grid is a deliberate unsupported case']}
args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
