import {test,expect,type Page} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {aiTools,aiToolsFor,findAiTool,NO_AI} from '../lib/ai-tools';
import {technologyLogo} from '../components/platform/ProjectIdentity';

async function openStack(page:Page,title='AI picker sample project'){
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'ai-picker-student',name:'Sample Maker',email:'maker@example.test',role:'student',verified:true,suspended:false,scopes:[],profile:{department:'Computer Science'}},uploadsAvailable:true,emailVerificationRequired:false}}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['Computer Science'],subjects:['Final Year Project'],tags:['TypeScript']}}}));
 await page.goto('/submit');await page.getByRole('button',{name:'Reject non-essential',exact:true}).click({timeout:5000}).catch(()=>{});
 await page.getByLabel('Project title',{exact:true}).fill(title);
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
}

test('every AI tool has a unique name and a bundled logo',()=>{
 const names=aiTools.map(tool=>tool.name.toLowerCase());
 expect(new Set(names).size).toBe(names.length);
 expect(aiTools.length).toBeGreaterThan(50);
 for(const tool of aiTools){
  expect(['both','project','coding'],tool.name).toContain(tool.use);
  // Values are stored comma-separated, so a comma in a name would split it into two answers.
  expect(tool.name.includes(','),tool.name).toBe(false);
  expect(existsSync(`public${tool.icon}`),`${tool.name} logo file`).toBe(true);
  expect(readFileSync(`public${tool.icon}`,'utf8'),tool.name).toContain('<svg');
 }
});

test('each question lists its own tools, with logos shared with the project page',()=>{
 const project=aiToolsFor('project').map(tool=>tool.name),coding=aiToolsFor('coding').map(tool=>tool.name);
 expect(project).toEqual(expect.arrayContaining(['ChatGPT','Claude','Gemini','Hugging Face']));
 expect(project).not.toContain('GitHub Copilot');
 expect(coding).toEqual(expect.arrayContaining(['ChatGPT','GitHub Copilot','Cursor','Claude Code']));
 expect(coding).not.toContain('Hugging Face');
 expect(aiToolsFor('coding')[0].use).toBe('coding');
 expect(findAiTool('chatgpt')?.icon).toBe('/images/ai-tools/chatgpt.svg');
 expect(findAiTool('openai')).toBeUndefined();
 expect(technologyLogo('Claude')).toBe('/images/ai-tools/claude.svg');
 expect(technologyLogo('CampusBot')).toBeUndefined();
 expect(technologyLogo(NO_AI)).toBeUndefined();
});

test('all bundled AI logos are served',async({request})=>{
 const results=await Promise.all(aiTools.map(async tool=>{const response=await request.get(tool.icon);return {name:tool.name,ok:response.ok()&&(await response.text()).includes('<svg')};}));
 expect(results.filter(result=>!result.ok)).toEqual([]);
});

