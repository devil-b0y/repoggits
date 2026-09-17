import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { emptyProject, profileSchema, type Project, type User, type VersionStatus } from '../lib/schema';

// The session and the workspace read are both answered here, so the controls are checked against a
// fixed set of projects rather than whatever a shared test schema happens to hold.
const user:User={id:randomUUID(),email:'controls@example.test',name:'Controls student',role:'student',verified:true,suspended:false,scopes:[],profile:profileSchema.parse({name:'Controls student'})};
// Written in the order the workspace read returns: most recently updated first.
const fixtures:[string,VersionStatus,string][]=[
  ['Zephyr sensor grid','draft','A weather rig for the roof.'],
  ['Aurora campus map','pending','Wayfinding for new students.'],
  ['Beacon lab tracker','approved','Booking for the shared lab.'],
  ['Cobalt route planner','changes_requested','Bus timings across campus.'],
  ['Delta archive','rejected','Older notes, kept tidy.'],
];
// An hour apart and newest first, matching the order the workspace read returns them in.
const projects:Project[]=fixtures.map(([title,status,summary],i)=>{
  const edited=new Date(Date.now()-i*3600_000).toISOString();
  return {id:randomUUID(),ownerId:user.id,featured:false,archived:false,example:false,views:0,downloads:0,stars:0,likes:0,parentProjectId:null,parentVersionId:null,
    version:{id:randomUUID(),projectId:'',number:1,status,data:{...emptyProject,title,summary,teamName:'Controls team'},changelog:'',createdAt:edited,updatedAt:edited,requiredApprovals:1,approvals:0}};
});
const titles=(page:Page)=>page.locator('.workspace-project h3');

test.beforeEach(async({page})=>{
  await page.route('**/api/auth/me',route=>route.fulfill({json:{user,uploadsAvailable:true,emailVerificationRequired:false}}));
  await page.route('**/api/workspace',route=>route.fulfill({json:{user,projects,saved:[],notifications:[]}}));
  await page.goto('/workspace');
  await expect(titles(page)).toHaveCount(projects.length);
});

test('filters narrow the list by review stage and mark the chosen one',async({page})=>{
  const tab=(name:string)=>page.getByRole('button',{name,exact:true});
  await expect(tab('All')).toHaveAttribute('aria-pressed','true');
  // A version with changes requested sits with its author, so it is listed as a draft.
  await tab('Draft').click();
  await expect(titles(page)).toHaveText(['Zephyr sensor grid','Cobalt route planner']);
  await expect(tab('Draft')).toHaveAttribute('aria-pressed','true');
  await expect(tab('Draft')).toHaveClass(/active/);
  await expect(tab('All')).toHaveAttribute('aria-pressed','false');
  await tab('In Review').click();
  await expect(titles(page)).toHaveText(['Aurora campus map']);
  await tab('Published').click();
  await expect(titles(page)).toHaveText(['Beacon lab tracker']);
  await tab('All').click();
  await expect(titles(page)).toHaveCount(projects.length);
});

test('search matches titles and summaries, and says so when nothing matches',async({page})=>{
  const search=page.getByRole('textbox',{name:'Search projects'});
  await search.fill('aurora');
  await expect(titles(page)).toHaveText(['Aurora campus map']);
  // Case is ignored and the summary counts too, not just the title.
  await search.fill('SHARED LAB');
  await expect(titles(page)).toHaveText(['Beacon lab tracker']);
  await search.fill('nothing here');
  await expect(titles(page)).toHaveCount(0);
  await expect(page.getByText('No projects match this search.')).toBeVisible();
  await search.fill('');
  await expect(titles(page)).toHaveCount(projects.length);
});

test('sorting reorders the list without changing which projects are shown',async({page})=>{
  const sort=page.getByRole('combobox',{name:'Sort projects'});
  const listed=fixtures.map(([title])=>title);
  await expect(titles(page)).toHaveText(listed);
  await sort.selectOption('Oldest');
  await expect(titles(page)).toHaveText([...listed].reverse());
  await sort.selectOption('A-Z');
  await expect(titles(page)).toHaveText([...listed].sort((a,b)=>a.localeCompare(b)));
  await sort.selectOption('Recently updated');
  await expect(titles(page)).toHaveText(listed);
});

test('the controls stay inside the screen at every width and keep usable touch targets',async({page})=>{
  // 768 and 900 are the in-between widths where the toolbar is still a single row.
  for(const width of [320,390,768,900,1280]) {
    await page.setViewportSize({width,height:800});
    await expect(page.locator('.workspace-toolbar')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`page fits ${width}px`).toBe(true);
    for(const name of ['All','Draft','In Review','Published']) {
      const box=(await page.getByRole('button',{name,exact:true}).boundingBox())!;
      expect(box.x+box.width,`${name} tab right edge at ${width}px`).toBeLessThanOrEqual(width);
      if(width<=760)expect(box.height,`${name} tab height at ${width}px`).toBeGreaterThanOrEqual(44);
    }
  }
  // Still working once stacked.
  await page.setViewportSize({width:320,height:720});
  await page.getByRole('button',{name:'Published',exact:true}).click();
  await expect(titles(page)).toHaveText(['Beacon lab tracker']);
});

