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
  return {id:randomUUID(),ownerId:user.id,featured:false,archived:false,example:false,views:0,downloads:0,stars:0,likes:0,parentProjectId:null,parentVersionId:null,modificationId:null,
    version:{id:randomUUID(),projectId:'',number:1,status,data:{...emptyProject,title,summary,teamName:'Controls team'},changelog:'',createdAt:edited,updatedAt:edited,requiredApprovals:1,approvals:0}};
});
const titles=(page:Page)=>page.locator('.workspace-project h3');
const ago=(ms:number)=>new Date(Date.now()-ms).toISOString();
// Written exactly as the review flow writes them, including the one for a project since renamed.
const notifications=[
  {id:'n1',message:'Cobalt route planner · version 1: changes requested. Please add a test plan.',project_id:'',read:false,created_at:ago(30*60_000)},
  {id:'n2',message:'Beacon lab tracker · version 1: approved.',project_id:'',read:true,created_at:ago(2*3600_000)},
  {id:'n3',message:'Aurora campus map · version 1: pending (1/2 approvals).',project_id:'',read:true,created_at:ago(24*3600_000)},
  {id:'n4',message:'What it used to be called · version 1: rejected.',project_id:'',read:true,created_at:ago(3*24*3600_000)},
];
const saved:Project[]=([['Lumen study lamp','Bright Sparks','A desk lamp that follows the light in the room.'],
  ['Tide water monitor','River Watch','Sensors that warn before the bank floods.']] as const).map(([title,teamName,summary])=>({
  id:randomUUID(),ownerId:randomUUID(),featured:false,archived:false,example:false,views:0,downloads:0,stars:0,likes:0,parentProjectId:null,parentVersionId:null,modificationId:null,
  version:{id:randomUUID(),projectId:'',number:1,status:'approved' as const,data:{...emptyProject,title,summary,teamName},changelog:'',createdAt:ago(0),updatedAt:ago(0),requiredApprovals:1,approvals:1},
}));
async function withSaved(page:Page) {
  await page.route('**/api/workspace',route=>route.fulfill({json:{user,projects,saved,notifications:[]}}));
  await page.reload();
  await expect(page.locator('.saved-card')).toHaveCount(saved.length);
}
async function withUpdates(page:Page) {
  notifications[0].project_id=projects[3].id;notifications[1].project_id=projects[2].id;
  notifications[2].project_id=projects[1].id;notifications[3].project_id=projects[4].id;
  await page.route('**/api/workspace',route=>route.fulfill({json:{user,projects,saved:[],notifications}}));
  await page.reload();
  await expect(page.locator('.notification')).toHaveCount(notifications.length);
}

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

test('the resume panel points at the newest draft and stays smaller than a project card',async({page})=>{
  const resume=page.locator('.resume-panel');
  await expect(resume).toHaveCount(1);
  await expect(resume).toContainText('CONTINUE WHERE YOU LEFT OFF');
  // Zephyr is the newest editable one; Aurora is newer overall but is already in review.
  await expect(resume.locator('h3')).toHaveText('Zephyr sensor grid');
  await expect(resume).toContainText('Version 1');
  await expect(resume).toContainText('Last edited 1 minute ago');
  await expect(resume.getByRole('link',{name:/Continue editing/})).toHaveAttribute('href',`/submit?project=${projects[0].id}&version=${projects[0].version.id}`);
  // It sits above the projects heading, and is the shorter of the two.
  const [top,heading,card]=await Promise.all([resume.boundingBox(),page.locator('.workspace-layout h2').first().boundingBox(),page.locator('.workspace-project').first().boundingBox()]);
  expect(top!.y).toBeLessThan(heading!.y);
  expect(top!.height).toBeLessThan(card!.height);
});

test('the resume panel is absent when nothing is left to pick up',async({page})=>{
  // Every project already published: there is no draft to continue.
  const published=projects.map(p=>({...p,version:{...p.version,status:'approved' as const}}));
  await page.route('**/api/workspace',route=>route.fulfill({json:{user,projects:published,saved:[],notifications:[]}}));
  await page.reload();
  await expect(titles(page)).toHaveCount(published.length);
  await expect(page.locator('.resume-panel')).toHaveCount(0);
  // And absent again when there are no projects at all.
  await page.route('**/api/workspace',route=>route.fulfill({json:{user,projects:[],saved:[],notifications:[]}}));
  await page.reload();
  await expect(page.getByText('A blank page is a good beginning.')).toBeVisible();
  await expect(page.locator('.resume-panel')).toHaveCount(0);
});

test('saved projects show as compact cards with their creator and both actions',async({page})=>{
  await withSaved(page);
  const card=page.locator('.saved-card').filter({hasText:'Lumen study lamp'});
  await expect(card).toContainText('Bright Sparks');
  await expect(card).toContainText('A desk lamp that follows the light in the room.');
  await expect(card.getByRole('link',{name:/View project/})).toHaveAttribute('href',`/projects/${saved[0].id}`);
  await expect(card.getByRole('button',{name:'Remove from saved'})).toBeVisible();
  // Compact: shorter than a project card, and it does not pull in a cover image.
  const [savedBox,projectBox]=await Promise.all([card.boundingBox(),page.locator('.workspace-project').first().boundingBox()]);
  expect(savedBox!.height).toBeLessThan(projectBox!.height);
  await expect(card.locator('img')).toHaveCount(0);
});

