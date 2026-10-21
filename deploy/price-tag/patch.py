from pathlib import Path
import re,hashlib,json
HERE=Path(__file__).resolve().parent

def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);files={};replacements={};patched=[]
 css=(HERE/'fit.css').read_text()
 fit=(HERE.parent.parent/'apps/web/lib/price-tag-fit.mjs').read_text().replace('export function','function',1)
 for path in (base/'apps/web/.next').rglob('*.js'):
  text=path.read_text(encoding='utf-8')
  if '"40x50":{label:' not in text or '<div class="sku">SKU' in text:continue
  assert 'tag-content' not in text, 'Already fitted'
  new=text.replace('<article class="price-tag">','<article class="price-tag"><div class="tag-content">').replace('</article>`}', '</div></article>`}')
  assert new.count('class="tag-content"')==1
  new=new.replace('</style></head><body>',css+'</style></head><body>')
  document=re.search(r'([$\w]+)=[$\w]+\.contentDocument',new);assert document
  hook=re.search(r'await new Promise\(([$\w]+)=>window\.requestAnimationFrame\(\(\)=>\1\(\)\)\);',new);assert hook
  new=new[:hook.end()]+'('+fit+')('+document[1]+');'+new[hook.end():]
  start=new.index('preset:hidiPreset');end=new.index('function ',start+20);section=new[start:end]
  section,count=re.subn(r'("strong",\{)(children:[$\w]+\.productName)',r'\1style:{fontSize:"8px",lineHeight:1.1},\2',section,count=1);assert count==1
  new=new[:start]+section+new[end:]
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
 for name,text in files.items():
  dest=overlay/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text,encoding='utf-8')
 return {'passed':True,'allowedFiles':sorted(files),'patchedFactories':patched,'immutableChunks':replacements}
