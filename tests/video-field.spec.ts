import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const videoId='c20cd424-dcda-4b15-8a3b-7845e40ae0fe';
let demoVideo:Buffer;

test.beforeAll(async()=>{
 // A real, small, playable WebM fixture already ships with the sample project — reusing it means the browser can
 // actually decode duration/metadata in the editor, unlike an arbitrary buffer.
 demoVideo=await readFile(path.join(__dirname,'..','public','samples','campusflow','demo.webm'));
});

async function mockSession(page:Page){
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'video-test-student',name:'Sample Maker',email:'maker@example.test',role:'student',verified:true,suspended:false,scopes:[],profile:{department:'Computer Science'}},uploadsAvailable:true,emailVerificationRequired:false}}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['Computer Science'],subjects:['Final Year Project'],tags:['ESP32']}}}));
 await page.route('**/api/upload',r=>r.fulfill({json:{id:videoId,filename:'demo.webm',mime:'video/webm',size:demoVideo.length,url:`/api/files/${videoId}`}}));
 await page.route(`**/api/files/${videoId}`,r=>r.fulfill({contentType:'video/webm',body:demoVideo}));
}
async function openUnderTheHood(page:Page){
 await page.goto('/submit');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
}

test('uploading a video attaches it, rotate/trim edits persist through refresh, and the saved payload matches',async({page})=>{
 await mockSession(page);await openUnderTheHood(page);
 await page.getByLabel('Upload demo video').setInputFiles({name:'demo.webm',mimeType:'video/webm',buffer:demoVideo});
 await expect(page.locator('video[aria-label="Uploaded video preview"]')).toHaveAttribute('src',`/api/files/${videoId}`);

 await page.getByRole('button',{name:'Edit video'}).click();
 const editor=page.getByRole('dialog',{name:'Trim and rotate'});
 await expect(editor).toBeVisible();
 const startSlider=editor.getByRole('slider',{name:'Start'}),endSlider=editor.getByRole('slider',{name:'End'});
 await expect(startSlider).toBeEnabled();
 await editor.getByRole('button',{name:'Rotate right'}).click();
 await expect(editor.locator('.avatar-stage-caption')).toContainText('rotated 90°');
 const max=Number(await endSlider.getAttribute('max'));
 expect(max).toBeGreaterThan(0);
 const start=Math.round(max*0.2*10)/10,end=Math.round(max*0.7*10)/10;
 await startSlider.fill(String(start));
 await endSlider.fill(String(end));
 await editor.getByRole('button',{name:'Save video'}).click();
 await expect(editor).toBeHidden();

 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/The big idea/}).click();
 await page.getByLabel('Project title',{exact:true}).fill('Rotated demo project');
 await page.reload();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(page.locator('video[aria-label="Uploaded video preview"]')).toHaveAttribute('src',`/api/files/${videoId}`);
 await page.getByRole('button',{name:'Edit video'}).click();
 const reopened=page.getByRole('dialog',{name:'Trim and rotate'});
 await expect(reopened.locator('.avatar-stage-caption')).toContainText('rotated 90°');
 await expect(reopened.getByRole('slider',{name:'Start'})).toHaveValue(String(start));
 await expect(reopened.getByRole('slider',{name:'End'})).toHaveValue(String(end));
 await reopened.getByRole('button',{name:'Cancel'}).click();

 let saved:any;await page.route('**/api/projects',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{id:'video-project',versionId:'video-version'}});});
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Draft saved to your account.',{exact:false})).toBeVisible();
 expect(saved.data.videoId).toBe(videoId);
 expect(saved.data.videoRotation).toBe(90);
 expect(saved.data.videoTrimStart).toBeCloseTo(start,1);
 expect(saved.data.videoTrimEnd).toBeCloseTo(end,1);
});

test('removing an uploaded video clears it and resets rotation and trim',async({page})=>{
 await mockSession(page);await openUnderTheHood(page);
 await page.getByLabel('Upload demo video').setInputFiles({name:'demo.webm',mimeType:'video/webm',buffer:demoVideo});
 await expect(page.locator('video[aria-label="Uploaded video preview"]')).toBeVisible();
 await page.getByRole('button',{name:'Edit video'}).click();
 const editor=page.getByRole('dialog',{name:'Trim and rotate'});
 await editor.getByRole('button',{name:'Rotate right'}).click();
 await editor.getByRole('button',{name:'Save video'}).click();
 await expect(editor).toBeHidden();
 await page.getByRole('button',{name:'Remove',exact:true}).click();
 await expect(page.locator('video[aria-label="Uploaded video preview"]')).toBeHidden();

 let saved:any;await page.route('**/api/projects',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{id:'video-project-2',versionId:'video-version-2'}});});
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Draft saved to your account.',{exact:false})).toBeVisible();
 expect(saved.data.videoId).toBe('');
 expect(saved.data.videoRotation).toBe(0);
 expect(saved.data.videoTrimStart).toBe(0);
 expect(saved.data.videoTrimEnd).toBe(0);
});

test('an oversized video is rejected client-side before any upload request is sent',async({page})=>{
 await mockSession(page);await openUnderTheHood(page);
 let uploadCalled=false;
 await page.route('**/api/upload',async r=>{uploadCalled=true;await r.fulfill({json:{id:videoId}});});
 const oversized=Buffer.alloc(101*1024*1024);
 await page.getByLabel('Upload demo video').setInputFiles({name:'huge.mp4',mimeType:'video/mp4',buffer:oversized});
 await expect(page.getByText('The maximum video size is 100 MB.',{exact:false})).toBeVisible();
 expect(uploadCalled).toBe(false);
});

test('a non mp4/webm file is rejected client-side by extension',async({page})=>{
 await mockSession(page);await openUnderTheHood(page);
 await page.getByLabel('Upload demo video').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('not a video')});
 await expect(page.getByText('Choose an MP4 or WebM video file.',{exact:false})).toBeVisible();
});

test('the pasted video URL field still works on its own, unaffected by the upload option',async({page})=>{
 await mockSession(page);await openUnderTheHood(page);
 await page.getByLabel('Demo video URL',{exact:false}).fill('https://example.test/demo.mp4');
 await page.reload();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(page.getByLabel('Demo video URL',{exact:false})).toHaveValue('https://example.test/demo.mp4');
 await expect(page.locator('video[aria-label="Uploaded video preview"]')).toHaveCount(0);
});
