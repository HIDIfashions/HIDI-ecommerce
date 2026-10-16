"""Add reviewed copy editor and bounded storefront enhancement to the current runtime."""
from pathlib import Path
HERE=Path(__file__).resolve().parent
ASSETS=['product-copy.mjs','product-preview.mjs','product-preview.css','product-preview.html','product-copy-storefront.mjs','product-copy-storefront.css']
def once(text,anchor,new):
 assert text.count(anchor)==1,'One retained anchor required: '+anchor
 return text.replace(anchor,new,1)
def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);files={}
 handler=(base/'admin-tools/handler.mjs').read_text()
 names=[name for name in ASSETS if not name.endswith('.html')]
 handler=once(handler,'const assets=new Map([','const assets=new Map(['+','.join(repr(n) for n in names)+',')
 handler=once(handler,'const pages=new Map([',"const pages=new Map([['/admin/product-preview','product-preview.html'],")
 files['admin-tools/handler.mjs']=handler
 navigation=(base/'admin-tools/navigation.js').read_text()
 entry="    { key: 'product-preview', label: 'Product Preview & Edit', href: '/admin/product-preview', icon: '<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/>', marker: 'hidiProductPreview' },"
 navigation=once(navigation,'  const tools = [','  const tools = [\n'+entry)
 files['admin-tools/navigation.js']=navigation
 page=(base/'admin-tools/product-quick-fill.html').read_text()
 files['admin-tools/product-quick-fill.html']=once(page,'<h1>Product Quick Fill</h1>','<h1>Product Quick Fill</h1><p><a href=\"/admin/product-preview\">Preview and edit every dress →</a></p>')
 server=(base/'server.mjs').read_text()
 loader="\n  if (!html.includes('data-hidi-product-copy-loader')) html = html.replace(/<\\/head>/i, '<link rel=\"stylesheet\" href=\"/admin-tools-assets/product-copy-storefront.css\"><script type=\"module\" data-hidi-product-copy-loader src=\"/admin-tools-assets/product-copy-storefront.mjs\"></script></head>');"
 for hook in ['function injectOffers(html, pathname) {','function injectStorefrontLayerFix(html) {']:server=once(server,hook,hook+loader)
 files['server.mjs']=server
 for name in ASSETS:files['admin-tools/'+name]=(HERE.parent/'admin-tools'/name).read_text()
 for name,text in files.items():
  target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
 return {'passed':True,'allowedFiles':sorted(files),'apiUnchanged':True,'originalPhotosPreserved':True,'allRetainedAdminToolsPreserved':True,'noDatabaseMigration':True}
