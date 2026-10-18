"""Fetch the same pre-trained weights used locally; reject any changed bytes."""
import ast
import hashlib
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parents[2]
source = ast.parse((root/'apps/ocr/extractor.py').read_text())
weights = next(ast.literal_eval(node.value) for node in source.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'WEIGHTS' for target in node.targets))
directory = root/'apps/ocr/models'
directory.mkdir(exist_ok=True)
base = 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/'
for name, expected in weights.items():
    path = directory/name
    if not path.exists():
        kind = 'det' if '_det_' in name else 'rec'
        with urllib.request.urlopen(base+kind+'/'+name, timeout=120) as response:
            content = response.read(32*1024*1024+1)
        if hashlib.sha256(content).hexdigest() != expected:
            raise ValueError('Unexpected OCR weight hash: '+name)
        path.write_bytes(content)
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Unexpected local OCR weight hash: '+name)
    print('Verified '+name)
