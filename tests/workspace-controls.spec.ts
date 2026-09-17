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
const projects:Project[]=fixtures.map(([title,status,summary])=>({
  id:randomUUID(),ownerId:user.id,featured:false,archived:false,example:false,views:0,downloads:0,stars:0,likes:0,parentProjectId:null,parentVersionId:null,
  version:{id:randomUUID(),projectId:'',number:1,status,data:{...emptyProject,title,summary,teamName:'Controls team'},changelog:'',createdAt:new Date().toISOString(),requiredApprovals:1,approvals:0},
}));
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

test('a filter and a search apply together',async({page})=>{
  await page.getByRole('button',{name:'Draft',exact:true}).click();
  await page.getByRole('textbox',{name:'Search projects'}).fill('route');
  await expect(titles(page)).toHaveText(['Cobalt route planner']);
  // The count beside the heading follows what is actually listed.
  await expect(page.locator('.count-label')).toHaveText('1');
});
