import {test,expect,type Page} from '@playwright/test';
import languages from '../lib/programming-languages.json';
import {readFile} from 'node:fs/promises';
const fileId='a10cd424-dcda-4b15-8a3b-7845e40ae0fe';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
async function mockSession(page:Page){
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'studio-test-student',name:'Sample Maker',email:'maker@example.test',role:'student',verified:true,suspended:false,scopes:[],profile:{department:'Computer Science'}},uploadsAvailable:true,emailVerificationRequired:false}}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['Computer Science','Electronics'],subjects:['Final Year Project'],tags:['ESP32','TypeScript']}}}));
 await page.route('**/api/upload',r=>r.fulfill({json:{id:fileId}}));
 await page.route(`**/api/files/${fileId}`,r=>r.fulfill({contentType:'image/png',body:pixel}));
}

test('starter kits preserve custom answers and the downloadable draft matches recovered work',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 await page.getByLabel('Project title',{exact:true}).fill('Smart garden notebook');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await page.getByLabel('Frontend',{exact:true}).fill('My custom interface');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/The big idea/}).click();
 await page.locator('.starter-details > summary').click();
 await page.getByRole('button',{name:/ESP32 \/ connected device/}).click();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(page.getByLabel('Frontend',{exact:true})).toHaveValue('My custom interface');
 await expect(page.locator('.language-chip')).toHaveCount(2);
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/The big idea/}).click();
 await page.getByRole('button',{name:'Use writing outline'}).click();
 await expect(page.getByLabel('Full story',{exact:true})).toHaveValue(/The problem/);
 await expect(page.getByRole('button',{name:'Use writing outline'})).toBeDisabled();
 await page.reload();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(page.locator('.language-chip')).toHaveCount(2);
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/The big idea/}).click();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download draft JSON'}).click();
 const download=await downloadPromise;const exported=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(exported.data.title).toBe('Smart garden notebook');expect(exported.data.stack.frontend).toBe('My custom interface');expect(exported.data.stack.languages).toBe('C++, Python');
});

test('review explains missing fields and submits only after required details are ready',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 await page.getByLabel('Project title',{exact:true}).fill('A working project');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await page.getByRole('button',{name:'Submit for review'}).click();
 await expect(page.locator('#submission-review')).toBeFocused();
 await expect(page.locator('.readiness')).toContainText('Choose a subject.');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/The big idea/}).click();
 await page.getByLabel('Subject',{exact:false}).fill('Mini Project');
 await page.getByLabel('Short description',{exact:false}).fill('A helpful project that students can reuse for their own work.');
 await page.getByLabel('Full story',{exact:true}).fill('We built a helpful project for students to organise their academic work and share their discoveries with the next team.');
 await page.locator('.starter-details > summary').click();await page.getByRole('button',{name:/Web application/}).click();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await expect(page.locator('.readiness')).toContainText('All required details are ready');
 let saved:any;await page.route('**/api/projects',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{id:'project-test',versionId:'version-test'}});});
 await page.route('**/workspace',r=>r.fulfill({contentType:'text/html',body:'<h1>Workspace</h1>'}));
 await page.getByRole('button',{name:'Submit for review'}).click();await page.waitForURL('**/workspace');expect(saved.submit).toBe(true);
});

test('gallery order is editable and survives refresh without losing files',async({page})=>{
 await mockSession(page);let counter=1;
 await page.route('**/api/upload',r=>r.fulfill({json:{id:`b10cd424-dcda-4b15-8a3b-${String(counter++).padStart(12,'0')}`}}));
 await page.route('**/api/files/b10cd424-*',r=>r.fulfill({contentType:'image/png',body:pixel}));
 await page.goto('/submit');
 for(let i=0;i<2;i++){await page.getByLabel('Add gallery image',{exact:true}).setInputFiles({name:`photo-${i}.png`,mimeType:'image/png',buffer:pixel});await expect(page.locator('.gallery-thumbs>div')).toHaveCount(i+1);}
 await page.getByRole('button',{name:'Move gallery image 2 earlier'}).click();
 await page.reload();await expect(page.locator('.gallery-thumbs img').first()).toHaveAttribute('src','/api/files/b10cd424-dcda-4b15-8a3b-000000000002');
 await expect(page.getByRole('button',{name:'Move gallery image 1 earlier'})).toBeDisabled();
 await page.getByRole('button',{name:'Remove gallery image 1',exact:true}).click();await expect(page.locator('.gallery-thumbs>div')).toHaveCount(1);
});

