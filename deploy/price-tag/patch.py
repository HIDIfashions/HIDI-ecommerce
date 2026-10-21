from pathlib import Path
import re,hashlib,json
HERE=Path(__file__).resolve().parent

def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);files={};replacements={};patched=[]
 css=(HERE/'raster.css').read_text()
 raster=(HERE.parent.parent/'apps/web/lib/price-tag-raster.mjs').read_text().replace('export async function','async function',1)
 for path in (base/'apps/web/.next').rglob('*.js'):
  text=path.read_text(encoding='utf-8')
  if "address.dataset.lines = '2'" not in text:continue
  assert 'rasterizePriceTagDocument' not in text, 'Already rasterized'
  new=text.replace('</style></head><body>',css+'</style></head><body>')
  start=new.index('function fitPriceTagDocument(doc)');brace=new.index('{',start);depth=1;end=brace+1
  while depth:
   if new[end]=='{':depth+=1
   elif new[end]=='}':depth-=1
   end+=1
  invocation=re.match(r'\s*\)\(([$\w]+)\);',new[end:]);assert invocation
  after=end+invocation.end()
  new=new[:after]+'await ('+raster.strip()+')('+invocation[1]+');'+new[after:]
  new=new.replace('Thermal printer','Gobbler TT428B (203 DPI)')
  new=new.replace('300-DPI thermal-transfer','203-DPI thermal-transfer').replace('300 DPI READY','203 DPI')
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
