"""Capture the remaining public video for actual-media candidate checks."""
import json
import os
from pathlib import Path
import urllib.request
root=Path(os.environ['RUNNER_TEMP'])/'hidi-hero-sound-private'
hero=json.loads((root/'public-before.json').read_text())['hero']
items=hero['items']
assert len(items)==1 and items[0]['originalName']=='IMG_3757.mp4' and items[0]['type']=='video'
assert items[0]['url'].startswith('/api/hidi/hero-asset/brand/hero/media/')
with urllib.request.urlopen('https://hidiindia.com'+items[0]['url'],timeout=90) as response:
    value=response.read(50*1024*1024+1)
assert 1024<len(value)<=50*1024*1024
(root/'hero-video.mp4').write_bytes(value)
print('PASS: actual selected video captured for audio playback checks')
