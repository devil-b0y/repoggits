import {test,expect,type Page} from '@playwright/test';

// Admin › Settings, with the API mocked: the "Organize the collective" section's departments field gets a
// "pick from catalog" affordance seeded with the vetted RGPV B.Tech/MBA branch list, on top of the existing free-text
// textarea (which stays the source of truth so institutions other than RGPV keep full control of their own list).
const viewer={user:{id:'admin-test',name:'Site Admin',email:'admin@example.test',role:'superadmin',verified:true,suspended:false,scopes:[],profile:{name:'Site Admin'}},uploadsAvailable:true,emailVerificationRequired:false};
const settings={moderation:{requiredApprovals:1,allowedEmailDomains:[]},categories:{departments:['Computer Science Engineering (CSE)'],subjects:['Final Year Project'],tags:['Next.js']},ai:{enabled:true,hourlyLimit:10,dailyLimit:40,siteDailyLimit:300}};
async function mockSettings(page:Page){
 await page.route('**/api/auth/me',r=>r.fulfill({json:viewer}));
 await page.route('**/api/settings',r=>r.fulfill({json:settings}));
}

test('the branch catalog picker appends chosen RGPV departments without duplicating an already-listed one',async({page})=>{
 await mockSettings(page);await page.goto('/admin/settings');
 const departments=page.getByLabel('Departments',{exact:true});
 // A longer timeout here only absorbs the admin route's first dev-server compile; the settings fetch itself is mocked.
 await expect(departments).toHaveValue('Computer Science Engineering (CSE)',{timeout:10000});
 const toggle=page.getByRole('button',{name:/Add from RGPV branch catalog/});
 await toggle.click();
 await expect(page.getByText('B.Tech branches')).toBeVisible();
 await expect(page.getByText('MBA specializations')).toBeVisible();
 const search=page.getByRole('textbox',{name:'Search branch catalog'});
 await search.fill('iot');
 await expect(page.getByRole('option',{name:/Computer Science Engineering \(IoT\)/})).toBeVisible();
 await expect(page.getByRole('option',{name:'Computer Science Engineering (CSE)',exact:true})).toHaveCount(0);
 await page.getByRole('option',{name:/Computer Science Engineering \(IoT\)/}).click();
 await expect(departments).toHaveValue('Computer Science Engineering (CSE)\nComputer Science Engineering (IoT)');
 // Re-selecting the same branch (still visible in the filtered, still-open menu) must not duplicate the line.
 await page.getByRole('option',{name:/Computer Science Engineering \(IoT\)/}).click();
 await expect(departments).toHaveValue('Computer Science Engineering (CSE)\nComputer Science Engineering (IoT)');
 await search.fill('mba');
 await page.getByRole('option',{name:'MBA (General)',exact:true}).click();
 await expect(departments).toHaveValue('Computer Science Engineering (CSE)\nComputer Science Engineering (IoT)\nMBA (General)');
 let saved:any;await page.route('**/api/admin/settings',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{}});});
 await page.getByRole('button',{name:/Save settings/}).click();
 await expect(page.getByText('Settings saved.')).toBeVisible();
 expect(saved.departments).toEqual(['Computer Science Engineering (CSE)','Computer Science Engineering (IoT)','MBA (General)']);
});

test('typing a custom department by hand still works alongside the catalog picker',async({page})=>{
 await mockSettings(page);await page.goto('/admin/settings');
 const departments=page.getByLabel('Departments',{exact:true});
 await departments.fill('Computer Science Engineering (CSE)\nMy Custom Department');
 let saved:any;await page.route('**/api/admin/settings',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{}});});
 await page.getByRole('button',{name:/Save settings/}).click();
 await expect(page.getByText('Settings saved.')).toBeVisible();
 expect(saved.departments).toEqual(['Computer Science Engineering (CSE)','My Custom Department']);
});
