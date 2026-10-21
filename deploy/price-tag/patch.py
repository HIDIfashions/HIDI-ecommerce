from pathlib import Path
import re,hashlib,json
HERE=Path(__file__).resolve().parent

def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);files={};replacements={};patched=[]
 for path in (base/'apps/web/.next').rglob('*.js'):
  text=path.read_text(encoding='utf-8')
  if '.product-meta { font-size: 3.5pt;' not in text or '<div class="sku">SKU' in text:continue
  assert '"40x50":{label:' not in text
  new,count=re.subn(r'(?="50x40":\{label:)', '"40x50":{label:"40 × 50 mm",width:40,height:50,note:"Portrait label · size without measurements"},',text);assert count==1
  new,count=re.subn(r'(\.item,[$\w]+,[$\w]+,)([$\w]+)\.height===40\)', r'\1(\2.height===40||\2.width===40))',new);assert count==1
  new,count=re.subn(r'hidiPreset==="50x40"\?\[\]', '(hidiPreset==="50x40"||hidiPreset==="40x50")?[]',new);assert count==1
  new=new.replace('(hidiPreset==="50x50"||hidiPreset==="50x40")','(hidiPreset==="50x50"||hidiPreset==="50x40"||hidiPreset==="40x50")')
  new=new.replace('aspectRatio:hidiPreset===', 'aspectRatio:hidiPreset==="40x50"?"4 / 5":hidiPreset===')
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
