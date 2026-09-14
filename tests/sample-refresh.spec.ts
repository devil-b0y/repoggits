import {test,expect} from '@playwright/test';
import {db,migrate} from '../lib/db';
import {seedSample,SAMPLE_PROJECT_ID,SAMPLE_VERSION_ID} from '../scripts/sample-data';
import {submissionIssues} from '../lib/submission-guide';

test('sample refresh updates the example and retains its media, identity and counters',async({request})=>{
 await migrate();await seedSample();
 await db.query('UPDATE r.projects SET views=7 WHERE id=$1',[SAMPLE_PROJECT_ID]);
 await db.query("UPDATE r.versions SET data=jsonb_set(data,'{stack,languages}','\"Old language value\"') WHERE id=$1",[SAMPLE_VERSION_ID]);
 const result=await seedSample({refresh:true});expect('updated' in result&&result.updated).toBe(true);
 const [row]=await db.query('SELECT v.data,v.changelog,p.views FROM r.versions v JOIN r.projects p ON v.project_id=p.id WHERE v.id=$1',[SAMPLE_VERSION_ID]);
 expect(row.data.stack.languages).toBe('JavaScript, HTML, CSS');expect(submissionIssues(row.data,row.changelog)).toEqual([]);
 expect(row.data.galleryIds).toHaveLength(4);expect(row.data.team.every((m:any)=>m.photoId&&m.branch&&m.semester&&m.college)).toBe(true);
 expect(row.views).toBe(7);
 expect((await request.get(`/api/files/${row.data.coverId}`)).ok()).toBe(true);
 expect((await request.get('/samples/campusflow/demo.webm')).ok()).toBe(true);
 expect((await db.query('SELECT id FROM r.versions WHERE project_id=$1',[SAMPLE_PROJECT_ID]))).toHaveLength(1);
});
