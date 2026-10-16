import {execFileSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';
export const fixtureCommands=[
 ['qdisc','add','dev','lo','root','handle','7:','prio','bands','3','priomap',...Array(16).fill('0')],
 ['qdisc','add','dev','lo','parent','7:3','handle','70:','netem','limit','10000','delay','125ms'],
 ...['dport','sport'].map((direction,index)=>['filter','add','dev','lo','parent','7:','protocol','ip','pref',String(10+index),'u32','match','ip','protocol','6','0xff','match','ip',direction,'3190','0xffff','flowid','7:3'])
];
export async function installFixtureDelay(){
 if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true')throw Error('Delayed staging fixture requires its isolated Linux Actions runner');
 const tc=args=>execFileSync('sudo',['tc',...args],{encoding:'utf8'});
 const before=tc(['qdisc','show','dev','lo']);if(!/^qdisc noqueue 0: root\b/m.test(before)||before.trim().split('\n').length!==1)throw Error('Refuse to replace an existing loopback traffic policy');
 const originalMtu=Number((await readFile('/sys/class/net/lo/mtu','utf8')).trim());if(!Number.isInteger(originalMtu)||originalMtu<1500)throw Error('Unexpected loopback MTU');
 let owned=false,mtuChanged=false;
 const close=()=>{try{if(owned){const current=tc(['qdisc','show','dev','lo']);if(!/^qdisc prio 7: root\b/m.test(current))throw Error('Fixture traffic policy changed independently');tc(['qdisc','del','dev','lo','root']);owned=false;}}finally{if(mtuChanged){execFileSync('sudo',['ip','link','set','dev','lo','mtu',String(originalMtu)]);mtuChanged=false;}}};
 try{
  for(const [index,args] of fixtureCommands.entries()){tc(args);if(index===0)owned=true;}
  execFileSync('sudo',['ip','link','set','dev','lo','mtu','1500']);mtuChanged=true;
  await writeFile('evidence/paint-performance/network-fixture.json',JSON.stringify({passed:true,host:'127.0.0.1',port:3190,oneWayDelayMs:125,roundTripDelayMs:250,mtu:1500,originalMtu,otherPortsDelayed:false,scope:'isolated CI runner only',qdisc:tc(['qdisc','show','dev','lo']),filters:tc(['filter','show','dev','lo','parent','7:'])},null,2));
  return close;
 }catch(error){close();throw error;}
}
