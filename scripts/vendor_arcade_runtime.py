"""Vendor the pinned Pyodide runtime and NumPy wheel for same-origin offline play."""
from pathlib import Path
import hashlib
import base64
import json
import shutil
import urllib.request
import argparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/arcade/node_modules/pyodide'
TARGET = ROOT / 'web/arcade/public/runtime/pyodide'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proxy', help='Optional download proxy, for example http://127.0.0.1:7897')
    args = parser.parse_args()
    TARGET.mkdir(parents=True, exist_ok=True)
    version = json.loads((SOURCE / 'package.json').read_text())['version']
    lock = json.loads((SOURCE / 'pyodide-lock.json').read_text())
    entries = []
    names = ['pyodide.mjs', 'pyodide.js', 'pyodide.asm.wasm', 'pyodide-lock.json']
    names.append('pyodide.asm.mjs' if (SOURCE / 'pyodide.asm.mjs').exists() else 'pyodide.asm.js')
    for name in names:
        shutil.copy2(SOURCE / name, TARGET / name)
        entries.append({'file': name, 'source': f'npm:pyodide@{version}'})
    # Serve the stdlib as JSON, then create an in-memory Blob in the worker.
    # Download managers can intercept network ZIP URLs and return an empty 204.
    (TARGET / 'python_stdlib.json').write_text(json.dumps({
        'encoding': 'base64',
        'data': base64.b64encode((SOURCE / 'python_stdlib.zip').read_bytes()).decode('ascii')
    }), encoding='utf-8')
    entries.append({'file': 'python_stdlib.json', 'source': f'npm:pyodide@{version}:python_stdlib.zip'})
    pending = ['numpy']
    visited = set()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({'http': args.proxy, 'https': args.proxy})) if args.proxy else urllib.request.build_opener()
    while pending:
        name = pending.pop()
        if name in visited:
            continue
        visited.add(name)
        package = lock['packages'][name]
        pending.extend(package['depends'])
        dest = TARGET / package['file_name']
        url = f'https://cdn.jsdelivr.net/pyodide/v{version}/full/{dest.name}'
        transport = dest.with_name(dest.name + '.json')
        payload = None
        if transport.exists():
            try:
                payload = base64.b64decode(json.loads(transport.read_text())['data'], validate=True)
            except (ValueError, KeyError):
                pass
        if payload is None or hashlib.sha256(payload).hexdigest() != package['sha256']:
            with opener.open(url, timeout=90) as response:
                payload = response.read()
        digest = hashlib.sha256(payload).hexdigest()
        if digest != package['sha256']:
            raise ValueError(f'Integrity check failed: {name}')
        transport.write_text(json.dumps({'encoding': 'base64', 'data': base64.b64encode(payload).decode('ascii')}), encoding='utf-8')
        entries.append({'file': transport.name, 'source': url})
        print(f'Verified {name}: {len(payload)} bytes', flush=True)
    for entry in entries:
        file = TARGET / entry['file']
        entry.update(bytes=file.stat().st_size, sha256=hashlib.sha256(file.read_bytes()).hexdigest())
    (TARGET / 'manifest.json').write_text(json.dumps({'pyodide': version, 'files': entries}, indent=2), encoding='utf-8')
    print(f'Vendored {len(entries)} files, {sum(x["bytes"] for x in entries)} bytes', flush=True)

if __name__ == '__main__':
    main()
