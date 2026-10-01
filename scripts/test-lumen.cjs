const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.COMPOSER_URL||'http://127.0.0.1:8089/');
 await page.locator('[data-brand="lumen"]').click();
 await page.locator('#lumen-fact-heading').click();
 const text=page.locator('#lumen-text'),subject=page.locator('#lumen-subject'),size=page.locator('#lumen-size'),create=page.locator('#lumen-create');
 const canvas=()=>page.locator('#stage-canvas').evaluate(c=>c.toDataURL());
 assert.equal(await subject.inputValue(),'none');
 assert.equal(await size.inputValue(),'72');
 const initial=await canvas();await create.click();assert.equal(await text.evaluate(e=>e===document.activeElement),true);assert.equal(await canvas(),initial);
 const sample='Light travels faster than sound. That’s why you see lightning before you hear thunder.';
 await text.fill(sample);await subject.selectOption('physics');await create.click();await page.waitForFunction(()=>document.querySelector('#lumen-status').textContent.startsWith('Ready:'));
 assert.deepEqual(await page.locator('#stage-canvas').evaluate(c=>[c.width,c.height]),[1080,1920]);
 const dir=path.resolve(__dirname,'../exports/lumen');fs.mkdirSync(dir,{recursive:true});
 const download=page.waitForEvent('download');await page.locator('#btn-download').click();const d=await download;assert.equal(d.suggestedFilename(),'lumen-fact-1080x1920.png');await d.saveAs(path.join(dir,'lumen-fact-sample.png'));
 const ready=await canvas();await text.fill(sample.repeat(20));await create.click();await page.waitForFunction(()=>document.querySelector('#lumen-status').textContent.includes('too long'));assert.equal(await canvas(),ready);await text.fill(sample);
 await size.fill('35');await create.click();assert.equal(await canvas(),ready);assert.equal(await size.evaluate(e=>e.validity.valid),false);await size.fill('64');
 await page.locator('[data-brand="aura"]').click();await page.locator('[data-brand="lumen"]').click();assert.equal(await text.inputValue(),sample);assert.equal(await subject.inputValue(),'physics');
 await subject.selectOption('none');await create.click();await page.waitForFunction(()=>document.querySelector('#lumen-status').textContent.startsWith('Ready:'));

 assert.deepEqual(await subject.locator('option').allTextContents(),['None · Graphite','Maths · Pink','Physics · Blue','Chemistry · Purple','Biology · Green','Social · Yellow']);
 assert.equal(await page.locator('#lumen-source').count(),0);
 const results=await page.evaluate(async()=>{
   const original=CanvasRenderingContext2D.prototype.fillText, records=[];
   let calls=[];
   CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){calls.push({text,x,y,color:this.fillStyle});return original.call(this,text,x,y,...args);};
   try {
     for(const [subject,palette] of Object.entries(LumenFactTemplate.palettes)){
       calls=[];
       const blob=await LumenFactTemplate.render({text:'A little curiosity goes a long way.',subject,format:'1080x1350'});
       const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
       const c=canvas.getContext('2d');c.drawImage(image,0,0);image.close();
       records.push({subject,palette,calls:[...calls],pixel:[...c.getImageData(30,600,1,1).data],url:canvas.toDataURL()});
     }
   }finally{CanvasRenderingContext2D.prototype.fillText=original;}
   return records;
 });
 const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 let minimum=Infinity;
 for(const result of results){
   const {subject,palette,calls,pixel,url}=result;
   assert.deepEqual(pixel.slice(0,3),palette.background.slice(1).match(/../g).map(v=>parseInt(v,16)));
   assert.deepEqual(calls.filter(c=>c.y===1110).map(c=>c.text),subject==='none'?[]:[palette.label]);
   assert.equal(calls.some(c=>/Source:|None/.test(c.text)),false);
   for(const color of [palette.text,palette.secondary])for(const bg of [palette.background,palette.beam]){const a=luminance(color),b=luminance(bg),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);minimum=Math.min(minimum,contrast);assert.ok(contrast>=4.5,`${subject}: ${color} on ${bg} = ${contrast}`);}
   fs.writeFileSync(path.join(dir,`subject-${subject}.png`),Buffer.from(url.split(',')[1],'base64'));
 }
 console.log('Minimum Lumen text contrast:',minimum.toFixed(2));
 const invalidBefore=await canvas();
 assert.match(await page.evaluate(async()=>{try{await LumenFactTemplate.render({text:'Valid text',subject:'unknown'});}catch(e){return e.message;}}),/valid Lumen subject/);
 assert.equal(await canvas(),invalidBefore);
 // Hold an in-flight render, then change the subject. Its stale result must not replace the canvas.
 await page.evaluate(()=>{window.originalLumenRender=LumenFactTemplate.render;LumenFactTemplate.render=async args=>{const blob=await originalLumenRender(args);await new Promise(resolve=>window.releaseLumenRender=resolve);return blob;};});
 await create.click();await page.waitForFunction(()=>typeof window.releaseLumenRender==='function');
 await subject.selectOption('biology');
 await page.evaluate(async()=>{window.releaseLumenRender();LumenFactTemplate.render=window.originalLumenRender;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 assert.equal(await canvas(),invalidBefore);
 await create.click();await page.waitForFunction(()=>document.querySelector('#lumen-status').textContent.startsWith('Ready:'));
 await page.locator('#btn-save').click();
 await page.setViewportSize({width:390,height:844});await text.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(dir,'mobile.png')});
 await page.setViewportSize({width:1280,height:900});await text.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'desktop.png')});
 const staticPaths=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(e=>e.src||e.href));for(const url of staticPaths)assert.equal((await page.request.get(url)).ok(),true);
 assert.deepEqual(errors,[]);console.log('PASS: Lumen manual input, subject palettes, blank/overflow/size validation, brand-switch draft retention, 1080x1920 PNG, save, mobile, local assets.');
}finally{await browser.close()}})();
