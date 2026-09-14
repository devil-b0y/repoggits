import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db, migrate } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { openBytes, openProfile } from '../lib/encryption';

const password = 'a long passphrase for profile studio checks';

test.beforeAll(async () => { await migrate(); });

async function signIn(page:Page, name:string) {
  const id = randomUUID(), email = `profile-${id}@example.test`;
  await db.query("INSERT INTO r.users(id,email,password_hash,name,role,verified,profile) VALUES($1,$2,$3,$4,'student',true,$5)", [id, email, await hashPassword(password), name, JSON.stringify({ name })]);
  expect((await page.request.post('/api/auth/login', { headers:{ origin:process.env.APP_ORIGIN! }, data:{ email, password } })).status()).toBe(200);
  return id;
}
const profileOf = async (id:string) => openProfile((await db.query('SELECT profile FROM r.users WHERE id=$1', [id]))[0].profile) as Record<string,string>;
// Red on the left, blue on the right, so rotation and panning are visible in the saved pixels.
const halves = async () => ({ name:'halves.png', mimeType:'image/png', buffer:await sharp({ create:{ width:600, height:300, channels:3, background:'#ff0000' } }).composite([{ input:{ create:{ width:300, height:300, channels:3, background:'#0000ff' } }, left:300, top:0 }]).png().toBuffer() });
async function savedPhoto(id:string) {
  const avatarId = (await profileOf(id)).avatarId;
  const [file] = await db.query<{ content:Buffer }>('SELECT content FROM r.files WHERE id=$1', [avatarId]);
  const { data, info } = await sharp(openBytes(file.content, 'files.content')).removeAlpha().raw().toBuffer({ resolveWithObject:true });
  return { avatarId, size:[info.width, info.height], pixel:(x:number, y:number) => { const i = (y*info.width + x)*info.channels; return [data[i], data[i+1], data[i+2]]; } };
}

