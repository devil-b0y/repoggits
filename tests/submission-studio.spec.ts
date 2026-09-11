import {test,expect,type Page} from '@playwright/test';
const fileId='a10cd424-dcda-4b15-8a3b-7845e40ae0fe';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
async function mockSession(page:Page){
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'studio-test-student',name:'Sample Maker',email:'maker@example.test',role:'student',verified:true,suspended:false,scopes:[],profile:{department:'Computer Science'}},uploadsAvailable:true,emailVerificationRequired:false}}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['Computer Science','Electronics'],subjects:['Final Year Project'],tags:['ESP32','TypeScript']}}}));
 await page.route('**/api/upload',r=>r.fulfill({json:{id:fileId}}));
 await page.route(`**/api/files/${fileId}`,r=>r.fulfill({contentType:'image/png',body:pixel}));
}
test('studio previews edits, retains refresh recovery, uploads, and saves the existing payload',async({page})=>{
 await mockSession(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/submit');
 await page.getByLabel('Project title',{exact:true}).fill('My connected garden');await page.getByLabel('Short description',{exact:false}).fill('An ESP32-powered garden that makes every watering decision count.');
 await expect(page.locator('.studio-preview h2')).toHaveText('My connected garden');
 await page.reload();await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('My connected garden');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Show your work/}).click();
 await page.getByLabel('Cover image',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:pixel});
 await expect(page.locator('.studio-preview img')).toHaveAttribute('src',`/api/files/${fileId}`);
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/The big idea/}).click();
 await page.screenshot({path:'test-results/submission-studio-desktop.png'});
 let saved:any;await page.route('**/api/projects',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{id:'project-test',versionId:'version-test'}});});
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved to your account.',{exact:false})).toBeVisible();
 expect(saved.data.title).toBe('My connected garden');expect(saved.data.coverId).toBe(fileId);expect(saved.submit).toBe(false);
});
test('mobile studio keeps all form fields accessible and navigation fits',async({page})=>{
 await mockSession(page);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/submit');
 await expect(page.getByRole('heading',{level:1})).toContainText('Its next chapter.');await expect(page.locator('.form-section')).toHaveCount(6);
 await page.screenshot({path:'test-results/submission-studio-mobile.png'});
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();await expect(page.getByLabel('Demo video URL',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();await expect(page.getByRole('button',{name:'Submit for review'})).toBeVisible();
});
