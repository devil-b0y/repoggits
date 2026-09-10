import { test, expect } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';
import sharp from 'sharp';
import { validateZip, validateImage, safeFilename } from '../lib/file-validation';

// Minimal ZIP fixture builder: never extracts or executes fixture contents.
export function zipFixture(name:string,content:Buffer,compressed=false) {
  let crc=0xffffffff;
  for(const byte of content){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
  crc=(crc^0xffffffff)>>>0;
  const filename=Buffer.from(name),body=compressed?deflateRawSync(content):content;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(compressed?8:0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(content.length,22);local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(compressed?8:0,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(content.length,24);central.writeUInt16LE(filename.length,28);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+body.length,16);
  return Buffer.concat([local,filename,body,central,filename,end]);
}
test('archive validation accepts source and rejects disguised executable content',async()=>{
  await expect(validateZip(zipFixture('src/main.ts',Buffer.from('export const message = "hello";')))).resolves.toBeUndefined();
  await expect(validateZip(zipFixture('src/main.txt',Buffer.from('MZ disguised binary')))).rejects.toThrow('Executables');
  await expect(validateZip(zipFixture('tool.exe',Buffer.from('binary')))).rejects.toThrow('Unsupported');
});
test('archive validation rejects traversal, nested archives and decompression bombs',async()=>{
  await expect(validateZip(zipFixture('../escape.txt',Buffer.from('escape')))).rejects.toThrow();
  await expect(validateZip(zipFixture('nested.txt',Buffer.from([0x50,0x4b,0x03,0x04,0,0])))).rejects.toThrow('nested archives');
  await expect(validateZip(zipFixture('huge.txt',Buffer.alloc(2*1024*1024),true))).rejects.toThrow('decompression limit');
});
test('image decoding rejects fake images and re-encodes real images',async()=>{
  await expect(validateImage(Buffer.from('MZ fake PNG image'))).rejects.toThrow('valid PNG');
  const png=await sharp({create:{width:4,height:4,channels:3,background:'#3059b5'}}).png().toBuffer();
  const output=await validateImage(png);expect((await sharp(output).metadata()).format).toBe('webp');
  expect(safeFilename('../../bad\r\nname.png')).toBe('bad__name.png');
});

test('built-in inspection validates source text and embedded images',async()=>{
  await expect(validateZip(zipFixture('main.py',Buffer.from('print("hello")')))).resolves.toBeUndefined();
  await expect(validateZip(zipFixture('fake.ts',Buffer.from([0xff,0xfe,0x81])))).rejects.toThrow('UTF-8');
  await expect(validateZip(zipFixture('fake.txt',Buffer.from('hidden\u0000binary')))).rejects.toThrow('control bytes');
  await expect(validateZip(zipFixture('fake.png',Buffer.from('not an image')))).rejects.toThrow('valid PNG');
  const png=await sharp({create:{width:4,height:4,channels:3,background:'#3059b5'}}).png().toBuffer();
  await expect(validateZip(zipFixture('assets/cover.png',png))).resolves.toBeUndefined();
  const corrupt=zipFixture('main.ts',Buffer.from('hello'));corrupt[30+Buffer.byteLength('main.ts')]=0x78;
  await expect(validateZip(corrupt)).rejects.toThrow('checksum');
});
