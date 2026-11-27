// Start a local preview first. Measures city paints, not just browser rAF callbacks.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
try {
 const page = await browser.newPage({ viewport: {width: 1200,height: 800}, deviceScaleFactor: 1 });
 await page.addInitScript(() => sessionStorage.setItem('appery-city-arrived','1'));
 await page.goto(process.argv[2] || 'http://127.0.0.1:5174/');
 const map = page.locator('[data-model-loaded="true"]'); await map.waitFor({timeout:60000});
 await page.locator('.city-time-control select').selectOption('noon');
 await page.waitForTimeout(1200);
 const results = await map.evaluate(async (el) => {
  const canvas=el.querySelector('canvas'), gl=canvas.getContext('webgl2');
  const gpu=gl.getExtension('WEBGL_debug_renderer_info');
  const out={gpu:gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):'unknown',triangles:el.dataset.triangles};
  const marker=document.querySelector('[data-hit-x][data-hit-y]');
  const x=Number(marker.dataset.hitX),y=Number(marker.dataset.hitY);
  const send=(type,opts={})=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse',clientX:x,clientY:y,...opts}));
  for(const phase of ['idle','hover','drag']) {
   let last=0,lastTime='',n=0;const spans=[],events=[];const start=performance.now();
   if(phase==='drag') send('pointerdown',{button:0,buttons:1});
   do {
    const now=await new Promise(requestAnimationFrame);
    if(el.dataset.animationTime!==lastTime){if(last)spans.push(now-last);last=now;lastTime=el.dataset.animationTime;}
    const s=performance.now();
    if(phase==='hover')send('pointermove',{clientX:Math.round(x+45*Math.sin(n*.2)),clientY:y});
    if(phase==='drag')send('pointermove',{clientX:x+(n%30)*2,buttons:1});
    events.push(performance.now()-s);n++;
   }while(performance.now()-start<3200 || spans.length<6);
   if(phase==='drag')send('pointerup',{button:0});
   const q=(a,p)=>Number(a.sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))].toFixed(1));
   out[phase]={samples:spans.length,medianMs:q(spans,.5),p95Ms:q(spans,.95),eventP95Ms:q(events,.95)};
  }
  return out;
 }); console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
