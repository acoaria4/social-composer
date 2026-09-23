// Export review renders from the exact renderer used in the composer.
// NODE_PATH must resolve Playwright; COMPOSER_URL can override the local preview.
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');
const sampleSets=require('./horoscope-samples.json');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.goto(process.env.COMPOSER_URL||'http://127.0.0.1:8089/');
 const dir=path.resolve(__dirname,'../exports/daily-horoscope');fs.mkdirSync(dir,{recursive:true});
 const edition=process.env.HOROSCOPE_DATA?JSON.parse(fs.readFileSync(process.env.HOROSCOPE_DATA,'utf8')):null;
 const language=edition?.language||process.env.HOROSCOPE_LANGUAGE||'ta';
 const samples=sampleSets[language];
 const keys=['none','sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 for(const key of keys)for(const blank of [true,false]){
  const data=await page.evaluate(async({key,blank,samples,edition,language})=>{
   const t=window.AuraHoroscopeTemplate,date=edition?.date||`2026-09-${key==='none'?23:20+t.keys.indexOf(key)}`;
   const blob=await t.render({...edition,date,language,ordered:t.signs.map((name,i)=>({name,text:edition?edition.readings.find(r=>r.sign===name.toLowerCase()).summary:samples[i]}))},t.palette(key,date),{blank,readingFontSize:Number(edition?.readingFontSize||30),readingFontWeight:Number(edition?.readingFontWeight||600)});
   return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
  },{key,blank,samples,edition,language});
  fs.writeFileSync(path.join(dir,`${language}-${key}-${blank?'blank':edition?'reading':'sample'}.png`),Buffer.from(data,'base64'));
 }
 const sheet=await page.evaluate(async({keys,language,kind})=>{
  const c=document.createElement('canvas');c.width=1440;c.height=1280;const x=c.getContext('2d');x.fillStyle='#e6e3dd';x.fillRect(0,0,c.width,c.height);
  for(let i=0;i<keys.length;i++){const image=new Image();image.src=`exports/daily-horoscope/${language}-${keys[i]}-${kind}.png`;await image.decode();const xx=20+(i%4)*360,yy=20+Math.floor(i/4)*640;x.drawImage(image,xx,yy,320,569);x.fillStyle='#302b26';x.font='500 20px "DM Sans"';x.fillText(keys[i]==='none'?'No tint':keys[i][0].toUpperCase()+keys[i].slice(1),xx,yy+600);}
  return c.toDataURL().split(',')[1];
 },{keys,language:language,kind:edition?'reading':'sample'});fs.writeFileSync(path.join(dir,`${language}-tint-overview.png`),Buffer.from(sheet,'base64'));
 const previews=await page.evaluate(async({language,kind})=>{
   const c=new Image();c.src=`exports/daily-horoscope/${language}-wednesday-${kind}.png`;await c.decode();
   const phone=document.createElement('canvas');phone.width=390;phone.height=693;phone.getContext('2d').drawImage(c,0,0,390,693);
   // Match the screenshot's approximate 589 x 1157 cover viewport.
   const overlay=document.createElement('canvas');overlay.width=589;overlay.height=1280;const o=overlay.getContext('2d');
   o.fillStyle='#0b1014';o.fillRect(0,0,589,1280);
   o.save();o.beginPath();o.rect(0,0,589,1157);o.clip();
   const scale=1157/1920;o.drawImage(c,(589-1080*scale)/2,0,1080*scale,1157);o.restore();
   o.fillStyle='rgba(0,0,0,.18)';o.fillRect(0,0,589,150);o.fillRect(510,700,79,420);o.fillRect(0,1015,589,142);
   o.fillStyle='white';o.font='bold 30px sans-serif';o.fillText('Reels',165,139);o.font='22px sans-serif';o.fillText('9:27',35,55);
   o.font='42px sans-serif';o.fillText('♡',523,742);o.fillText('○',528,836);o.fillText('↗',528,978);
   o.font='bold 23px sans-serif';o.fillText('aura.gl',87,1047);o.font='18px sans-serif';o.fillText('Caption and audio area',28,1117);
   o.fillStyle='#dae1d8';o.font='bold 17px sans-serif';o.fillText('SIMULATED REELS PREVIEW',28,1201);o.font='15px sans-serif';o.fillText('Approximate crop and controls from your screenshot',28,1231);
   return {phone:phone.toDataURL().split(',')[1],overlay:overlay.toDataURL().split(',')[1]};
 },{language,kind:edition?'reading':'sample'});
 for(const [kind,data] of Object.entries(previews))fs.writeFileSync(path.join(dir,`${language}-wednesday-${kind}.png`),Buffer.from(data,'base64'));
 console.log('Exported 8 blank templates, 8 sample renders (illustrative text, not forecasts), and a tint overview.');
}finally{await browser.close()}})();
