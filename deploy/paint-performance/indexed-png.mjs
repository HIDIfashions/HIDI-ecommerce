import {deflateSync} from 'node:zlib';
const crc=bytes=>{let value=-1;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^-1)>>>0;};
const chunk=(type,bytes)=>{const name=Buffer.from(type),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);name.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,bytes])),bytes.length+8);return out;};
// A palette stores every original RGBA value, including RGB beneath zero alpha.
// Assets with more than 256 distinct colours keep their existing representation.
export function indexedPng(data,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length!==width*height*4)throw Error('Invalid RGBA image');
 const counts=new Map();for(let i=0;i<data.length;i+=4){const key=data.readUInt32BE(i);counts.set(key,(counts.get(key)||0)+1);if(counts.size>256)return null;}let best;
 for(const order of ['input','frequency','rgba']){
  const colours=[...counts.keys()];if(order==='frequency')colours.sort((a,b)=>counts.get(b)-counts.get(a));if(order==='rgba')colours.sort((a,b)=>a-b);
  const map=new Map(colours.map((v,i)=>[v,i])),indices=Buffer.alloc(width*height),palette=Buffer.alloc(colours.length*3),alpha=Buffer.alloc(colours.length),header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=3;
  colours.forEach((key,i)=>{palette[i*3]=key>>>24;palette[i*3+1]=(key>>>16)&255;palette[i*3+2]=(key>>>8)&255;alpha[i]=key&255;});for(let i=0;i<indices.length;i++)indices[i]=map.get(data.readUInt32BE(i*4));
  for(const filter of [0,1,2]){const rows=Buffer.alloc((width+1)*height);for(let y=0;y<height;y++){rows[y*(width+1)]=filter;for(let x=0;x<width;x++){const at=y*width+x,pred=filter===1?(x?indices[at-1]:0):filter===2?(y?indices[at-width]:0):0;rows[y*(width+1)+1+x]=(indices[at]-pred)&255;}}
   const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('PLTE',palette),chunk('tRNS',alpha),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);if(!best||bytes.length<best.length)best=bytes;
  }
 }
 return best;
}