test('removing a saved project asks the bookmark endpoint to drop it',async({page})=>{
  await withSaved(page);
  let sent:{url:string;body:{saved?:boolean}}|null=null;
  await page.route('**/api/projects/*/bookmark',async route=>{
    sent={url:route.request().url(),body:route.request().postDataJSON()};
    await route.fulfill({json:{saved:false}});
  });
  await page.locator('.saved-card').filter({hasText:'Tide water monitor'}).getByRole('button',{name:'Remove from saved'}).click();
  await expect.poll(()=>sent?.body.saved).toBe(false);
  expect(sent!.url).toContain(`/api/projects/${saved[1].id}/bookmark`);
});

test('the saved empty state keeps its wording and stays a single quiet row',async({page})=>{
  await expect(page.getByText('Save a published project from its detail page to keep it here.')).toBeVisible();
  await expect(page.locator('.saved-card')).toHaveCount(0);
  const empty=page.locator('.saved-empty');
  // Minimal: no illustration, one small icon, and short enough not to leave a hole in the page.
  await expect(empty.locator('img')).toHaveCount(0);
  const box=(await empty.boundingBox())!;
  expect(box.height).toBeLessThan(110);
  const icon=(await empty.locator('svg').first().boundingBox())!;
  expect(icon.height).toBeLessThanOrEqual(24);
});

test('the updates panel keeps its empty message until something has happened',async({page})=>{
  await expect(page.getByText('Your review updates will arrive here.')).toBeVisible();
  await expect(page.locator('.notification')).toHaveCount(0);
  // The heading and its bell stay either way.
  await expect(page.locator('.aside-heading h2')).toContainText('Updates');
  await expect(page.locator('.aside-heading h2 svg')).toBeVisible();
});

test('updates read as an activity feed with an event, a project and a relative time',async({page})=>{
  await withUpdates(page);
  await expect(page.getByText('Your review updates will arrive here.')).toHaveCount(0);
  const entry=(n:number)=>page.locator('.notification').nth(n);
  await expect(entry(0)).toContainText('Changes requested on Cobalt route planner');
  await expect(entry(0)).toContainText('Please add a test plan.');
  await expect(entry(0)).toContainText('30 minutes ago');
  await expect(entry(1)).toContainText('Project published on Beacon lab tracker');
  await expect(entry(1)).toContainText('2 hours ago');
  // A part-way review reports its progress rather than the raw message.
  await expect(entry(2)).toContainText('Review received on Aurora campus map');
  await expect(entry(2)).toContainText('1 of 2 approvals');
  await expect(entry(2)).toContainText('1 day ago');
  // The project is named from the project itself, so a rename does not leave an update stale.
  await expect(entry(3)).toContainText('Not approved on Delta archive');
  await expect(entry(3)).not.toContainText('What it used to be called');
  for(let i=0;i<4;i++)await expect(entry(i).locator('.update-line svg')).toBeVisible();
  // Each entry still opens its project.
  await expect(entry(1)).toHaveAttribute('href',`/projects/${projects[2].id}`);
});

test('updates stay plain rather than becoming coloured cards',async({page})=>{
  await withUpdates(page);
  const look=await page.evaluate(()=>{
    const entry=document.querySelector('.notification')!;
    const panel=document.querySelector('.workspace-project')!;
    const icon=entry.querySelector('.update-line svg')!;
    return {background:getComputedStyle(entry).backgroundColor,panelBackground:getComputedStyle(panel).backgroundColor,
      iconColor:getComputedStyle(icon).color,detailColor:getComputedStyle(entry.querySelector('.update-detail')!).color};
  });
  // Same surface as every other panel, and the icon carries no colour of its own.
  expect(look.background).toBe(look.panelBackground);
  expect(look.iconColor).toBe(look.detailColor);
});

const SCREENS=[{name:'desktop',width:1440,columns:2},{name:'laptop',width:1280,columns:2},
  {name:'tablet landscape',width:1024,columns:2},{name:'tablet portrait',width:768,columns:1},
  {name:'mobile',width:390,columns:1},{name:'small mobile',width:320,columns:1}] as const;

test('the whole workspace fits every screen without sideways scrolling',async({page})=>{
  await withSaved(page);
  await page.route('**/api/workspace',route=>route.fulfill({json:{user,projects,saved,notifications}}));
  await page.reload();
  for(const screen of SCREENS) {
    await page.setViewportSize({width:screen.width,height:900});
    await expect(page.locator('.workspace-project').first()).toBeVisible();
    const report=await page.evaluate(()=>{
      const wider=[...document.querySelectorAll('.workspace-page *')]
        .filter(el=>el.getBoundingClientRect().right>window.innerWidth+1).map(el=>el.className.toString()||el.tagName);
      const layout=document.querySelector('.workspace-layout')!;
      return {overflow:document.documentElement.scrollWidth>window.innerWidth,wider:wider.slice(0,4),
        columns:getComputedStyle(layout).gridTemplateColumns.split(' ').length};
    });
    expect(report.overflow,`${screen.name} scrolls sideways`).toBe(false);
    expect(report.wider,`${screen.name} has elements past the edge`).toEqual([]);
    // Projects beside updates on the wider screens, stacked from a tablet held upright down.
    expect(report.columns,`${screen.name} columns`).toBe(screen.columns);
  }
});

