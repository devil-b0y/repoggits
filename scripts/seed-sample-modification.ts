import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {ZipFile} from 'yazl';
import {pool,transaction} from '../lib/db';
import {activeAdapter} from '../lib/database/manager';
import {audit} from '../lib/auth';
import {sealBytes,sealProfile,sealText,storedEmail} from '../lib/encryption';
import {projectSchema} from '../lib/schema';
import {validateImage,validateZip} from '../lib/file-validation';
import {projectLineage} from '../lib/project-community';
import {SAMPLE_PROJECT_ID} from './sample-data';
const id='03a24e7b-2aeb-416e-8309-e37dfdd58620';
const ownerId='65f241f3-4ab3-411e-9a32-160ad4c71d42';
async function main(){
 const folder=resolve('examples/campusflow-focus');
 const zip=new ZipFile();const chunks:Buffer[]=[];const archiveReady=new Promise<Buffer>((yes,no)=>{zip.outputStream.on('data',c=>chunks.push(c));zip.outputStream.on('end',()=>yes(Buffer.concat(chunks)));zip.outputStream.on('error',no);});
 for(const name of ['index.html','styles.css','app.js','README.md','LICENSE'])zip.addBuffer(await readFile(resolve(folder,name)),`campusflow-focus/${name}`);
 zip.end();const source=await archiveReady;await validateZip(source);
 const files=[{id:randomUUID(),filename:'campusflow-focus-cover.webp',mime:'image/webp',content:await validateImage(await readFile(resolve(folder,'assets/cover.png')))},{id:randomUUID(),filename:'campusflow-focus-mobile.webp',mime:'image/webp',content:await validateImage(await readFile(resolve(folder,'assets/mobile.png')))},{id:randomUUID(),filename:'campusflow-focus-source.zip',mime:'application/zip',content:source}];
 const portraits=await Promise.all([{name:'Rohan Mehta',asset:'rohan'},{name:'Isha Sen',asset:'isha'}].map(async person=>({...person,id:randomUUID(),filename:`campusflow-focus-${person.asset}.webp`,mime:'image/webp',content:await validateImage(await readFile(resolve(folder,`assets/${person.asset}.png`)))})));
 const result=await transaction(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtext('repoggits-campusflow-focus-sample'))");
  const [existing]=await client.query('SELECT id,example,owner_id,parent_project_id FROM r.projects WHERE id=$1',[id]);
  if(existing){if(!existing.example||existing.owner_id!==ownerId||existing.parent_project_id!==SAMPLE_PROJECT_ID)throw Error('Sample ID collision. No changes made.');
   const [version]=await client.query("SELECT id,data FROM r.versions WHERE project_id=$1 AND status='approved' ORDER BY number DESC LIMIT 1 FOR UPDATE",[id]);
   if(!version)throw Error('Approved sample version not found.');
   const data=projectSchema.parse(version.data);
   let added=0;
   for(const portrait of portraits){
    const member=data.team.find(member=>member.name===portrait.name);
    if(!member)throw Error('Expected sample team member not found.');
    if(member.photoId)continue;
    await client.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,$3,$4,$5,$6,'trusted_sample')",[portrait.id,ownerId,sealText(portrait.filename,'files.filename'),portrait.mime,portrait.content.length,sealBytes(portrait.content,'files.content')]);
    member.photoId=portrait.id;added++;
   }
   if(added){
    await client.query('UPDATE r.versions SET data=$1 WHERE id=$2',[JSON.stringify(data),version.id]);
    await audit(client,null,'example.team.portraits.attached',id,{versionId:version.id,count:added,provenance:'AI-generated fictional sample portraits'});
   }
   return added?'Sample portraits attached':'Already exists with portraits';
  }
  const [parent]=await client.query("SELECT v.id,v.number,v.data FROM r.projects p JOIN r.versions v ON v.project_id=p.id WHERE p.id=$1 AND p.example=true AND NOT p.archived AND v.status='approved' ORDER BY v.number DESC LIMIT 1",[SAMPLE_PROJECT_ID]);
  if(!parent)throw Error('Approved original demo not found. No changes made.');
  const original=projectSchema.parse(parent.data);
  const data=projectSchema.parse({...original,title:'CampusFlow Focus - priorities, deadlines & exports',teamName:'Circuit & Code',summary:'A testing modification of CampusFlow with priority filters, earliest-deadline sorting, and a portable CSV task export.',description:'CampusFlow Focus is a fictional testing build by Circuit & Code, based on CampusFlow by Campus Makers. It preserves the original task board, search, progress tracking, and browser-local persistence.\n\nAdded features are implemented in the live demo and downloadable source: filter tasks by priority, sort each column by earliest due date, and export every task as a CSV file. The modified demo uses its own local-storage key so it never overwrites the original demo workspace.\n\nThis is a repository-authored test sample, not a real student submission or educator-reviewed release. Team identities are fictional. Screenshots show the actual modified application. No cloud sync or backend is provided.',features:['NEW: Filter the task board by High, Medium, or Low priority','NEW: Sort tasks in each column by earliest due date','NEW: Download all tasks as CSV, including assignee, priority, due date, and status','Keep modified-demo data separate from the original demo workspace',...original.features.slice(0,4)],team:[{name:'Rohan Mehta',email:'rohan.focus@students.invalid',contribution:'Priority filters, deadline sorting, and local persistence',branch:'Computer Science',semester:'6',college:'GGITS',photoId:portraits[0].id},{name:'Isha Sen',email:'isha.focus@students.invalid',contribution:'CSV export, responsive design, and regression testing',branch:'Information Technology',semester:'6',college:'GGCT',photoId:portraits[1].id}],tags:[...original.tags,'CSV export','Task prioritization'],coverId:files[0].id,galleryIds:[files[1].id],sourceId:files[2].id,liveUrl:`${(process.env.APP_ORIGIN||'http://localhost:3000').replace(/\/$/,'')}/samples/campusflow-focus/index.html`,videoUrl:'',github:'',startDate:'2026-09-10',endDate:'2026-09-17',hardwareCosts:[],softwareCosts:[],openSource:true});
  const email=storedEmail('campusflow.focus.sample@repoggits.invalid');
  await client.query("INSERT INTO r.users(id,email,email_hash,name,role,suspended,profile) VALUES($1,$2,$3,'Circuit & Code (sample)','student',true,$4)",[ownerId,email.email,email.emailHash,sealProfile({name:'Circuit & Code (sample)',bio:'Fictional modification team for testing. No sign-in credentials.'})]);
  for(const file of [...files,...portraits])await client.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,$3,$4,$5,$6,'trusted_sample')",[file.id,ownerId,sealText(file.filename,'files.filename'),file.mime,file.content.length,sealBytes(file.content,'files.content')]);
  await client.query('INSERT INTO r.projects(id,owner_id,example,parent_project_id,parent_version_id) VALUES($1,$2,true,$3,$4)',[id,ownerId,SAMPLE_PROJECT_ID,parent.id]);
  await client.query("INSERT INTO r.versions(id,project_id,number,status,data,changelog) VALUES($1,$2,$3,'approved',$4,$5)",[randomUUID(),id,Number(parent.number)+1,JSON.stringify(data),'Testing sample: priority filtering, earliest-deadline sorting, CSV export, and separate browser-local state. Credits Campus Makers and the pinned original CampusFlow version. Published as an illustrative example, not an educator approval.']);
  await audit(client,null,'example.modification.published',id,{parentId:SAMPLE_PROJECT_ID,parentVersionId:parent.id,provenance:'Repository-authored fictional testing sample',assets:files.map(f=>({filename:f.filename,sha256:createHash('sha256').update(f.content).digest('hex')}))});
  return 'Created';
 });
 await transaction(async client=>{
  const [version]=await client.query("SELECT data FROM r.versions WHERE project_id=$1 AND status='approved' ORDER BY number DESC LIMIT 1",[id]);
  const data=projectSchema.parse(version.data);
  for(const person of portraits){
   const member=data.team.find(member=>member.name===person.name);
   const [file]=await client.query('SELECT mime,size FROM r.files WHERE id=$1 AND owner_id=$2',[member?.photoId,ownerId]);
   if(!file||file.mime!=='image/webp'||Number(file.size)<=0)throw Error('Sample portrait verification failed.');
  }
 });
 console.log('Verified both team portraits are stored and linked.');
 const lineage=await projectLineage(null,null,SAMPLE_PROJECT_ID);
 if(!lineage.modifications.some(row=>row.id===id))throw Error('Modified build was not listed under the original project.');
 console.log(`${result}: /projects/${id}`);console.log(`Verified in original Modified builds: /projects/${SAMPLE_PROJECT_ID}`);
}
main().catch(()=>{console.error('Unable to seed or verify the modified sample. Check the configured database and existing sample.');process.exitCode=1;}).finally(async()=>{await (await activeAdapter()).close();await pool().end();});
