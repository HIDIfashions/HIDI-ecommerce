import { stripDetailLines } from './product-detail-fields.mjs';
// Restricted catalogue formatting: raw HTML and links are always escaped.
export function escapeCopy(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function inline(value) {
  return escapeCopy(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}
export function renderProductCopy(value) {
  const lines=String(value ?? '').replace(/\r\n?/g,'\n').split('\n');
  let html='', paragraph=[], list=null;
  const flush=()=>{if(paragraph.length){html+='<p>'+paragraph.map(inline).join('<br>')+'</p>';paragraph=[];}};
  const close=()=>{if(list){html+='</'+list+'>';list=null;}};
  for(const line of lines){
    if(!line.trim()){flush();close();continue;}
    const heading=line.match(/^#{1,3}\s+(.+)$/), bullet=line.match(/^\s*(?:[-+] |\d+\. )(.+)$/);
    if(heading){flush();close();html+='<h3>'+inline(heading[1])+'</h3>';}
    else if(bullet){flush();const kind=/^\s*\d/.test(line)?'ol':'ul';if(list!==kind){close();html+='<'+kind+'>';list=kind;}html+='<li>'+inline(bullet[1])+'</li>';}
    else {close();paragraph.push(line);}
  }
  flush();close();return html;
}
export function narrativeCopy(value) {
  return stripDetailLines(value);
}
