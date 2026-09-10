import yauzl from 'yauzl';
import sharp from 'sharp';
import { crc32 } from 'node:zlib';
import { HttpError } from './errors';

export const MAX_UPLOAD = 20 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const rasterExtensions = new Set(['png','jpg','jpeg','webp']);

// Source policy, not an antivirus verdict. Never evaluate uploaded code.
async function inspectSource(bytes:Buffer,extension:string) {
  if(rasterExtensions.has(extension)){await validateImage(bytes);return;}
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw new Error('Source files must contain UTF-8 text, not binary data.');}
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new Error('Binary control bytes are not allowed in source files.');
}
const allowedSource = new Set('txt md markdown json js jsx ts tsx mjs cjs html css scss less py ipynb c cpp cc h hpp java kt kts rs go rb php sql yaml yml toml xml csv ino pde sh bat ps1 gitignore gitattributes editorconfig env example lock mod sum vue svelte dart swift r jl make cmake dockerfile png jpg jpeg webp svg'.split(' '));

export function safeFilename(name:string) {
  const last = name.replace(/\\/g, '/').split('/').pop() || 'file';
  return last.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 100) || 'file';
}

export async function validateZip(buffer:Buffer):Promise<void> {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new HttpError(400, 'Upload a valid, nonempty ZIP archive.');
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries:true, validateEntrySizes:true, strictFileNames:true }, (error, zip) => {
      if (error || !zip) return reject(new HttpError(400, 'Invalid ZIP archive.'));
      let total = 0, entries = 0, ended = false;
      const timer = setTimeout(() => fail('Archive inspection timed out.'), 15000);
      const fail = (message:string) => { if(ended)return; ended=true;clearTimeout(timer);zip.close();reject(new HttpError(400,message)); };
      const seen = new Set<string>();
      zip.on('error', () => fail('The ZIP archive is corrupt.'));
      zip.on('end', () => { if(ended)return; ended=true;clearTimeout(timer);resolve(); });
      zip.on('entry', entry => {
        if (++entries > MAX_ENTRIES) return fail('ZIP files may contain at most 2,000 entries.');
        const name: string = entry.fileName;
        if (/\\|:|\x00/.test(name) || name.startsWith('/') || name.split('/').some(part => part === '..') || seen.has(name.toLowerCase())) return fail('Unsafe or duplicate archive path.');
        seen.add(name.toLowerCase());
        if ((entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000) return fail('Symbolic links are not allowed.');
        if (entry.generalPurposeBitFlag & 1) return fail('Encrypted archives cannot be scanned.');
        if (entry.uncompressedSize > MAX_UPLOAD || total + entry.uncompressedSize > MAX_EXPANDED || entry.uncompressedSize > Math.max(1024 * 1024, entry.compressedSize * 100)) return fail('Archive decompression limit exceeded.');
        if (name.endsWith('/')) {zip.readEntry();return;}
        const base = name.split('/').pop()!.toLowerCase();
        const ext = base.includes('.') ? base.split('.').pop()! : base;
        if (!allowedSource.has(ext) && !['license','readme','makefile','dockerfile'].includes(base)) return fail(`Unsupported source file: ${safeFilename(base)}. Remove binaries and nested archives.`);
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail('Cannot read archive content.');
          let entryBytes=0, first=Buffer.alloc(0),checksum=0;
          const chunks:Buffer[]=[];
          stream.on('data', (chunk:Buffer) => {
            entryBytes += chunk.length;total += chunk.length;checksum=crc32(chunk,checksum);
            if(first.length<4)first=Buffer.concat([first,chunk]).subarray(0,4);
            if(total>MAX_EXPANDED || entryBytes>entry.uncompressedSize || entryBytes>MAX_UPLOAD) {stream.destroy();return fail('Actual decompressed size exceeds the archive limit.');}
            chunks.push(chunk);
            if(first.subarray(0,2).toString()==='MZ' || ['7f454c46','504b0304','feedface','feedfacf','cefaedfe','cffaedfe','cafebabe'].includes(first.toString('hex'))) {stream.destroy();fail('Executables and nested archives are not allowed.');}
          });
          stream.on('error', () => fail('Archive content is corrupt.'));
          stream.on('end', () => {
            if(ended)return;
            if(checksum!==entry.crc32)return fail('Archive checksum verification failed.');
            void inspectSource(Buffer.concat(chunks),ext).then(()=>{if(!ended)zip.readEntry();}).catch(error=>fail(error.message||'Unsupported archive content.'));
          });
        });
      });
      zip.readEntry();
    });
  });
}

export async function validateImage(buffer:Buffer) {
  try {
    const image = sharp(buffer, {limitInputPixels: 25_000_000, animated:false, failOn:'warning'});
    const meta = await image.metadata();
    if (!['png','jpeg','webp'].includes(meta.format || '') || (meta.pages || 1)>1) throw new Error('format');
    return await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  } catch { throw new HttpError(400, 'Upload a valid PNG, JPEG, or WebP image under 25 megapixels.'); }
}
