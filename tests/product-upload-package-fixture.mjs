import {deflateRawSync} from 'node:zlib';
export function zipPackage(entries,{compressed=true}={}){
  const local=[],central=[];let offset=0;
  for(const [name,value] of entries){const data=Buffer.from(value),payload=compressed?deflateRawSync(data):data,filename=Buffer.from(name),header=Buffer.alloc(30),directory=Buffer.alloc(46);let crc=0xffffffff;for(const byte of data){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}crc=(crc^0xffffffff)>>>0;
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(compressed?8:0,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(payload.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
    directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(compressed?8:0,10);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(payload.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
    local.push(header,filename,payload);central.push(directory,filename);offset+=header.length+filename.length+payload.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
