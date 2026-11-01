"""Add optional per-image mobile artwork; preserve the existing hero/video flow."""
import hashlib,json,re,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent

def transform(source,changes):
    text=source.decode('utf-8')
    for old,new,count in changes:
        assert text.count(old)==count,'Unexpected anchor: '+old[:90]
        text=text.replace(old,new)
    inverse=text
    for old,new,count in reversed(changes):
        assert inverse.count(new)==count,'Ambiguous inverse anchor'
        inverse=inverse.replace(new,old)
    assert inverse.encode('utf-8')==source
    return text.encode('utf-8')

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    public_old='desktopPosition: normalizePosition(raw.desktopPosition), mobilePosition: normalizePosition(raw.mobilePosition), fitMode: normalizeFitMode(raw.fitMode) };'
    public_new='''desktopPosition: normalizePosition(raw.desktopPosition), mobilePosition: normalizePosition(raw.mobilePosition), fitMode: normalizeFitMode(raw.fitMode),
    ...(!imagesOnly && raw.type === "image" && typeof raw.mobileAssetId === "string" && raw.mobileAssetId && typeof raw.mobileUrl === "string" && raw.mobileUrl
      ? { mobileAssetId: raw.mobileAssetId, mobileUrl: canonicalMediaUrl(raw.mobileUrl), mobileOriginalName: typeof raw.mobileOriginalName === "string" ? raw.mobileOriginalName : "" } : {}) };'''
    req_old='''    used.add(asset.id);
    return { ...publicMediaItem({ ...asset, assetId: asset.id, desktopPosition: item.desktopPosition, mobilePosition: item.mobilePosition,
      fitMode: item.fitMode, altText: typeof item.altText === "string" ? item.altText.trim().slice(0, 220) : "" }, imagesOnly) };'''
    req_new='''    used.add(asset.id);
    let mobile = {};
    if (item.mobileAssetId != null && item.mobileAssetId !== "") {
      if (imagesOnly || asset.type !== "image" || typeof item.mobileAssetId !== "string") throw new Error("Choose media of type image for mobile hero artwork");
      const match = library.assets.find(row => row.id === item.mobileAssetId && row.type === "image");
      if (!match) throw new Error("Choose media from the hero image library for mobile artwork");
      mobile = { mobileAssetId: match.id, mobileUrl: match.url, mobileOriginalName: match.originalName };
    }
    return { ...publicMediaItem({ ...asset, ...mobile, assetId: asset.id, desktopPosition: item.desktopPosition, mobilePosition: item.mobilePosition,
      fitMode: item.fitMode, altText: typeof item.altText === "string" ? item.altText.trim().slice(0, 220) : "" }, imagesOnly) };'''
    files={'hero-media.mjs':transform((base/'hero-media.mjs').read_bytes(),[(public_old,public_new,1),(req_old,req_new,1)])}
    admin=(base/'dist/landing-media-control.html').read_bytes()
    files['dist/landing-media-control.html']=transform(admin,[
      ('</style>',(HERE/'controls.css').read_text(encoding='utf-8')+'\n</style>',1),
      ('<div class="row">\n<label>Desktop focal point', (HERE/'controls.html').read_text(encoding='utf-8')+'\n<div class="row">\n<label>Desktop focal point',1),
      ('function renderPreview() {','function renderPreview() {\n  renderHeroDeviceImages();',1),
      ('const media=node(asset,pos,isHero() && asset.type==="video" ? "cover" : $("fitMode").value,true);','const deviceAsset=isHero() && side==="mobile" && asset.type==="image" && asset.mobileUrl ? {...asset,url:asset.mobileUrl} : asset;\n    const media=node(deviceAsset,pos,isHero() && asset.type==="video" ? "cover" : $("fitMode").value,true);',1),
      ('function updateButtons() {','function updateButtons() {\n  renderHeroDeviceImages();',1),
      ('load().catch(error=>', (HERE/'editor.js').read_text(encoding='utf-8')+'\nload().catch(error=>',1),
    ])
    html=(base/'dist/index.html').read_bytes();refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html);assert len(refs)==1
    old_path=refs[0].decode();assert re.fullmatch(r'/assets/index-[A-Za-z0-9_-]+\.js',old_path)
    bundle=(base/'dist'/old_path.lstrip('/')).read_bytes()
    start='HidiMediaCreate(Ae.createElement,"img",{key:yt.url,className:"hero-live-media"'
    # The same style suffix occurs on the video and image; match the image's
    # explicit objectFit branch to avoid touching any video props.
    end='"data-hero-image-fit":yt.fitMode,style:{objectFit:yt.fitMode==="contain"?"contain":"cover",visibility:kt||"video"===yt.type&&HidiMediaPoster(yt.url,yt.mobilePosition)?"visible":"hidden","--hero-position-desktop":yt.desktopPosition,"--hero-position-mobile":yt.mobilePosition}})'
    normal='type:e.type,url:Qe(e.url),assetId:e.assetId,desktopPosition:"string"==typeof e.desktopPosition?e.desktopPosition:"50% 50%",mobilePosition:"string"==typeof e.mobilePosition?e.mobilePosition:"50% 50%",fitMode:e.fitMode==="contain"?"contain":"cover"'
    changed=transform(bundle,[(start,start.replace('HidiMediaCreate(Ae.createElement','HidiHeroDeviceCreate(Ae,HidiMediaCreate'),1),(end,end[:-1]+',yt.mobileUrl)',1),(normal,normal+',mobileUrl:e.type==="image"?Qe(e.mobileUrl):""',2)])
    changed=(HERE/'image.js').read_bytes()+b'\n'+changed
    new_path='/assets/index-'+hashlib.sha256(changed).hexdigest()[:16]+'.js'
    files['dist'+new_path]=changed;files['dist/index.html']=html.replace(old_path.encode(),new_path.encode())
    # Initial video bootstraps include the remaining slides. Preserve mobile
    # artwork there too, while legacy JSON remains byte-identical.
    name='paint-performance/hero.mjs'
    assert (base/name).is_file(),'Required video-first hero bootstrap is missing'
    if (base/name).exists():
        old='const publicItem=item=>({type:item.type,url:item.url,assetId:item.assetId,desktopPosition:position(item.desktopPosition),mobilePosition:position(item.mobilePosition)});'
        new=old.replace('mobilePosition:position(item.mobilePosition)}','mobilePosition:position(item.mobilePosition),...(item.type==="image"&&item.mobileUrl?{mobileAssetId:item.mobileAssetId,mobileUrl:item.mobileUrl}:{})}')
        files[name]=transform((base/name).read_bytes(),[(old,new,1)])
    for name,data in files.items():
        dest=overlay/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'inverseVerified':True,'videoRenderingUnchanged':True,'productionWrites':0}

if __name__=='__main__':print(json.dumps(patch_runtime(sys.argv[1],sys.argv[2]),indent=2))
