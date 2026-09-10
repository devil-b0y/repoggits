import { deflateRawSync, crc32 } from 'node:zlib';
export function zipFixture(name:string,content:Buffer,compressed=false) {
  const crc=crc32(content),filename=Buffer.from(name),body=compressed?deflateRawSync(content):content;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(compressed?8:0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(content.length,22);local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(compressed?8:0,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(content.length,24);central.writeUInt16LE(filename.length,28);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+body.length,16);
  return Buffer.concat([local,filename,body,central,filename,end]);
}
