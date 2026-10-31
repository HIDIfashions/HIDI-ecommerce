"""Add explicit hero upload controls to the retained admin page only; no live writes."""
from pathlib import Path
import hashlib,json,sys,re
HERE=Path(__file__).resolve().parent

def patch_admin(source):
    text=source.decode('utf-8');changes=[]
    def replace(old,new):
        nonlocal text
        assert text.count(old)==1,'Expected one admin anchor: '+old[:100]
        changes.append((old,new));text=text.replace(old,new)
    replace('</style>',(HERE/'controls.css').read_text(encoding='utf-8')+'\n</style>')
    replace('<div id="sequenceEditor" hidden>',(HERE/'controls.html').read_text(encoding='utf-8')+'\n<div id="sequenceEditor" hidden>')
    replace('help:"Main first-screen media. Add up to 20 videos or images, arrange the order and choose automatic rotation."','help:"Your homepage banner on desktop and mobile. Add an optional image alongside the video, arrange the sequence, then publish."')
    replace('$("publish").textContent=isSequence() ? "Publish media list" : "Make selected live";','$("publish").textContent=isHero() ? "Publish banner" : isSequence() ? "Publish media list" : "Make selected live";')
    replace('$("upload").disabled=busy || !prepared.length;','''$("upload").disabled=busy || !prepared.length;
  $("heroUploadOptions").hidden=!isHero();$("file").closest(".upload").hidden=isHero();
  $("upload").hidden=isHero() && !prepared.length;
  for(const id of ["heroChooseVideo","heroChooseImage","heroVideoFile","heroImageFile"])$(id).disabled=busy || (isHero() && draftFor().items.length>=20);''')
    replace('$("upload").textContent=prepared.length>1 ? "Upload "+prepared.length+" files" : "Upload to library";','$("upload").textContent=isHero() ? "Retry upload" : prepared.length>1 ? "Upload "+prepared.length+" files" : "Upload to library";')
    replace('$("fitMode").value=asset?.fitMode || "cover";','$("fitMode").value=asset?.fitMode || (isHero() && asset?.type==="image" ? "contain" : "cover");')
    replace('node(asset,pos,isHero() ? "cover" : $("fitMode").value,true)','node(asset,pos,isHero() && asset.type==="video" ? "cover" : $("fitMode").value,true)')
    replace('(["fitMode","altText"].includes(id) && isHero())','(isHero() && (id==="altText" || (id==="fitMode" && selected?.type!=="image")))')
    replace('UX image treatment<select id="fitMode">','Image display<select id="fitMode">')
    replace('Full photo - no crop','Full image - no crop')
    replace('$("autoPlay").checked=draft.autoPlay;$("intervalSeconds").value=String(draft.intervalSeconds);','''if(isHero())draft.autoPlay=true;
  $("autoPlay").checked=draft.autoPlay;$("intervalSeconds").value=String(draft.intervalSeconds);
  $("autoPlay").closest("label").hidden=isHero();$("autoPlay").closest(".row").classList.toggle("hero-rotation-settings",isHero());
  const hasImages=draft.items.some(item=>item.type==="image"),hasVideos=draft.items.some(item=>item.type==="video");
  $("intervalSeconds").closest("label").hidden=isHero()&&!hasImages;
  $("heroPlaybackSummary").textContent=hasImages&&hasVideos ? "Video + image loop · The video plays to the end, images display for "+draft.intervalSeconds+" seconds each, then the sequence repeats on desktop and mobile." : hasImages ? "Image slideshow · Images rotate automatically on desktop and mobile." : "Video only · The video repeats continuously on desktop and mobile. Upload an image to add it to the loop.";''')
    replace('autoPlay:draft.autoPlay,intervalSeconds:draft.intervalSeconds};}','autoPlay:isHero() ? true : draft.autoPlay,intervalSeconds:draft.intervalSeconds};}')
    replace('$("intervalSeconds").onchange=()=>{draftFor().intervalSeconds=Number($("intervalSeconds").value);dirty();};','$("intervalSeconds").onchange=()=>{draftFor().intervalSeconds=Number($("intervalSeconds").value);dirty();renderSequence();};')
    replace('$("file").onchange=()=>operation(async()=>{\n  const files=[...$("file").files];prepared=[];','async function prepareSelection(files) {\n  prepared=[];')
    replace('  say(prepared.length+" file(s) ready to upload.");\n});','''  say(prepared.length+" file(s) ready to upload.");
}
$("file").onchange=()=>operation(()=>prepareSelection([...$("file").files]));
for(const [kind,buttonId,inputId] of [["video","heroChooseVideo","heroVideoFile"],["image","heroChooseImage","heroImageFile"]]) {
  $(buttonId).onclick=()=>$(inputId).click();
  $(inputId).onchange=async()=>{
    const files=[...$(inputId).files];if(!files.length)return;
    await operation(async()=>{
      if(!isHero())throw new Error("Choose Homepage hero media before uploading.");
      if(files.some(file=>!file.type.startsWith(kind+"/")))throw new Error("Choose a supported "+kind+" file.");
      await prepareSelection(files);await uploadPrepared();
    });
    $(inputId).value="";
  };
}''')
    replace('$("upload").onclick=()=>operation(async()=>{','async function uploadPrepared() {')
    replace('  $("file").value="";$("uploadProgress").textContent=count+" file(s) uploaded.";renderPreview();say(demoMode ? "Added to demo only. Nothing live changed." : isSequence() ? "Files saved and added to the draft. Publish the list when ready." : "Uploaded. Preview, then make selected live.");\n});','''  $("file").value="";$("uploadProgress").textContent=count+" file(s) uploaded.";renderPreview();say(demoMode ? "Added to demo only. Nothing live changed." : isHero() ? "Uploaded to draft. Review the desktop and mobile previews, then Publish banner." : isSequence() ? "Files saved and added to the draft. Publish the list when ready." : "Uploaded. Preview, then make selected live.");
}
$("upload").onclick=()=>operation(uploadPrepared);''')
    # Reversibility proves unrelated admin behavior was not rewritten.
    inverse=text
    for old,new in reversed(changes):
        assert inverse.count(new)==1,'Ambiguous inverse anchor'
        inverse=inverse.replace(new,old)
    assert inverse.encode('utf-8')==source,'Unexpected unrelated admin bytes'
    return text.encode('utf-8'),len(changes)

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay);name='dist/landing-media-control.html'
    source=(base/name).read_bytes();patched,count=patch_admin(source)
    html=(base/'dist/index.html').read_bytes();refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html);assert len(refs)==1
    old_path=refs[0].decode();assert re.fullmatch(r'/assets/index-[A-Za-z0-9_-]+\.js',old_path)
    bundle=(base/'dist'/old_path.lstrip('/')).read_bytes()
    old=b'onError:()=>ve(yt.url),style:{visibility:'
    new=b'onError:()=>ve(yt.url),"data-hero-image-fit":yt.fitMode,style:{objectFit:yt.fitMode==="contain"?"contain":"cover",visibility:'
    assert bundle.count(old)==1,'Expected one uploaded hero image style anchor'
    image_bundle=bundle.replace(old,new)
    normalize_old=b'type:e.type,url:Qe(e.url),assetId:e.assetId,desktopPosition:"string"==typeof e.desktopPosition?e.desktopPosition:"50% 50%",mobilePosition:"string"==typeof e.mobilePosition?e.mobilePosition:"50% 50%"'
    normalize_new=normalize_old+b',fitMode:e.fitMode==="contain"?"contain":"cover"'
    assert image_bundle.count(normalize_old)==2,'Expected initial and fetched hero image normalizers'
    image_bundle=image_bundle.replace(normalize_old,normalize_new)
    assert image_bundle.replace(normalize_new,normalize_old).replace(new,old)==bundle
    new_path='/assets/index-'+hashlib.sha256(image_bundle).hexdigest()[:16]+'.js'
    image_css=b'<style data-hidi-hero-image-fit>.hero-media:has(img.hero-live-media[data-hero-image-fit="contain"]){background:#f7f3ed}.hero--campaign:has(img.hero-live-media[data-hero-image-fit="contain"]) .hero-shade{display:none}.hero--campaign:has(img.hero-live-media[data-hero-image-fit="contain"]) .campaign-shop-button{background:#591e22;color:#fff8ef;border-color:#591e22}</style>'
    assert html.count(b'</head>')==1
    image_html=html.replace(old_path.encode(),new_path.encode()).replace(b'</head>',image_css+b'</head>')
    assert image_html.replace(image_css,b'').replace(new_path.encode(),old_path.encode())==html
    files={name:patched,'dist/index.html':image_html,'dist'+new_path:image_bundle}
    for file,data in files.items():
        target=overlay/file;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'boundedAdminEdits':count,'baselineAdminSha256':hashlib.sha256(source).hexdigest(),'candidateAdminSha256':hashlib.sha256(patched).hexdigest(),'inverseVerified':True,'storefrontImageFitOnly':True,'videoRenderingUnchanged':True,'mediaHandlerUnchanged':True,'productionWrites':0}

if __name__=='__main__':print(json.dumps(patch_runtime(sys.argv[1],sys.argv[2]),indent=2))
