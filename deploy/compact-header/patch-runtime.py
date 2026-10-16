"""Append isolated header CSS; retain every original asset and runtime byte."""
import hashlib,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
CSS=HERE.parent.parent/'apps/web/app/compact-header.css'
def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);assert not overlay.exists(),'Fresh overlay required'
 css=CSS.read_bytes();assert b'</style' not in css and b'@import' not in css
 name='compact-header-'+hashlib.sha256(css).hexdigest()[:16]+'.css'
 link='<link rel="stylesheet" data-hidi-compact-header href="/'+name+'">'
 server=(base/'server.mjs').read_text();html=(base/'dist/index.html').read_text()
 assert 'data-hidi-compact-header' not in server+html,'Header overlay already installed'
 anchors=list(re.finditer(r'function injectStorefrontLayerFix\(html(?:, pathname)?\) \{\n',server));assert len(anchors)==1,'Unknown storefront injection function'
 anchor=anchors[0].group()
 addition='  if (!html.includes("data-hidi-compact-header")) html = html.replace(/<\\/head>/i, '+repr(link)+" + '</head>');\n"
 updated=server.replace(anchor,anchor+addition,1);assert updated.replace(anchor+addition,anchor,1)==server
 assert html.count('</head>')==1,'Unknown homepage document'
 updated_html=html.replace('</head>',link+'\n</head>',1);assert updated_html.replace(link+'\n</head>','</head>',1)==html
 files={'server.mjs':updated.encode(),'dist/index.html':updated_html.encode(),'dist/'+name:css}
 for path,data in files.items():
  target=overlay/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 return {'passed':True,'allowedFiles':sorted(files),'cssAsset':name,'inverseTransformsVerified':True,'existingStylesRetained':True,'logoArtworkUnchanged':True,'databaseWrites':False,'storageWrites':False}
