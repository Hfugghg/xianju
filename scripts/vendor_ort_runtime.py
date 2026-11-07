"""Copy pinned npm ONNX Runtime browser assets for same-origin hosting."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[1]
package = root / 'web/arcade/node_modules/onnxruntime-web'
target = root / 'web/arcade/public/runtime/ort'
target.mkdir(parents=True, exist_ok=True)
names = ['ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs',
         'ort-wasm-simd-threaded.asyncify.wasm']
manifest = {'package': 'onnxruntime-web',
            'version': json.loads((package / 'package.json').read_text())['version'],
            'source': 'https://github.com/microsoft/onnxruntime', 'license': 'MIT', 'files': []}
for name in names:
    shutil.copy2(package / 'dist' / name, target / name)
    manifest['files'].append({'name': name, 'sha256': hashlib.sha256((target / name).read_bytes()).hexdigest()})
(target / 'sources.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
