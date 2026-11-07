(() => {
  'use strict';
  const ENDPOINT = 'https://aura-glitchlabs.fly.dev/api/horoscopes/daily';
  const template = window.AuraHoroscopeTemplate;
  const SIGNS = template.signs;
  const source = document.getElementById('horoscope-source');
  const manualPanel = document.getElementById('horoscope-manual');
  const fields = SIGNS.map((sign, index) => {
    const label = document.createElement('label');
    label.className = 'horoscope-field';
    const name = document.createElement('span');
    const input = document.createElement('textarea');
    input.id = `horoscope-reading-${sign.toLowerCase()}`;
    input.rows = 5;
    input.setAttribute('aria-describedby', 'horoscope-status');
    input.addEventListener('input', () => {input.removeAttribute('aria-invalid'); update();});
    label.append(name, input);
    document.getElementById('horoscope-readings').append(label);
    return {name, input, index};
  });
  const dateInput = document.getElementById('horoscope-date');
  const language = document.getElementById('horoscope-language');
  const context = document.getElementById('horoscope-context');
  const fontSize = document.getElementById('horoscope-font-size');
  const fontRange = document.getElementById('horoscope-font-size-range');
  const fontWeight = document.getElementById('horoscope-font-weight');
  const typography = () => ({readingFontSize:fontSize.valueAsNumber, readingFontWeight:Number(fontWeight.value)});
  const theme = document.getElementById('horoscope-theme');
  const button = document.getElementById('horoscope-create');
  const coverButton = document.getElementById('horoscope-cover');
  const blankButton = document.getElementById('horoscope-blank');
  const status = document.getElementById('horoscope-status');
  const paletteLabel = document.getElementById('horoscope-palette');
  const apiStatus = document.getElementById('horoscope-api-status');
  let apiController = null;
  let apiRevision = 0;
  function setApiStatus(state, text) {
    apiStatus.dataset.state = state;
    apiStatus.textContent = text;
    apiStatus.title = state === 'waiting'
      ? 'The response is taking longer than usual. The API may be starting up.'
      : state === 'working' ? 'The daily horoscope endpoint returned a valid edition.'
      : state === 'error' ? 'The request failed, timed out, or returned invalid readings. Select AURA again or create a horoscope to retry.' : '';
  }
  async function fetchReadings(day, lang, signal) {
    apiController?.abort();
    const controller = new AbortController();
    apiController = controller;
    const version = ++apiRevision;
    let timedOut = false;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, {once:true});
    if (signal?.aborted) cancel();
    setApiStatus('checking', 'Checking API…');
    const slow = setTimeout(() => {
      if (version === apiRevision) setApiStatus('waiting', 'Waiting for API to cold start');
    }, 3000);
    const timeout = setTimeout(() => {timedOut = true;controller.abort();}, 60000);
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set('date', day);url.searchParams.set('lang', lang);
      const response = await fetch(url, {signal:controller.signal, credentials:'omit', cache:'no-store'});
      if (!response.ok) throw new Error(`AURA returned HTTP ${response.status}. Please retry when the daily API is available.`);
      const data = validate(await response.json(), day, lang);
      if (version === apiRevision) setApiStatus('working', 'Working');
      return data;
    } catch (error) {
      // Canceled selections are not outages; only failed or timed-out requests are.
      if (version === apiRevision && (!controller.signal.aborted || timedOut)) setApiStatus('error', 'API not working');
      throw error;
    } finally {
      clearTimeout(slow);clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      if (version === apiRevision) apiController = null;
    }
  }
  function checkApi() {
    if (source.value !== 'api' || !dateInput.checkValidity() || request) return;
    fetchReadings(dateInput.value, language.value).catch(() => {});
  }
  document.querySelector('[data-brand="aura"]').addEventListener('click', checkApi);
  document.querySelectorAll('[data-brand]:not([data-brand="aura"])').forEach(button => {
    button.addEventListener('click', update);
  });
  let request = null;
  let revision = 0;
  dateInput.value = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function palette() { return template.palette(theme.value, dateInput.value); }

  function resetButtons() {
    button.disabled = false;
    button.textContent = 'Create horoscope';
    coverButton.disabled = false;
    coverButton.textContent = 'Create cover';
    blankButton.disabled = false;
    blankButton.textContent = 'Blank horoscope template';
  }

  // All artwork actions share one revision so a previous request or render
  // cannot replace the result of a later cover, blank, or horoscope action.
  function cancelWork() {
    revision++;
    apiRevision++;
    apiController?.abort();
    apiController = null;
    request?.abort();
    request = null;
    resetButtons();
    return revision;
  }

  function finishWork(version) {
    if (version !== revision) return;
    resetButtons();
    request = null;
  }

  function update() {
    cancelWork();
    const manual = source.value === 'manual';
    manualPanel.hidden = !manual;
    apiStatus.hidden = manual;
    context.hidden = manual;
    context.textContent = '';
    if (!manual) setApiStatus('idle', 'Create horoscope to fetch readings.');
    fields.forEach(({name, input, index}) => {
      name.textContent = language.value === 'ta' ? template.tamil[index] : template.rasis[index];
      input.lang = language.value;
      name.lang = language.value;
    });
    const colors = palette();
    paletteLabel.textContent = colors[0];
    paletteLabel.style.setProperty('--day-accent', colors[3]);
    status.textContent = 'Create a cover or horoscope to apply your settings. Any existing canvas stays unchanged until ready.';
  }
  source.addEventListener('change', () => {update();checkApi();});
  dateInput.addEventListener('change', () => {update();checkApi();});
  theme.addEventListener('change', update);
  fontRange.addEventListener('input', () => {fontSize.value=fontRange.value;update();});
  fontSize.addEventListener('input', () => {if(fontSize.checkValidity())fontRange.value=fontSize.value;update();});
  fontWeight.addEventListener('change', update);
  language.addEventListener('change', () => {update();checkApi();});
  update();

  function validate(data, day, lang) {
    if (data.date !== day || data.language !== lang || data.timezone !== 'Asia/Kolkata' || !Array.isArray(data.readings) || data.readings.length !== 12) {
      throw new Error('AURA returned an incomplete, different-language, or different-date edition. No post was created.');
    }
    const ordered = SIGNS.map(name => {
      const matches = data.readings.filter(r => r.sign === name.toLowerCase());
      if (matches.length !== 1 || typeof matches[0].summary !== 'string' || !matches[0].summary.trim()) {
        throw new Error(`The ${name} reading is missing. No post was created.`);
      }
      return {name, text: matches[0].summary.trim()};
    });
    if (typeof data.disclaimer !== 'string' || !data.disclaimer.trim()) throw new Error('AURA did not return its reading context. Please retry.');
    return {...data, ordered};
  }
  const render = template.render;
  coverButton.addEventListener('click', async () => {
    if (!dateInput.reportValidity()) return;
    const version = cancelWork();
    const day = dateInput.value, lang = language.value, colors = palette();
    request = new AbortController();
    coverButton.disabled = true;
    coverButton.textContent = 'Creating cover…';
    context.textContent = '';
    status.textContent = 'Preparing your daily cover…';
    try {
      const blob = await template.renderCover({date:day, language:lang}, colors);
      if (version !== revision) return;
      if (!await window.auraComposer.setHoroscope(blob, day, () => version === revision, 'cover')) return;
      status.textContent = `Cover ready: ${day} · ${colors[0]} · ${lang === 'ta' ? 'தமிழ்' : 'English'}. Save or Download PNG to keep it.`;
    } catch (error) {
      if (version === revision) status.textContent = error.message;
    } finally {
      finishWork(version);
    }
  });
  blankButton.addEventListener('click', async () => {
    if (!dateInput.reportValidity()) return;
    const version=cancelWork(), day=dateInput.value,lang=language.value;
    request = new AbortController();
    blankButton.disabled = true;
    blankButton.textContent = 'Creating blank template…';
    context.textContent = '';
    status.textContent = 'Preparing your blank horoscope template…';
    try {
      const blob=await render({date:day,language:lang},palette(),{blank:true});
      if(version!==revision)return;
      if (!await window.auraComposer.setHoroscope(blob,day,()=>version===revision)) return;
      context.textContent='';
      status.textContent='Blank template ready. Add your own readings below each sign name. Download PNG to export.';
    } catch(error) {if(version===revision)status.textContent=error.message;}
    finally {finishWork(version);}
  });
  button.addEventListener('click', async()=>{
    if(!dateInput.reportValidity() || !fontSize.reportValidity())return;
    const version = cancelWork();
    const manual = source.value === 'manual';
    if (manual) {
      const missing = fields.find(({input}) => !input.value.trim());
      if (missing) {
        missing.input.setAttribute('aria-invalid', 'true');
        document.getElementById("horoscope-manual").open = true;
        missing.input.focus();
        status.textContent = `Add the ${missing.name.textContent} reading. The canvas is unchanged.`;
        return;
      }
    }
    const day=dateInput.value,lang=language.value,colors=palette();
    const textStyle = typography();
    const manualData = {date:day, language:lang, ordered:fields.map(({input}, i)=>({name:SIGNS[i], text:input.value.trim()}))};
    const controller=new AbortController();request=controller;
    button.disabled=true;button.textContent=manual?'Creating horoscope…':'Loading AURA…';status.textContent=manual?'Preparing your 12 readings…':`Fetching all 12 readings for ${day}…`;
    try {
      const data=manual ? manualData : await fetchReadings(day, lang, controller.signal);
      if(version!==revision)return;
      const blob=await render(data,colors,textStyle);
      if(version!==revision)return;
      if (!await window.auraComposer.setHoroscope(blob,day,()=>version===revision)) return;
      context.textContent=manual?'':data.disclaimer;context.lang=lang;
      status.textContent=`Ready: ${day} · ${colors[0]} · ${lang==='ta'?'தமிழ்':'English'} · all 12 ${manual?'manual readings':'readings from AURA'}. Download PNG to export.`;
    } catch(error) {
      if(version!==revision)return;
      status.textContent=error.name==='AbortError' ? 'AURA took too long to respond. Please retry. The canvas is unchanged.' : !manual && error instanceof TypeError ? 'Could not reach AURA. Check your connection and that the API allows this website. The canvas is unchanged.' : error.message;
    } finally {
      finishWork(version);
    }
  });
})();
