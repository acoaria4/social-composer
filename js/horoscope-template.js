(() => {
  'use strict';
  const signs=['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const rasis=['Mesham','Rishabam','Mithunam','Kadagam','Simmam','Kanni','Thulam','Viruchigam','Dhanusu','Magaram','Kumbam','Meenam'];
  const tamil=['மேஷம்','ரிஷபம்','மிதுனம்','கடகம்','சிம்மம்','கன்னி','துலாம்','விருச்சிகம்','தனுசு','மகரம்','கும்பம்','மீனம்'];
  // Label, atmosphere, reading ink, accessible name accent, background key.
  const palettes=[
    ['Sunday · Warm gold','#efb777','#253026','#805b2d','sunday'],
    ['Monday · Moon pearl','#afc7df','#253026','#49627a','monday'],
    ['Tuesday · Terracotta','#da9b88','#253026','#8b5142','tuesday'],
    ['Wednesday · Sage','#b3c393','#253026','#4d6845','wednesday'],
    ['Thursday · Saffron','#e5c36a','#253026','#7b601e','thursday'],
    ['Friday · Rose','#e8a7ba','#253026','#875268','friday'],
    ['Saturday · Lavender','#b8a6d2','#253026','#69557f','saturday'],
  ];
  const neutral=['No tint · AURA ivory','#fbfaf7','#253026','#805b2d','none'];
  const keys=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  function palette(key,date){if(key==='none'||key==='general')return neutral;return palettes[key==='daily'?new Date(`${date}T12:00:00Z`).getUTCDay():keys.indexOf(key)]||neutral;}
  const assetBase=new URL('../assets/horoscope/',document.currentScript.src);
  const images=new Map();
  function loadImage(name){
    if(!images.has(name)) images.set(name,new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);
      image.onerror=()=>{images.delete(name);reject(new Error('Could not load the horoscope artwork. Please reload.'));};
      image.src=new URL(name,assetBase).href;
    }));
    return images.get(name);
  }
  // Never split Tamil vowel marks, or introduce spaces within a long word.
  function wrap(c,text,width,locale){
    const lines=[];let line='';
    for(const word of text.trim().split(/\s+/)){
      if(c.measureText(word).width<=width){
        const next=line?`${line} ${word}`:word;
        if(line&&c.measureText(next).width>width){lines.push(line);line=word;}else line=next;
        continue;
      }
      if(line){lines.push(line);line='';}
      for(const {segment} of new Intl.Segmenter(locale,{granularity:'grapheme'}).segment(word)){
        if(c.measureText(segment).width>width)throw new Error('A character is too wide. Reduce the reading text size.');
        if(line&&c.measureText(line+segment).width>width){lines.push(line);line='';}
        line+=segment;
      }
    }
    if(line)lines.push(line);return lines;
  }
  async function render(data,colors,{blank=false,readingFontSize=30,readingFontWeight=600}={}){
    if(!Number.isInteger(readingFontSize)||readingFontSize<18||readingFontSize>36)throw new Error('Choose a whole reading text size from 18 to 36 px.');
    if(![400,600,700].includes(readingFontWeight))throw new Error('Choose Regular, Semibold, or Bold reading text.');
    const ta=data.language==='ta',family=ta?'Noto Sans Tamil':'DM Sans';
    const bodyFont=`${readingFontWeight} ${readingFontSize}px "${family}"`;
    const [background,art]=await Promise.all([
      loadImage(`background-${colors[4]||'none'}.png`),loadImage('ivory-emblems.png'),
      document.fonts.load(bodyFont,ta?'தமிழ்':'Reading'),
      document.fonts.load(`700 32px "${family}"`,ta?'மேஷம்':'Mesham'),
      document.fonts.load(`600 24px "${family}"`,ta?'புதன்':'Wednesday'),
      document.fonts.load('700 44px "Noto Sans Tamil"','இன்றைய ராசிபலன்'),
      document.fonts.load('500 60px "Cormorant Garamond"'),
    ]);
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const c=canvas.getContext('2d');
    c.drawImage(background,0,0,1080,1920);c.textBaseline='alphabetic';c.fillStyle=colors[2];
    const center=(value,y,font)=>{c.font=font;c.fillText(value,(1080-c.measureText(value).width)/2,y);};
    center(ta?'இன்றைய ராசிபலன்':'Your daily horoscope',310,ta?'700 44px "Noto Sans Tamil"':'500 60px "Cormorant Garamond"');
    const date=new Intl.DateTimeFormat(ta?'ta-IN':'en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${data.date}T12:00:00Z`));
    center(date,361,`600 24px "${family}"`);
    signs.forEach((sign,i)=>{
      const cardX=180+(i%2)*370,y=400+Math.floor(i/2)*208;
      c.fillStyle='#fffcf5';c.beginPath();c.roundRect(cardX,y,350,196,22);c.fill();
      const originalX=i%2?547:28,originalY=412+Math.floor(i/2)*197;
      c.save();c.beginPath();c.arc(cardX+38,y+28,19,0,Math.PI*2);c.clip();
      c.drawImage(art,(originalX+29)*art.width/1080,(originalY+8)*art.height/1920,166*art.width/1080,166*art.height/1920,cardX+19,y+9,38,38);c.restore();
      const name=ta?tamil[i]:rasis[i];
      c.fillStyle=colors[3];c.font=`700 32px "${family}"`;c.fillText(name,cardX+68,y+37);
      if(blank)return;
      const reading=data.ordered[i];if(!reading||reading.name!==sign||typeof reading.text!=='string'||!reading.text.trim())throw new Error(`Missing or unordered ${sign} reading.`);
      c.fillStyle=colors[2];c.font=bodyFont;
      const lines=wrap(c,reading.text,306,ta?'ta':'en'),lineHeight=Math.ceil(readingFontSize*1.2);
      const baseline=y+46+readingFontSize;
      if(lines.some((line,n)=>baseline+n*lineHeight+c.measureText(line).actualBoundingBoxDescent>y+182)){
        throw new Error(`${name}'s reading does not fit at ${readingFontSize} px. Reduce the shared reading text size or shorten this reading. No text was cut and the canvas is unchanged.`);
      }
      lines.forEach((line,n)=>c.fillText(line,cardX+22,baseline+n*lineHeight));
    });
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not render the horoscope.')),'image/png'));
  }
  window.AuraHoroscopeTemplate={signs,rasis,tamil,palettes,neutral,keys,palette,render};
})();
