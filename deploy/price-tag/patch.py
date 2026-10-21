from pathlib import Path
import re,hashlib,json
HERE=Path(__file__).resolve().parent

def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);files={};replacements={};patched=[]
 patched=[]
 for path in (base/'apps/web/.next').rglob('*.js'):
  text=path.read_text(encoding='utf-8')
  if 'hidiPreset' not in text or '<div class="sku">SKU' not in text:continue
  new,count=re.subn(r'\s*<div class="sku">SKU \$\{[^}]+\}</div>', '',text);assert count==1
  new,count=re.subn(r'\(0,([$\w]+)\.jsxs\)\("small",\{children:\["SKU ",[$\w]+\.sku\]\}\)', 'null',new);assert count==1
  # Last rule wins over both compact print presets.
  new=new.replace('</style></head><body>', '.product-meta { font-size: 3.5pt; line-height: 1.1; }\n</style></head><body>')
  previewStart=new.index('preset:hidiPreset');previewEnd=new.index('function ',previewStart+20)
  section=new[previewStart:previewEnd]
  section,count=re.subn(r'("span",\{)(children:\[)', r'\1style:{fontSize:"5px",lineHeight:1.1},\2',section,count=1);assert count==1
  new=new[:previewStart]+section+new[previewEnd:]
  new=new.replace('the full SKU remains printed below the product details.', 'it remains printed below the price.')
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