test('the controls are set above the small-print size at every width',async({page})=>{
  for(const width of [390,900,1280]) {
    await page.setViewportSize({width,height:800});
    const sizes=await page.evaluate(()=>{
      const bar=document.querySelector('.workspace-toolbar')!;
      const size=(sel:string)=>parseFloat(getComputedStyle(bar.querySelector(sel)!).fontSize);
      return {tab:size('.filter-tabs button'),search:size('.search input'),sort:size('.workspace-sort select')};
    });
    for(const [part,size] of Object.entries(sizes))expect(size,`${part} at ${width}px`).toBeGreaterThanOrEqual(13);
    // A phone needs 16px on the fields it focuses, or the browser zooms the page in.
    if(width<=760)expect(sizes.search,'phone search input').toBeGreaterThanOrEqual(16);
  }
});

const card=(page:Page,title:string)=>page.locator('.workspace-project').filter({hasText:title});

test('each card carries its own edited time, visibility and review state',async({page})=>{
  const meta=(title:string)=>card(page,title).locator('.project-meta-line');
  // Fixtures are an hour apart, so the time comes from each version rather than the page load.
  await expect(meta('Zephyr sensor grid')).toContainText('Edited 1m ago');
  await expect(meta('Beacon lab tracker')).toContainText('Edited 2h ago');
  // A version only becomes readable by others once approved.
  await expect(meta('Zephyr sensor grid')).toContainText('Private');
  await expect(meta('Beacon lab tracker')).toContainText('Public');
  await expect(meta('Zephyr sensor grid')).toContainText('No reviews yet');
  await expect(meta('Aurora campus map')).toContainText('Awaiting review');
  await expect(meta('Beacon lab tracker')).toContainText('Published');
  await expect(meta('Cobalt route planner')).toContainText('Changes requested');
  await expect(meta('Delta archive')).toContainText('Not approved');
  // Small print: quieter than the description it sits under, and parted by a dot rather than a rule.
  const type=await page.evaluate(()=>{
    const line=document.querySelector('.project-meta-line')!;
    const summary=line.previousElementSibling!;
    const parts=line.querySelectorAll('span');
    return {meta:parseFloat(getComputedStyle(line).fontSize),summary:parseFloat(getComputedStyle(summary).fontSize),
      firstSeparator:getComputedStyle(parts[0],'::before').content,laterSeparator:getComputedStyle(parts[1],'::before').content};
  });
  expect(type.meta).toBeLessThan(type.summary);
  expect(type.meta).toBeGreaterThanOrEqual(12);
  expect(type.firstSeparator).toBe('none');
  expect(type.laterSeparator).toContain('·');
});

test('the card menu offers rename on a draft and a link only once published',async({page})=>{
  const draft=card(page,'Zephyr sensor grid'),published=card(page,'Beacon lab tracker');
  await draft.getByRole('button',{name:/More actions/}).click();
  await expect(draft.getByRole('menuitem',{name:'Rename'})).toBeEnabled();
  await expect(draft.getByRole('menuitem',{name:'Share'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(draft.getByRole('menuitem',{name:'Rename'})).toHaveCount(0);
  await published.getByRole('button',{name:/More actions/}).click();
  await expect(published.getByRole('menuitem',{name:'Rename'})).toBeDisabled();
  await expect(published.getByRole('menuitem',{name:'Share'})).toBeEnabled();
});

test('renaming a draft writes through the version endpoint the editor already uses',async({page})=>{
  let sent:{method:string;body:{data?:{title?:string};submit?:boolean;changelog?:string}}|null=null;
  await page.route('**/api/versions/*',async route=>{
    sent={method:route.request().method(),body:route.request().postDataJSON()};
    await route.fulfill({json:{ok:true}});
  });
  // Anchored on the summary: while renaming, the title is an input value rather than card text.
  const draft=card(page,'A weather rig for the roof.');
  await draft.getByRole('button',{name:/More actions/}).click();
  await draft.getByRole('menuitem',{name:'Rename'}).click();
  await draft.getByLabel('Project title').fill('Zephyr weather rig');
  await draft.getByRole('button',{name:'Save name'}).click();
  await expect.poll(()=>sent?.body.data?.title).toBe('Zephyr weather rig');
  expect(sent!.method).toBe('PATCH');
  // Renaming must not submit the version for review or discard its changelog.
  expect(sent!.body.submit).toBe(false);
  expect(sent!.body.changelog).toBe('');
});

test('the existing view and edit actions are untouched',async({page})=>{
  const draft=card(page,'Zephyr sensor grid');
  await expect(draft.getByRole('link',{name:/View version/})).toHaveAttribute('href',/\/projects\/[^?]+\?version=/);
  await expect(draft.getByRole('link',{name:'Continue editing'})).toHaveAttribute('href',/\/submit\?project=/);
  await expect(draft.locator('.status-tag')).toHaveText('draft');
  await expect(draft.locator('.version-label')).toHaveText('Version 1');
  await expect(draft.locator('h3')).toHaveText('Zephyr sensor grid');
});

test('a filter and a search apply together',async({page})=>{
  await page.getByRole('button',{name:'Draft',exact:true}).click();
  await page.getByRole('textbox',{name:'Search projects'}).fill('route');
  await expect(titles(page)).toHaveText(['Cobalt route planner']);
  // The count beside the heading follows what is actually listed.
  await expect(page.locator('.count-label')).toHaveText('1');
});
