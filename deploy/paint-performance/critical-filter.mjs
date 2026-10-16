export function selectInitialCss(postcss,css,ranges){
 const ast=postcss.parse(css);ast.walkComments(c=>c.remove());
 ast.walkRules(rule=>{
  let parent=rule.parent;while(parent&&parent.type!=='root'){
   if(/keyframes$/i.test(parent.name||'')||parent.name==='media'&&/height|orientation|prefers|pointer|hover/.test(parent.params||''))return;
   parent=parent.parent;
  }
  if(/:hover|:focus|:active|:disabled|\[aria-/.test(rule.selector))return;
  const start=rule.source.start.offset,end=rule.source.end.offset;
  if(!ranges.some(([a,b])=>start>=a&&end<=b))rule.remove();
 });
 ast.walkAtRules(rule=>{if(rule.name==='charset'||rule.nodes&&!rule.nodes.length)rule.remove();});
 return ast.toString();
}
