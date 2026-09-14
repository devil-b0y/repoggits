import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {generateProjectDraft,geminiKeys} from '../lib/gemini';
import {applyAiDraft,aiDraftSchema,type AiDraft} from '../lib/ai-project-draft';
import {emptyProject,projectSchema} from '../lib/schema';
import {db,migrate} from '../lib/db';
import {hashToken} from '../lib/auth';
import {seedSample,SAMPLE_PROJECT_ID,SAMPLE_VERSION_ID} from '../scripts/sample-data';

const prompt='We made an ESP32 smart garden using C++ with a soil moisture sensor and pump.';
const draft:AiDraft={fields:{title:'Smart campus garden',description:'We built a soil monitoring system using an ESP32 and a moisture sensor. The firmware reads the sensor and switches a water pump when needed.',tags:['ESP32','C++'],startDate:'2026-08-01',endDate:'2026-08-22',team:[{name:'Sample Maker',rollNumber:'00123',email:'maker@example.test',college:'GGITS',semester:'6',branch:'Electronics',contribution:'Firmware'}],stack:{languages:'C++'}},missingDetails:['Add the hardware cost.'],notes:[]};
const success=(value:unknown=draft)=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
const fetchStub=(handler:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>)=>handler as typeof fetch;
let env:{key?:string;keys?:string;model?:string};
test.beforeEach(()=>{env={key:process.env.GEMINI_API_KEY,keys:process.env.GEMINI_API_KEYS,model:process.env.GEMINI_MODEL};process.env.GEMINI_API_KEY='test-primary';process.env.GEMINI_API_KEYS='';process.env.GEMINI_MODEL='gemini-2.5-flash';});
test.afterEach(()=>{for(const [key,value] of [['GEMINI_API_KEY',env.key],['GEMINI_API_KEYS',env.keys],['GEMINI_MODEL',env.model]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}});

test('Gemini sends only the prompt and structured schema, then falls back without duplicate keys',async()=>{
 process.env.GEMINI_API_KEYS='test-primary, test-backup, test-backup';expect(geminiKeys()).toEqual(['test-primary','test-backup']);
 const attempts:string[]=[];
 const result=await generateProjectDraft(prompt,fetchStub(async(url,init)=>{
  expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  attempts.push(new Headers(init?.headers).get('x-goog-api-key')!);
  const body=JSON.parse(String(init?.body));expect(body.contents).toEqual([{role:'user',parts:[{text:prompt}]}]);expect(body.generationConfig.responseJsonSchema.properties.fields).toBeTruthy();
  return attempts.length===1?Response.json({error:{message:'Quota exhausted'}},{status:429}):success();
 }));
 expect(attempts).toEqual(['test-primary','test-backup']);expect(result.fields.team?.[0].rollNumber).toBe('00123');
});

test('provider errors stay safe, invalid output cannot smuggle file IDs, and date errors are rejected',async()=>{
 await expect(generateProjectDraft(prompt,fetchStub(async()=>Response.json({secret:'do-not-expose'},{status:403})))).rejects.toThrow('could not authorize');
 await expect(generateProjectDraft(prompt,fetchStub(async()=>success({...draft,fields:{...draft.fields,coverId:randomUUID()}})))).rejects.toThrow('usable draft');
 await expect(generateProjectDraft(prompt,fetchStub(async()=>success({...draft,fields:{startDate:'2026-02-31'}})))).rejects.toThrow('usable draft');
 await expect(generateProjectDraft(prompt,fetchStub(async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify(draft)}]}}]})))).rejects.toThrow('usable draft');
});

test('unsafe or unrelated prompts are refused with a clear reason instead of a draft',async()=>{
 let body:{safetySettings:{category:string;threshold:string}[]}|undefined;
 await expect(generateProjectDraft(prompt,fetchStub(async(_url,init)=>{body=JSON.parse(String(init?.body));return Response.json({promptFeedback:{blockReason:'SAFETY'}});}))).rejects.toMatchObject({status:422});
 expect(body?.safetySettings.map(setting=>setting.category)).toContain('HARM_CATEGORY_DANGEROUS_CONTENT');
 await expect(generateProjectDraft(prompt,fetchStub(async()=>Response.json({candidates:[{finishReason:'SAFETY'}]})))).rejects.toThrow('declined');
 await expect(generateProjectDraft('Write a 2000 word essay about climate change for my class.',fetchStub(async()=>success({fields:{},missingDetails:[],notes:[]})))).rejects.toThrow('does not look like a project description');
});

test('selected fields preserve manual answers, project uploads and correctly matched team photos',()=>{
 const coverId=randomUUID(),sourceId=randomUUID(),photoId=randomUUID();
 const original=projectSchema.parse({...emptyProject,title:'My own title',coverId,sourceId,galleryIds:[randomUUID()],team:[{name:'Sample Maker',email:'maker@example.test',contribution:'Lead',photoId}],hardwareCosts:[]});
 const applied=applyAiDraft(original,draft,['description','team','stack']);
 expect(applied.title).toBe(original.title);expect(applied.coverId).toBe(coverId);expect(applied.sourceId).toBe(sourceId);expect(applied.galleryIds).toEqual(original.galleryIds);expect(applied.team[0].photoId).toBe(photoId);expect(applied.team[0].rollNumber).toBe('00123');
 const changed=applyAiDraft(original,aiDraftSchema.parse({...draft,fields:{team:[{name:'Another person'}]}}),['team']);expect(changed.team[0].photoId).toBe('');
});

