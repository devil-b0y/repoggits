import {expect,test} from '@playwright/test';

for(const mode of ['paused','reduced'] as const){
  test(`the ${mode} 3D hero redraws after resizing while offscreen`,async({page})=>{
    await page.setViewportSize({width:1440,height:1000});
    if(mode==='reduced')await page.emulateMedia({reducedMotion:'reduce'});
    // Count real GPU draws so a surviving canvas/data attribute cannot conceal
    // a cleared drawing buffer when the static illustration returns to view.
    await page.addInitScript(()=>{
      for(const contextType of [WebGLRenderingContext,WebGL2RenderingContext]){
        const draw=contextType.prototype.drawElements;
        contextType.prototype.drawElements=function(this:WebGLRenderingContext|WebGL2RenderingContext,mode:number,count:number,type:number,offset:number){
          if(this.canvas instanceof HTMLCanvasElement)this.canvas.dataset.testDrawCount=String(Number(this.canvas.dataset.testDrawCount??0)+1);
          return draw.call(this,mode,count,type,offset);
        };
      }
    });
    await page.goto('/');
    const object=page.locator('.maker-objects');
    const canvas=object.locator('canvas');
    await expect(object).toHaveAttribute('data-ready','true');
    if(mode==='paused')await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
    await expect(object).toHaveAttribute('data-motion',mode);
    await expect.poll(()=>canvas.evaluate(element=>Number(element.dataset.testDrawCount??0))).toBeGreaterThan(0);
    const originalWidth=await canvas.evaluate(element=>(element as HTMLCanvasElement).width);

    await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
    await expect.poll(()=>object.evaluate(element=>element.getBoundingClientRect().bottom)).toBeLessThan(-80);
    await page.setViewportSize({width:1280,height:1000});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const offscreenDraws=await canvas.evaluate(element=>Number(element.dataset.testDrawCount??0));

    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await expect(object).toBeInViewport();
    await expect.poll(()=>canvas.evaluate(element=>(element as HTMLCanvasElement).width)).not.toBe(originalWidth);
    await expect.poll(()=>canvas.evaluate(element=>Number(element.dataset.testDrawCount??0))).toBeGreaterThan(offscreenDraws);
    await expect(object).toHaveAttribute('data-motion',mode);
  });
}
