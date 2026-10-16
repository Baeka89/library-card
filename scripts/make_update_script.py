"""Build one complete updater, including the reviewed project source."""
from pathlib import Path
import ast
import base64
import hashlib
import io
import json
import zipfile

EXCLUDED = {'.git', '.venv', '.publication', 'dist', '__pycache__', 'node_modules', '.pytest_cache', '.storage', '.checks'}


def build(root, destination):
    version = json.loads((root / 'custom_components/card_library/manifest.json').read_text())['version']
    files = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if any(part in EXCLUDED or part == '.env' or part.startswith('.env.') for part in relative.parts) or path.suffix in {'.pyc', '.pyo', '.zip'} or path.name in {'secrets.yaml', '.DS_Store', 'Thumbs.db'} or path.name.startswith('home-assistant.log'):
            continue
        if path.is_symlink():
            raise ValueError('Symlink im Quellpaket: ' + str(relative))
        if path.is_file():
            files[relative.as_posix()] = path.read_bytes()
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name, data in files.items():
            info = zipfile.ZipInfo('library-card/' + name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    raw = stream.getvalue()
    source = (root / 'scripts/update_publication.py').read_text()
    values = {'VERSION': version, 'TAG': 'v' + version, 'MARKER': 'reviewed-release-v' + version + '.json',
              'DIGEST': hashlib.sha256(raw).hexdigest(), 'PAYLOAD': base64.b64encode(raw).decode('ascii')}
    lines = source.splitlines(keepends=True)
    for node in reversed(ast.parse(source).body):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in values:
            name = node.targets[0].id
            lines[node.lineno - 1:node.end_lineno] = [name + ' = ' + repr(values[name]) + '\n']
    result = ''.join(lines)
    compile(result, str(destination), 'exec')
    destination = Path(destination)
    with destination.open('x', encoding='utf-8') as handle:
        handle.write(result)
    return {'version': version, 'files': len(files), 'bytes': destination.stat().st_size, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps(build(Path(__file__).resolve().parents[1], args.destination), indent=2))
