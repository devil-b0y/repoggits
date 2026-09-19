import {test,expect,type Page} from '@playwright/test';
import {emptyProject} from '../lib/schema';
const id='11111111-1111-4111-8111-111111111111';
const fixture={project:{id,ownerId:'owner',featured:false,archived:false,views:248,downloads:36,stars:18,likes:9,parentProjectId:null,parentVersionId:null,example:false,version:{id:'version-one',projectId:id,number:2,status:'approved',changelog:'Improved the planning experience.',createdAt:'2026-08-22T12:00:00Z',requiredApprovals:1,approvals:1,data:{...emptyProject,title:'CampusFlow',summary:'A calmer workspace for everything you are building.',description:'Bring tasks, ideas, and documentation into one thoughtful workspace.\nBuilt for students who want to focus on the work that matters.',teamName:'Campus Makers',tags:['JavaScript','HTML','CSS','React','LocalStorage','Student productivity'],stack:{frontend:'React, Next.js',backend:'Node.js',database:'Browser LocalStorage',languages:'JavaScript, HTML, CSS',frameworks:'React',tools:'Playwright, Figma'},team:[{name:'Aarav Sharma',email:'aarav@example.test',contribution:'Frontend development & interaction design',college:'GGITS',branch:'Computer Science',semester:'6',photoId:''},{name:'Ananya Verma',email:'ananya@example.test',contribution:'Product design & quality assurance',college:'GGCT',branch:'Information Technology',semester:'6',photoId:''}],features:['Organize tasks and milestones in one workspace','Keep your documentation close to your code','Designed for smaller screens, too','Save your progress as you build'],services:[{name:'Vercel',purpose:'Frontend hosting and preview deployments',url:'https://vercel.com'}],startDate:'2026-08-01',endDate:'2026-08-22',year:'2026',subject:'Mini Project',coverId:'cover',galleryIds:['photo-two'],sourceId:'source',videoUrl:'/samples/campusflow/demo.webm',liveUrl:'/samples/campusflow/index.html',github:'https://github.com/example/campusflow',softwareCosts:[{name:'Hosting',amount:0}],hardwareCosts:[]}}},editable:false,saved:false,starred:false,liked:false,original:null,modifications:[],versions:[{id:'version-one',number:2,status:'approved',changelog:'Improved the planning experience.',createdAt:'2026-08-22T12:00:00Z'}],comments:[],reviews:[],related:[]};
async function setup(page:Page,customize?:(data:typeof fixture)=>void){
 const data=structuredClone(fixture);customize?.(data);data.project.version.data.videoUrl=new URL('/samples/campusflow/demo.webm',process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3107').href;
 await page.addInitScript(()=>{if(!localStorage.getItem('repoggits-theme'))localStorage.setItem('repoggits-theme','dark');});
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'viewer',name:'Viewer',role:'student',verified:true},emailVerificationRequired:false,uploadsAvailable:true}}));
 await page.route(`**/api/projects/${id}**`,async r=>{const url=new URL(r.request().url());if(url.pathname.endsWith('/reactions')){const body=r.request().postDataJSON();data[body.kind==='star'?'starred':'liked']=body.active;data.project[body.kind==='star'?'stars':'likes']+=body.active?1:-1;return r.fulfill({json:{active:body.active,stars:data.project.stars,likes:data.project.likes}});}if(url.pathname.endsWith('/bookmark')){data.saved=r.request().postDataJSON().saved;return r.fulfill({json:{ok:true}});}if(url.pathname.endsWith('/view'))return r.fulfill({json:{ok:true}});return r.fulfill({json:data});});
 await page.route('**/api/files/**',r=>r.fulfill({path:'public/images/workshop/campusflow.webp',contentType:'image/webp'}));
 await page.goto(`/projects/${id}`);await expect(page.getByRole('heading',{name:'CampusFlow',exact:true})).toBeVisible();
 // A test may call setup again with different data; the consent banner only shows until a choice is stored.
 if(await page.evaluate(()=>!localStorage.getItem('repoggits-cookie-consent')))await page.getByRole('button',{name:'Reject non-essential',exact:true}).click();
}
test('project identity, circular logos and team details render without altering the demo',async({page})=>{
 await setup(page);await page.screenshot({path:'test-results/detail-top-dark.png'});
 await expect(page.getByRole('region',{name:'Project summary'})).toContainText('Campus Makers');await expect(page.locator('.pd-summary-stats dd')).toHaveText(['2026','v2','248','36']);await expect(page.locator('.pd-review-badge')).toHaveText('approved');await expect(page.locator('.pd-summary-team')).toHaveAttribute('href','#project-team');await page.locator('.pd-summary').screenshot({path:'test-results/detail-summary.png'});
 await expect(page.locator('.pd-technologies .tech-badges .pd-logo-orbit')).toHaveCount(6);
 await expect(page.locator('.pd-technologies .tech-badges img[src="/images/technologies/react.svg"]')).toBeVisible();await page.locator('.pd-technologies').scrollIntoViewIfNeeded();await expect.poll(()=>page.locator('.pd-technologies img').evaluateAll(els=>els.every(el=>(el as HTMLImageElement).complete))).toBeTruthy();await page.screenshot({path:'test-results/detail-stack-dark.png'});
 await expect(page.locator('.pd-team-card')).toHaveCount(2);await expect(page.locator('.pd-team-card').first()).toContainText('GGITS');
 await expect(page.locator('.pd-member-initials').first()).toHaveText('AS');await page.locator('.pd-team-section').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/detail-team-dark.png'});
 await expect(page.locator('.media-heading h3')).toHaveText('Project Demo');
 await expect(page.locator('.media-stage')).toHaveCSS('aspect-ratio','16 / 10');
 await expect(page.locator('.media-stage')).toHaveCSS('border-radius','9px');
 await expect(page.getByRole('button',{name:'Show project photo 2'})).toHaveCSS('height','85px');
 await page.getByRole('button',{name:'Show project photo 2'}).click();await expect(page.locator('.media-photo')).toHaveAttribute('src','/api/files/photo-two');
 await page.getByRole('button',{name:'Watch working demo'}).click();await expect(page.locator('video.video-frame')).toBeVisible();
});
test('stars, likes and saving still work after visual changes',async({page})=>{
 await setup(page);for(const name of ['Star project','Like project']){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');}
 await page.getByRole('button',{name:'Save project',exact:true}).click();await expect(page.getByRole('button',{name:'Remove from saved'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Live demo',exact:true})).toHaveAttribute('href','/samples/campusflow/index.html');
 await expect(page.getByRole('button',{name:'Download source',exact:true})).toBeEnabled();
});
test('failed technology images have meaningful icon fallbacks',async({page})=>{
 await page.route('**/images/technologies/react.svg',r=>r.abort());await setup(page);
 await expect(page.locator('.pd-technologies .tech-badges .pd-tech-token').filter({hasText:/^React$/}).locator('.pd-logo-orbit svg')).toBeVisible();
});
test('lineage banner is large, uses the display font and stays readable in dark mode',async({page})=>{
 const channel=(v:number)=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
 const luminance=(rgb:string)=>{const [r,g,b]=rgb.match(/\d+/g)!.map(Number);return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);};
 const contrast=(a:string,b:string)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05);};
 await setup(page,data=>{Object.assign(data.project,{parentProjectId:'22222222-2222-4222-8222-222222222222',parentVersionId:'original-version'});Object.assign(data,{original:{id:'22222222-2222-4222-8222-222222222222',version_id:'original-version',title:'CampusFlow — your semester, a little more organised',number:1,team_name:'Campus Makers'}});});
 const banner=page.locator('.lineage-banner');await banner.scrollIntoViewIfNeeded();
 await expect(banner.getByRole('link',{name:'CampusFlow — your semester, a little more organised, version 1'})).toHaveAttribute('href','/projects/22222222-2222-4222-8222-222222222222?version=original-version');
 const heading=banner.locator('strong');
 await expect(heading).toHaveCSS('font-size','22px');expect(await heading.evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Space Grotesk');
 await expect(banner.locator('p')).toHaveCSS('font-size','17px');
 const background=await banner.evaluate(el=>getComputedStyle(el).backgroundColor);
 for(const target of [heading,banner.locator('p'),banner.getByRole('link')])expect(contrast(await target.evaluate(el=>getComputedStyle(el).color),background)).toBeGreaterThanOrEqual(4.5);
 await banner.screenshot({path:'test-results/lineage-banner-dark.png'});
 await page.setViewportSize({width:360,height:900});await banner.scrollIntoViewIfNeeded();
 await expect(heading).toHaveCSS('font-size','19px');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
const modified='33333333-3333-4333-8333-333333333333',origin='22222222-2222-4222-8222-222222222222';
const asModification=(data:typeof fixture)=>{
 Object.assign(data.project,{parentProjectId:origin,parentVersionId:'original-version'});
 Object.assign(data,{original:{id:origin,version_id:'original-version',title:'CampusFlow — your semester, a little more organised',number:1,team_name:'Campus Makers',changelog:'',created_at:'2026-08-01T12:00:00Z'}});
};
test('the version icon carries each project to its counterpart and stays away when there is none',async({page})=>{
 // An original with a published modification offers the one control, pointing at that project's own page.
 await setup(page,data=>{Object.assign(data,{modifications:[{id:modified,title:'CampusFlow Focus - priorities, deadlines & exports',team_name:'Focus Makers'}]});});
 const forward=page.getByRole('link',{name:/^View CampusFlow Focus/});
 await expect(forward).toHaveAttribute('href',`/projects/${modified}`);
 await expect(forward).toHaveAttribute('title','View modified version');
 await expect(page.getByRole('link',{name:/the original this build started from/})).toHaveCount(0);
 // Same routing as the rest of the app: the header survives, and Back returns to where browsing left off.
 await page.route(`**/api/projects/${modified}**`,r=>r.fulfill({json:structuredClone(fixture)}));
 await forward.click();
 await expect(page).toHaveURL(new RegExp(`/projects/${modified}$`));
 await expect(page.locator('.platform .nav')).toBeVisible();
 await page.goBack();
 await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
});
test('a modified build points back at its original, and drops the control when that original is gone',async({page})=>{
 await setup(page,asModification);
 const back=page.getByRole('link',{name:/the original this build started from/});
 await expect(back).toHaveAttribute('href',`/projects/${origin}?version=original-version`);
 await expect(back).toHaveAttribute('title','View original version');
 // Nothing to open, so nothing to click: no icon, no disabled control, no broken link.
 await setup(page,data=>{asModification(data);data.original=null;});
 await expect(page.locator('.pd-version-link')).toHaveCount(0);
 await expect(page.locator('.lineage-banner')).toContainText('currently unavailable');
});
test('project cards carry the same version icon, and only when the counterpart exists',async({page})=>{
 await setup(page,data=>{
  const related=structuredClone(fixture.project);
  Object.assign(related,{id:origin,modificationId:modified});
  related.version.data.title='CampusFlow — your semester, a little more organised';
  const plain=structuredClone(fixture.project);
  Object.assign(plain,{id:'44444444-4444-4444-8444-444444444444'});
  plain.version.data.title='A project on its own';
  data.related=[related,plain] as typeof data.related;
 });
 const card=page.locator('.project-card').filter({hasText:'a little more organised'});
 await expect(card.getByRole('link',{name:/^View the modified version of/})).toHaveAttribute('href',`/projects/${modified}`);
 await expect(page.locator('.project-card').filter({hasText:'A project on its own'}).locator('.version-link')).toHaveCount(0);
});
for(const width of [360,768,1440])test(`project case study fits ${width}px in both themes`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await setup(page);
 for(const theme of ['dark','light']){
  if(theme==='light'){await page.evaluate(()=>localStorage.setItem('repoggits-theme','light'));await page.reload();await expect(page.locator('.platform')).not.toHaveClass(/dark/);}
  for(const selector of ['.pd-summary','.media-heading','.pd-language-grid','.pd-team-section','.pd-technologies','.history']){await page.locator(selector).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
 }
 await page.screenshot({path:`test-results/project-detail-${width}.png`,fullPage:true});
});