test('profile details preview live, tidy links, and save', async ({ page }) => {
  const id = await signIn(page, 'Ada Maker');
  await page.goto('/account');
  const card = page.getByRole('complementary', { name:'Profile preview' });
  const strength = page.getByRole('progressbar', { name:'Profile strength' });
  await expect(card.getByRole('heading', { name:'Ada Maker' })).toBeVisible();
  await expect(card.getByText('AM', { exact:true })).toBeVisible();
  await expect(strength).toHaveAttribute('aria-valuenow', '0');
  const save = page.getByRole('button', { name:'Save profile' });
  await expect(save).toBeDisabled();

  await page.getByLabel('Bio').fill('I build tiny robots that water plants.');
  await expect(card.getByText('I build tiny robots that water plants.')).toBeVisible();
  await expect(page.getByText('You have unsaved changes')).toBeVisible();
  await page.getByLabel('Department').fill('Computer Science');
  await page.getByLabel('GitHub profile').fill('octocat');
  await page.getByLabel('LinkedIn profile').fill('linkedin.com/in/ada-maker');
  await page.getByLabel('Bio').focus();
  await expect(page.getByLabel('GitHub profile')).toHaveValue('https://github.com/octocat');
  await expect(page.getByLabel('LinkedIn profile')).toHaveValue('https://linkedin.com/in/ada-maker');
  await expect(strength).toHaveAttribute('aria-valuenow', '57');

  await save.click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await profileOf(id)).toMatchObject({ bio:'I build tiny robots that water plants.', department:'Computer Science', github:'https://github.com/octocat', linkedin:'https://linkedin.com/in/ada-maker' });

  await page.reload();
  await expect(card.getByRole('link', { name:'GitHub' })).toHaveAttribute('href', 'https://github.com/octocat');
  await page.getByLabel('Full name').fill('Someone Else');
  await expect(card.getByRole('heading', { name:'Someone Else' })).toBeVisible();
  await page.getByRole('button', { name:'Discard' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Maker');
  await expect(save).toBeDisabled();
});

test('photo editor rotates, applies a look, and saves a square profile photo', async ({ page }) => {
  const id = await signIn(page, 'Grace Builder');
  await page.goto('/account');
  const card = page.getByRole('complementary', { name:'Profile preview' });
  const editor = page.getByRole('dialog', { name:'Frame your photo' });

  await page.getByLabel('Choose a profile photo').setInputFiles(await halves());
  await expect(editor).toBeVisible();
  await expect(editor.getByText('Opening your photo…')).toHaveCount(0);
  await editor.getByRole('button', { name:'Rotate right' }).click();
  await editor.getByRole('button', { name:'Save photo' }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText('Profile photo saved.')).toBeVisible();

  const rotated = await savedPhoto(id);
  expect(rotated.size).toEqual([720, 720]);
  await expect(card.getByRole('img', { name:'Grace Builder profile photo' })).toHaveAttribute('src', `/api/files/${rotated.avatarId}`);
  // A clockwise quarter turn moves the red left half to the top.
  const [topRed,, topBlue] = rotated.pixel(360, 120), [bottomRed,, bottomBlue] = rotated.pixel(360, 600);
  expect(topRed).toBeGreaterThan(200); expect(topBlue).toBeLessThan(60);
  expect(bottomBlue).toBeGreaterThan(200); expect(bottomRed).toBeLessThan(60);

  await card.getByRole('button', { name:'Adjust photo' }).click();
  await expect(editor.getByText('Opening your photo…')).toHaveCount(0);
  await editor.getByRole('button', { name:'Mono' }).click();
  await expect(editor.getByRole('button', { name:'Mono' })).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('button', { name:'Save photo' }).click();
  await expect(editor).toBeHidden();
  await expect.poll(async () => (await profileOf(id)).avatarId).not.toBe(rotated.avatarId);
  const [r, g, b] = (await savedPhoto(id)).pixel(360, 120);
  expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(14);

  await card.getByRole('button', { name:'Adjust photo' }).click();
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await card.getByRole('button', { name:'Remove photo' }).click();
  await expect(page.getByText('Profile photo removed.')).toBeVisible();
  expect((await profileOf(id)).avatarId).toBe('');
  await expect(card.getByText('GB', { exact:true })).toBeVisible();
});

test('dragging pans without leaving gaps and the keyboard zooms', async ({ page }) => {
  const id = await signIn(page, 'Lin Pan');
  await page.goto('/account');
  const editor = page.getByRole('dialog', { name:'Frame your photo' });
  await page.getByLabel('Choose a profile photo').setInputFiles(await halves());
  await expect(editor.getByText('Opening your photo…')).toHaveCount(0);

  const stage = editor.getByRole('group', { name:/Crop area/ }), box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width*1.9, box.y + box.height/2, { steps:8 });
  await page.mouse.up();

  const zoom = editor.getByRole('slider', { name:'Zoom' });
  await stage.focus();
  await page.keyboard.press('+');
  await expect(zoom).toHaveValue('1.1');
  await page.keyboard.press('-');
  await expect(zoom).toHaveValue('1');
  await editor.getByRole('button', { name:'Save photo' }).click();
  await expect(editor).toBeHidden();
  // Dragged as far right as it goes, the crop shows only the red left half and no empty edge.
  const [red,, blue] = (await savedPhoto(id)).pixel(700, 360);
  expect(red).toBeGreaterThan(200); expect(blue).toBeLessThan(60);
});

test('photo editor fits a narrow phone screen', async ({ page }) => {
  await page.setViewportSize({ width:320, height:640 });
  await signIn(page, 'Mo Phone');
  await page.goto('/account');
  await page.getByLabel('Choose a profile photo').setInputFiles(await halves());
  const editor = page.getByRole('dialog', { name:'Frame your photo' });
  await expect(editor.getByText('Opening your photo…')).toHaveCount(0);
  const box = (await editor.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path:'test-results/profile-studio/editor-320.png' });
  await editor.getByRole('button', { name:'Cancel' }).click();
  await expect(editor).toBeHidden();

  await page.getByLabel('Bio').fill('Hello');
  await expect(page.getByRole('button', { name:'Discard' })).toBeVisible();
  const bar = (await page.locator('.profile-savebar').boundingBox())!;
  expect(bar.x + bar.width).toBeLessThanOrEqual(320);
  expect(bar.height).toBeLessThan(72);
});
