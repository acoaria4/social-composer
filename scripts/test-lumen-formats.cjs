const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.COMPOSER_URL||'http://127.0.0.1:8089/');
  await page.locator('[data-brand="lumen"]').click();await page.locator('#lumen-fact-heading').click();
  const format=page.locator('#lumen-format'),text=page.locator('#lumen-text'),subject=page.locator('#lumen-subject');
  assert.equal(await format.inputValue(),'1080x1920');
  assert.deepEqual(await format.locator('option').evaluateAll(es=>es.map(e=>e.value)),['1080x1920','1080x1080','1080x1350','1200x630','1600x900']);
  const sample='Light travels faster than sound. That’s why you see lightning before you hear thunder.';
  await text.fill(sample);await subject.selectOption('physics');
  const create=async()=>{await page.locator('#lumen-create').click();await page.waitForFunction(()=>document.querySelector('#lumen-status').textContent.startsWith('Ready:'));};
  const canvas=()=>page.locator('#stage-canvas').evaluate(c=>c.toDataURL());
  const dir=path.resolve(__dirname,'../exports/lumen-formats');fs.mkdirSync(dir,{recursive:true});
  const exports=await page.evaluate(async(sample)=>{
    const draws=[],originalText=CanvasRenderingContext2D.prototype.fillText,originalImage=CanvasRenderingContext2D.prototype.drawImage;
    let calls=[],images=[];
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){const m=this.measureText(text);calls.push({text,x,y,font:this.font,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});return originalText.call(this,text,x,y,...args);};
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(args.length===4)images.push({x:args[0],y:args[1],w:args[2],h:args[3]});return originalImage.call(this,image,...args);};
    try{
      for(const [format,layout] of Object.entries(LumenFactTemplate.formats))for(const subject of Object.keys(LumenFactTemplate.palettes)){
        calls=[];images=[];
        const blob=await LumenFactTemplate.render({text:sample,subject,format});
        const metrics=[...calls],logo=[...images];
        const bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
        let phone=null,reels=null;
        if(format==='1080x1920'){
          const p=document.createElement('canvas');p.width=390;p.height=693;p.getContext('2d').drawImage(c,0,0,390,693);phone=p.toDataURL();
          // The same approximate crop and overlay positions used by render-horoscope.cjs.
          const r=document.createElement('canvas');r.width=589;r.height=1280;const o=r.getContext('2d');o.fillStyle='#0b1014';o.fillRect(0,0,589,1280);
          o.save();o.beginPath();o.rect(0,0,589,1157);o.clip();const scale=1157/1920;o.drawImage(c,(589-1080*scale)/2,0,1080*scale,1157);o.restore();
          o.fillStyle='rgba(0,0,0,.18)';o.fillRect(0,0,589,150);o.fillRect(510,700,79,420);o.fillRect(0,1015,589,142);
          o.fillStyle='white';o.font='bold 30px sans-serif';o.fillText('Reels',165,139);o.font='22px sans-serif';o.fillText('9:27',35,55);
          o.font='42px sans-serif';o.fillText('♡',523,742);o.fillText('○',528,836);o.fillText('↗',528,978);
          o.font='bold 23px sans-serif';o.fillText('lumen',87,1047);o.font='18px sans-serif';o.fillText('Caption and audio area',28,1117);
          o.fillStyle='#dae1d8';o.font='bold 17px sans-serif';o.fillText('SIMULATED REELS PREVIEW',28,1201);o.font='15px sans-serif';o.fillText('Same approximate crop and controls as AURA',28,1231);reels=r.toDataURL();
        }
        draws.push({format,subject,layout,calls:metrics,logo,width:c.width,height:c.height,png:c.toDataURL(),phone,reels});
      }
    }finally{CanvasRenderingContext2D.prototype.fillText=originalText;CanvasRenderingContext2D.prototype.drawImage=originalImage;}
    return draws;
  },sample);
  assert.equal(exports.length,30);
  for(const item of exports){
    const {format,subject,layout,calls,logo}=item;
    assert.deepEqual([item.width,item.height],format.split('x').map(Number));
    for(const call of calls){
      assert.ok(call.left>=layout.left-1&&call.right<=layout.right+1,`${format}/${subject}: horizontal bounds for ${call.text}`);
      assert.ok(call.top>=0&&call.bottom<layout.height,`${format}/${subject}: vertical bounds`);
      if(call.font.includes('Outfit')) assert.ok(call.top>=layout.bodyTop&&call.bottom<=layout.bodyBottom);
      if(format==='1080x1920') assert.ok(call.left>=180-1&&call.right<=900+1&&call.top>=270&&call.bottom<=1636);
    }
    assert.equal(logo.length,1);
    assert.ok(logo[0].x>=layout.left&&logo[0].x+logo[0].w<=layout.right);
    assert.ok(logo[0].y+logo[0].h<layout.labelY-20,'Logo and reading label must not overlap');
    assert.deepEqual(calls.filter(c=>c.y===layout.subjectY).map(c=>c.text),subject==='none'?[]:[subject[0].toUpperCase()+subject.slice(1)]);
    for(const key of ['png','phone','reels'])if(item[key])fs.writeFileSync(path.join(dir,`${format}-${subject}${key==='png'?'':`-${key}`}.png`),Buffer.from(item[key].split(',')[1],'base64'));
  }
  for(const key of ['1080x1920','1080x1080','1080x1350','1200x630','1600x900']){
    await format.selectOption(key);await create();
    assert.deepEqual(await page.locator('#stage-canvas').evaluate(c=>[c.width,c.height]),key.split('x').map(Number));
    assert.equal(await page.locator('#preset-select').isDisabled(),true);
    assert.equal(await page.locator('#lumen-format-guidance').isVisible(),true);
    const stable=await canvas();
    await page.locator('#preset-select').evaluate(e=>{e.value='1080x1080';e.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await canvas(),stable);assert.equal(await page.locator('#preset-select').inputValue(),key);
    const download=page.waitForEvent('download');await page.locator('#btn-download').click();assert.equal((await download).suggestedFilename(),`lumen-fact-${key}.png`);
    await text.fill(sample.repeat(50));await page.locator('#lumen-create').click();
    await page.waitForFunction(()=>document.querySelector('#lumen-status').textContent.includes('too long'));
    assert.equal(await canvas(),stable);assert.match(await page.locator('#lumen-status').innerText(),/at 64 px/);await text.fill(sample);
  }
  await format.selectOption('1080x1920');await create();const before=await canvas();
  await format.selectOption('1080x1080');assert.equal(await canvas(),before);
  await page.locator('[data-brand="aura"]').click();await page.locator('[data-brand="lumen"]').click();assert.equal(await format.inputValue(),'1080x1080');
  // A format change while decoding must prevent the previous template from committing.
  await page.evaluate(()=>{window.originalFormatRender=LumenFactTemplate.render;LumenFactTemplate.render=async args=>{const blob=await originalFormatRender(args);await new Promise(resolve=>window.releaseFormatRender=resolve);return blob;};});
  await page.locator('#lumen-create').click();await page.waitForFunction(()=>typeof window.releaseFormatRender==='function');
  await format.selectOption('1200x630');await page.evaluate(async()=>{releaseFormatRender();LumenFactTemplate.render=originalFormatRender;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  assert.equal(await canvas(),before);
  await create();await page.locator('#btn-save').click();
  await page.reload();if(!await page.locator('#pane-created').isVisible())await page.locator('#btn-created-toggle').click();await page.locator('#assets-created > .asset-chip').first().click();
  await page.waitForFunction(()=>document.querySelector('#preset-select').disabled);
  assert.deepEqual(await page.locator('#stage-canvas').evaluate(c=>[c.width,c.height]),[1200,630]);
  await page.locator('#btn-close-saved').click();
  await page.locator('#bg-input').setInputFiles(path.resolve(__dirname,'../brands/current/lumen-icon.png'));
  await page.waitForFunction(()=>!document.querySelector('#preset-select').disabled);assert.equal(await page.locator('#lumen-format-guidance').isVisible(),false);
  assert.match(await page.evaluate(async()=>{try{await LumenFactTemplate.render({text:'A fact',format:'native'});}catch(e){return e.message;}}),/valid Lumen format/);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: 30 Lumen layouts, dimensions and content bounds, AURA story margins, subject omission, PNG names, pending/stale format changes, overflow, saved restore, crop protection, and mobile width.');
 }finally{await browser.close();}
})();