test('language menu supports logos, aliases, multiple selections and custom languages',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 await page.getByLabel('Project title',{exact:true}).fill('Language picker sample project');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 const picker=page.locator('.language-picker'),input=picker.getByRole('combobox',{name:'Languages'});
 await input.fill('py');await picker.getByRole('option',{name:'Python Programming',exact:true}).click();
 await expect(picker.locator('.language-chip img')).toHaveAttribute('src','/images/languages/python.svg');
 await input.fill('cpp');await input.press('ArrowDown');await input.press('Enter');
 await expect(picker.getByRole('button',{name:'Remove language C++',exact:true})).toBeVisible();
 await input.fill('JS');await input.press('Enter');
 await expect(picker.getByRole('button',{name:'Remove language JavaScript',exact:true})).toBeVisible();
 await input.press('Escape');
 await picker.getByRole('button',{name:'Other / add a language',exact:true}).click();
 await picker.getByLabel('Other coding language',{exact:true}).fill('CampusLang');
 await picker.getByRole('button',{name:'Add language',exact:true}).click();
 await expect(picker.getByRole('button',{name:'Remove language CampusLang',exact:true})).toBeVisible();
 await page.reload();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(picker.locator('.language-chip')).toHaveCount(4);
 await picker.getByRole('button',{name:'Remove language C++',exact:true}).click();await expect(picker.locator('.language-chip')).toHaveCount(3);
 let saved:any;await page.route('**/api/projects',async route=>{saved=route.request().postDataJSON();await route.fulfill({json:{id:'language-project',versionId:'language-version'}});});
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved to your account.',{exact:false})).toBeVisible();
 expect(saved.data.stack.languages).toBe('Python, JavaScript, CampusLang');
});

test('all bundled language logos load locally',async({request})=>{
 const results=await Promise.all(languages.filter(language=>language.icon).map(async language=>{
  const response=await request.get(language.icon!);return {name:language.name,ok:response.ok()&&(await response.text()).includes('<svg')};
 }));
 expect(results.filter(result=>!result.ok)).toEqual([]);expect(results.length).toBeGreaterThan(60);
});

