"""Append a bounded asset layer while preserving every original runtime setting."""
import copy, gzip, hashlib, io, json, os, tarfile
from pathlib import Path

ALLOWED = {'app/offers/checkout.js', 'app/offers/offers.css'}
def digest(data): return 'sha256:' + hashlib.sha256(data).hexdigest()
def encode(value): return json.dumps(value, separators=(',', ':')).encode()
def build(source, destination, files):
    assert set(files) == ALLOWED, 'Only the two reviewed checkout assets may change'
    source, destination = Path(source), Path(destination)
    manifest = json.loads((source/'manifest.json').read_bytes())
    config_bytes = (source/manifest['config']['digest'].split(':')[1]).read_bytes()
    assert digest(config_bytes) == manifest['config']['digest']
    config = json.loads(config_bytes)
    destination.mkdir()
    for item in source.iterdir():
        if item.is_file() and item.name != 'manifest.json': os.link(item, destination/item.name)
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w') as archive:
        for name, content in sorted(files.items()):
            entry = tarfile.TarInfo(name); entry.size = len(content)
            entry.uid = entry.gid = 1000; entry.mode = 0o644; entry.mtime = 0
            archive.addfile(entry, io.BytesIO(content))
    layer = gzip.compress(raw.getvalue(), mtime=0)
    result = copy.deepcopy(config)
    result['rootfs']['diff_ids'].append(digest(raw.getvalue()))
    result.setdefault('history', []).append({'created_by':'HIDI reviewed checkout display assets'})
    updated = copy.deepcopy(manifest)
    new_config = encode(result)
    updated['config'].update(digest=digest(new_config), size=len(new_config))
    updated['layers'].append({'mediaType':manifest['layers'][-1]['mediaType'], 'digest':digest(layer), 'size':len(layer)})
    for data in [layer, new_config]: (destination/digest(data).split(':')[1]).write_bytes(data)
    (destination/'manifest.json').write_bytes(encode(updated))
    assert {k:v for k,v in result.items() if k not in ('history','rootfs')} == {k:v for k,v in config.items() if k not in ('history','rootfs')}
    assert updated['layers'][:-1] == manifest['layers']
    return digest(encode(updated))
