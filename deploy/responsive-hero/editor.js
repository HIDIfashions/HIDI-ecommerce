function heroDeviceItem() {
  return isHero() ? draftFor().items.find(item=>item.id===selected?.id && item.type==='image') : null;
}
function renderHeroDeviceImages() {
  const item=heroDeviceItem();$('heroDeviceImages').hidden=!item;
  if(!item)return;
  $('heroDesktopName').textContent=item.originalName || 'Desktop image';
  $('heroMobileName').textContent=item.mobileOriginalName || 'Uses the desktop image';
  $('heroReplaceMobile').textContent=item.mobileAssetId ? 'Replace mobile image' : 'Upload mobile image';
  $('heroRemoveMobile').hidden=!item.mobileAssetId;
  for(const id of ['heroReplaceDesktop','heroReplaceMobile','heroDesktopFile','heroMobileFile','heroRemoveMobile'])$(id).disabled=busy;
}
async function uploadHeroDeviceImage(device,file) {
  const item=heroDeviceItem();if(!item)throw new Error('Select an image in the banner list first.');
  if(!imageAccept.split(',').includes(file.type))throw new Error('Choose a JPEG, PNG, WebP or AVIF image.');
  const preparedImage=await optimise(file);
  const asset=demoMode ? {id:'demo-device-'+Date.now(),type:'image',url:URL.createObjectURL(preparedImage),originalName:preparedImage.name} : await uploadFile(preparedImage);
  if(asset.type!=='image')throw new Error('Choose an image for this banner.');
  heroLibrary=[asset,...heroLibrary];
  if(device==='mobile')Object.assign(item,{mobileAssetId:asset.id,mobileUrl:asset.url,mobileOriginalName:asset.originalName});
  else Object.assign(item,{...asset,assetId:asset.id});
  selected=item;setFields(item);dirty();renderSequence();renderLibrary();renderPreview();
  say((device==='mobile'?'Mobile':'Desktop')+' image saved to this banner draft. Publish banner when ready.');
}
for(const [device,button,input] of [['desktop','heroReplaceDesktop','heroDesktopFile'],['mobile','heroReplaceMobile','heroMobileFile']]) {
  $(button).onclick=()=>$(input).click();
  $(input).onchange=async()=>{const file=$(input).files[0];if(!file)return;await operation(()=>uploadHeroDeviceImage(device,file));$(input).value='';};
}
$('heroRemoveMobile').onclick=()=>{
  if(busy)return;const item=heroDeviceItem();if(!item)return;
  item.mobileAssetId=null;delete item.mobileUrl;delete item.mobileOriginalName;
  selected=item;dirty();renderPreview();say('Mobile will use the desktop image after you publish this draft.');
};
