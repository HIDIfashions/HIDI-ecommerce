from pathlib import Path
import re,hashlib,json
HERE=Path(__file__).resolve().parent

def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);files={};replacements={};patched=[]
 css=(HERE/'logo-address.css').read_text()
 fit=(HERE.parent.parent/'apps/web/lib/price-tag-fit.mjs').read_text().replace('export function','function',1)
 svg=(HERE.parent.parent/'apps/web/public/brand/hidi-logo-price-tag.svg').read_text().strip()
 for path in (base/'apps/web/.next').rglob('*.js'):
  text=path.read_text(encoding='utf-8')
  if 'function fitPriceTagDocument(doc)' not in text:continue
  assert 'postal-address' not in text, 'Already updated'
  new,count=re.subn(r'<header class="brand"><img src="\$\{[^}]+\}" alt="HIDI"></header>',lambda _: '<header class="brand">'+svg+'</header>',text);assert count==1
  # The address immediately follows the marketed-by row.
  marker=new.index('<b>Marketed by:</b>');address=re.search(r'<div>\$\{([$\w]+)\}</div>',new[marker:]);assert address
  start=marker+address.start();end=marker+address.end()
  new=new[:start]+address[0].replace('<div>','<div class="postal-address">')+new[end:]
  new=new.replace('</style></head><body>',css+'</style></head><body>')
  start=new.index('function fitPriceTagDocument(doc)');brace=new.index('{',start);depth=1;end=brace+1
  while depth:
   if new[end]=='{':depth+=1
   elif new[end]=='}':depth-=1
   end+=1
  new=new[:start]+fit.strip()+new[end:]
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
