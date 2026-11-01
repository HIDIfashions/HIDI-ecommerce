// Use a browser-selected picture source so rotation and image readiness remain
// controlled by the existing hero. Videos never enter this component.
function HidiHeroDeviceImage({React,MediaCreate,original,mobileUrl}) {
  const [failed,setFailed]=React.useState(false);
  React.useEffect(()=>setFailed(false),[mobileUrl,original.src]);
  const image={...original,onError:event=>{
    if(!failed&&matchMedia('(max-width: 700px)').matches){setFailed(true);return;}
    original.onError?.(event);
  }};
  return React.createElement('picture',{'data-hidi-device-image':'true',style:{display:'contents'}},
    !failed&&React.createElement('source',{media:'(max-width: 700px)',srcSet:mobileUrl}),
    MediaCreate(React.createElement,'img',image));
}
function HidiHeroDeviceCreate(React,MediaCreate,tag,props,mobileUrl) {
  return mobileUrl ? React.createElement(HidiHeroDeviceImage,{key:props.key,React,MediaCreate,original:props,mobileUrl}) : MediaCreate(React.createElement,tag,props);
}