test('language choices fit a phone and custom names respect the stored field limit',async({page})=>{
 await mockSession(page);await page.setViewportSize({width:320,height:844});await page.goto('/submit');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 const picker=page.locator('.language-picker');await picker.scrollIntoViewIfNeeded();
 await picker.getByRole('button',{name:'Open language menu'}).click();
 await expect(picker.getByRole('option')).toHaveCount(languages.length+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await picker.getByRole('combobox').fill('not-a-listed-language');
 await picker.getByRole('option',{name:/Other language/}).click();
 const custom=picker.getByLabel('Other coding language',{exact:true});
 await custom.fill('x'.repeat(61));await custom.press('Enter');await expect(picker.getByRole('status')).toContainText('60 characters');
 await custom.fill(Array.from({length:6},(_,i)=>String(i)+'x'.repeat(49)).join(','));await custom.press('Enter');
 await expect(picker.getByRole('status')).toContainText('300 characters');
 await expect(picker.locator('.language-chip')).toHaveCount(0);
 await page.screenshot({path:'test-results/language-picker-mobile.png'});
});

test('technology picker supports keyboard choices, custom chips and refresh recovery',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 const input=page.getByRole('combobox',{name:'Technology tags'});
 expect(await input.evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(40);
 await input.focus();await input.press('ArrowUp');
 const lastChoice=page.getByRole('listbox',{name:'Technology suggestions'}).getByRole('option',{selected:true});
 await expect(lastChoice).toBeVisible();
 await expect.poll(async()=>{const option=(await lastChoice.boundingBox())!,list=(await page.getByRole('listbox',{name:'Technology suggestions'}).boundingBox())!;return option.y>=list.y&&option.y+option.height<=list.y+list.height;}).toBe(true);
 await input.fill('Type');await input.press('ArrowDown');await input.press('Enter');
 await expect(page.getByRole('button',{name:'Remove technology TypeScript',exact:true})).toBeVisible();
 await input.fill('Custom board, ESP32');await input.press('Enter');
 await input.fill('esp32');await input.press('Enter');
 await expect(page.locator('.tech-chip')).toHaveCount(3);
 await input.press('Escape');await expect(input).toHaveAttribute('aria-expanded','false');
 await page.getByLabel('Frontend',{exact:true}).fill('React');await page.reload();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(page.locator('.tech-chip')).toHaveCount(3);
 await expect(page.getByLabel('Frontend',{exact:true})).toHaveValue('React');
 await page.getByRole('button',{name:'Remove technology Custom board',exact:true}).click();
 await expect(page.locator('.tech-chip')).toHaveCount(2);
});

test('technology picker fits a dark mobile screen and rejects oversized tags',async({page})=>{
 await mockSession(page);await page.setViewportSize({width:320,height:844});await page.goto('/submit');
 await page.getByRole('button',{name:'Toggle navigation'}).click();await page.locator('.nav-mobile-theme').click();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 const input=page.getByRole('combobox',{name:'Technology tags'});
 await input.fill('x'.repeat(41));await input.press('Enter');
 await expect(page.getByRole('status').filter({hasText:'40 characters'})).toBeVisible();
 await expect(page.locator('.tech-chip')).toHaveCount(0);
 await input.fill('ESP');await page.getByRole('option',{name:'ESP32',exact:true}).click();
 await input.press('Escape');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.tech-tag-editor').screenshot({path:'test-results/technology-picker-mobile.png'});
});

for(const width of [320,834,1440]){
 test(`studio typography, introduction and form navigation fit ${width}px`,async({page})=>{
  await mockSession(page);await page.setViewportSize({width,height:1000});await page.goto('/submit');
  const start=page.getByRole('link',{name:'Let’s tell your story'});
  await expect(start).toBeVisible();expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:`test-results/studio-introduction-${width}.png`});
  await start.click();await expect(page).toHaveURL(/#studio-section-1$/);
  const title=page.getByLabel('Project title',{exact:true});
  await title.fill('A connected campus garden built by students, for students');
  expect(await title.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.locator('#studio-section-1').screenshot({path:`test-results/studio-form-${width}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const link of await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link').all())expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if(width===320){
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.getByRole('button',{name:'Toggle navigation'}).click();
   await page.locator('.nav-mobile-theme').click();
   await expect(page.locator('.platform')).toHaveClass(/dark/);
   await expect(title).toHaveValue('A connected campus garden built by students, for students');
  }
 });
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
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
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


test('stack presets preserve custom values, show icons and save after refresh',async({page})=>{
 await mockSession(page);await page.setViewportSize({width:390,height:844});await page.goto('/submit');
 await page.getByLabel('Project title',{exact:true}).fill('Stack preset testing project');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await page.getByLabel('Frontend',{exact:true}).fill('Existing custom interface');
 await page.getByRole('button',{name:'Choose frontend technologies',exact:true}).click();
 const menu=page.locator('.stack-presets-menu');
 await expect(menu.getByRole('button',{name:'React',exact:true}).locator('img')).toHaveAttribute('src','/images/technologies/react.svg');
 await menu.getByRole('button',{name:'React',exact:true}).click();
 await menu.getByRole('button',{name:'React',exact:true}).click();
 await expect(page.getByLabel('Frontend',{exact:true})).toHaveValue('Existing custom interface, React');
 await menu.getByRole('button',{name:'Other / type custom',exact:true}).click();
 await expect(page.getByLabel('Frontend',{exact:true})).toBeFocused();
 await page.getByLabel('Database',{exact:true}).fill('PostgreSQL (Neon DB)');
 const dbField=page.locator('.tech-stack-field').filter({has:page.getByLabel('Database',{exact:true})});
 await expect(dbField.locator('.stack-selected-logos img')).toHaveAttribute('src','/images/technologies/postgresql.svg');
 const frontend=page.locator('.tech-stack-field').filter({has:page.getByLabel('Frontend',{exact:true})});
 await expect(frontend.locator('.stack-selected-logos .pd-logo-orbit svg')).toHaveCount(1);
 await page.reload();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(page.getByLabel('Frontend',{exact:true})).toHaveValue('Existing custom interface, React');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 let saved:any;await page.route('**/api/projects',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{id:'stack-project',versionId:'stack-version'}});});
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Draft saved to your account.',{exact:false})).toBeVisible();
 expect(saved.data.stack.frontend).toBe('Existing custom interface, React');expect(saved.data.stack.database).toBe('PostgreSQL (Neon DB)');
});


test('named technology presets render their brand logos',async({page,request})=>{
 await mockSession(page);await page.goto('/submit');
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 const input=page.getByRole('combobox',{name:'Technology tags'});
 for(const name of ['Fastify','Laravel','Ruby on Rails','.NET','ROS','ROS 2','ESP32','PlatformIO']){
  await input.fill(name);
  const option=page.getByRole('option',{name,exact:true});
  const logo=option.locator('img');await expect(logo).toHaveCount(1);
  const response=await request.get((await logo.getAttribute('src'))!);
  expect(response.ok(),name).toBe(true);expect(await response.text()).toContain('<svg');
 }
 await input.fill('Machine Learning');
 await expect(page.getByRole('option',{name:'Machine Learning',exact:true}).locator('.pd-logo-orbit svg')).toHaveCount(1);
});


test('studio objects and introductions follow each step without resetting answers',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 const cookies=page.getByRole('button',{name:'Reject non-essential',exact:true});if(await cookies.isVisible())await cookies.click();
 await page.getByLabel('Project title',{exact:true}).fill('My preserved engineering project');
 const headings=['Your idea.','Great work.','Inside the build.','Show the spark.','What it took.','One last look.'];
 const nav=page.getByRole('navigation',{name:'Project form sections'});
 for(let i=0;i<6;i++){
  await nav.getByRole('link').nth(i).click();
  await expect(page.locator('.studio-hero h1')).toContainText(headings[i]);
  await expect(page.locator('.studio-step-object')).toHaveAttribute('data-object',String(i+1));
  await expect(page.locator('.studio-form-content')).toHaveAttribute('data-step',String(i+1));
 }
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.locator('.studio-step-object')).toHaveAttribute('data-object','5');
 await nav.getByRole('link').first().click();
 await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('My preserved engineering project');
 await page.locator('.studio-hero').screenshot({path:'test-results/studio-step-notebook.png'});
 await nav.getByRole('link').nth(2).click();
 await page.locator('.studio-hero').screenshot({path:'test-results/studio-step-board.png'});
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('.studio-step-object')).toBeVisible();
 await page.locator('.studio-hero').screenshot({path:'test-results/studio-step-mobile.png'});
});
