import {test,expect,type Page} from '@playwright/test';

// Admin › Settings, with the API mocked: the "Organize the collective" section's departments field gets a
// "pick from catalog" affordance seeded with the vetted RGPV B.Tech/MBA branch list, on top of the existing free-text
// textarea (which stays the source of truth so institutions other than RGPV keep full control of their own list).
const viewer={user:{id:'admin-test',name:'Site Admin',email:'admin@example.test',role:'superadmin',verified:true,suspended:false,scopes:[],profile:{name:'Site Admin'}},uploadsAvailable:true,emailVerificationRequired:false};
const settings={moderation:{requiredApprovals:1,allowedEmailDomains:[]},categories:{departments:['B.Tech CSE'],subjects:['Final Year Project'],tags:['Next.js']},ai:{enabled:true,hourlyLimit:10,dailyLimit:40,siteDailyLimit:300}};
async function mockSettings(page:Page){
 // Pre-accept cookies so the consent banner (a fixed bottom overlay) never covers the form fields below.
 await page.addInitScript(()=>localStorage.setItem('repoggits-cookie-consent',JSON.stringify({analytics:true,functional:true,marketing:true,updatedAt:new Date().toISOString()})));
 await page.route('**/api/auth/me',r=>r.fulfill({json:viewer}));
 await page.route('**/api/settings',r=>r.fulfill({json:settings}));
}

test('the branch catalog picker appends chosen RGPV departments without duplicating an already-listed one',async({page})=>{
 await mockSettings(page);await page.goto('/admin/settings');
 // Located by name, not getByLabel: this form's wrapping <label> makes the computed accessible name unreliable here
 // (same trap as the AdvancedFilters selects elsewhere in the admin panel).
 const departments=page.locator('textarea[name="departments"]');
 // A longer timeout here only absorbs the admin route's first dev-server compile; the settings fetch itself is mocked.
 await expect(departments).toHaveValue('B.Tech CSE',{timeout:15000});
 const toggle=page.getByRole('button',{name:/Add from RGPV branch catalog/});
 await toggle.click();
 await expect(page.getByText('B.Tech',{exact:true})).toBeVisible();
 await expect(page.getByText('M.Tech',{exact:true})).toBeVisible();
 await expect(page.getByText('Postgraduate & Diploma',{exact:true})).toBeVisible();
 const search=page.getByRole('textbox',{name:'Search branch catalog'});
 await search.fill('iot');
 await expect(page.getByRole('option',{name:'B.Tech CSE (IoT, Cyber Security & Blockchain)',exact:true})).toBeVisible();
 await expect(page.getByRole('option',{name:'B.Tech CSE',exact:true})).toHaveCount(0);
 await page.getByRole('option',{name:'B.Tech CSE (IoT, Cyber Security & Blockchain)',exact:true}).click();
 await expect(departments).toHaveValue('B.Tech CSE\nB.Tech CSE (IoT, Cyber Security & Blockchain)');
 // Re-selecting the same branch (still visible in the filtered, still-open menu) must not duplicate the line.
 await page.getByRole('option',{name:'B.Tech CSE (IoT, Cyber Security & Blockchain)',exact:true}).click();
 await expect(departments).toHaveValue('B.Tech CSE\nB.Tech CSE (IoT, Cyber Security & Blockchain)');
 await search.fill('mba');
 await page.getByRole('option',{name:'MBA',exact:true}).click();
 await expect(departments).toHaveValue('B.Tech CSE\nB.Tech CSE (IoT, Cyber Security & Blockchain)\nMBA');
 let saved:any;await page.route('**/api/admin/settings',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{}});});
 await page.getByRole('button',{name:/Save settings/}).click();
 await expect(page.getByText('Settings saved.')).toBeVisible();
 expect(saved.departments).toEqual(['B.Tech CSE','B.Tech CSE (IoT, Cyber Security & Blockchain)','MBA']);
});

test('typing a custom department by hand still works alongside the catalog picker',async({page})=>{
 await mockSettings(page);await page.goto('/admin/settings');
 const departments=page.locator('textarea[name="departments"]');
 await expect(departments).toHaveValue('B.Tech CSE',{timeout:15000});
 await departments.fill('B.Tech CSE\nMy Custom Department');
 let saved:any;await page.route('**/api/admin/settings',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{}});});
 await page.getByRole('button',{name:/Save settings/}).click();
 await expect(page.getByText('Settings saved.')).toBeVisible();
 expect(saved.departments).toEqual(['B.Tech CSE','My Custom Department']);
});