test('AI pickers search with logos, add custom tools, replace answers with "No AI used" and save both answers',async({page})=>{
 await openStack(page);
 const project=page.locator('.ai-picker').nth(0),coding=page.locator('.ai-picker').nth(1);
 await expect(project.getByRole('combobox',{name:'AI tools in your project'})).toBeVisible();
 await expect(coding.getByRole('combobox',{name:'AI tools used for coding'})).toBeVisible();

 await project.getByRole('combobox').fill('hugging');await project.getByRole('option',{name:/Hugging Face/}).click();
 await expect(project.locator('.ai-chip img')).toHaveAttribute('src','/images/ai-tools/hugging-face.svg');
 await project.getByRole('combobox').fill('copilot');
 await expect(project.getByRole('option',{name:/Microsoft Copilot/})).toBeVisible();
 await expect(project.getByRole('option',{name:/GitHub Copilot/})).toHaveCount(0);

 await coding.getByRole('combobox').fill('copilot');
 await expect(coding.getByRole('option',{name:/GitHub Copilot/})).toBeVisible();
 await coding.getByRole('combobox').press('ArrowDown');await coding.getByRole('combobox').press('Enter');
 await expect(coding.getByRole('button',{name:'Remove AI tool GitHub Copilot',exact:true})).toBeVisible();
 await coding.getByRole('combobox').press('Escape');
 await coding.getByRole('button',{name:'Other / add an AI tool',exact:true}).click();
 await coding.getByLabel('Other AI tool',{exact:true}).fill('CampusBot');
 await coding.getByRole('button',{name:'Add tool',exact:true}).click();
 await expect(coding.getByRole('button',{name:'Remove AI tool CampusBot',exact:true})).toBeVisible();

 // "No AI used" replaces the other answers, and choosing a real tool afterwards replaces it.
 await project.getByRole('button',{name:/I didn.t use AI/}).click();
 await expect(project.locator('.ai-chip')).toHaveCount(1);
 await expect(project.locator('.ai-chip')).toContainText(NO_AI);
 await expect(project.getByRole('button',{name:'Remove AI tool Hugging Face'})).toHaveCount(0);
 await expect(project.getByRole('button',{name:/I didn.t use AI/})).toHaveAttribute('aria-pressed','true');
 await project.getByRole('combobox').fill('chatgpt');await project.getByRole('option',{name:/ChatGPT/}).click();
 await expect(project.locator('.ai-chip')).toHaveCount(1);
 await expect(project.getByRole('button',{name:'Remove AI tool ChatGPT',exact:true})).toBeVisible();
 await project.getByRole('combobox').press('Escape');
 await project.getByRole('button',{name:/I didn.t use AI/}).click();
 await expect(project.locator('.ai-chip')).toContainText(NO_AI);
 await project.getByRole('combobox').fill('');await project.getByRole('combobox').focus();
 await page.screenshot({path:'test-results/ai-pickers-desktop.png'});

 await page.reload();
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/Under the hood/}).click();
 await expect(project.locator('.ai-chip')).toHaveCount(1);await expect(project.locator('.ai-chip')).toContainText(NO_AI);
 await expect(coding.locator('.ai-chip')).toHaveCount(2);

 let saved:any;await page.route('**/api/projects',async route=>{saved=route.request().postDataJSON();await route.fulfill({json:{id:'ai-project',versionId:'ai-version'}});});
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved to your account.',{exact:false})).toBeVisible();
 expect(saved.data.stack.aiTools).toBe(NO_AI);expect(saved.data.stack.aiCoding).toBe('GitHub Copilot, CampusBot');
});

test('answering only the AI questions does not tick "Tools & technologies"',async({page})=>{
 await openStack(page);
 const item=page.locator('.studio-checklist li').filter({hasText:'Tools & technologies'});
 await page.locator('.ai-picker').nth(1).getByRole('button',{name:/I didn.t use AI/}).click();
 await expect(page.locator('.ai-picker').nth(1).locator('.ai-chip')).toContainText(NO_AI);
 await expect(item).not.toHaveClass(/is-done/);
 await page.getByLabel('Frontend',{exact:true}).fill('React');
 await expect(item).toHaveClass(/is-done/);
});

test('AI menus fit a phone and custom names respect the stored field limit',async({page})=>{
 await page.setViewportSize({width:320,height:844});await openStack(page);
 const picker=page.locator('.ai-picker').nth(1);await picker.scrollIntoViewIfNeeded();
 await picker.getByRole('button',{name:'Open AI tools used for coding menu'}).click();
 const list=picker.getByRole('listbox');await expect(list).toBeVisible();
 await expect(picker.getByRole('option')).toHaveCount(aiToolsFor('coding').length+2);
 const box=(await list.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
 // Scoped to the pickers: the studio's step navigation is not part of this feature.
 expect(await page.evaluate(()=>[...document.querySelectorAll('.ai-picker, .ai-picker *')].filter(el=>el.getBoundingClientRect().right>innerWidth+.5).map(el=>el.className))).toEqual([]);
 await page.screenshot({path:'test-results/ai-pickers-mobile.png'});
 await picker.getByRole('option',{name:/Other tool/}).click();
 const custom=picker.getByLabel('Other AI tool',{exact:true});
 await custom.fill('x'.repeat(61));await custom.press('Enter');await expect(picker.getByRole('status')).toContainText('60 characters');
 await custom.fill(Array.from({length:6},(_,i)=>String(i)+'x'.repeat(49)).join(','));await custom.press('Enter');
 await expect(picker.getByRole('status')).toContainText('300 characters');
 await expect(picker.locator('.ai-chip')).toHaveCount(0);
});
