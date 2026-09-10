import { test, expect } from '@playwright/test';

test('discovery, bookmarks, submission persistence and keyboard dialogs', async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/demo');
  await expect(page.getByRole('heading',{level:1})).toContainText('Good ideas');
  await expect(page.locator('.scene canvas')).toBeVisible();
  await page.getByRole('button',{name:'Rotate 3D workbench'}).click();
  await page.getByRole('button',{name:'Software',exact:true}).click();
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.getByRole('textbox',{name:'Search projects'}).fill('PostgreSQL');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Save Your campus, connected.',exact:true}).click();
  await page.getByRole('button',{name:'My workspace'}).click();
  await expect(page.getByRole('dialog')).toContainText('Your campus, connected.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Share your project',exact:true}).click();
  await page.getByLabel('Project title',{exact:true}).fill('Accessible campus map');
  await page.getByLabel('Team name',{exact:true}).fill('Map makers');
  await page.getByLabel('The idea',{exact:true}).fill('A student project mapping accessible routes across campus.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.reload();
  await page.getByRole('button',{name:'My workspace'}).click();
  await expect(page.getByRole('dialog')).toContainText('Accessible campus map');
  await expect(page.getByRole('dialog')).toContainText('Your campus, connected.');
  expect(errors).toEqual([]);
});

test('mobile layout, navigation and reduced motion',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/demo');
  await expect(page.locator('.scene canvas')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('link',{name:'How it works',exact:true}).click();
  await expect(page.getByRole('button',{name:'Toggle navigation'})).toHaveAttribute('aria-expanded','false');
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});

test('desktop visual capture',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/demo');
  await expect(page.locator('.scene canvas')).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
});
