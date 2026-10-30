import {DRESSES,DEFAULT_ORDER,validOrder} from './model.mjs';
const host=document.querySelector('#portraitOrder');
if(host){
  const $=id=>document.getElementById('portraitOrder'+id),endpoint='/api/hidi/landing-media-portrait-order';
  let saved=[],draft=[],etag=null,loaded=false,busy=false,active=false;
  const changed=()=>draft.join()!==saved.join();
  const message=(text,error=false)=>{$('Status').textContent=text;$('Status').dataset.error=String(error);};
  const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
  function render(focusId,direction){
    $('List').replaceChildren();$('Preview').replaceChildren();
    draft.forEach((id,index)=>{
      const dress=DRESSES.find(d=>d.id===id),row=node('li');row.dataset.dress=id;
      const img=node('img');img.src=dress.url;img.alt=dress.name;
      const copy=node('div');copy.className='dress-copy';copy.append(node('strong',dress.name),node('span',dress.title),node('span',dress.caption));
      const controls=node('div');controls.className='dress-controls';
      for(const [label,delta] of [['Move up',-1],['Move down',1]]){
        const btn=node('button',label);btn.type='button';btn.dataset.direction=String(delta);btn.setAttribute('aria-label',label+': '+dress.name);
        btn.disabled=busy||!active||index+delta<0||index+delta>=draft.length;
        btn.onclick=()=>{[draft[index],draft[index+delta]]=[draft[index+delta],draft[index]];render(id,delta);message(dress.name+' moved to position '+(index+delta+1)+'. Unsaved changes — click Save order.');};controls.append(btn);
      }
      row.append(node('span',String(index+1)),img,copy,controls);$('List').append(row);
      const figure=node('figure'),photo=img.cloneNode();photo.alt='';figure.append(photo,node('figcaption',(index+1)+'. '+dress.title));$('Preview').append(figure);
    });
    $('Save').disabled=!loaded||!active||busy||!changed();$('Reload').disabled=busy;$('Default').disabled=!loaded||!active||busy||draft.join()===DEFAULT_ORDER.join();
    if(focusId){const row=$('List').querySelector('[data-dress="'+focusId+'"]');const preferred=row.querySelector('[data-direction="'+direction+'"]');(preferred.disabled?row.querySelector('button:not(:disabled)'):preferred)?.focus();}
  }
  async function load(){
    if(busy)return;if(changed()&&!confirm('Discard your unsaved dress order?'))return;
    busy=true;render();message('Loading saved order…');
    try{const response=await fetch(endpoint,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message||'Unable to load order');if(!validOrder(data.order))throw Error('Invalid saved order');saved=[...data.order];draft=[...saved];etag=data.etag;active=data.builtinActive;loaded=true;message(active?'Saved order loaded. Move a dress to preview a change.':'A custom Ananya photo list is active. These five built-in dresses are not currently displayed.');}
    catch(error){loaded=false;active=false;message(error.message,true);}finally{busy=false;render();}
  }
  $('Reload').onclick=load;
  $('Default').onclick=()=>{draft=[...DEFAULT_ORDER];render();message('Original order selected. Click Save order to publish it.');};
  $('Save').onclick=async()=>{
    if(busy||!loaded||!active||!changed())return;busy=true;render();message('Saving dress order…');
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order:draft,etag})}),data=await response.json();if(!response.ok)throw Error(data.message||'Unable to save order');if(!validOrder(data.order))throw Error('Invalid saved order');saved=[...data.order];draft=[...saved];etag=data.etag;message('Order saved. Refresh the homepage to see the new sequence.');}
    catch(error){message(error.message,true);}finally{busy=false;render();}
  };
  addEventListener('beforeunload',event=>{if(changed()){event.preventDefault();event.returnValue='';}});
  await load();
}
