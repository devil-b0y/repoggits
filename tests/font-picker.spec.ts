import {test,expect,type Page} from '@playwright/test';
import {projectFonts} from '../lib/project-fonts';

async function mockSession(page:Page){
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'font-test-student',name:'Sample Maker',email:'maker@example.test',role:'student',verified:true,suspended:false,scopes:[],profile:{department:'Computer Science'}},uploadsAvailable:true,emailVerificationRequired:false}}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['Computer Science'],subjects:['Final Year Project'],tags:['ESP32']}}}));
}

test('every typeface is offered, previewed in its own font, and saved with the project',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 // The form will not submit while its required fields are empty, and the draft is what carries the font key.
 await page.getByLabel('Project title',{exact:true}).fill('Typeface test project');
 const picker=page.locator('.font-picker');
 await picker.scrollIntoViewIfNeeded();
 await picker.getByRole('button',{name:/Page typeface/}).click();
 await expect(picker.getByRole('option')).toHaveCount(projectFonts.length);
 // Each row is drawn in the face it offers — that is what makes the list readable as a preview.
 const editorial=projectFonts.find(font=>font.key==='editorial')!;
 const row=picker.getByRole('option',{name:new RegExp(editorial.name)});
 await expect(row.locator('strong')).toHaveCSS('font-family',/Iowan|Palatino|Georgia/);
 await row.click();
 await expect(picker.getByRole('button',{name:/Page typeface/})).toContainText(editorial.name);
 await expect(picker.locator('.font-preview')).toHaveCSS('font-family',/Iowan|Palatino|Georgia/);

 let saved:{data?:{font?:string}}|undefined;
 await page.route('**/api/projects',async route=>{saved=route.request().postDataJSON();await route.fulfill({json:{id:'project-test',versionId:'version-test'}});});
 // Save draft lives in the studio's last section.
 await page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/This chapter/}).click();
 await page.getByRole('button',{name:'Save draft'}).click();
 await expect.poll(()=>saved?.data?.font).toBe('editorial');
});
