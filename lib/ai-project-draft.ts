import {z} from 'zod';
import type {ProjectData} from './schema';

const text=(max:number)=>z.string().max(max);
const date=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/);
const url=z.string().max(2000).regex(/^https?:\/\//);
export const aiProjectFields=z.object({
 title:text(120).min(3).optional(),summary:text(300).optional(),description:text(20000).optional(),
 features:z.array(text(300).min(1)).max(30).optional(),type:z.enum(['Software','Hardware','Hybrid']).optional(),
 department:text(100).optional(),subject:text(100).optional(),year:z.string().regex(/^20\d{2}$/).optional(),teamName:text(100).optional(),
 team:z.array(z.object({name:text(100).min(1),email:text(254).optional(),rollNumber:text(60).optional(),contribution:text(200).optional(),branch:text(100).optional(),semester:z.enum(['1','2','3','4','5','6','7','8']).optional(),college:z.enum(['GGITS','GGCT']).optional()}).strict()).max(20).optional(),
 stack:z.object({frontend:text(300).optional(),backend:text(300).optional(),database:text(300).optional(),languages:text(300).optional(),frameworks:text(300).optional(),tools:text(300).optional()}).strict().optional(),
 tags:z.array(text(40).min(1)).max(40).optional(),startDate:date.optional(),endDate:date.optional(),purchaseDate:date.optional(),
 github:url.optional(),liveUrl:url.optional(),videoUrl:url.optional(),
 services:z.array(z.object({name:text(100).min(1),purpose:text(300).optional(),url:url.optional()}).strict()).max(30).optional(),
 hardwareCosts:z.array(z.object({name:text(100).min(1),quantity:z.number().int().min(1).max(10000),unitCost:z.number().min(0).max(10000000)}).strict()).max(100).optional(),
 softwareCosts:z.array(z.object({name:text(100).min(1),amount:z.number().min(0).max(10000000)}).strict()).max(100).optional(),
 currency:z.enum(['INR','USD','EUR','GBP']).optional(),openSource:z.boolean().optional(),
}).strict();
export const aiDraftSchema=z.object({fields:aiProjectFields,missingDetails:z.array(text(250)).max(20),notes:z.array(text(250)).max(10)}).strict();
export type AiDraft=z.infer<typeof aiDraftSchema>;
export const aiFieldLabels:Record<keyof AiDraft['fields'],string>={title:'Project title',summary:'Short description',description:'Full story',features:'Feature highlights',type:'Project type',department:'Department',subject:'Subject',year:'Academic year',teamName:'Team name',team:'Team members',stack:'Build stack',tags:'Technology tags',startDate:'Development start',endDate:'Development end',purchaseDate:'Parts purchase date',github:'GitHub URL',liveUrl:'Live demo URL',videoUrl:'Demo video URL',services:'Services used',hardwareCosts:'Hardware costs',softwareCosts:'Software costs',currency:'Currency',openSource:'No software costs'};

// Only explicitly selected, allowlisted text fields can change; upload IDs never come from AI.
export function applyAiDraft(current:ProjectData,draft:AiDraft,selected:(keyof AiDraft['fields'])[]):ProjectData{
 const next={...current};
 for(const key of selected){
  const value=draft.fields[key];if(value===undefined)continue;
  if(key==='stack'){next.stack={...current.stack,...draft.fields.stack};continue;}
  if(key==='team'){
   // Match by email, then roll number, then an unambiguous name; never transfer photos by row position.
   next.team=draft.fields.team!.map(member=>{
    const normalized=(s:string|undefined)=>(s||'').trim().toLowerCase();
    const candidates=current.team.filter(existing=>member.email?normalized(existing.email)===normalized(member.email):member.rollNumber?normalized(existing.rollNumber)===normalized(member.rollNumber):normalized(existing.name)===normalized(member.name));
    const existing=candidates.length===1?candidates[0]:undefined;
    return {name:member.name,email:member.email??existing?.email??'',rollNumber:member.rollNumber??existing?.rollNumber??'',contribution:member.contribution??existing?.contribution??'',branch:member.branch??existing?.branch??'',semester:member.semester??existing?.semester??'',college:member.college??existing?.college??'',photoId:existing?.photoId||''};
   });continue;
  }
  if(key==='services'){next.services=draft.fields.services!.map(s=>({...s,purpose:s.purpose||'',url:s.url||''}));continue;}
  Object.assign(next,{[key]:value});
 }
 // Keep existing costs instead of silently deleting them when the proposed type conflicts.
 if((next.type==='Software'&&next.hardwareCosts.length)||(next.type==='Hardware'&&next.softwareCosts.length))next.type='Hybrid';
 if(next.softwareCosts.length)next.openSource=false;
 return next;
}
