// Arcade: shared chrome for the newer PLAY HARD games (play/<id>/). It adds the corner HUB + full-screen buttons,
// the title screen, the game-over screen (PLAY AGAIN goes through loloAd, which is where core/wallet.js charges the
// next round), the "Back to the Hub?" window, a big banner, a high-DPI canvas, a game loop and little synth sounds.
//
//   Arcade.init({ id, logo: ['WORD', 'WORD'], tag, helpDesk, helpTouch, start(), playing() });
//   Arcade.over({ title, lose, stats, score })   // score = number for the best-score line
//   const view = Arcade.canvas(onResize)         // view.ctx, view.w, view.h (CSS pixels)
//   Arcade.loop(update(dt), draw())              // update is skipped while Arcade.paused
(function () {
  'use strict';
  const A = window.Arcade = {};
  const $ = (id) => document.getElementById(id);
  A.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
  A.paused = false;
  let o = null;

  /* ---------- best score (per game, this browser) ---------- */
  const bestKey = () => 'arc-best-' + o.id;
  A.getBest = () => { try { return +localStorage.getItem(bestKey()) || 0; } catch (e) { return 0; } };
  A.saveBest = (score) => {
    const old = A.getBest();
    if (score > old) { try { localStorage.setItem(bestKey(), score); } catch (e) { /* private mode */ } return true; }
    return false;
  };
  function showBest() { const b = A.getBest(); $('arcBestT').textContent = b ? `★ BEST ${b.toLocaleString()} ★` : ''; }

  /* ---------- screens ---------- */
  A.init = (opts) => {
    o = opts;
    document.body.classList.toggle('touch', A.touch);
    document.body.insertAdjacentHTML('beforeend', `
      <div id="arcCorner"><button id="arcHub" title="Back to the Lolo Hub">&#x2302; HUB</button>
        <button id="arcFs" title="Full screen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button></div>
      <div id="arcBanner"></div>
      <div id="arcTitle" class="arc-overlay">
        <h1 class="arc-logo">${o.logo.map((w) => `<span>${w}</span>`).join('')}</h1>
        <p class="arc-tag">${o.tag}</p>${o.titleExtra || ''}
        <div class="arc-row"><button id="arcPlay" class="arc-big">PLAY</button></div>
        <div class="arc-best" id="arcBestT"></div>
        <p class="arc-help desk">${o.helpDesk}</p><p class="arc-help touch">${o.helpTouch}</p>
      </div>
      <div id="arcOver" class="arc-overlay hidden">
        <h2 class="arc-over-title" id="arcOverT"></h2><p class="arc-stats" id="arcOverS"></p>
        <div class="arc-row"><button id="arcAgain" class="arc-big">PLAY AGAIN</button><button id="arcOverHub" class="arc-small">&#x2302; HUB</button></div>
      </div>
      <div id="arcQuit" class="arc-overlay hidden" role="dialog" aria-modal="true">
        <div class="arc-panel"><h2>Back to the Hub?</h2><p>${o.quitNote || 'This round will end.'}</p>
          <div class="arc-row"><button id="arcQuitNo" class="arc-small">Keep playing</button><button id="arcQuitYes" class="arc-small danger">Leave</button></div></div>
      </div>`);
    showBest();
    const goHub = () => { location.href = '../../'; };
    const play = () => { $('arcTitle').classList.add('hidden'); A.sfx.unlock(); o.start(); };
    const again = () => { $('arcOver').classList.add('hidden'); A.sfx.unlock(); window.loloAd ? window.loloAd('game-over', o.start) : o.start(); };
    $('arcPlay').onclick = play;
    $('arcAgain').onclick = again;
    $('arcOverHub').onclick = goHub;
    const setQuit = (open) => { $('arcQuit').classList.toggle('hidden', !open); A.paused = open; };
    $('arcHub').onclick = () => (o.playing && o.playing() ? setQuit(true) : goHub());
    $('arcQuitNo').onclick = () => setQuit(false);
    $('arcQuitYes').onclick = goHub;
    $('arcQuit').addEventListener('click', (e) => { if (e.target.id === 'arcQuit') setQuit(false); });
    $('arcFs').onclick = () => {
      const d = document;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else { const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); }
    };
    addEventListener('keydown', (e) => {
      if (document.querySelector('.lolo-gate')) return;
      if (e.code === 'Escape') { if (o.playing && o.playing()) setQuit($('arcQuit').classList.contains('hidden')); return; }
      if (e.code === 'Enter' || e.code === 'Space') {
        if (!$('arcTitle').classList.contains('hidden')) { e.preventDefault(); play(); }
        else if (!$('arcOver').classList.contains('hidden') && performance.now() - overAt > 800) { e.preventDefault(); again(); }
      }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && o.playing && o.playing()) setQuit(true); });
  };
  let overAt = 0;
  A.over = ({ title, lose, stats, score }) => {
    overAt = performance.now();
    const isNew = score != null && A.saveBest(score);
    $('arcOverT').textContent = title;
    $('arcOverT').classList.toggle('lose', !!lose);
    $('arcOverS').innerHTML = stats + (isNew ? '<br><span class="new">★ NEW BEST! ★</span>' : score != null ? `<br>Best: <b>${A.getBest().toLocaleString()}</b>` : '');
    $('arcOver').classList.remove('hidden');
    showBest();
    if (isNew) A.sfx.fanfare(); else if (lose) A.sfx.lose();
  };
  A.banner = (text, sub, color) => {
    const b = $('arcBanner');
    b.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    b.style.color = color || '';
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  };
  A.stat = (el, value) => {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    const v = el.querySelector('span');
    const s = String(value);
    if (v.textContent !== s) { v.textContent = s; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  };

  /* ---------- canvas + loop ---------- */
  A.canvas = (onResize) => {
    const cv = document.createElement('canvas');
    cv.className = 'arc-game';
    document.body.prepend(cv);
    const view = { cv, ctx: cv.getContext('2d'), w: 0, h: 0, dpr: 1 };
    const fit = () => {
      view.dpr = Math.min(2, window.devicePixelRatio || 1);
      view.w = innerWidth; view.h = innerHeight;
      cv.width = Math.round(view.w * view.dpr); cv.height = Math.round(view.h * view.dpr);
      view.ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      if (onResize) onResize(view);
    };
    addEventListener('resize', fit);
    fit();
    return view;
  };
  A.loop = (update, draw) => {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!A.paused) update(dt);
      draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  /* ---------- little synth sounds ---------- */
  let ac = null, master = null;
  const ctx = () => {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } catch (e) { return null; }
    }
    return ac;
  };
  const S = A.sfx = {
    unlock() { const c = ctx(); if (c && c.state === 'suspended') c.resume(); },
    tone(f, len = 0.15, type = 'square', vol = 0.15, slide = 0, delay = 0) {
      const c = ctx(); if (!c) return;
      const t = c.currentTime + delay, os = c.createOscillator(), g = c.createGain();
      os.type = type; os.frequency.setValueAtTime(f, t);
      if (slide) os.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + len);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      os.connect(g); g.connect(master); os.start(t); os.stop(t + len + 0.02);
    },
    noise(len = 0.25, vol = 0.2, freq = 1200, delay = 0) {
      const c = ctx(); if (!c) return;
      const t = c.currentTime + delay, n = Math.floor(c.sampleRate * len), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master); src.start(t);
    },
    arp(freqs, step = 0.07, type = 'triangle', vol = 0.13, len = 0.16) { freqs.forEach((f, i) => S.tone(f, len, type, vol, 0, i * step)); },
    pop(pitch = 1) { S.tone(420 * pitch, 0.09, 'sine', 0.2, 500 * pitch); },
    hit() { S.noise(0.08, 0.15, 2500); },
    boom() { S.noise(0.5, 0.35, 600); S.tone(120, 0.4, 'sawtooth', 0.12, -80); },
    coin() { S.arp([988, 1319], 0.06, 'square', 0.08, 0.1); },
    up() { S.arp([523, 659, 784, 1046], 0.06, 'triangle', 0.14); },
    lose() { S.arp([392, 330, 262, 196], 0.13, 'sawtooth', 0.1, 0.25); },
    fanfare() { S.arp([523, 659, 784, 1046, 784, 1046, 1318], 0.09, 'square', 0.1, 0.2); },
  };

  /* ---------- small helpers ---------- */
  A.rnd = (a, b) => a + Math.random() * (b - a);
  A.irnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  A.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  A.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  A.fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
})();
