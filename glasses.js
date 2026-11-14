/* Glasses: Meta glasses as camera and earpiece for Vehicle Scan. Owner: Dylan (shared). Ideas and sign-off: Jonathan.

   How it works today, with no extra app:
   - Camera: videos and photos taken on the glasses land in the phone's gallery (Meta AI app auto-import).
     The person picks them here; this file pulls still frames from a video and sends them to Claude to read.
   - Earpiece: the glasses are a Bluetooth headset for the phone, so anything this app says
     (speechSynthesis) plays in the glasses' speakers.
   - Claude: each person's own Claude API key, saved only on their phone (never in this public repo),
     like the monday.com token. A walkaround costs a few cents.

   Nothing here touches monday.com or SCOUT; app.js decides what to do with what Claude reads. */
(function () {
  'use strict';
  const API = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-sonnet-5-5';

  /* ---------- VIN check digit (same math as the scanner) ---------- */
  const TR = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const WT = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  function cleanVin(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function vinValid(v) {
    v = cleanVin(v); if (v.length !== 17 || /[IOQ]/.test(v)) return false;
    let s = 0; for (let i = 0; i < 17; i++) { const c = v[i]; const n = /\d/.test(c) ? +c : TR[c]; if (n === undefined) return false; s += n * WT[i]; }
    const r = s % 11; return v[8] === (r === 10 ? 'X' : String(r));
  }

  /* ---------- pictures from the gallery ---------- */
  function drawScaled(src, w, h, maxSide, quality) {
    const k = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality || 0.72).split(',')[1];
  }
  function imageFrame(file, maxSide) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { try { resolve(drawScaled(img, img.naturalWidth, img.naturalHeight, maxSide, 0.8)); } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); } };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t open ' + file.name + '.')); };
      img.src = url;
    });
  }
  function videoFrames(file, count, maxSide, onProgress) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      const out = []; let times = [], i = 0;
      const done = (e) => { URL.revokeObjectURL(url); v.removeAttribute('src'); e ? reject(e) : resolve(out); };
      v.onerror = () => done(new Error('This phone couldn’t open the video. Try a photo instead, or re-save the video in the gallery.'));
      v.onloadedmetadata = () => {
        const d = v.duration; if (!isFinite(d) || d <= 0) return done(new Error('That video looks empty.'));
        const n = Math.max(1, Math.min(count, Math.ceil(d / 2)));       // at most one frame every 2 seconds
        times = Array.from({ length: n }, (_, k) => Math.min(d - 0.1, (d * (k + 0.5)) / n));
        v.currentTime = times[0];
      };
      v.onseeked = () => {
        try { out.push(drawScaled(v, v.videoWidth, v.videoHeight, maxSide, 0.7)); } catch (e) { return done(e); }
        i++; if (onProgress) onProgress(i / times.length);
        if (i < times.length) v.currentTime = times[i]; else done();
      };
    });
  }
  // Videos give frames spread over the clip; photos are sent whole (sharper, best for a VIN sticker).
  async function framesFrom(files, opts) {
    opts = opts || {};
    const list = [...files]; const vids = list.filter((f) => /^video\//.test(f.type)), pics = list.filter((f) => /^image\//.test(f.type));
    if (!vids.length && !pics.length) throw new Error('Pick a video or photo from the glasses.');
    const out = [];
    for (const p of pics.slice(0, 6)) out.push(await imageFrame(p, 1568));
    const per = vids.length ? Math.floor((opts.maxFrames || 20) / vids.length) : 0;
    for (const f of vids) out.push(...await videoFrames(f, per, 1024, opts.onProgress));
    return out;
  }

  /* ---------- Claude ---------- */
  // tool: { name, description, input_schema }. Claude must answer by filling it in, so the app always gets the same shape.
  async function ask(key, { system, text, images, tool, maxTokens }) {
    if (!key) throw new Error('NO_KEY');
    if (!navigator.onLine) throw new Error('No signal. Try again when the phone has a connection.');
    const content = (images || []).map((d) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d } }));
    content.push({ type: 'text', text });
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens || 2000, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content }] })
    });
    let j = null; try { j = await res.json(); } catch (e) {}
    if (res.status === 401 || res.status === 403) throw new Error('Claude didn’t accept the API key. Check it in Settings.');
    if (res.status === 429 || res.status === 529) throw new Error('Claude is busy right now. Try again in a minute.');
    if (!res.ok || !j) throw new Error('Claude error (' + res.status + ')' + (j && j.error && j.error.message ? ': ' + j.error.message : ''));
    const block = (j.content || []).find((b) => b.type === 'tool_use');
    if (!block) throw new Error('Claude didn’t send back a result. Try again.');
    return block.input;
  }

  /* ---------- talking in your ear ---------- */
  let voiceOn = true;
  function say(text) {
    if (!voiceOn || !text || !('speechSynthesis' in window)) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(String(text));
        u.rate = 1.05; u.onend = u.onerror = () => resolve();
        speechSynthesis.speak(u);
        setTimeout(resolve, 20000);
      } catch (e) { resolve(); }
    });
  }
  // Read money as words a speaker handles well: $13,900 -> "13,900 dollars"
  function sayMoney(n) { return Math.round(n).toLocaleString() + ' dollars'; }
  function quiet() { try { speechSynthesis.cancel(); } catch (e) {} }

  /* Spoken notes while the walkaround coach runs (Chrome's speech recognition, best effort).
     It skips what it hears while the app itself is talking. */
  function listen(onText) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    let stop = false; const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = 'en-US';
    r.onresult = (e) => { if (speechSynthesis.speaking) return; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()); };
    r.onend = () => { if (!stop) try { r.start(); } catch (e) {} };
    r.onerror = () => {};
    try { r.start(); } catch (e) { return null; }
    return { stop() { stop = true; try { r.stop(); } catch (e) {} } };
  }

  // The shot list Dylan hears while recording. Spaced so the whole walkaround fits in one 3-minute glasses video.
  const SHOTS = [
    ['Driver door jamb sticker. Get close and hold still two seconds.', 9],
    ['Key on. Look at the dash: odometer and any warning lights.', 10],
    ['Driver front tire. Tread and sidewall.', 8], ['Driver side, front to back.', 10], ['Driver rear tire.', 7],
    ['Rear: tailgate, bumper, and the bed.', 11], ['Passenger rear tire.', 7], ['Passenger side, back to front.', 10],
    ['Passenger front tire.', 7], ['Front end and windshield. Look for chips and cracks.', 10], ['Hood up. Engine bay, look for leaks.', 12],
    ['Interior: driver seat, dash, headliner.', 10], ['Back seat.', 8], ['Look under the truck behind each front tire for drips.', 9]
  ];
  async function coach(steps, { onStep, signal } = {}) {
    for (let i = 0; i < steps.length; i++) {
      if (signal && signal.aborted) return false;
      if (onStep) onStep(i, steps[i][0]);
      await say(steps[i][0]);
      await new Promise((r) => { const t = setTimeout(r, steps[i][1] * 1000); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
    }
    if (signal && signal.aborted) return false;
    await say('That’s it. Stop the video, then pick it here.');
    return true;
  }

  /* ---------- what Claude fills in (the wording of each request lives in modes/*.js) ---------- */
  const AREAS = ['Windshield', 'Tires', 'Visible fluid leaks', 'Body / paint condition', 'Interior condition', 'Blinkers / exterior lights', 'Other walk-around notes'];
  const TOOLS = {
    walkaround: { name: 'walkaround', description: 'What the glasses walkaround shows about this vehicle.', input_schema: { type: 'object', required: ['vin', 'areas', 'recon', 'summary'], properties: {
      vin: { type: 'string', description: 'All 17 characters exactly as printed on the door jamb sticker, windshield VIN plate or a dash screen. Empty string if not clearly readable; never guess a character.' },
      odometer: { type: ['integer', 'null'], description: 'Miles on the odometer if clearly readable, else null.' },
      areas: { type: 'array', items: { type: 'object', required: ['area', 'seen', 'ok', 'note'], properties: {
        area: { type: 'string', enum: AREAS }, seen: { type: 'boolean', description: 'Was this clearly visible in the pictures?' },
        ok: { type: 'boolean', description: 'True if nothing needing work was seen.' }, note: { type: 'string', description: 'Short, specific: where and what. Tires: each tire you saw, tread estimate, brand if readable.' } } } },
      recon: { type: 'array', description: 'Work this vehicle likely needs, from what was seen or said.', items: { type: 'object', required: ['item', 'low', 'high'], properties: {
        item: { type: 'string' }, low: { type: 'integer', description: 'Typical low cost, parts + labor, USD' }, high: { type: 'integer' } } } },
      summary: { type: 'string', description: 'One plain sentence for the recon tech.' } } } },
    photo: { name: 'photo', description: 'What the photo(s) show about the vehicle.', input_schema: { type: 'object', required: ['vin', 'flags', 'say'], properties: {
      vin: { type: 'string', description: '17 characters exactly as printed. Empty string if not clearly readable; never guess a character.' },
      lane: { type: 'string', description: 'Lane / run number if shown, else empty.' },
      miles: { type: ['integer', 'null'] },
      vehicle: { type: 'string', description: 'Year make model trim engine if shown, else empty.' },
      flags: { type: 'array', description: 'Announcements or condition problems printed or visible (frame damage, flood, title brand, TMU/odometer, as-is, structural, airbag light, check engine light).', items: { type: 'object', required: ['title', 'hard'], properties: {
        title: { type: 'string' }, hard: { type: 'boolean', description: 'True for deal-breakers: title brand, frame/structural, flood, odometer not actual, airbag.' } } } },
      say: { type: 'string', description: 'Under 25 words to speak in the buyer’s ear: lane, vehicle, miles, any flag.' } } } },
    coach: { name: 'coach', description: 'Coaching for presenting this trade number.', input_schema: { type: 'object', required: ['say', 'present', 'value_points', 'objections'], properties: {
      say: { type: 'string', description: 'Under 45 words, spoken in the salesperson’s ear before he walks back to the desk.' },
      present: { type: 'string', description: 'Two or three sentences on how to present the number.' },
      value_points: { type: 'array', items: { type: 'string' }, description: 'Up to 3 specific, honest reasons for the number, from the scan.' },
      objections: { type: 'array', items: { type: 'object', required: ['they_say', 'you_say'], properties: { they_say: { type: 'string' }, you_say: { type: 'string' } } } } } } }
  };

  window.LCCGlasses = { MODEL, AREAS, TOOLS, vinValid, cleanVin, framesFrom, ask, say, sayMoney, quiet, listen, coach, SHOTS,
    setVoice(on) { voiceOn = !!on; if (!on) quiet(); } };
})();
