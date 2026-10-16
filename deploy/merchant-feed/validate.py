"""Independent XML, landing-page and original-image validation. GET requests only."""
import concurrent.futures,io,json,sys,urllib.request,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from html.parser import HTMLParser

folder=Path(sys.argv[1]);root=ET.fromstring((folder/'google-products.xml').read_bytes());ns={'g':'http://base.google.com/ns/1.0'}
items=root.findall('./channel/item');assert items
def value(item,key):return item.findtext('g:'+key,namespaces=ns)
ids=[value(i,'id') for i in items];assert len(ids)==len(set(ids))
for i in items:
    for key in ['id','item_group_id','title','description','link','image_link','availability','price','condition','brand','size','color','gender','age_group']:
        assert value(i,key),key
    assert len(value(i,'id'))<=50 and len(value(i,'title'))<=150 and len(value(i,'description'))<=5000
    assert value(i,'price').endswith(' INR') and value(i,'availability')=='in_stock'
    assert '?variant='+value(i,'id') in value(i,'link')
    assert value(i,'link').startswith('https://hidiindia.com/products/')
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HIDI-Merchant-Feed-Validation/1.0'}),timeout=45) as r:
        assert r.status==200
        if '/api/' not in url:assert 'noindex' not in r.headers.get('X-Robots-Tag','').lower()
        return r.read(),r.headers
class Document(HTMLParser):
    def __init__(self,body):
        super().__init__();self.canonicals=[];self.schemas=[];self.mode=False;self.parts=[];self.feed(body.decode())
    def handle_starttag(self,t,a):
        a=dict(a)
        if t=='link' and a.get('rel')=='canonical':self.canonicals.append(a.get('href'))
        if t=='script' and a.get('type')=='application/ld+json':self.mode=True;self.parts=[]
    def handle_data(self,s):
        if self.mode:self.parts.append(s)
    def handle_endtag(self,t):
        if self.mode and t=='script':self.schemas.append(json.loads(''.join(self.parts)));self.mode=False
groups={}
for i in items:groups.setdefault(value(i,'canonical_link'),[]).append(i)
def page(pair):
    url,offers=pair;body,_=get(url);d=Document(body);assert d.canonicals and all(c==url for c in d.canonicals)
    def walk(node):
        if isinstance(node,dict):
            yield node
            for v in node.values():yield from walk(v)
        elif isinstance(node,list):
            for v in node:yield from walk(v)
    graph=list(walk(d.schemas));published=[n for n in graph if n.get('@type')=='Offer']
    # Feed identities use public variant IDs; match schema by the public SKU via detail data.
    detail=json.loads(get(url.replace('/products/','/api/store/products/'))[0]);variants={v['id']:v for v in detail['variants']}
    for i in offers:
        v=variants[value(i,'id')];assert v['available']>0
        expected=(value(i,'price').split()[0]);assert expected==f"{v['pricePaise']/100:.2f}"
        assert any(o.get('sku')==v['sku'] and f"{float(o['price']):.2f}"==expected for o in published),'Offer markup mismatch '+url
    return {'url':url,'offers':len(offers),'passed':True}
def image(url):
    body,headers=get(url);assert headers.get('Content-Type','').startswith('image/');assert len(body)<=16*1024*1024
    with Image.open(io.BytesIO(body)) as im:
        w,h=im.size;assert w>=250 and h>=250,(url,w,h);im.verify()
    return {'url':url,'width':w,'height':h,'passed':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    pages=list(pool.map(page,groups.items()));images=list(pool.map(image,sorted({value(i,'image_link') for i in items})))
report={'passed':True,'offers':len(items),'products':len(groups),'landingPages':pages,'originalImages':images,'readOnly':True}
(folder/'catalogue-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':True,'products':len(groups),'offers':len(items),'originalImages':len(images)}))
