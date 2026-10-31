"""Remove only the obsolete launch strip's homepage asset references."""
import hashlib,re
from pathlib import Path

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    original=(base/'dist/index.html').read_bytes()
    patterns=[
        rb'<link\b[^>]*\bhref=[\"\']/hidi-launch-countdown-20261011\.css[\"\'][^>]*>|<style\b[^>]*data-hidi-inline-css=[\"\']/hidi-launch-countdown-20261011\.css[\"\'][^>]*>[^<]*</style>',
        rb'<script\b[^>]*\bsrc=[\"\']/(?:hidi-launch-countdown-20261011|assets/home-countdown-de2c96f5b53a953c)\.js[\"\'][^>]*>\s*</script>',
    ]
    spans=[]
    for pattern in patterns:
        matches=list(re.finditer(pattern,original,re.I))
        assert len(matches)==1,'Expected exactly one original launch strip asset reference'
        spans.append(matches[0].span())
    updated=original
    for start,end in sorted(spans,reverse=True):updated=updated[:start]+updated[end:]
    assert b'hidi-launch-countdown' not in updated and b'home-countdown-' not in updated
    restored=updated
    for start,end in sorted(spans):restored=restored[:start]+original[start:end]+restored[start:]
    assert restored==original,'Unrelated homepage bytes changed'
    target=overlay/'dist/index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(updated)
    return {'passed':True,'allowedFiles':['dist/index.html'],'removedReferences':2,'inverseVerified':True,'beforeSha256':hashlib.sha256(original).hexdigest(),'afterSha256':hashlib.sha256(updated).hexdigest()}
