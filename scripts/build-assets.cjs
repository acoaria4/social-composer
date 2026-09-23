/* Run with NODE_PATH pointing to a Playwright installation and a local site server.
   Only reads the copied current icons; every output stays inside the composer. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage();
 await page.goto(process.env.COMPOSER_URL || 'http://127.0.0.1:8089/');
 const outputs=await page.evaluate(async()=>{
  const brands=[
   {id:'expenses',name:'Expenses',font:'600 140px Manrope',ink:'#f7f1e8',dark:'#18120d',accent:'#d9b793',box:[260,280,1000,1080]},
   {id:'aura',name:'AURA',font:'500 160px "Cormorant Garamond"',ink:'#fff8ee',dark:'#2b1c10',accent:'#ba7f46',box:[195,255,1065,1030]},
   {id:'lumen',name:'Lumen',font:'500 140px Outfit',ink:'#fff4f8',dark:'#291426',accent:'#edbb55',box:[475,140,785,520]},
   {id:'glitchlabs',name:'gLitCh Labs',font:'500 140px Manrope',ink:'#f0eeea',dark:'#080a0d',accent:'#8c939f',box:[230,230,1020,990]},
  ];
  const results={};
  for(const b of brands){
   await document.fonts.load(b.font);
   const image=new Image();image.src=`brands/current/${b.id}-icon.png`;await image.decode();
   const c=document.createElement('canvas');const [x,y,x2,y2]=b.box;c.width=x2-x;c.height=y2-y;
   const ctx=c.getContext('2d');ctx.drawImage(image,-x,-y);
   const pixels=ctx.getImageData(0,0,c.width,c.height);
   for(let i=0;i<pixels.data.length;i+=4){const d=pixels.data;const r=d[i],g=d[i+1],bl=d[i+2];
    // Separate the metallic foreground from each icon's backing, preserving its highlights.
    const strength=b.id==='glitchlabs' ? (Math.min(r,g,bl)-65)/40 : b.id==='aura' ? (r-bl-35)/20 : b.id==='lumen' ? (g-bl-12)/22 : Math.max((r-bl-10)/14,(Math.min(r,g,bl)-110)/35);
    d[i+3]=Math.round(d[i+3]*Math.max(0,Math.min(1,strength)));
   }
   // Fill enclosed highlight gaps without filling the open spaces in the mark.
   const w=c.width,h=c.height,n=w*h,seen=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
   const push=(j)=>{if(!seen[j]&&pixels.data[j*4+3]<128){seen[j]=1;queue[tail++]=j}};
   for(let xx=0;xx<w;xx++){push(xx);push((h-1)*w+xx)}
   for(let yy=0;yy<h;yy++){push(yy*w);push(yy*w+w-1)}
   while(head<tail){const j=queue[head++],xx=j%w;if(xx)push(j-1);if(xx<w-1)push(j+1);if(j>=w)push(j-w);if(j<n-w)push(j+w)}
   for(let j=0;j<n;j++)if(!seen[j])pixels.data[j*4+3]=255;
   // Lumen's central spark is one component; discard fragments of surrounding rays.
   if(b.id==='lumen'){
    const visited=new Uint8Array(n);let best=[];
    for(let j=0;j<n;j++)if(!visited[j]&&pixels.data[j*4+3]>127){const part=[j];visited[j]=1;for(let k=0;k<part.length;k++){const t=part[k],xx=t%w;for(const v of [xx?t-1:-1,xx<w-1?t+1:-1,t>=w?t-w:-1,t<n-w?t+w:-1])if(v>=0&&!visited[v]&&pixels.data[v*4+3]>127){visited[v]=1;part.push(v)}}if(part.length>best.length)best=part}
    const keep=new Uint8Array(n);best.forEach(j=>keep[j]=1);for(let j=0;j<n;j++)if(!keep[j])pixels.data[j*4+3]=0;
   }
   ctx.putImageData(pixels,0,0);results[`${b.id}-mark.png`]=c.toDataURL();
   for(const [variant,color] of [['light',b.ink],['dark',b.dark]]){
    const out=document.createElement('canvas');let t=out.getContext('2d');t.font=b.font;
    const tw=t.measureText(b.name).width;const dw=t.measureText('.').width;
    out.width=Math.ceil(tw+dw+40);out.height=230;t=out.getContext('2d');t.font=b.font;t.textBaseline='middle';t.fillStyle=color;t.fillText(b.name,20,115);t.fillStyle=b.accent;t.fillText('.',20+tw,115);
    results[`${b.id}-wordmark-${variant}.png`]=out.toDataURL();
    const lock=document.createElement('canvas');lock.width=out.width+240;lock.height=260;const l=lock.getContext('2d');l.drawImage(image,0,0,260,260);l.drawImage(out,240,15);results[`${b.id}-lockup-${variant}.png`]=lock.toDataURL();
   }
  }
  return results;
 });
 const dir=path.resolve(__dirname,'../brands/current');
 for(const [name,data] of Object.entries(outputs))fs.writeFileSync(path.join(dir,name),Buffer.from(data.split(',')[1],'base64'));
 console.log(`Built ${Object.keys(outputs).length} composer assets.`);
 }finally{await browser.close()}
})();
