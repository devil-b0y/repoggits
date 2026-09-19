import {test,expect,type Page} from '@playwright/test';

// Admin › Roles & permissions, with the API mocked: a Teacher-Admin's grant checkboxes are grouped into the same
// four sections the admin sidebar itself uses (see admin/nav.ts), each a bordered icon+label toggle card rather
// than a flat list of bare native checkboxes.
const viewer={user:{id:'admin-test',name:'Site Admin',email:'admin@example.test',role:'superadmin',verified:true,suspended:false,scopes:[],profile:{name:'Site Admin'}},uploadsAvailable:true,emailVerificationRequired:false};
const teacher={id:'teacher-1',name:'Umang',email:'umang@example.test',role:'teacher',scopes:['department:Computer Science','permission:analytics'],suspended:false,verified:true};
async function mockPeople(page:Page){
 await page.addInitScript(()=>localStorage.setItem('repoggits-cookie-consent',JSON.stringify({analytics:true,functional:true,marketing:true,updatedAt:new Date().toISOString()})));
 await page.route('**/api/auth/me',r=>r.fulfill({json:viewer}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['B.Tech CSE'],subjects:['Final Year Project'],tags:[]}}}));
 await page.route('**/api/admin',r=>r.fulfill({json:{queue:[],projects:[],users:[teacher],audit:[]}}));
}

test('a Teacher-Admin\'s permissions are grouped into sections with an icon per toggle, not a flat checkbox list',async({page})=>{
 await mockPeople(page);await page.goto('/admin/people');
 const row=page.locator('.user-row').filter({hasText:'Umang'});
 await expect(row).toBeVisible({timeout:10000});
 // The four groups mirror the admin sidebar's own sections (Dashboard/People/Projects/Logs/Platform).
 await expect(row.locator('.admin-permission-group h4')).toHaveText(['Dashboard','People','Projects','Logs','Platform']);
 const analytics=row.locator('.admin-permission-toggle',{hasText:'Dashboards and analytics'});
 // Umang already holds permission:analytics, so this toggle starts checked and styled as such.
 await expect(analytics).toHaveClass(/is-checked/);
 await expect(analytics.locator('input[type=checkbox]')).toBeChecked();
 await expect(analytics.locator('svg').first()).toBeVisible();
 const live=row.locator('.admin-permission-toggle',{hasText:'Live monitoring'});
 await expect(live).not.toHaveClass(/is-checked/);
 await live.click();
 await expect(live).toHaveClass(/is-checked/);
 // The two personal-data permissions still carry their badge inside the new card layout.
 await expect(row.locator('.admin-permission-toggle',{hasText:'Read prompt text'}).getByText('personal data')).toBeVisible();
 await row.screenshot({path:'test-results/admin-permissions-redesign.png'});
});
