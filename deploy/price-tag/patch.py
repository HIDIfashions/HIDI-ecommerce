from pathlib import Path
import re,hashlib,json
HERE=Path(__file__).resolve().parent

def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);files={};replacements={};patched=[]
 css=(HERE/'square.css').read_text()
 for path in (base/'apps/web/.next').rglob('*.js'):
  text=path.read_text(encoding='utf-8')
  if 'Recommended for the complete legal footer' not in text or '@page { size:' not in text:continue
  assert '"50x50"' not in text,'Square option already exists'
  new,count=re.subn(r'(?="50x90":\{label:)', '"50x50":{label:"50 × 50 mm",width:50,height:50,note:"Compact square tag"},',text)
  assert count==1
  match=re.search(r'@page \{ size: \$\{(\w+)\.width\}',new);assert match
  size=match[1]
  assert new.count('</style></head><body>')==1
  new=new.replace('</style></head><body>','${'+size+'.height===50?'+json.dumps(css)+':""}</style></head><body>')
  # The preview receives the selected preset, including its exact aspect ratio.
  preview=re.search(r'function ([$\w]+)\(\{item:(\w+),details:(\w+)\}\)',new);assert preview
  func,item,details=preview.groups()
  new=new.replace(preview[0],preview[0].replace('details:'+details,'details:'+details+',preset:hidiPreset'))
  tag=re.search(r'className:([^,}]+\.previewTag),children:',new);assert tag
  # Width is 50mm for square; other preset previews keep their established layout.
  new=new.replace(tag[0],tag[0].replace(',children:',',"data-square":hidiPreset==="50x50",style:{aspectRatio:hidiPreset==="50x50"?"1 / 1":hidiPreset==="50x80"?"5 / 8":hidiPreset==="60x100"?"3 / 5":"5 / 9"},children:'))
  call=re.search(re.escape(func)+r',\{item:([^,}]+),details:([^,}]+)\}',new);assert call
  # Locate the current preset in the live preview heading.
  current=re.findall(r'children:[$\w]+\[([$\w]+)\]\.label',new);assert current
  new=new.replace(call[0],call[0][:-1]+',preset:'+current[-1]+'}')
  name=path.relative_to(base).as_posix()
  if '/static/' in name:
   newname=re.sub(r'-[a-f0-9]{16}\.js$', '-'+hashlib.sha256(new.encode()).hexdigest()[:16]+'.js',name);assert newname!=name
   replacements[Path(name).name]=Path(newname).name;files[newname]=new
  else:files[name]=new
  patched.append(name)
 assert any('/static/' in n for n in patched) and any('/server/' in n for n in patched),patched
 # Update manifests and page references to the new immutable chunk URL.
 for path in (base/'apps/web/.next').rglob('*'):
  if not path.is_file() or path.suffix not in ['.js','.json','.html','.rsc']:continue
  name=path.relative_to(base).as_posix();text=files.get(name,path.read_text(encoding='utf-8'));new=text
  for old,value in replacements.items():new=new.replace(old,value)
  if new!=text:files[name]=new
 # Existing price-tag stylesheet owns all preview selectors.
 found=0
 for path in (base/'apps/web/.next/static/css').glob('*.css'):
  text=path.read_text()
  if 'price-tags_previewTag__' not in text:continue
  found+=1
  names=dict(re.findall(r'(price-tags_(preview\w+)__[\w-]+)',text))
  mapping={value:key for key,value in names.items()}
  extra=(HERE/'preview.css').read_text()
  for key,value in mapping.items():extra=extra.replace('.'+key,'.'+value)
  for name in list(files):
   if name.endswith('.js') and 'hidiPreset' in files[name]:
    content=files[name]
    preview=re.search(r'\(0,([$\w]+)\.jsxs\)\("div",\{className:[^,]+\.previewTag',content);assert preview
    alias=preview[1]
    anchor='},children:['
    start=content.index('"data-square":hidiPreset')
    pos=content.index(anchor,start)+len(anchor)
    files[name]=content[:pos]+'(0,'+alias+'.jsx)("style",{children:'+json.dumps(extra)+'}),'+content[pos:]
 assert found==1,found
 for name,text in files.items():
  dest=overlay/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text,encoding='utf-8')
 return {'passed':True,'allowedFiles':sorted(files),'patchedFactories':patched,'immutableChunks':replacements}
