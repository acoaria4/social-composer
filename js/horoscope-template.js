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
  function coverTextMetrics(context, text, font) {
    context.font = font;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    const metrics = context.measureText(text);
    return {
      left: metrics.actualBoundingBoxLeft,
      right: metrics.actualBoundingBoxRight,
      ascent: metrics.actualBoundingBoxAscent,
      descent: metrics.actualBoundingBoxDescent,
    };
  }

  function drawCoverText(context, text, font, color, centerX, baseline, maxWidth) {
    const metrics = coverTextMetrics(context, text, font);
    if (metrics.left + metrics.right > maxWidth) {
      throw new Error('The cover text does not fit. Please reload the local fonts and retry.');
    }
    context.fillStyle = color;
    // Center the visible letterforms, including the day number's asymmetric bearings.
    context.fillText(text, centerX + (metrics.left - metrics.right) / 2, baseline);
  }

  function drawCoverDate(context, lines, centerX, centerY) {
    const gap = 18;
    const holeRadius = 174;
    let height = 0;
    const measured = lines.map(line => {
      const metrics = coverTextMetrics(context, line.text, line.font);
      const item = { ...line, metrics, top: height };
      height += metrics.ascent + metrics.descent + gap;
      return item;
    });
    height -= gap;

    for (const line of measured) {
      const top = centerY - height / 2 + line.top;
      const bottom = top + line.metrics.ascent + line.metrics.descent;
      const halfWidth = (line.metrics.left + line.metrics.right) / 2;
      const farthestY = Math.max(Math.abs(top - centerY), Math.abs(bottom - centerY));
      if (Math.hypot(halfWidth, farthestY) > holeRadius) {
        throw new Error('The cover date does not fit inside the zodiac wheel. Please reload the local fonts and retry.');
      }
      drawCoverText(context, line.text, line.font, line.color, centerX, top + line.metrics.ascent, holeRadius * 2);
    }
  }

  async function renderCover({ date, language = 'ta' } = {}, colors = neutral) {
    const readingDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T12:00:00Z`) : null;
    if (!readingDate || !Number.isFinite(readingDate.getTime()) || readingDate.toISOString().slice(0, 10) !== date) {
      throw new Error('Choose a valid reading date for the cover.');
    }
    if (!['ta', 'en'].includes(language)) throw new Error('Choose Tamil or English for the cover.');

    const isTamil = language === 'ta';
    const family = isTamil ? 'Noto Sans Tamil' : 'DM Sans';
    const locale = isTamil ? 'ta-IN' : 'en-IN';
    const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(readingDate);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(readingDate);
    const title = isTamil ? ['இன்றைய', 'ராசிபலன்'] : ['Your daily', 'horoscope'];
    const firstTitleFont = `600 76px "${family}"`;
    const secondTitleFont = `700 92px "${family}"`;
    const monthFont = `500 30px "${family}"`;
    const weekdayFont = `500 34px "${family}"`;
    const dayFont = '500 144px "Cormorant Garamond"';
    const [background, ornament, wordmark] = await Promise.all([
      loadImage(`background-${colors[4] || 'none'}.png`),
      loadImage('zodiac-cover-ring.png'),
      loadImage('../../brands/current/aura-wordmark-dark.png'),
      document.fonts.load(firstTitleFont, title[0]),
      document.fonts.load(secondTitleFont, title[1]),
      document.fonts.load(monthFont, monthYear),
      document.fonts.load(weekdayFont, weekday),
      document.fonts.load(dayFont, date.slice(-2)),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const context = canvas.getContext('2d');
    context.drawImage(background, 0, 0, 1080, 1920);

    const wordmarkWidth = 178;
    context.save();
    context.globalAlpha = 0.86;
    context.drawImage(wordmark, (1080 - wordmarkWidth) / 2, 310, wordmarkWidth, wordmarkWidth * wordmark.height / wordmark.width);
    context.restore();
    drawCoverText(context, title[0], firstTitleFont, colors[3], 540, 440, 720);
    drawCoverText(context, title[1], secondTitleFont, colors[2], 540, 550, 720);

    context.save();
    // The generated ornament has a soft outer halo; keep it circular over the day plate.
    context.beginPath();
    context.arc(540, 1020, 386, 0, Math.PI * 2);
    context.clip();
    context.shadowColor = 'rgba(97,66,34,.07)';
    context.shadowBlur = 9;
    context.shadowOffsetY = 3;
    context.drawImage(ornament, 140, 620, 800, 800);
    context.restore();
    context.fillStyle = 'rgba(255,251,242,.54)';
    context.beginPath();
    context.arc(540, 1020, 188, 0, Math.PI * 2);
    context.fill();
    drawCoverDate(context, [
      { text: date.slice(-2), font: dayFont, color: '#695038' },
      { text: monthYear, font: monthFont, color: '#4b443d' },
      { text: weekday, font: weekdayFont, color: colors[3] },
    ], 540, 1020);

    return new Promise((resolve, reject) => canvas.toBlob(blob => blob
      ? resolve(blob)
      : reject(new Error('Could not render the horoscope cover.')), 'image/png'));
  }

  window.AuraHoroscopeTemplate={signs,rasis,tamil,palettes,neutral,keys,palette,render,renderCover};
})();
