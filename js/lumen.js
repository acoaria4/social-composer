(() => {
  'use strict';
  const text=document.getElementById('lumen-text'),subject=document.getElementById('lumen-subject'),format=document.getElementById('preset-select'),size=document.getElementById('lumen-size'),button=document.getElementById('lumen-create'),status=document.getElementById('lumen-status');
  let revision=0;
  const invalidate=()=>{revision++;button.disabled=false;button.textContent='Create Lumen post';status.textContent='Create to apply your changes. The current canvas stays unchanged until ready.';};
  text.maxLength=20000;
  let draftFormat=window.lumenComposer.getFormat();
  function captureForm(){return {text:text.value,subject:subject.value,size:size.value,format:draftFormat};}
  function restoreForm(value,savedSource){
    if(typeof value.text==='string')text.value=value.text.slice(0,20000);
    if(typeof value.subject==='string'&&Object.hasOwn(window.LumenFactTemplate.palettes,value.subject))subject.value=value.subject;
    if(typeof value.size==='string'||typeof value.size==='number')size.value=String(value.size).slice(0,12);
    if(typeof value.format==='string'&&Object.hasOwn(window.LumenFactTemplate.formats,value.format)){
      draftFormat=value.format;
      if(window.lumenComposer.setDraftFormat)window.lumenComposer.setDraftFormat(draftFormat);
      else format.value=draftFormat;
    }
    invalidate();
    if(savedSource)status.textContent='Saved Lumen text and settings loaded. Create Lumen post to apply your changes.';
  }
  window.ComposerTemplateState.register('lumen',{capture:captureForm,restore:restoreForm});
  [text,size].forEach(input=>input.addEventListener('input',invalidate));
  subject.addEventListener('change',invalidate);
  format.addEventListener('change',()=>{
    if(document.querySelector('[data-brand="lumen"]').getAttribute('aria-pressed')==='true')draftFormat=window.lumenComposer.getFormat();
    invalidate();
  });
  document.querySelectorAll('[data-brand]:not([data-brand="lumen"])').forEach(button=>button.addEventListener('click',invalidate));
  document.addEventListener('composer:document-operation',event=>{if(event.detail.owner!=='lumen')invalidate();});
  button.addEventListener('click',async()=>{
    if(!text.value.trim()){text.focus();status.textContent='Enter a fact or explanation first.';return;}
    if(!size.reportValidity())return;
    const selectedFormat=window.lumenComposer.getFormat();
    draftFormat=selectedFormat;
    const savedSource={kind:'lumen-fact',form:{...captureForm(),format:selectedFormat}};
    const version=++revision;
    const ticket=window.ComposerDocument.begin('lumen');
    button.disabled=true;button.textContent='Creating…';status.textContent='Preparing your Lumen post…';
    try{
      const blob=await window.LumenFactTemplate.render({text:savedSource.form.text,subject:savedSource.form.subject,fontSize:Number(savedSource.form.size),format:selectedFormat});
      if(version!==revision||!window.ComposerDocument.isCurrent(ticket))return;
      if(!await window.lumenComposer.setFact(blob,selectedFormat,()=>version===revision,ticket,savedSource))return;
      status.textContent=`Ready: ${selectedFormat.replace('x',' × ')} · Lumen fact post. Save or Download PNG to keep it.`;
    }catch(error){if(version===revision)status.textContent=error.message;}
    finally{if(version===revision){button.disabled=false;button.textContent='Create Lumen post';}}
  });
})();
