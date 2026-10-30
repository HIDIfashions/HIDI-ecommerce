"""Prepare a bounded header-only CSS overlay. Does not deploy or change settings."""
import hashlib,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    assert not overlay.exists(),'Fresh overlay required'
    css=(HERE/'header.css').read_bytes()
    name='header-burgundy-'+hashlib.sha256(css).hexdigest()[:16]+'.css'
    link='<link rel="stylesheet" data-hidi-header-burgundy href="/'+name+'">'
    server=(base/'server.mjs').read_bytes();html=(base/'dist/index.html').read_bytes()
    assert b'data-hidi-header-burgundy' not in server+html,'Already installed'
    text=server.decode();anchors=list(re.finditer(r'function injectStorefrontLayerFix\(html(?:, pathname)?\) \{\n',text))
    assert len(anchors)==1,'Unknown storefront injection function'
    anchor=anchors[0].group()
    addition='  if (!html.includes("data-hidi-header-burgundy")) html = html.replace(/<\\/head>/i, '+repr(link)+" + '</head>');\n"
    updated=text.replace(anchor,anchor+addition,1)
    assert updated.replace(anchor+addition,anchor,1).encode()==server
    assert html.count(b'</head>')==1
    updated_html=html.replace(b'</head>',link.encode()+b'\n</head>',1)
    assert updated_html.replace(link.encode()+b'\n</head>',b'</head>',1)==html
    discovery=(base/'seo-document/discovery.mjs').read_bytes()
    anchor=b'</style></head><body>'
    assert discovery.count(anchor)==1,'Unknown guide header template'
    replacement=b'</style>'+link.encode()+b'</head><body>'
    updated_discovery=discovery.replace(anchor,replacement,1)
    assert updated_discovery.replace(replacement,anchor,1)==discovery
    files={'server.mjs':updated.encode(),'dist/index.html':updated_html,'dist/'+name:css,'seo-document/discovery.mjs':updated_discovery}
    for name,data in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'inverseTransformsVerified':True,'cssOnlyBehaviorChange':True,'liveWrites':0,'deployed':False}
