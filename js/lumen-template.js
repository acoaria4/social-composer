(() => {
  'use strict';
  const base=new URL('../brands/current/',document.currentScript.src);
  const palettes = Object.freeze({
    none: Object.freeze({label:'',background:'#202226',text:'#F5F3EF',secondary:'#D0D2D6',beam:'#292C31',accent:'#E6BC72',divider:'#747A84',logo:'light'}),
    maths: Object.freeze({label:'Maths',background:'#F8E7ED',text:'#291426',secondary:'#71394F',beam:'#EFDAE4',accent:'#FC4177',divider:'#C89CAC',logo:'dark'}),
    physics: Object.freeze({label:'Physics',background:'#E5EFFA',text:'#172D4A',secondary:'#345578',beam:'#D4E3F4',accent:'#3479C6',divider:'#94B1D0',logo:'dark'}),
    chemistry: Object.freeze({label:'Chemistry',background:'#EEE6F7',text:'#342044',secondary:'#65427E',beam:'#E0D3ED',accent:'#9259BA',divider:'#B19AC5',logo:'dark'}),
    biology: Object.freeze({label:'Biology',background:'#E6F1E8',text:'#183B28',secondary:'#365E43',beam:'#D4E5D8',accent:'#39865A',divider:'#94B59F',logo:'dark'}),
    social: Object.freeze({label:'Social',background:'#FFF3CD',text:'#493608',secondary:'#705519',beam:'#F3E4B2',accent:'#BB861C',divider:'#CBB777',logo:'dark'}),
  });
  // Profiles are in export pixels; story content follows AURA's Reels-safe region.
  const formats = Object.freeze({
    '1080x1920': {label:'Story / Reel · 9:16',width:1080,height:1920,left:180,right:900,logoY:270,logoWidth:260,sloganY:305,labelY:420,ruleY:448,bodyTop:490,bodyBottom:1450,subjectY:1500,dividerY:1555,footerY:1605,sparkY:1598,sparkSize:30},
    '1080x1080': {label:'Square · 1:1',width:1080,height:1080,left:72,right:1008,logoY:64,logoWidth:260,sloganY:97,labelY:242,ruleY:264,bodyTop:300,bodyBottom:790,subjectY:854,dividerY:930,footerY:986,sparkY:978,sparkSize:30},
    '1080x1350': {label:'Portrait · 4:5',width:1080,height:1350,left:88,right:990,logoY:78,logoWidth:290,sloganY:111,labelY:318,ruleY:346,bodyTop:371,bodyBottom:1035,subjectY:1110,dividerY:1190,footerY:1245,sparkY:1237,sparkSize:36},
    '1200x630': {label:'Landscape · 1.91:1',width:1200,height:630,left:64,right:1136,logoY:38,logoWidth:230,sloganY:70,labelY:166,ruleY:188,bodyTop:210,bodyBottom:450,subjectY:490,dividerY:535,footerY:584,sparkY:576,sparkSize:28},
    '1600x900': {label:'Landscape · 16:9',width:1600,height:900,left:86,right:1514,logoY:56,logoWidth:290,sloganY:92,labelY:236,ruleY:260,bodyTop:290,bodyBottom:680,subjectY:740,dividerY:795,footerY:855,sparkY:847,sparkSize:32},
  });
  Object.values(formats).forEach(Object.freeze);
  const logos = new Map();
  function logo(variant) {
    if (!logos.has(variant)) logos.set(variant, new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { logos.delete(variant); reject(new Error('Could not load the Lumen artwork. Please reload.')); };
      image.src = new URL(`lumen-lockup-${variant}.png`,base).href;
    }));
    return logos.get(variant);
  }
  function wrap(ctx,value,width){
    const lines=[];
    for(const paragraph of value.split(/\n/)){
      if(!paragraph.trim()){lines.push('');continue;}
      let line='';
      for(const word of paragraph.trim().split(/\s+/)){
        if(ctx.measureText(word).width>width)throw new Error('A word or link is too wide. Reduce the text size or shorten it.');
        const next=line?line+' '+word:word;
        if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;
      }
      lines.push(line);
    }
    return lines;
  }
  async function render({text,subject='none',fontSize=64,format='1080x1920'}){
    if(typeof text!=='string'||!text.trim())throw new Error('Enter a fact or explanation first.');
    if(!Number.isInteger(fontSize)||fontSize<36||fontSize>84)throw new Error('Choose a whole text size from 36 to 84 px.');
    if(typeof subject !== 'string' || !Object.hasOwn(palettes,subject))throw new Error('Choose a valid Lumen subject.');
    if(typeof format !== 'string' || !Object.hasOwn(formats,format))throw new Error('Choose a valid Lumen format.');
    const palette=palettes[subject], layout=formats[format];
    const [brand]=await Promise.all([logo(palette.logo),document.fonts.load(`600 ${fontSize}px "Outfit"`),document.fonts.load('500 25px "DM Sans"'),document.fonts.load('600 22px "DM Sans"')]);
    const canvas=document.createElement('canvas');canvas.width=layout.width;canvas.height=layout.height;const c=canvas.getContext('2d');
    const {width,height,left,right}=layout;
    c.fillStyle=palette.background;c.fillRect(0,0,width,height);
    c.save();c.beginPath();c.moveTo(width*.907,0);c.lineTo(width,0);c.lineTo(width,height);c.lineTo(width*.944,height);c.lineTo(width*.843,height*.741);c.closePath();c.fillStyle=palette.beam;c.fill();c.restore();
    c.fillStyle=palette.accent;c.fillRect(0,0,16,height);
    c.drawImage(brand,left,layout.logoY,layout.logoWidth,layout.logoWidth*brand.height/brand.width);
    c.textBaseline='alphabetic';c.font='600 22px "DM Sans"';c.fillStyle=palette.secondary;
    const sloganX=right-200;
    c.fillText('A LITTLE MORE',sloganX,layout.sloganY);c.fillText('CURIOUS.',sloganX,layout.sloganY+30);
    c.fillText('SMALL FACT. BIG SPARK.',left,layout.labelY);
    c.fillStyle=palette.accent;c.fillRect(left,layout.ruleY,88,6);
    c.font=`600 ${fontSize}px "Outfit"`;c.fillStyle=palette.text;
    let lines;
    try { lines=wrap(c,text.trim(),right-left); }
    catch { throw new Error(`A word or link is too wide for ${layout.label} at ${fontSize} px. Reduce Text size or shorten it. The canvas is unchanged.`); }
    const lineHeight=Math.ceil(fontSize*1.22),firstBaseline=layout.bodyTop+fontSize;
    const overflow=lines.some((line,i)=>{
      const metrics=c.measureText(line),baseline=firstBaseline+i*lineHeight;
      return baseline-metrics.actualBoundingBoxAscent<layout.bodyTop || baseline+metrics.actualBoundingBoxDescent>layout.bodyBottom || metrics.width>right-left;
    });
    if(overflow)throw new Error(`This text is too long for ${layout.label} at ${fontSize} px. Reduce Text size or shorten the copy. The canvas is unchanged.`);
    lines.forEach((line,i)=>c.fillText(line,left,firstBaseline+i*lineHeight));
    if(subject !== 'none'){
      c.font='500 25px "DM Sans"';c.fillStyle=palette.secondary;
      c.fillText(palette.label,left,layout.subjectY);
    }
    c.strokeStyle=palette.divider;c.lineWidth=2;c.beginPath();c.moveTo(left,layout.dividerY);c.lineTo(right,layout.dividerY);c.stroke();
    c.font='600 22px "DM Sans"';c.fillStyle=palette.secondary;c.fillText('theglitchlabs.com/lumen',left,layout.footerY);
    c.save();c.translate(right-layout.sparkSize,layout.sparkY);c.scale(layout.sparkSize/36,layout.sparkSize/36);c.fillStyle=palette.accent;c.beginPath();c.moveTo(0,-36);c.bezierCurveTo(6,-8,8,-6,36,0);c.bezierCurveTo(8,6,6,8,0,36);c.bezierCurveTo(-6,8,-8,6,-36,0);c.bezierCurveTo(-8,-6,-6,-8,0,-36);c.fill();c.restore();
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not export the Lumen template.')),'image/png'));
  }
  window.LumenFactTemplate={render,palettes,formats};
})();
