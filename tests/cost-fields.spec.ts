import {test,expect,type Page} from '@playwright/test';

async function mockSession(page:Page){
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'cost-test-student',name:'Sample Maker',email:'maker@example.test',role:'student',verified:true,suspended:false,scopes:[],profile:{department:'Computer Science'}},uploadsAvailable:true,emailVerificationRequired:false}}));
 await page.route('**/api/settings',r=>r.fulfill({json:{categories:{departments:['Computer Science','Electronics'],subjects:['Final Year Project'],tags:['ESP32','TypeScript']}}}));
}
const openCosts=(page:Page)=>page.getByRole('navigation',{name:'Project form sections'}).getByRole('link',{name:/What it took/}).click();

test('hardware and software costs are picked from their own catalogues and totalled without trailing zeros',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 // Hybrid keeps both panels on screen; Software would hide the hardware one.
 await page.getByLabel('Project type').click();
 await page.getByRole('option',{name:'Hybrid'}).click();
 await openCosts(page);

 await page.getByRole('button',{name:'Add part'}).click();
 await page.getByRole('button',{name:'Choose from the part name catalogue'}).click();
 await page.getByRole('button',{name:'ESP32',exact:true}).click();
 await expect(page.getByLabel('Part name',{exact:true})).toHaveValue('ESP32');
 await page.getByLabel('Quantity',{exact:true}).fill('2');
 await page.getByLabel('Unit cost',{exact:true}).fill('400');
 // The point of the money helper: 800, never 800.00.
 await expect(page.locator('.cost-row-total output')).toHaveText('INR 800');

 await page.getByLabel('No software or service costs').uncheck();
 await page.getByRole('button',{name:'Add software cost'}).click();
 await page.getByRole('button',{name:'Choose from the license, hosting, or tool catalogue'}).click();
 await page.getByRole('button',{name:'Vercel',exact:true}).click();
 await expect(page.getByLabel('License, hosting, or tool',{exact:true})).toHaveValue('Vercel');
 await page.getByLabel('Cost',{exact:true}).fill('1200');

 await expect(page.locator('.cost-fields > .cost-total output')).toHaveText('INR 2,000');
});

test('a cost field can be cleared and retyped instead of trapping a zero',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 await openCosts(page);
 await page.getByLabel('No software or service costs').uncheck();
 await page.getByRole('button',{name:'Add software cost'}).click();
 const cost=page.getByLabel('Cost',{exact:true});
 await cost.fill('1200');
 // Backspacing through the value must leave the box empty, not snap back to a 0 the next keystroke appends to.
 for(let i=0;i<4;i++)await cost.press('Backspace');
 await expect(cost).toHaveValue('');
 await cost.pressSequentially('850');
 await expect(cost).toHaveValue('850');
 await expect(page.locator('.cost-fields > .cost-total output')).toHaveText('INR 850');
});

test('where the parts were bought asks for a website online and a place in person',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 await page.getByLabel('Project type').click();
 await page.getByRole('option',{name:'Hybrid'}).click();
 await openCosts(page);

 // Nothing is asked until a way of buying is chosen.
 await expect(page.getByLabel('Website link')).toHaveCount(0);
 await page.getByRole('button',{name:'Online store'}).click();
 await page.getByRole('button',{name:'Choose from the online store catalogue'}).click();
 await page.getByRole('button',{name:/Robu\.in/}).click();
 await expect(page.getByLabel('Store',{exact:true})).toHaveValue('Robu.in');
 await expect(page.getByLabel('Website link')).toHaveValue('https://robu.in');
 await expect(page.locator('.buy-preview')).toContainText('robu.in');

 // Switching to a shop swaps the website question for a location one.
 await page.getByRole('button',{name:'Physical store'}).click();
 await expect(page.getByLabel('Website link')).toHaveCount(0);
 await page.getByLabel('Location',{exact:true}).fill('https://maps.google.com/?q=Gwalior+electronics+market');
 await expect(page.locator('.buy-preview')).toContainText('Open in Maps');
});

test('a catalogue name keeps its logo and a custom name is still typeable',async({page})=>{
 await mockSession(page);await page.goto('/submit');
 await openCosts(page);
 await page.getByLabel('No software or service costs').uncheck();
 await page.getByRole('button',{name:'Add software cost'}).click();
 await page.getByRole('button',{name:'Choose from the license, hosting, or tool catalogue'}).click();
 await page.getByRole('button',{name:'Firebase',exact:true}).click();
 await expect(page.locator('.cost-picker-mark img')).toHaveAttribute('src',/firebase/i);

 await page.getByRole('button',{name:'Choose from the license, hosting, or tool catalogue'}).click();
 await page.getByRole('button',{name:'Other / type your own'}).click();
 await page.getByLabel('License, hosting, or tool',{exact:true}).fill('College server rental');
 await expect(page.getByLabel('License, hosting, or tool',{exact:true})).toHaveValue('College server rental');
});
