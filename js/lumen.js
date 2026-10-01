(() => {
  'use strict';
  const text=document.getElementById('lumen-text'),subject=document.getElementById('lumen-subject'),format=document.getElementById('lumen-format'),size=document.getElementById('lumen-size'),button=document.getElementById('lumen-create'),status=document.getElementById('lumen-status');
  let revision=0;
  const invalidate=()=>{revision++;button.disabled=false;button.textContent='Create Lumen post';status.textContent='Create to apply your changes. The current canvas stays unchanged until ready.';};
  [text,size].forEach(input=>input.addEventListener('input',invalidate));
  subject.addEventListener('change',invalidate);
  format.addEventListener('change',invalidate);
  document.querySelectorAll('[data-brand]:not([data-brand="lumen"])').forEach(button=>button.addEventListener('click',invalidate));
  button.addEventListener('click',async()=>{
    if(!text.value.trim()){text.focus();status.textContent='Enter a fact or explanation first.';return;}
    if(!size.reportValidity())return;
    const selectedFormat=format.value;
    const version=++revision;
    button.disabled=true;button.textContent='Creating…';status.textContent='Preparing your Lumen post…';
    try{
      const blob=await window.LumenFactTemplate.render({text:text.value,subject:subject.value,fontSize:size.valueAsNumber,format:selectedFormat});
      if(version!==revision)return;
      if(!await window.lumenComposer.setFact(blob,selectedFormat,()=>version===revision))return;
      status.textContent=`Ready: ${selectedFormat.replace('x',' × ')} · Lumen fact post. Save or Download PNG to keep it.`;
    }catch(error){if(version===revision)status.textContent=error.message;}
    finally{if(version===revision){button.disabled=false;button.textContent='Create Lumen post';}}
  });
})();
