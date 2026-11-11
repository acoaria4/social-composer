const { launchBrowser } = require('./test-support.cjs');const assert=require('node:assert/strict');const path=require('node:path');
const reviewDir=path.resolve(__dirname,'../exports/daily-horoscope');
(async()=>{const browser=await launchBrowser();try{
 let apiCalls=0,apiOverflow=false;
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://aura-glitchlabs.fly.dev/**',route=>{apiCalls++;const params=new URL(route.request().url()).searchParams;const date=params.get('date'),language=params.get('lang');const summary=language==='ta'?'அடுத்த முடிவுக்கு முன் புதிய கோணத்தில் சிந்தியுங்கள்.':'Take one thoughtful step. Give yourself room to grow.';return route.fulfill({json:{date,language,timezone:'Asia/Kolkata',disclaimer:'For reflection only. Use your own judgement.',readings:['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'].map(sign=>({sign,summary:apiOverflow?`${summary} `.repeat(30):summary}))}})});
 await page.goto(process.env.COMPOSER_URL||'http://127.0.0.1:8089/');await page.locator('[data-brand="aura"]').click();
 await page.locator('#aura-heading').click();
 await page.locator('#settings-heading').click();
 await page.locator('#horoscope-manual > summary').click();
 await page.locator('#horoscope-typography > summary').click();
 const longSample='நண்பர்கள் அல்லது தொழில் வட்டாரத்திலிருந்து உதவி கிடைக்கலாம். நீண்டகால திட்டம் ஒன்றை நடைமுறைப்படுத்தும் எண்ணம் வலுப்படும்.';
 const sample='நிதானமாகச் செயல்படுங்கள்.';
 const size=page.locator('#horoscope-font-size'),range=page.locator('#horoscope-font-size-range'),weight=page.locator('#horoscope-font-weight');
 const alignment=page.locator('#horoscope-alignment');
 const source=page.locator('#horoscope-source'), fields=page.locator('#horoscope-readings textarea');
 const canvas=()=>page.locator('#stage-canvas').evaluate(c=>c.toDataURL());
 const create=async()=>{await page.locator('#horoscope-create').click();await page.waitForFunction(()=>document.querySelector('#horoscope-status').textContent.startsWith('Ready:'));};
 assert.equal(await size.inputValue(),'30');assert.equal(await weight.inputValue(),'600');
 assert.equal(await alignment.inputValue(),'justify');
 assert.equal(await source.inputValue(),'manual');assert.equal(await page.locator('#horoscope-language').inputValue(),'ta');assert.equal(await fields.count(),12);assert.equal(apiCalls,0);
 assert.equal(await page.locator('#horoscope-api-status').isVisible(),false);
 const initial=await canvas();await page.locator('#horoscope-create').click();assert.equal(await fields.first().evaluate(e=>e===document.activeElement),true);assert.equal(await canvas(),initial);
 for(let i=0;i<12;i++)await fields.nth(i).fill(sample);
 await fields.nth(3).fill('   ');await page.locator('#horoscope-create').click();assert.equal(await fields.nth(3).evaluate(e=>e===document.activeElement),true);await fields.nth(3).fill(sample);
 await create();assert.equal(apiCalls,0);
 const manualImage=await canvas();
 await size.fill('37');await page.locator('#horoscope-create').click();assert.equal(await size.evaluate(e=>e.validity.valid),false);assert.equal(await canvas(),manualImage);
 await size.fill('18.5');assert.equal(await size.evaluate(e=>e.validity.valid),false);
 await size.fill('');await page.locator('#horoscope-create').click();assert.equal(await canvas(),manualImage);
 await size.fill('18');assert.equal(await range.inputValue(),'18');
 for(let i=0;i<12;i++)await fields.nth(i).fill(longSample);
 await create();
 for(let i=0;i<12;i++)await fields.nth(i).fill(sample);
 await range.fill('36');assert.equal(await size.inputValue(),'36');await weight.selectOption('700');await create();
 await size.fill('30');await weight.selectOption('600');await create();assert.equal(await canvas(),manualImage);

 const fs=require('node:fs');fs.mkdirSync(reviewDir,{recursive:true});
 const manualDownload=page.waitForEvent('download');await page.locator('#btn-download').click();await (await manualDownload).saveAs(path.join(reviewDir,'tamil-story.png'));
 await fields.first().fill(sample.repeat(30));await page.locator('#horoscope-create').click();await page.waitForFunction(()=>document.querySelector('#horoscope-status').textContent.includes('No text was cut'));assert.equal(await canvas(),manualImage);await fields.first().fill(sample);
 await page.locator('[data-brand="lumen"]').click();await page.locator('[data-brand="aura"]').click();
 await page.locator('#horoscope-language').selectOption('en');assert.equal(await page.locator('#horoscope-readings label').first().innerText(),'Mesham');await page.locator('#horoscope-language').selectOption('ta');
 assert.equal(await page.locator('#horoscope-theme option').count(),9);
 await page.locator('#horoscope-theme').selectOption('friday');await page.locator('#horoscope-date').fill('2026-09-21');await page.locator('#horoscope-date').dispatchEvent('change');assert.equal(await page.locator('#horoscope-theme').inputValue(),'friday');assert.match(await page.locator('#horoscope-palette').innerText(),/Friday/);
 assert.equal(apiCalls,0);
 // Reject a deliberately overlong API edition rather than relying on a short
 // reading landing near an engine-specific font-metrics boundary at 30px.
 // Commit WebKit's native date editor before programmatic selectOption; the
 // latter does not move focus, so otherwise date blur can consume Create's click.
 await page.locator('#horoscope-date').blur();
 apiOverflow=true;await source.selectOption('api');
 await page.locator('#horoscope-create').click();await page.waitForFunction(()=>!document.querySelector('#horoscope-create').disabled);
 assert.match(await page.locator('#horoscope-status').innerText(),/does not fit/);
 assert.equal(await canvas(),manualImage);
 apiOverflow=false;
 await size.fill('24');await create();
 assert.deepEqual(await page.locator('#stage-canvas').evaluate(c=>[c.width,c.height]),[1080,1920]);
 for(const lang of ['ta','en']){await page.locator('#horoscope-language').selectOption(lang);await page.locator('#horoscope-create').click();await page.waitForFunction(()=>document.querySelector('#horoscope-status').textContent.startsWith('Ready:'));}
 await source.selectOption('manual');assert.equal(await size.inputValue(),'24');await size.fill('30');assert.deepEqual(await fields.evaluateAll(es=>es.map(e=>e.value)),Array(12).fill(sample));
 const stable=await canvas();
 // A selection change during image decoding must not commit the old image.
 assert.equal(await page.evaluate(async()=>{
   const t=window.AuraHoroscopeTemplate;
   const blob=await t.render({date:'2026-09-22',language:'ta'},t.neutral,{blank:true});
   return window.auraComposer.setHoroscope(blob,'2026-09-22',()=>false);
 }),false);assert.equal(await canvas(),stable);

 await page.route('https://aura-glitchlabs.fly.dev/**',route=>route.fulfill({status:503,body:'Unavailable'}));
 await source.selectOption('api');await page.locator('#horoscope-create').click();await page.waitForFunction(()=>document.querySelector('#horoscope-status').textContent.includes('HTTP 503'));assert.equal(await canvas(),stable);
 await page.unroute('https://aura-glitchlabs.fly.dev/**');
 let release;const gate=new Promise(resolve=>{release=resolve});let started;const pending=new Promise(resolve=>{started=resolve});
 await page.route('https://aura-glitchlabs.fly.dev/**',async route=>{started();await gate;await route.abort().catch(()=>{});});
 await page.locator('#horoscope-create').click();await pending;await source.selectOption('manual');release();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await canvas(),stable);assert.equal(await page.locator('#horoscope-create').isEnabled(),true);assert.equal(await page.locator('#horoscope-api-status').isVisible(),false);
 assert.deepEqual(await fields.evaluateAll(es=>es.map(e=>e.value)),Array(12).fill(sample));
 assert.equal(await size.inputValue(),'30');assert.equal(await weight.inputValue(),'600');
 await page.locator('#horoscope-language').selectOption('ta');
 for(const key of ['none','sunday','monday','tuesday','wednesday','thursday','friday','saturday','daily']){await page.locator('#horoscope-theme').selectOption(key);await page.locator('#horoscope-blank').click();await page.waitForFunction(()=>document.querySelector('#horoscope-status').textContent.startsWith('Blank template ready'));assert.equal(await page.locator('#horoscope-theme option').count(),9)}
 await create();
 const download=page.waitForEvent('download');await page.locator('#btn-download').click();assert.match((await download).suggestedFilename(),/aura-daily-horoscope-2026-09-21-1080x1920/);
 const typographyChecks=await page.evaluate(async()=>{
   const t=window.AuraHoroscopeTemplate,original=CanvasRenderingContext2D.prototype.fillText;
   const luminance=hex=>{const a=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
   const contrasts=[...t.palettes,t.neutral].map(p=>(luminance('#fffcf5')+.05)/(luminance(p[3])+.05));
   if(contrasts.some(v=>v<4.5))throw new Error('Name contrast failed');
   for(const lang of ['ta','en'])for(const size of [18,30,36])for(const weight of [400,600,700]){
     const records=[];CanvasRenderingContext2D.prototype.fillText=function(text,x,y){records.push({text,x,y,font:this.font,color:this.fillStyle,width:this.measureText(text).width});return original.apply(this,arguments);};
     try{
       await t.render({date:'2026-09-23',language:lang,ordered:t.signs.map(name=>({name,text:lang==='ta'?'நலம்.':'Be well.'}))},t.palette('wednesday','2026-09-23'),{readingFontSize:size,readingFontWeight:weight});
       const probe=document.createElement('canvas').getContext('2d');probe.font=`${weight} ${size}px "${lang==='ta'?'Noto Sans Tamil':'DM Sans'}"`;const expectedBody=probe.font;probe.font=`700 32px "${lang==='ta'?'Noto Sans Tamil':'DM Sans'}"`;const expectedName=probe.font;
       const readings=records.filter(r=>r.text===(lang==='ta'?'நலம்.':'Be well.'));
       if(readings.length!==12||readings.some(r=>r.font!==expectedBody||r.color!=='#253026'||r.width>306))throw new Error('Shared reading typography failed');
       const names=records.filter(r=>(lang==='ta'?t.tamil:t.rasis).includes(r.text));
       if(names.length!==12||names.some(r=>r.font!==expectedName||r.color!=='#4d6845'||r.width>268))throw new Error('Name style changed');
     }finally{CanvasRenderingContext2D.prototype.fillText=original;}
   }
   for(const value of [17,37,18.5,NaN]){let rejected=false;try{await t.render({},t.neutral,{readingFontSize:value});}catch{rejected=true;}if(!rejected)throw new Error('Invalid size accepted');}
   let rejected=false;try{await t.render({},t.neutral,{readingFontWeight:500});}catch{rejected=true;}if(!rejected)throw new Error('Invalid weight accepted');
   return {minimumContrast:Math.min(...contrasts)};
 });assert.ok(typographyChecks.minimumContrast>=4.5);
 const overflow=await page.evaluate(async()=>{try{const t=window.AuraHoroscopeTemplate;await t.render({date:'2026-09-21',ordered:t.signs.map(name=>({name,text:'Long summary '.repeat(80)})),disclaimer:'Context'},t.neutral);return false}catch(e){return /No text was cut/.test(e.message)}});assert.equal(overflow,true);
 const alignmentChecks=await page.evaluate(async()=>{
   const template=window.AuraHoroscopeTemplate;
   const width=306, date='2026-09-23';
   const original=CanvasRenderingContext2D.prototype.fillText;
   const measure=document.createElement('canvas').getContext('2d');
   const renderLines=async(language,reading,options)=>{
     const lines=new Map();
     CanvasRenderingContext2D.prototype.fillText=function(text,x,y){
       if(x>=202&&x<508&&y>440&&y<596){
         const line=lines.get(y)||{left:x,right:x,parts:[]};
         line.left=Math.min(line.left,x);line.right=Math.max(line.right,x+this.measureText(text).width);
         line.parts.push(text);lines.set(y,line);
       }
       return original.apply(this,arguments);
     };
     try{
       const ordered=template.signs.map((name,index)=>({name,text:index===0?reading:language==='ta'?'நலம்.':'Be well.'}));
       await template.render({date,language,ordered},template.neutral,options);
       return [...lines.values()].map(({left,right,parts})=>({left,right,text:parts.join(' ').trim().replace(/\s+/g,' ')}));
     }finally{CanvasRenderingContext2D.prototype.fillText=original;}
   };
   const examples={
     en:['calm','mind','step','day','focus','plan','space','steady'],
     ta:['நலம்','வளம்','அமைதி','உறுதி','முயற்சி','கவனம்','இன்று','அன்பு','நிதானம்','முன்னேற்றம்'],
   };
   const results=[];
   for(const [language,words] of Object.entries(examples)){
     measure.font=`600 30px "${language==='ta'?'Noto Sans Tamil':'DM Sans'}"`;
     await document.fonts.load(measure.font,words.join(' '));
     const space=measure.measureText(' ').width;
     // Choose an eligible fixture using the actual browser font metrics, with room on both sides of the spacing limit.
     const line=words.flatMap(word=>Array.from({length:6},(_,i)=>Array(i+2).fill(word).join(' '))).find(text=>{
       const parts=text.split(' '), slack=width-measure.measureText(text).width;
       return slack>=4&&slack<(parts.length-1)*space*.8&&measure.measureText(`${text} ${parts[0]}`).width>width;
     });
     if(!line)throw new Error(`No suitable ${language} alignment fixture`);
     const reading=`${line} ${line}`;
     results.push({language,line,reading,justified:await renderLines(language,reading),left:await renderLines(language,reading,{readingAlignment:'left'})});
   }
   const wideGap='Take care mmmmmmmmm';
   return {results,fallback:await renderLines('en',wideGap),fallbackLeft:await renderLines('en',wideGap,{readingAlignment:'left'})};
 });
 for(const {language,line,justified,left} of alignmentChecks.results){
   assert.deepEqual(justified.map(item=>item.text),[line,line],`${language}: justification preserves whole words and line breaks`);
   assert.deepEqual(left.map(item=>item.text),[line,line]);
   assert.ok([...justified,...left].every(item=>Math.abs(item.left-202)<.1),`${language}: all lines start at the card's reading margin`);
   assert.ok(Math.abs(justified[0].right-508)<.5,`${language}: the first justified line reaches the right margin`);
   assert.ok(justified[0].right-left[0].right>3,`${language}: Left keeps natural spacing`);
   assert.deepEqual(justified[1],left[1],`${language}: the final line keeps natural spacing`);
 }
 assert.deepEqual(alignmentChecks.fallback.map(line=>line.text),['Take care','mmmmmmmmm']);
 assert.deepEqual(alignmentChecks.fallback,alignmentChecks.fallbackLeft,'A line requiring an excessive word gap stays left aligned');
 await page.setViewportSize({width:390,height:844});await fields.first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(reviewDir,'mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.setViewportSize({width:1280,height:900});await page.locator('#horoscope-source').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(reviewDir,'desktop.png')});
 await page.locator('#horoscope-language').selectOption('en');
 await fields.first().fill(alignmentChecks.results.find(result=>result.language==='en').reading);
 for(let i=1;i<12;i++)await fields.nth(i).fill('Be well.');
 await alignment.selectOption('left');await create();const leftArtwork=await canvas();
 await alignment.selectOption('justify');await create();assert.notEqual(await canvas(),leftArtwork,'The alignment control changes the generated artwork');
 await alignment.selectOption('left');await page.reload();
 assert.equal(await alignment.inputValue(),'left','The AURA alignment draft survives reload');
 assert.equal(await page.evaluate(()=>ComposerTemplateState.captureForms().aura.alignment),'left');
 assert.deepEqual(errors,[]);
 console.log('Minimum name contrast:',typographyChecks.minimumContrast.toFixed(2));
 console.log('PASS: shared size/weight/alignment, justified Tamil and English with safe spacing, alignment draft reload, invalid values, long Tamil at 18px, name contrast, manual default, Tamil sample, missing/overflow validation, draft retention, API failures/cancellation, API-fed render, all nine selections, date-independent tints, blank templates, PNG export, overflow guard, mobile width.');
}finally{await browser.close()}})();
