(() => {
  'use strict';
  const base=new URL('../brands/current/',document.currentScript.src);
  let logoPromise;
  function logo(){return logoPromise||(logoPromise=new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>{logoPromise=null;reject(new Error('Could not load the Lumen artwork. Please reload.'));};i.src=new URL('lumen-lockup-dark.png',base).href;}));}
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
  async function render({text,source='',fontSize=64}){
    if(typeof text!=='string'||!text.trim())throw new Error('Enter a fact or explanation first.');
    if(!Number.isInteger(fontSize)||fontSize<36||fontSize>84)throw new Error('Choose a whole text size from 36 to 84 px.');
    const [brand]=await Promise.all([logo(),document.fonts.load(`600 ${fontSize}px "Outfit"`),document.fonts.load('500 25px "DM Sans"'),document.fonts.load('600 22px "DM Sans"')]);
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');
    c.fillStyle='#F8E7ED';c.fillRect(0,0,1080,1350);
    // A repeated pink beam and four-point spark make this Lumen's own series.
    c.save();c.beginPath();c.moveTo(980,0);c.lineTo(1080,0);c.lineTo(1080,1350);c.lineTo(1020,1350);c.lineTo(910,1000);c.closePath();c.fillStyle='#efdae4';c.fill();c.restore();
    c.fillStyle='#FC4177';c.fillRect(0,0,16,1350);
    const logoWidth=290;c.drawImage(brand,86,78,logoWidth,logoWidth*brand.height/brand.width);
    c.textBaseline='alphabetic';c.font='600 22px "DM Sans"';c.fillStyle='#71394f';
    c.fillText('A LITTLE MORE',738,111);c.fillText('CURIOUS.',738,141);
    c.fillStyle='#71394f';c.font='600 22px "DM Sans"';c.fillText('SMALL FACT. BIG SPARK.',88,318);
    c.fillStyle='#FC4177';c.fillRect(88,346,88,6);
    c.font=`600 ${fontSize}px "Outfit"`;c.fillStyle='#291426';
    const lines=wrap(c,text.trim(),850),lineHeight=Math.ceil(fontSize*1.22);
    if(lines.length*lineHeight>616)throw new Error('This text is too long at the selected size. Reduce Text size or shorten the copy. The canvas is unchanged.');
    // Stable top alignment keeps every post recognizable in the feed.
    lines.forEach((line,i)=>c.fillText(line,88,435+i*lineHeight));
    if(source.trim()){
      c.font='500 25px "DM Sans"';c.fillStyle='#593448';
      const sourceLines=wrap(c,'Source: '+source.trim(),800);
      if(sourceLines.length>2)throw new Error('Keep the source line to two lines. Use a short publication name instead of a long URL.');
      sourceLines.forEach((line,i)=>c.fillText(line,88,1110+i*34));
    }
    c.strokeStyle='#c89cac';c.lineWidth=2;c.beginPath();c.moveTo(88,1190);c.lineTo(990,1190);c.stroke();
    c.font='600 22px "DM Sans"';c.fillStyle='#593448';c.fillText('theglitchlabs.com/lumen',88,1245);
    c.save();c.translate(944,1237);c.fillStyle='#FC4177';c.beginPath();c.moveTo(0,-36);c.bezierCurveTo(6,-8,8,-6,36,0);c.bezierCurveTo(8,6,6,8,0,36);c.bezierCurveTo(-6,8,-8,6,-36,0);c.bezierCurveTo(-8,-6,-6,-8,0,-36);c.fill();c.restore();
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not export the Lumen template.')),'image/png'));
  }
  window.LumenFactTemplate={render};
})();
