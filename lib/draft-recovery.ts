import { z } from 'zod';
import { emptyProject, type ProjectData } from './schema';

// Recovery accepts incomplete inputs, including partial URLs and blank team rows.
const strings=z.array(z.string());
const recoveryData=z.object({
  ...Object.fromEntries(Object.entries(emptyProject).filter(([,v])=>typeof v==='string').map(([k])=>[k,z.string()])),
  type:z.enum(['Software','Hardware','Hybrid']),currency:z.enum(['INR','USD','EUR','GBP']),openSource:z.boolean(),
  features:strings,tags:strings,galleryIds:strings,
  stack:z.object(Object.fromEntries(Object.keys(emptyProject.stack).map(k=>[k,z.string()]))),
  team:z.array(z.object({name:z.string(),email:z.string(),contribution:z.string(),branch:z.string(),semester:z.string(),college:z.string(),photoId:z.string()})),
  services:z.array(z.object({name:z.string(),purpose:z.string(),url:z.string()})),
  hardwareCosts:z.array(z.object({name:z.string(),quantity:z.number(),unitCost:z.number()})),
  softwareCosts:z.array(z.object({name:z.string(),amount:z.number()})),
});
export const draftKey=(userId:string,versionId='new')=>`repoggits-draft-v1:${userId}:${versionId}`;
export function readRecovery(key:string,baseline:string){
  const raw=localStorage.getItem(key);if(!raw)return null;
  if(raw.length>1_000_000)throw new Error('The saved recovery copy is too large.');
  const parsed=z.object({data:recoveryData,changelog:z.string(),baseline:z.string()}).safeParse(JSON.parse(raw));
  if(!parsed.success)throw new Error('The saved recovery copy could not be read.');
  if(parsed.data.baseline!==baseline)throw new Error('This draft changed in your account. The latest account version is shown; your browser recovery copy has been kept.');
  return {data:parsed.data.data as ProjectData,changelog:parsed.data.changelog};
}