async function mockSession(page:Page){
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'gemini-test-student',name:'Sample Maker',email:'maker@example.test',role:'student',verified:true,suspended:false,scopes:[],profile:{department:'Computer Science'}},uploadsAvailable:true,emailVerificationRequired:false}}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['Computer Science'],subjects:['Mini Project'],tags:['ESP32']}}}));
}

test('Gemini preview is optional, applies selected details, preserves uploads and survives refresh',async({page})=>{
 await mockSession(page);await page.route('**/api/ai/project-draft',r=>r.fulfill({json:draft}));
 const fileId=randomUUID();
 await page.route('**/api/upload',r=>r.fulfill({json:{id:fileId}}));
 await page.route(`**/api/files/${fileId}`,r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>'}));
 await page.goto('/submit');await page.getByLabel('Project title',{exact:true}).fill('Keep this title');
 await page.getByLabel('Cover image',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
 await expect(page.locator('.studio-preview img')).toHaveAttribute('src',`/api/files/${fileId}`);
 await page.getByLabel('Describe your project',{exact:true}).fill(prompt);
 await page.getByRole('button',{name:'Generate project details'}).click();await expect(page.locator('.gemini-result')).toBeVisible();
 await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Keep this title');
 await page.locator('.gemini-field').getByRole('checkbox',{name:'Use suggested Project title',exact:true}).uncheck();
 await page.getByRole('button',{name:'Apply selected details'}).click();
 await expect(page.getByLabel('Member roll number',{exact:false})).toHaveValue('00123');
 await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Keep this title');
 await page.reload();await expect(page.getByLabel('Member roll number',{exact:false})).toHaveValue('00123');await expect(page.getByLabel('Describe your project',{exact:true})).toHaveValue(prompt);
 await expect(page.locator('.studio-preview img')).toHaveAttribute('src',`/api/files/${fileId}`);
 let saved:any;await page.route('**/api/projects',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{id:'project-test',versionId:'version-test'}});});
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved to your account.',{exact:false})).toBeVisible();expect(saved.data.team[0].rollNumber).toBe('00123');
});

test('Gemini failure keeps manual work and mobile controls usable',async({page})=>{
 await mockSession(page);await page.setViewportSize({width:320,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/ai/project-draft',r=>r.fulfill({status:429,json:{error:'Gemini is at its usage limit. Try again later or continue manually.'}}));
 await page.goto('/submit');await page.getByLabel('Project title',{exact:true}).fill('My manual project');
 await page.getByLabel('Describe your project',{exact:true}).fill(prompt);await page.getByRole('button',{name:'Generate project details'}).click();
 await expect(page.locator('.gemini-assistant [role=alert]')).toContainText('usage limit');await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('My manual project');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.gemini-assistant').screenshot({path:'test-results/gemini-mobile.png'});
});

test('AI endpoint enforces sign-in, origin checks, prompt limits and per-account limits before provider calls',async({request})=>{
 await migrate();
 const url='/api/ai/project-draft',origin=process.env.APP_ORIGIN!;
 expect((await request.post(url,{headers:{origin},data:{prompt}})).status()).toBe(401);
 const id=randomUUID(),token=randomUUID();await db.query("INSERT INTO r.users(id,email,name,role,verified,profile) VALUES($1,$2,'AI test student','student',true,'{}')",[id,`${id}@example.test`]);
 await db.query("INSERT INTO r.sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hashToken(token),id]);
 const headers={origin,cookie:`repoggits_session=${token}`};
 expect((await request.post(url,{headers:{...headers,origin:'https://other.invalid'},data:{prompt}})).status()).toBe(403);
 expect((await request.post(url,{headers,data:{prompt:'a'.repeat(12001)}})).status()).toBe(400);
 await db.query("INSERT INTO r.rate_limits(key,count,expires_at) VALUES($1,10,now()+interval '1 hour')",[`gemini-hour:${id}`]);
 expect((await request.post(url,{headers,data:{prompt}})).status()).toBe(429);
});

test('member roll numbers persist in storage and are hidden from ordinary project viewers',async({request})=>{
 await migrate();await seedSample();
 await db.query("UPDATE r.versions SET data=jsonb_set(data,'{team,0,rollNumber}','\"00123\"') WHERE id=$1",[SAMPLE_VERSION_ID]);
 const id=randomUUID(),token=randomUUID();await db.query("INSERT INTO r.users(id,email,name,role,verified,profile) VALUES($1,$2,'Viewer','student',true,'{}')",[id,`${id}@example.test`]);
 await db.query("INSERT INTO r.sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hashToken(token),id]);
 const response=await request.get(`/api/projects/${SAMPLE_PROJECT_ID}`,{headers:{cookie:`repoggits_session=${token}`}});expect(response.ok()).toBe(true);expect((await response.json()).project.version.data.team[0].rollNumber).toBe('');
 const [stored]=await db.query('SELECT data FROM r.versions WHERE id=$1',[SAMPLE_VERSION_ID]);expect(stored.data.team[0].rollNumber).toBe('00123');
});
