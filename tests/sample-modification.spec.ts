import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const demo=pathToFileURL(resolve('public/samples/campusflow-focus/index.html')).href;
test('modified demo filters priorities, sorts deadlines and exports all tasks',async({page})=>{
 await page.goto(demo);await expect(page.locator('.task')).toHaveCount(6);
 await page.locator('#priority-filter').selectOption('High');await expect(page.locator('.task')).toHaveCount(2);
 await expect(page.locator('.task .priority').first()).toHaveText('High priority');
 await page.locator('#priority-filter').selectOption('');await page.locator('#sort-order').selectOption('due');
 await expect(page.locator('#done .task').first()).toHaveAttribute('data-task-id','t5');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export tasks as CSV'}).click();const file=await downloaded;expect(file.suggestedFilename()).toBe('campusflow-focus-tasks.csv');
 const stream=await file.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));const csv=Buffer.concat(chunks).toString();expect(csv.split('\r\n')).toHaveLength(7);expect(csv).toContain('Rohan');expect(csv).toContain('Isha');
});
test('modified demo saves separately from the original',async({page})=>{
 await page.goto(demo);await page.evaluate(()=>localStorage.setItem('campusflow-sample-v1','original sentinel'));
 await page.getByRole('button',{name:'Start Map the student submission journey',exact:true}).click();await page.reload();
 await expect(page.locator('#doing [data-task-id=t1]')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('campusflow-sample-v1'))).toBe('original sentinel');
});