test('card actions stay reachable and finger-sized on a phone',async({page})=>{
  await withSaved(page);
  await page.setViewportSize({width:390,height:844});
  const first=page.locator('.workspace-project').first();
  // The menu does not depend on hovering, since a phone cannot hover.
  const trigger=first.getByRole('button',{name:/More actions/});
  // Revealing it is a 200ms fade, so this settles rather than reading mid-transition.
  await expect.poll(()=>trigger.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  const triggerBox=(await trigger.boundingBox())!;
  expect(Math.min(triggerBox.width,triggerBox.height)).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const item=first.getByRole('menuitem',{name:'Rename'});
  const itemBox=(await item.boundingBox())!;
  expect(itemBox.height).toBeGreaterThanOrEqual(44);
  // The menu opens inside the screen rather than off the right edge.
  expect(itemBox.x).toBeGreaterThanOrEqual(0);
  expect(itemBox.x+itemBox.width).toBeLessThanOrEqual(390);
  await item.click();
  await expect(first.getByLabel('Project title')).toBeVisible();
  // Renaming, and the actions under every card, stay on screen too.
  for(const name of ['Save name','Cancel'])expect((await first.getByRole('button',{name}).boundingBox())!.x+(await first.getByRole('button',{name}).boundingBox())!.width).toBeLessThanOrEqual(390);
  await first.getByRole('button',{name:'Cancel'}).click();
  await expect(first.getByRole('link',{name:/View version/})).toBeVisible();
  await expect(first.getByRole('link',{name:'Continue editing'})).toBeVisible();
});

test('cards and buttons answer the pointer without lifting, glowing or casting shadows',async({page})=>{
  await withSaved(page);
  const card=page.locator('.workspace-project').first();
  const resting=await card.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderColor,background:s.backgroundColor};});
  await card.hover();
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).borderColor)).not.toBe(resting.border);
  const hovered=await card.evaluate(el=>{const s=getComputedStyle(el);
    return {background:s.backgroundColor,transform:s.transform,shadow:s.boxShadow,image:s.backgroundImage,filter:s.filter,backdrop:s.backdropFilter};});
  expect(hovered.background).not.toBe(resting.background);
  // None of the treatments that were ruled out.
  expect(hovered.transform,'card must not lift or scale').toBe('none');
  expect(hovered.shadow,'card must not cast a shadow').toBe('none');
  expect(hovered.image,'card must not gain a gradient').toBe('none');
  expect(hovered.filter+hovered.backdrop,'card must not glow or blur behind').toBe('nonenone');
  // A text action answers the pointer too.
  const action=card.getByRole('link',{name:/View version/});
  const before=await action.evaluate(el=>getComputedStyle(el).color);
  await action.hover();
  await expect.poll(()=>action.evaluate(el=>getComputedStyle(el).color)).not.toBe(before);
});

test('the menu fades in and focus is visible inside it',async({page})=>{
  await withSaved(page);
  const card=page.locator('.workspace-project').first();
  await card.getByRole('button',{name:/More actions/}).click();
  const list=card.locator('.card-menu-list');
  const opening=await list.evaluate(el=>{const s=getComputedStyle(el);
    return {name:s.animationName,duration:s.animationDuration,shadow:s.boxShadow,backdrop:s.backdropFilter,image:s.backgroundImage};});
  expect(opening.name).toBe('workspace-menu-open');
  // Quick enough to feel immediate rather than animated at the viewer.
  expect(parseFloat(opening.duration)).toBeLessThanOrEqual(0.2);
  expect(opening.shadow+opening.backdrop+opening.image).toBe('nonenonenone');
  // Reached by keyboard, since :focus-visible deliberately ignores focus moved by script after a click.
  await page.keyboard.press('Tab');
  const item=card.getByRole('menuitem',{name:'Rename'});
  await expect(item).toBeFocused();
  const focused=await item.evaluate(el=>{const s=getComputedStyle(el);return {width:s.outlineWidth,style:s.outlineStyle,offset:s.outlineOffset};});
  expect(focused.style).toBe('solid');
  expect(parseFloat(focused.width)).toBeGreaterThanOrEqual(2);
  expect(parseFloat(focused.offset)).toBeLessThanOrEqual(0);
});

test('a filter and a search apply together',async({page})=>{
  await page.getByRole('button',{name:'Draft',exact:true}).click();
  await page.getByRole('textbox',{name:'Search projects'}).fill('route');
  await expect(titles(page)).toHaveText(['Cobalt route planner']);
  // The count beside the heading follows what is actually listed.
  await expect(page.locator('.count-label')).toHaveText('1');
});
