function HidiRetainedSource(value){try{const url=new URL(value,location.href);return url.pathname+url.search;}catch{return '';}}
function HidiCanRetainNativeHero(){
 const navigation=performance.getEntriesByType?.('navigation')?.[0];
 return location.pathname==='/'&&!matchMedia('(max-width: 700px)').matches&&typeof document.body.moveBefore==='function'&&document.visibilityState!=='hidden'&&!(window.scrollY||0)&&!location.hash&&navigation?.type!=='back_forward';
}
function HidiCaptureNativeHero(){
 if(!HidiCanRetainNativeHero()||typeof xf().flushSync!=='function')return null;
 const selected=HidiHeroInitialSelection(),first=selected?.items?.[0],video=document.querySelector('#root video[data-hidi-first-hero]'),section=video?.closest('section.hero');
 if(!video||!section||first?.type!=='video'||!video.poster)return null;
 const rect=section.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;
 // Keep the already-painted geometry while the following synchronous commit adopts the video.
 Object.assign(section.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0'});
 document.body.moveBefore(section,null);
 return {video,section,source:HidiRetainedSource(first.url)};
}
const HidiNativeHeroCache=HidiCaptureNativeHero();
function HidiFinishNativeParking(){if(HidiNativeHeroCache?.section){HidiNativeHeroCache.section.remove();HidiNativeHeroCache.section=null;}if(HidiNativeHeroCache)HidiNativeHeroCache.video=null;}
function HidiUpdateRetainedVideo(video,previous,next){
 const changed=key=>!previous||!Object.is(previous[key],next[key]);
 const text=(key,attribute=key)=>{if(!changed(key))return;const value=next[key];if(value==null){if(video.getAttribute(attribute)!==null)video.removeAttribute(attribute);}else if(video.getAttribute(attribute)!==String(value))video.setAttribute(attribute,String(value));};
 text('className','class');
 const before=previous?.style||{},after=next.style||{};
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!Object.is(before[key],after[key])){
  const value=after[key];
  if(key.startsWith('--')){if(value==null)video.style.removeProperty(key);else if(video.style.getPropertyValue(key)!==String(value))video.style.setProperty(key,String(value));}
  else if(video.style[key]!==String(value??''))video.style[key]=value??'';
 }
 if(changed('muted')){if(video.defaultMuted!==Boolean(next.muted))video.defaultMuted=Boolean(next.muted);if(video.muted!==Boolean(next.muted))video.muted=Boolean(next.muted);}
 for(const [key,property]of [['autoPlay','autoplay'],['loop','loop'],['playsInline','playsInline']])if(changed(key)&&video[property]!==Boolean(next[key]))video[property]=Boolean(next[key]);
 text('preload');text('poster');text('src');
 return {...next,style:{...after}};
}
const HidiRetainedHeroVideo=HidiHeroReact.forwardRef(function HidiRetainedHeroVideo(props,forwardedRef){
 const {hidiSourceKey,...attributes}=props;
 const [video]=HidiHeroReact.useState(()=>{
  const cache=HidiNativeHeroCache;
  if(!cache?.video||cache.source!==HidiRetainedSource(hidiSourceKey))return null;
  return cache.video;
 });
 const holder=HidiHeroReact.useRef(null),callbacks=HidiHeroReact.useRef(attributes),previous=HidiHeroReact.useRef(null);
 HidiHeroReact.useLayoutEffect(()=>{
  if(!video)return;
  const events={ended:'onEnded',loadeddata:'onLoadedData',canplay:'onCanPlay',error:'onError'},forward=event=>callbacks.current[events[event.type]]?.(event);
  for(const name of Object.keys(events))video.addEventListener(name,forward);
  holder.current.moveBefore(video,null);
  video.removeAttribute('data-hidi-first-hero');
  HidiFinishNativeParking();
  return ()=>{
   for(const name of Object.keys(events))video.removeEventListener(name,forward);
   previous.current=null;try{video.pause();video.removeAttribute('src');video.load();}catch{}
  };
 },[video]);
 HidiHeroReact.useLayoutEffect(()=>{
  if(!video)return;
  if(typeof forwardedRef==='function')forwardedRef(video);else if(forwardedRef)forwardedRef.current=video;
  return ()=>{if(typeof forwardedRef==='function')forwardedRef(null);else if(forwardedRef)forwardedRef.current=null;};
 },[video,forwardedRef]);
 HidiHeroReact.useLayoutEffect(()=>{if(video){callbacks.current=attributes;previous.current=HidiUpdateRetainedVideo(video,previous.current,attributes);}},[video,attributes]);
 return video?HidiHeroReact.createElement('span',{ref:holder,'data-hidi-retained-video':true,style:{display:'contents'}}):HidiHeroReact.createElement('video',{...attributes,ref:forwardedRef});
});
