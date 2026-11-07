// LessonKit: the shared engine for the paper-style lessons (work/<folder>/index.html), same look and rules as
// math-g3: a menu of lessons (?lesson=<key>), one question per index card, 2 tries, combos, BOOM feedback and
// LoloWallet.lessonDone(id, rightOnFirstTry / total) at the end. A page only describes its questions:
//
//   LessonKit.run({ title, sub, lang: 'fr'|'en'|'zh' (for the voice), cheers: [...],
//     study: { title, sub, render(el) },                 // optional, ?lesson=study
//     lessons: { key: { id, title, sub, count, make(i), fast?: ms } } });
//
// make(i) returns one question: { html, say?, lang?, tries? (2), reveal? (html), hint?, lenient?, sayAfter? } plus
//   kind 'num'    ans: number              (html may hold '{?}' where the answer goes, number pad)
//   kind 'choice' ans + options [{ label, value }], cols?, huge?
//   kind 'spell'  ans: string, tiles?: letters
//   kind 'custom' mount(el, api)           api: { right(), wrong(msg), say(slow), q }
(function () {
  'use strict';
  const K = window.LessonKit = {};
  const $ = (id) => document.getElementById(id);
  const rnd = K.rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = K.pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = K.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- speech (Web Speech API, voices differ per system) ---------- */
  const LANGS = { fr: 'fr-FR', en: 'en-US', zh: 'zh-CN' };
  const hasTTS = 'speechSynthesis' in window;
  let voices = [], cache = {}, lastUtter = null;
  const norm = (l) => l.replace(/_/g, '-').toLowerCase();
  function loadVoices() { if (hasTTS) { voices = speechSynthesis.getVoices(); cache = {}; } }
  if (hasTTS) { speechSynthesis.addEventListener('voiceschanged', loadVoices); loadVoices(); setTimeout(loadVoices, 300); }
  function voiceFor(lang) {
    if (cache[lang] !== undefined) return cache[lang];
    const want = norm(LANGS[lang] || lang);
    const base = want.split('-')[0];
    const vs = voices.filter((v) => {
      const l = norm(v.lang);
      return base === 'zh' ? /^(zh|cmn)/.test(l) && !/(hk|tw|yue|mo)/.test(l) : l.split('-')[0] === base;
    });
    const nice = (v) => /online|natural|neural|premium|enhanced|google/i.test(v.name);
    const v = vs.find((x) => norm(x.lang) === want && nice(x)) || vs.find((x) => norm(x.lang) === want) || vs.find(nice) || vs[0] || null;
    if (voices.length) cache[lang] = v;
    return v;
  }
  K.hasVoice = (lang) => !!voiceFor(lang);
  K.say = (text, lang, slow, onEnd) => {
    if (!hasTTS || !text) { if (onEnd) onEnd(); return; }
    if (!voices.length) loadVoices();
    lang = lang || (C && C.lang) || 'en';
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      const v = voiceFor(lang);
      u.lang = v ? v.lang : (LANGS[lang] || lang);
      if (v) u.voice = v;
      u.rate = slow ? 0.55 : 0.85;
      if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
      lastUtter = u; // Chrome can drop an utterance it garbage-collects
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    };
    // Android Chrome swallows a speak() right after cancel()
    if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(go, 120); } else go();
  };
  const VOICE_HELP = {
    fr: 'French', en: 'English', zh: 'Chinese (Mandarin)',
  };

  /* ---------- sounds + fireworks ---------- */
  let actx = null;
  const tone = K.tone = (freqs, type, step = 0.08, len = 0.18, vol = 0.12) => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * step;
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + len + 0.02);
      });
    } catch (e) { /* no sound, still fun */ }
  };
  const yay = (combo) => tone([523, 659, 784, 1046, 1318].slice(0, 3 + Math.min(2, combo)).map((f) => f * Math.pow(1.06, Math.min(combo, 6))), 'triangle');
  const nope = () => tone([220, 165], 'sawtooth', 0.12, 0.22, 0.1);
  function boom(text, bad) {
    const b = document.createElement('div');
    b.className = 'boom' + (bad ? ' bad' : '');
    b.textContent = text;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 1000);
    document.body.classList.remove('flash-good', 'flash-bad'); void document.body.offsetWidth;
    document.body.classList.add(bad ? 'flash-bad' : 'flash-good');
  }
  const burst = K.burst = (n, bits) => {
    const cx = innerWidth / 2, cy = innerHeight * 0.42;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'bit';
      s.textContent = pick(bits);
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.color = pick(['#e8590c', '#1f9d55', '#2f6fd6', '#d63a3a', '#b07a00', '#8e44ec']);
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 280;
      s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      s.style.setProperty('--r', rnd(-360, 360) + 'deg');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }
  };

  /* ---------- page skeleton ---------- */
  let C, L, curKey, qs, qi, typed, tries, firstTry, results, combo, best, askedAt, locked, q;
  function skeleton() {
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = `
      <div class="bar"><a href="../../?tab=work">⬅ WORK HARD</a><span class="gold" id="gold"></span></div>
      <h1 id="title"></h1><div class="sub" id="sub"></div>
      <div class="voice-warn hidden" id="voiceWarn"></div>
      <div class="menu" id="menu"></div>
      <div class="study hidden" id="study"></div>
      <div id="play" class="hidden">
        <div class="hud"><div class="dots" id="dots"></div><div class="combo" id="combo"></div></div>
        <div class="card" id="card"></div>
        <div class="feedback" id="fb"></div>
        <div id="input"></div>
        <button class="next hidden" id="next">Next ➡</button>
      </div>
      <div class="results hidden" id="results"></div>`;
    document.body.prepend(wrap);
  }
  function home() {
    $('title').textContent = C.title;
    $('sub').textContent = C.sub || 'Pick a lesson';
    ['study', 'play', 'results'].forEach((id) => $(id).classList.add('hidden'));
    $('menu').classList.remove('hidden');
  }

  /* ---------- a lesson ---------- */
  K.start = function start(key) {
    if (hasTTS) speechSynthesis.cancel();
    curKey = key;
    ['menu', 'results', 'play', 'study'].forEach((id) => $(id).classList.add('hidden'));
    window.scrollTo(0, 0);
    if (key === 'study' && C.study) {
      $('title').textContent = C.study.title;
      $('sub').textContent = C.study.sub || '';
      const el = $('study');
      el.innerHTML = '';
      el.classList.remove('hidden');
      C.study.render(el);
      const back = document.createElement('div');
      back.className = 'results';
      back.innerHTML = `<div class="row">${Object.entries(C.lessons).map(([k, l]) => `<a href="?lesson=${k}">${l.emoji || '▶'} ${l.title}</a>`).join('')}</div>`;
      el.appendChild(back);
      return;
    }
    L = C.lessons[key];
    if (!L) return home();
    if (L.reset) L.reset();
    qs = Array.from({ length: L.count }, (_, i) => L.make(i));
    qi = 0; combo = 0; best = 0; results = [];
    $('title').textContent = L.title;
    $('sub').textContent = L.sub;
    $('play').classList.remove('hidden');
    ask();
  };
  function dots() {
    $('dots').innerHTML = qs.map((_, i) => `<span class="${i < results.length ? (results[i] ? 'ok' : 'miss') : i === qi ? 'now' : ''}"></span>`).join('');
  }
  const sayQ = (slow) => {
    if (!q.say) return;
    const btn = document.querySelector('.listen button');
    if (btn) btn.classList.add('talking');
    K.say(q.say, q.lang, slow, () => { const b = document.querySelector('.listen button'); if (b) b.classList.remove('talking'); });
  };
  function ask() {
    q = qs[qi];
    typed = ''; tries = 0; firstTry = true; locked = false;
    dots();
    let html = q.html || '';
    if (q.kind === 'num') html = html.includes('{?}') ? html.replace('{?}', '<span class="answer empty" id="ans"></span>') : html + '<div style="margin-top:10px"><span class="answer empty" id="ans"></span></div>';
    const listen = q.say ? '<div class="listen"><button type="button" id="sayBtn" title="Listen">🔊</button><button type="button" class="slow" id="slowBtn" title="Slowly">🐢</button></div>' : '';
    const card = $('card');
    card.innerHTML = `<span class="tag">Question ${qi + 1} of ${qs.length}</span>${listen}${html}`;
    card.classList.remove('shake'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    if (q.say) {
      $('sayBtn').onclick = () => sayQ(false);
      $('slowBtn').onclick = () => sayQ(true);
      if (q.autoSay !== false) setTimeout(() => sayQ(false), 350);
    }
    $('fb').textContent = ''; $('fb').className = 'feedback';
    $('next').classList.add('hidden');
    const inp = $('input');
    inp.innerHTML = ''; inp.classList.remove('hidden');
    if (q.kind === 'num') buildPad(inp);
    else if (q.kind === 'choice') buildChoices(inp);
    else if (q.kind === 'spell') buildSpell(inp);
    else if (q.kind === 'custom') q.mount(inp, { right, wrong, q, say: sayQ });
    askedAt = performance.now();
  }

  // number pad
  function buildPad(el) {
    const pad = document.createElement('div');
    pad.className = 'pad';
    ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'del', '0', 'go'].forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = k === 'del' ? '⌫' : k === 'go' ? '✔' : k;
      if (k === 'del' || k === 'go') b.className = k;
      b.onclick = () => padKey(k);
      pad.appendChild(b);
    });
    el.appendChild(pad);
  }
  function renderNum() { const a = $('ans'); if (a) { a.textContent = typed; a.classList.toggle('empty', !typed); } }
  function padKey(k) {
    if (locked) return;
    if (k === 'del') typed = typed.slice(0, -1);
    else if (k === 'go') return checkNum();
    else if (typed.length < 4) typed += k;
    renderNum();
    tone([880], 'square', 0, 0.04, 0.03);
  }
  function checkNum() {
    if (!typed || locked) return;
    const a = $('ans');
    if (Number(typed) === q.ans) { a.classList.add('right'); right(); return; }
    a.classList.add('wrong');
    wrong();
    setTimeout(() => { a.classList.remove('wrong'); typed = locked ? String(q.ans) : ''; renderNum(); }, 450);
  }

  // multiple choice
  function buildChoices(el) {
    const box = document.createElement('div');
    box.className = 'choices' + (q.huge ? ' huge' : '') + (q.cls ? ' ' + q.cls : '');
    box.style.setProperty('--cols', q.cols || (q.options.length === 3 ? 3 : 2));
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = o.label;
      b.style.animationDelay = i * 0.06 + 's';
      b.dataset.i = i;
      b.onclick = () => choose(b, o);
      box.appendChild(b);
    });
    el.appendChild(box);
  }
  function choose(b, o) {
    if (locked || b.disabled) return;
    if (o.say) K.say(o.say, q.lang);
    if (o.value === q.ans) {
      b.classList.add('right');
      b.parentNode.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      right();
    } else {
      b.classList.add('wrong'); b.disabled = true;
      wrong();
      if (locked) { // out of tries: show the right one
        const ok = q.options.findIndex((x) => x.value === q.ans);
        const rb = b.parentNode.querySelector(`button[data-i="${ok}"]`);
        if (rb) rb.classList.add('right');
        b.parentNode.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      }
    }
  }

  // spelling with letter tiles
  let tileUse = [];
  function buildSpell(el) {
    const word = q.ans;
    const letters = q.tiles || shuffle(word.split('').concat(shuffle('abcdefghiklmnoprstuwy'.split('').filter((c) => !word.includes(c))).slice(0, 3)));
    el.innerHTML = `<div class="spell-box" id="spellBox"></div><div class="tiles" id="tiles"></div>
      <div class="tools"><button type="button" class="del" id="spDel">⌫ Oops</button><button type="button" class="go" id="spGo">✔ Check</button></div>`;
    tileUse = [];
    letters.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = c; b.dataset.i = i;
      b.onclick = () => spellType(c, b);
      $('tiles').appendChild(b);
    });
    $('spDel').onclick = () => spellDel();
    $('spGo').onclick = () => checkSpell();
    renderSpell();
  }
  function renderSpell() {
    const n = Math.max(q.ans.length, typed.length);
    $('spellBox').innerHTML = Array.from({ length: n }, (_, i) => `<span class="${typed[i] ? 'has' : ''}">${typed[i] || ''}</span>`).join('');
  }
  function spellType(c, btn) {
    if (locked || typed.length >= q.ans.length + 2) return;
    if (!btn) btn = [...document.querySelectorAll('#tiles button:not(.used)')].find((b) => b.textContent === c);
    if (!btn) return;
    btn.classList.add('used');
    tileUse.push(btn);
    typed += c;
    renderSpell();
    tone([660 + typed.length * 40], 'square', 0, 0.05, 0.03);
  }
  function spellDel() {
    if (locked || !typed) return;
    typed = typed.slice(0, -1);
    const b = tileUse.pop(); if (b) b.classList.remove('used');
    renderSpell();
  }
  function checkSpell() {
    if (locked || !typed) return;
    if (typed === q.ans) { $('spellBox').classList.add('right'); right(); return; }
    wrong(typed.length !== q.ans.length ? `It has ${q.ans.length} letters. Listen again!` : 'Check the letters. Listen again!');
    if (locked) { typed = q.ans; renderSpell(); $('spellBox').classList.add('right'); }
    else { typed = ''; tileUse.forEach((b) => b.classList.remove('used')); tileUse = []; setTimeout(renderSpell, 300); setTimeout(() => sayQ(true), 500); }
  }

  /* ---------- right / wrong ---------- */
  const CHEERS = ['BOOM!', 'NAILED IT!', 'GENIUS!', 'YES!!', 'PERFECT!', 'WOW!', 'SUPERSTAR!', 'BRAIN POWER!'];
  function right() {
    if (locked) return;
    locked = true;
    const fast = L.fast && firstTry && performance.now() - askedAt < L.fast;
    const counts = firstTry || !!q.lenient;
    if (counts) { combo++; best = Math.max(best, combo); } else combo = 0;
    results.push(counts);
    boom(fast ? '⚡ FAST!' : pick(C.cheers || CHEERS));
    burst(counts ? 14 + Math.min(combo, 6) * 4 : 8, C.bits || ['★', '✦', '+', '✔', '🎉', '⭐']);
    yay(combo);
    $('fb').innerHTML = (q.praise || '') + (q.praise ? ' ' : '') + (firstTry ? (combo >= 3 ? `${combo} in a row!` : 'Right on the first try!') : 'Got it!');
    $('fb').className = 'feedback good';
    showCombo();
    done();
  }
  function wrong(msg) {
    if (locked) return;
    tries++; firstTry = false; combo = 0; showCombo();
    const card = $('card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    boom(pick(C.oops || ['OOPS!', 'NOPE!', 'HMM…', 'TRY AGAIN!']), true);
    nope();
    if (tries >= (q.tries || 2)) {
      locked = true;
      results.push(false);
      $('fb').innerHTML = `${msg && q.kind === 'custom' ? msg + '<br>' : ''}The answer is <b>${q.reveal || q.ans}</b>. You'll get the next one!`;
      $('fb').className = 'feedback bad';
      done(true);
    } else {
      $('fb').innerHTML = msg || q.hint || 'Not quite. One more try!';
      $('fb').className = 'feedback bad';
      if (q.say && q.kind === 'choice') setTimeout(() => sayQ(true), 500);
    }
  }
  function done(missed) {
    if (q.onDone) q.onDone(!missed);
    if (q.sayAfter) setTimeout(() => K.say(q.sayAfter, q.lang), 400);
    if (q.kind === 'num' || q.kind === 'spell') $('input').classList.add('hidden');
    $('next').classList.remove('hidden');
    $('next').focus({ preventScroll: true });
  }
  function showCombo() {
    const c = $('combo');
    c.textContent = combo >= 2 ? `🔥 COMBO ×${combo}` : '';
    c.classList.remove('pop'); void c.offsetWidth; if (combo >= 2) c.classList.add('pop');
  }
  function next() {
    if (hasTTS) speechSynthesis.cancel();
    qi++;
    if (qi < qs.length) ask(); else finish();
  }
  function finish() {
    dots();
    const right = results.filter(Boolean).length, score = right / qs.length;
    const grade = score === 1 ? 'A+' : score >= 0.85 ? 'A' : score >= 0.7 ? 'B' : score >= 0.5 ? 'C' : 'Try again';
    $('play').classList.add('hidden');
    const r = $('results');
    r.classList.remove('hidden');
    r.innerHTML = `<div class="grade" style="${score >= 0.7 ? 'color:var(--good);border-color:var(--good)' : ''}">${grade}</div>
      <p>${right} of ${qs.length} right${L.lenientAll ? '' : ' on the first try'}${best >= 3 ? ` · best combo 🔥 ×${best}` : ''}</p>
      <div class="row"><button id="again">🔁 Again</button><a class="alt" href="./">Other lessons</a><a class="alt" href="../../?tab=work">WORK HARD</a></div>`;
    $('again').onclick = () => K.start(curKey);
    if (score === 1) { burst(40, ['🏆', '⭐', 'A+', '💯', '🎉']); yay(6); }
    const L0 = L;
    setTimeout(() => LoloWallet.lessonDone(L0.id, score, {
      message: score === 1 ? (C.perfect || 'A perfect sheet! Full gold!') : score >= 0.5 ? `${right} of ${qs.length}. Nice work!` : undefined,
    }), 700);
  }

  /* ---------- keyboard ---------- */
  addEventListener('keydown', (e) => {
    if ($('play').classList.contains('hidden') || document.querySelector('.lolo-cele')) return;
    if (e.key === 'Enter') { e.preventDefault(); if (locked) return next(); if (q.kind === 'num') checkNum(); else if (q.kind === 'spell') checkSpell(); return; }
    if (locked) return;
    if (q.kind === 'num') {
      if (/^[0-9]$/.test(e.key)) padKey(e.key);
      else if (e.key === 'Backspace') { e.preventDefault(); padKey('del'); }
    } else if (q.kind === 'spell') {
      if (/^[a-z]$/i.test(e.key)) spellType(e.key.toLowerCase());
      else if (e.key === 'Backspace') { e.preventDefault(); spellDel(); }
    } else if (q.kind === 'choice' && /^[1-9]$/.test(e.key)) {
      const b = document.querySelector(`.choices button[data-i="${+e.key - 1}"]`);
      if (b) b.click();
    }
  });

  /* ---------- start ---------- */
  K.run = (cfg) => {
    C = cfg;
    skeleton();
    $('next').onclick = next;
    // tell the player when the voice this page needs is missing (Android fills its voice list in late)
    if (C.lang && C.voiceWarn !== false) setTimeout(() => {
      if (!hasTTS || (voices.length && !voiceFor(C.lang))) {
        const w = $('voiceWarn');
        w.innerHTML = `🔇 No ${VOICE_HELP[C.lang]} voice found on this device, so the 🔊 buttons may stay quiet.<br>
          <b>Android:</b> Settings → Text-to-speech → Speech Services by Google → Install voice data → ${VOICE_HELP[C.lang]}.
          <b>Windows:</b> use Microsoft Edge, or add the language in Settings → Time &amp; language → Speech.`;
        w.classList.remove('hidden');
      }
    }, 2500);
    LoloWallet.onChange((w) => {
      $('gold').innerHTML = `${w.coin(24)} ${w.gold}`;
      const study = C.study ? `<a class="study" href="?lesson=study" style="--t:1deg"><b>📖 ${C.study.title}</b><span>${C.study.sub || ''}</span></a>` : '';
      $('menu').innerHTML = study + Object.entries(C.lessons).map(([k, l], i) => {
        const c = w.lesson(l.id);
        const v = c ? w.lessonValue(c) : { gold: 0 };
        return `<a href="?lesson=${k}" style="--t:${(i % 2 ? 1.5 : -1.5)}deg"><b>${c ? c.emoji : l.emoji || ''} ${l.title}</b><span>${l.sub}</span><br><span style="color:var(--gold)">+${v.gold} gold</span></a>`;
      }).join('');
    });
    const key = new URLSearchParams(location.search).get('lesson');
    if (key && (C.lessons[key] || (key === 'study' && C.study))) K.start(key); else home();
  };
})();
