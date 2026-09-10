import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { transaction } from '../lib/db';
import { audit } from '../lib/auth';
import { projectSchema } from '../lib/schema';
import { validateImage, validateZip } from '../lib/file-validation';

export const SAMPLE_PROJECT_ID='e3213918-fb91-4c55-bef3-faf5ca96cec4';
export const SAMPLE_VERSION_ID='10f95358-6200-4d72-8c10-4c5588ca1d39';
const ownerId='d8245643-13c4-4a11-97f5-9a429e0c9931';
const fileId=(n:number)=>`f426a301-8633-4bac-8518-${String(n).padStart(12,'0')}`;
const folder=resolve('examples/campusflow');
const sourceFiles=['index.html','styles.css','app.js','README.md','LICENSE'];

// A deterministic, uncompressed ZIP of only the five repository-authored source files.
async function sourceArchive(){
  const local:Buffer[]=[],directory:Buffer[]=[];let offset=0;
  for(const name of sourceFiles){
    const filename=Buffer.from(`campusflow/${name}`),body=await readFile(resolve(folder,name)),checksum=crc32(body);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(checksum,14);header.writeUInt32LE(body.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(filename.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(checksum,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    local.push(header,filename,body);directory.push(central,filename);offset+=header.length+filename.length+body.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(sourceFiles.length,8);end.writeUInt16LE(sourceFiles.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  const archive=Buffer.concat([...local,central,end]);await validateZip(archive);return archive;
}

export async function seedSample(){
  const origin=process.env.APP_ORIGIN||'http://localhost:3000';
  const names=['cover','dashboard','new-task','completed-task','mobile','aarav','ananya'];
  const images=await Promise.all(names.map(async(name,i)=>({id:fileId(i+1),filename:`campusflow-${name}.webp`,mime:'image/webp',content:await validateImage(await readFile(resolve(folder,'assets',`${name}.png`)))})));
  const source=await sourceArchive();await writeFile(resolve(folder,'campusflow-source.zip'),source);
  const files=[...images,{id:fileId(8),filename:'campusflow-source.zip',mime:'application/zip',content:source}];
  const data=projectSchema.parse({
    title:'CampusFlow — your semester, a little more organised',
    type:'Software',department:'Computer Science',subject:'Mini Project',year:'2026',teamName:'Campus Makers',
    summary:'A calm student workspace for assignments, project milestones, and team tasks. Plan what comes next, track progress, and make room for your best work.',
    description:'CampusFlow brings the scattered parts of student work into one clear notebook: a task board, due dates, teammate assignments, and a simple view of progress. The prototype runs entirely in the browser, making it easy to try and easy to understand.\n\nCreate a task, choose a teammate and priority, move it from Up next to In the making, and mark it complete. The dashboard totals update as you work. Search helps you find tasks by title, subject, or teammate, and browser-local storage keeps your changes after a refresh.\n\nThis is a sample submission with a fictional team and AI-generated portraits. The attached screenshots and recorded video show the actual working demo. The source ZIP contains the complete HTML, CSS, JavaScript, README, and MIT license. Open index.html to run it without a build step.\n\nScope: this is a browser-local prototype, not a shared multi-user service. The optional deployment costs below are illustrative estimates; running the downloaded demo is free.',
    features:['Three-stage task board: Up next, In the making, and Made it happen','Create tasks with a subject, teammate, priority, and due date','Live task counts and a project-completion indicator','Search across task names, subjects, and teammates','Browser-local persistence, with a resettable demo workspace','Responsive desktop and mobile layouts with keyboard-accessible forms','Readable, dependency-free source that runs without installation'],
    team:[
      {name:'Aarav Sharma',email:'aarav.campusflow@students.invalid',contribution:'Task logic, local storage, and browser testing',branch:'Computer Science',semester:'6',college:'GGITS',photoId:fileId(6)},
      {name:'Ananya Verma',email:'ananya.campusflow@students.invalid',contribution:'Interface design, responsive layout, and documentation',branch:'Information Technology',semester:'6',college:'GGCT',photoId:fileId(7)},
    ],
    tags:['JavaScript','HTML','CSS','Student productivity','LocalStorage'],
    stack:{frontend:'Semantic HTML and responsive CSS',backend:'Browser-local prototype; no server required',database:'Browser localStorage',languages:'JavaScript, HTML, CSS',frameworks:'Vanilla JavaScript',tools:'Playwright, Chrome DevTools'},
    services:[{name:'Web Storage API',purpose:'Saves tasks in this browser across page reloads',url:'https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API'},{name:'Static web hosting',purpose:'Optional deployment target; the supplied demo is served locally by Repoggits',url:''}],
    startDate:'2026-08-01',endDate:'2026-08-22',purchaseDate:'',
    coverId:fileId(1),galleryIds:[fileId(2),fileId(3),fileId(4),fileId(5)],sourceId:fileId(8),
    liveUrl:`${origin}/samples/campusflow/index.html`,videoUrl:`${origin}/samples/campusflow/demo.webm`,github:'',
    hardwareCosts:[],softwareCosts:[{name:'Optional domain — illustrative annual estimate',amount:650},{name:'Optional static hosting — illustrative first month',amount:150}],currency:'INR',openSource:false,
  });
  return transaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('repoggits-campusflow-sample'))");
    const [existing]=await client.query('SELECT p.id,p.example,v.id AS version_id,v.data FROM r.projects p JOIN r.versions v ON v.project_id=p.id WHERE p.id=$1',[SAMPLE_PROJECT_ID]);
    if(existing){
      if(!existing.example)throw new Error('Sample identifier belongs to a non-sample project.');
      // liveUrl/videoUrl point at static files this same deployment serves, but they were baked in
      // with whatever APP_ORIGIN was active when this row was first seeded (e.g. seeded once while
      // testing locally, before pointing this database at a live server). Reseeding otherwise
      // preserves the row untouched, so repair just these two fields rather than skipping silently.
      const stored=projectSchema.parse(existing.data);
      if(stored.liveUrl!==data.liveUrl||stored.videoUrl!==data.videoUrl)
        await client.query("UPDATE r.versions SET data=jsonb_set(jsonb_set(data,'{liveUrl}'::text[],to_jsonb($1::text)),'{videoUrl}'::text[],to_jsonb($2::text)) WHERE id=$3",[data.liveUrl,data.videoUrl,existing.version_id]);
      return {id:SAMPLE_PROJECT_ID,created:false};
    }
    // No password or sessions: this sample identity cannot sign in or impersonate a student.
    await client.query("INSERT INTO r.users(id,email,name,role,suspended,profile) VALUES($1,'campusflow.sample@repoggits.invalid','Campus Makers (sample)','student',true,$2)",[ownerId,JSON.stringify({name:'Campus Makers (sample)',bio:'Fictional author for the clearly labeled CampusFlow example.'})]);
    for(const file of files)await client.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,$3,$4,$5,$6,'trusted_sample')",[file.id,ownerId,file.filename,file.mime,file.content.length,file.content]);
    await client.query('INSERT INTO r.projects(id,owner_id,example) VALUES($1,$2,true)',[SAMPLE_PROJECT_ID,ownerId]);
    await client.query("INSERT INTO r.versions(id,project_id,number,status,data,changelog) VALUES($1,$2,1,'approved',$3,$4)",[SAMPLE_VERSION_ID,SAMPLE_PROJECT_ID,JSON.stringify(data),'Sample release 1.0: working task board, search, browser-local persistence, desktop/mobile layouts, recorded walkthrough, full source archive, and fictional team profiles. Published as a display example, not an educator-reviewed student submission.']);
    await audit(client,null,'example.published',SAMPLE_PROJECT_ID,{provenance:'repository-authored sample; not a student upload or malware-scan verdict',assets:files.map(f=>({filename:f.filename,sha256:createHash('sha256').update(f.content).digest('hex')}))});
    return {id:SAMPLE_PROJECT_ID,created:true};
  });
}
