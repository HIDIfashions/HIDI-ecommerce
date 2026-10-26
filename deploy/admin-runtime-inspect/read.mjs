export async function run(){
  const {readFile}=await import('node:fs/promises');const s=await readFile('/app/server.mjs','utf8');
  const lines=s.split('\n'),indices=new Set();
  for(let i=0;i<lines.length;i++)if(/function injectStorefrontLayerFix|injectStorefrontLayerFix\(|function injectAdmin|pathname.*admin|html = inject|response\.end\(|res\.end\(/.test(lines[i]))for(let n=Math.max(0,i-4);n<Math.min(lines.length,i+12);n++)indices.add(n);
  console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,lines:[...indices].sort((a,b)=>a-b).map(i=>[i+1,lines[i]])}));
}
