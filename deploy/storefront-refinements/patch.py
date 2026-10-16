"""Surgical changes to retained production runtime; fail closed on unexpected inputs."""
import hashlib, importlib.util, pathlib, re
ROOT=pathlib.Path(__file__).resolve().parent
LINK_PATTERN=r'<link rel="stylesheet" data-hidi-storefront-refinements href="/storefront-refinements-[0-9a-f]{16}\.css">'

def patch_retained_offer_shipping(source):
    old='const shipping=subtotal<149900?9900:0,total=gross-discount+shipping;'
    new='const shipping=0,total=gross-discount+shipping;'
    assert source.count(old)==1,'Unexpected retained offer shipping calculation'
    updated=source.replace(old,new,1)
    assert updated.replace(new,old,1)==source
    return updated

def compatibility(source):
    spec=importlib.util.spec_from_file_location('retained_checkout_compat',ROOT.parent/'checkout-theme/runtime-compat.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.patch_checkout_runtime(source)

def assets():
    css=(ROOT/'subscription.css').read_bytes()
    name='storefront-refinements-'+hashlib.sha256(css).hexdigest()[:16]+'.css'
    link='<link rel="stylesheet" data-hidi-storefront-refinements href="/'+name+'">'
    return name,css,link

def patch_runtime(source):
    _,_,link=assets()
    original='function injectStorefrontLayerFix(html) {\n'
    assert source.count(original)==1
    addition='  if (!html.includes("data-hidi-storefront-refinements")) html = html.replace(/<\\/head>/i, '+repr(link)+" + '</head>');\n"
    compatible=compatibility(source)
    if addition in compatible:
        assert compatible.count(link)==1 and compatible.count('data-hidi-storefront-refinements')==2,'Duplicate runtime stylesheet injection'
        return compatible
    previous=list(re.finditer(LINK_PATTERN,compatible))
    if previous:
        assert len(previous)==1 and compatible.count('data-hidi-storefront-refinements')==2,'Unexpected runtime stylesheet injection'
        match=previous[0]
        return compatible[:match.start()]+link+compatible[match.end():]
    assert 'data-hidi-storefront-refinements' not in compatible
    result=compatible.replace(original,original+addition,1)
    assert result.replace(original+addition,original,1)==compatible
    return result

def patch_index(source):
    _,_,link=assets()
    assert len(re.findall('</head>',source,re.I))==1
    previous=list(re.finditer(LINK_PATTERN,source))
    assert len(previous)<=1 and source.count('data-hidi-storefront-refinements')==len(previous),'Unexpected homepage stylesheet injection'
    configs=list(re.finditer(r'src="\./config\.js(?:\?v=refinements-[0-9a-f]{12})?"',source))
    assert len(configs)==1,'Unexpected homepage config script'
    original=configs[0].group()
    version=hashlib.sha256(link.encode()).hexdigest()[:12]
    replacement='src="./config.js?v=refinements-'+version+'"'
    result=source.replace(original,replacement,1)
    if previous:
        oldlink=previous[0].group();result=result.replace(oldlink,link,1)
    else:
        result=re.sub('</head>',link+'\n</head>',result,count=1,flags=re.I)
    return result

def patch_config(source):
    old='Complimentary shipping on ₹1,499 and above'
    if source.count('Shipping is ₹0.00 on every order')==1 and old not in source:return source
    assert source.count(old)==1,'Unexpected announcement configuration; refusing changes'
    updated=source.replace(old,'Shipping is ₹0.00 on every order',1)
    assert updated.replace('Shipping is ₹0.00 on every order',old,1)==source
    return updated
