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
  async function render({text,subject='none',fontSize=64}){
    if(typeof text!=='string'||!text.trim())throw new Error('Enter a fact or explanation first.');
    if(!Number.isInteger(fontSize)||fontSize<36||fontSize>84)throw new Error('Choose a whole text size from 36 to 84 px.');
    if(typeof subject !== 'string' || !Object.hasOwn(palettes,subject))throw new Error('Choose a valid Lumen subject.');
    const palette=palettes[subject];
    const [brand]=await Promise.all([logo(palette.logo),document.fonts.load(`600 ${fontSize}px "Outfit"`),document.fonts.load('500 25px "DM Sans"'),document.fonts.load('600 22px "DM Sans"')]);
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');
    c.fillStyle=palette.background;c.fillRect(0,0,1080,1350);
    // A coordinated beam and four-point spark make this Lumen's own series.
    c.save();c.beginPath();c.moveTo(980,0);c.lineTo(1080,0);c.lineTo(1080,1350);c.lineTo(1020,1350);c.lineTo(910,1000);c.closePath();c.fillStyle=palette.beam;c.fill();c.restore();
    c.fillStyle=palette.accent;c.fillRect(0,0,16,1350);
    const logoWidth=290;c.drawImage(brand,86,78,logoWidth,logoWidth*brand.height/brand.width);
    c.textBaseline='alphabetic';c.font='600 22px "DM Sans"';c.fillStyle=palette.secondary;
    c.fillText('A LITTLE MORE',738,111);c.fillText('CURIOUS.',738,141);
    c.fillStyle=palette.secondary;c.font='600 22px "DM Sans"';c.fillText('SMALL FACT. BIG SPARK.',88,318);
    c.fillStyle=palette.accent;c.fillRect(88,346,88,6);
    c.font=`600 ${fontSize}px "Outfit"`;c.fillStyle=palette.text;
    const lines=wrap(c,text.trim(),850),lineHeight=Math.ceil(fontSize*1.22);
    if(lines.length*lineHeight>616)throw new Error('This text is too long at the selected size. Reduce Text size or shorten the copy. The canvas is unchanged.');
    // Stable top alignment keeps every post recognizable in the feed.
    lines.forEach((line,i)=>c.fillText(line,88,435+i*lineHeight));
    if(subject !== 'none'){
      c.font='500 25px "DM Sans"';c.fillStyle=palette.secondary;
      c.fillText(palette.label,88,1110);
    }
    c.strokeStyle=palette.divider;c.lineWidth=2;c.beginPath();c.moveTo(88,1190);c.lineTo(990,1190);c.stroke();
    c.font='600 22px "DM Sans"';c.fillStyle=palette.secondary;c.fillText('theglitchlabs.com/lumen',88,1245);
    c.save();c.translate(944,1237);c.fillStyle=palette.accent;c.beginPath();c.moveTo(0,-36);c.bezierCurveTo(6,-8,8,-6,36,0);c.bezierCurveTo(8,6,6,8,0,36);c.bezierCurveTo(-6,8,-8,6,-36,0);c.bezierCurveTo(-8,-6,-6,-8,0,-36);c.fill();c.restore();
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not export the Lumen template.')),'image/png'));
  }
  window.LumenFactTemplate={render,palettes};
})();
