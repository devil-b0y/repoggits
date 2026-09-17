import {test,expect} from '@playwright/test';

const channel=(v:number)=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
const luminance=(rgb:string)=>{const [r,g,b]=rgb.match(/\d+/g)!.map(Number);return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);};
const contrast=(a:string,b:string)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05);};

test('dark cookie banner text is readable against its background',async({page})=>{
 await page.goto('/');
 const banner=page.locator('.cookie-banner.cookie-dark');await expect(banner).toBeVisible();
 const background=await banner.evaluate(el=>getComputedStyle(el).backgroundColor);
 const targets=[banner.locator('strong',{hasText:'We use cookies'}),banner.getByRole('link',{name:'Privacy Policy'}),banner.getByRole('link',{name:'Cookie Policy'}),banner.getByRole('button',{name:'Reject non-essential'}),banner.getByRole('button',{name:'Customize cookies'})];
 for(const target of targets){
  const color=await target.evaluate(el=>getComputedStyle(el).color);
  expect(contrast(color,background),await target.innerText()).toBeGreaterThanOrEqual(4.5);
 }
});
