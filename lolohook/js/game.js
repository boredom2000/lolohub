// Lolo Hook: hold to grapple the nearest glowing dot, release to fly. 10 levels, easy to hard.
// Physics lives in physics.js (shared with tests), level data in levels.js.
'use strict';
(function () {
  const Ph = window.LoloHookPhys;
  const P = Ph.P;
  const LEVELS = window.LOLO_HOOK_LEVELS.map(Ph.build);
  const NAMES = window.LOLO_HOOK_LEVELS.map((l) => l.name);
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', IS_TOUCH);

  // ---------- canvas & view ----------
  const cv = $('game');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, scale = 1, viewW = 0, viewH = 0;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    scale = Math.min(H / 1080, W / 1000);
    viewW = W / scale; viewH = H / scale;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- saved progress ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('lolohook.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('lolohook.' + k, JSON.stringify(v)); } catch (_) {} },
  };
  let unlocked = clamp(Number(store.get('unlocked', 0)) || 0, 0, LEVELS.length - 1);
  let current = clamp(Number(store.get('level', 0)) || 0, 0, unlocked);

  // ---------- sound ----------
  const Sfx = (() => {
    let ac = null;
    function audio() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f0, f1, dur, type, vol, delay) {
      const a = audio(); if (!a) return;
      const t = a.currentTime + (delay || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol) {
      const a = audio(); if (!a) return;
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; f.type = 'lowpass';
      f.frequency.setValueAtTime(3000, a.currentTime); f.frequency.exponentialRampToValueAtTime(200, a.currentTime + dur);
      g.gain.value = vol;
      src.connect(f).connect(g).connect(a.destination); src.start();
    }
    return {
      unlock: audio,
      hook() { tone(700, 1700, 0.07, 'square', 0.05); },
      release() { tone(520, 260, 0.08, 'triangle', 0.08); },
      bounce() { tone(180, 950, 0.2, 'sine', 0.2); },
      thud() { tone(150, 60, 0.08, 'sine', 0.15); },
      die() { noise(0.45, 0.35); tone(420, 50, 0.45, 'sawtooth', 0.08); },
      win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.16, 'square', 0.06, i * 0.08)); },
    };
  })();

  // ---------- game state ----------
  const game = {
    mode: 'title',   // 'title' | 'play' | 'won'
    li: current, lvl: LEVELS[current], s: null,
    paused: false, holding: false,
    falls: 0, deadT: 0, winT: 0,
    hookAnim: 1, shake: 0, time: 0, acc: 0,
    camX: 0, camY: 0, trail: [], parts: [], tut: 0,
  };

  function updateHud() {
    $('levelNum').textContent = `LEVEL ${game.li + 1} / ${LEVELS.length}`;
    $('levelName').textContent = NAMES[game.li];
    $('fallsVal').textContent = game.falls;
  }

  function banner(big, small) {
    const b = $('banner');
    b.innerHTML = big + (small ? `<small>${small}</small>` : '');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  function hint(text) {
    const h = $('hint');
    if (text) h.textContent = text;
    h.classList.toggle('show', !!text);
  }

  function loadLevel(i, retry) {
    game.li = i;
    game.lvl = LEVELS[i];
    game.s = Ph.createState(game.lvl);
    game.trail = [];
    game.acc = 0;
    game.hookAnim = 1;
    snapCamera();
    updateHud();
    current = i; store.set('level', i);
    if (retry) banner('AGAIN!', NAMES[i]);
    else banner(`LEVEL ${i + 1}`, NAMES[i]);
    // first-time tutorial on level 1
    game.tut = (i === 0 && unlocked === 0) ? 1 : 0;
    hint(game.tut ? (IS_TOUCH ? 'TOUCH & HOLD TO GRAB A DOT' : 'HOLD CLICK OR SPACE TO GRAB A DOT') : '');
  }

  function startAt(i) {
    Sfx.unlock();
    $('title').classList.add('hidden');
    $('won').classList.add('hidden');
    document.body.classList.add('playing');
    game.mode = 'play';
    game.falls = 0;
    game.parts = [];
    game.holding = false;
    loadLevel(i);
  }

  function onHooked() {
    game.hookAnim = 0;
    Sfx.hook();
    if (game.tut === 1) { game.tut = 2; hint('LET GO TO FLY!'); }
  }

  function onDie() {
    const s = game.s;
    burst(s.x, s.y, 46, ['#ff2fd6', '#ffe81a', '#ff7a1a', '#fff'], 900);
    game.shake = 16;
    game.deadT = 0.85;
    game.falls++;
    Sfx.die();
    updateHud();
    const f = $('falls'); f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump');
  }

  function onWin() {
    const s = game.s;
    burst(s.x, s.y, 70, ['#19f7ff', '#7dff2f', '#ffe81a', '#ff2fd6', '#fff'], 1100);
    game.winT = 1.2;
    Sfx.win();
    hint('');
    const cheers = ['NICE!', 'WOOHOO!', 'AWESOME!', 'SWINGTASTIC!', 'RADICAL!'];
    banner(cheers[game.li % cheers.length]);
    if (game.li + 1 > unlocked && game.li + 1 < LEVELS.length) { unlocked = game.li + 1; store.set('unlocked', unlocked); }
  }

  function finishAll() {
    game.mode = 'won';
    document.body.classList.remove('playing');
    unlocked = LEVELS.length - 1; store.set('unlocked', unlocked);
    current = 0; store.set('level', 0);
    $('wonStats').innerHTML = `All <b>${LEVELS.length}</b> levels cleared!<br>Falls this run <b>${game.falls}</b>`;
    $('won').classList.remove('hidden');
  }

  // ---------- input ----------
  function pressDown() {
    if (game.mode !== 'play' || game.paused) return;
    Sfx.unlock();
    game.holding = true;
    if (Ph.press(game.lvl, game.s)) onHooked();
  }
  function pressUp() {
    game.holding = false;
    if (game.mode !== 'play') return;
    if (Ph.release(game.s)) {
      Sfx.release();
      if (game.tut === 2) { game.tut = 0; hint(''); }
    }
  }
  let activePointer = null;
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    pressDown();
  });
  const pointerEnd = (e) => { if (e.pointerId === activePointer) { activePointer = null; pressUp(); } };
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  const HOLD_KEYS = new Set(['Space', 'ArrowUp', 'KeyZ', 'KeyX', 'Enter']);
  window.addEventListener('keydown', (e) => {
    if (HOLD_KEYS.has(e.code) && game.mode === 'play') {
      e.preventDefault();
      if (!e.repeat) pressDown();
    } else if (e.code === 'KeyR' && game.mode === 'play' && !game.paused) {
      loadLevel(game.li, true);
    } else if (e.code === 'Escape' && game.mode === 'play') {
      setQuitOpen($('quitModal').classList.contains('hidden'));
    }
  });
  window.addEventListener('keyup', (e) => { if (HOLD_KEYS.has(e.code)) pressUp(); });
  window.addEventListener('blur', () => { activePointer = null; pressUp(); });

  // ---------- menus ----------
  function goHub() { location.href = '../'; }
  function setQuitOpen(open) {
    $('quitModal').classList.toggle('hidden', !open);
    game.paused = open;
    if (open) { activePointer = null; pressUp(); }
  }
  $('hubBtn').addEventListener('click', () => { if (game.mode === 'play') setQuitOpen(true); else goHub(); });
  $('quitNo').addEventListener('click', () => setQuitOpen(false));
  $('quitYes').addEventListener('click', goHub);
  $('quitModal').addEventListener('click', (ev) => { if (ev.target.id === 'quitModal') setQuitOpen(false); });
  $('playBtn').addEventListener('click', () => startAt(current));
  $('againBtn').addEventListener('click', () => startAt(0));
  $('wonHub').addEventListener('click', goHub);

  function buildTitle() {
    $('playBtn').textContent = current > 0 ? `PLAY LEVEL ${current + 1}` : 'PLAY';
    const box = $('levelPick');
    box.innerHTML = '';
    LEVELS.forEach((_, i) => {
      const b = document.createElement('button');
      b.textContent = i + 1;
      b.title = i <= unlocked ? NAMES[i] : 'Locked';
      b.disabled = i > unlocked;
      if (i < unlocked) b.classList.add('done');
      if (i === current) b.classList.add('cur');
      b.addEventListener('click', () => startAt(i));
      box.appendChild(b);
    });
  }

  // Full screen toggle. Hidden where the browser can't do it (e.g. iPhone Safari).
  {
    const fsBtn = $('fsBtn');
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.style.display = 'none';
    fsBtn.addEventListener('click', () => {
      const de = document.documentElement;
      const p = fsEl()
        ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
      if (p && p.catch) p.catch(() => {});
    });
    const fsSync = () => {
      fsBtn.classList.toggle('on', !!fsEl());
      fsBtn.title = fsEl() ? 'Exit full screen' : 'Full screen';
    };
    document.addEventListener('fullscreenchange', fsSync);
    document.addEventListener('webkitfullscreenchange', fsSync);
  }

  // ---------- particles ----------
  function burst(x, y, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.25 + Math.random() * 0.75);
      game.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200,
        life: 0.6 + Math.random() * 0.7, max: 1.3, size: 4 + Math.random() * 7,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  function updateParts(dt) {
    for (const p of game.parts) {
      p.life -= dt; p.vy += 1400 * dt; p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    game.parts = game.parts.filter((p) => p.life > 0);
  }

  // ---------- camera ----------
  function camTarget() {
    const s = game.s, lvl = game.lvl;
    let x;
    if (lvl.width <= viewW) x = (lvl.width - viewW) / 2;
    else x = clamp(s.x - viewW * 0.38 + clamp(s.vx * 0.12, -120, 220), -60, lvl.width - viewW + 60);
    const y = Math.min(P.FLOOR + 80 - viewH, s.y - viewH * 0.42);
    return { x, y };
  }
  function snapCamera() { const t = camTarget(); game.camX = t.x; game.camY = t.y; }

  // ---------- update ----------
  function update(dt) {
    game.time += dt;
    updateParts(dt);
    game.shake = Math.max(0, game.shake - 60 * dt);
    game.hookAnim = Math.min(1, game.hookAnim + dt / 0.07);
    const s = game.s;

    if (game.mode === 'title') {
      // attract mode: slowly pan across the level
      s.t += dt;
      const span = Math.max(0, game.lvl.width - viewW);
      game.camX = span * (0.5 - 0.5 * Math.cos(game.time * 0.12)) - (span ? 0 : (viewW - game.lvl.width) / 2);
      game.camY = P.FLOOR + 80 - viewH;
      return;
    }
    if (game.mode !== 'play' || game.paused) return;

    if (s.dead) {
      game.deadT -= dt;
      if (game.deadT <= 0) loadLevel(game.li, true);
    } else if (s.won) {
      game.winT -= dt;
      if (game.winT <= 0) {
        if (game.li + 1 < LEVELS.length) loadLevel(game.li + 1);
        else finishAll();
      }
    } else {
      game.acc += dt;
      while (game.acc >= P.DT) {
        game.acc -= P.DT;
        // holding with no rope keeps trying, so a dot that drifts into range gets grabbed
        if (game.holding && s.hook < 0 && Ph.press(game.lvl, s)) onHooked();
        Ph.step(game.lvl, s, P.DT);
        if (s.bounced) { Sfx.bounce(); burst(s.x, s.y + P.R, 14, ['#7dff2f', '#fff'], 400); }
        if (s.landed) Sfx.thud();
        if (s.dead) { onDie(); break; }
        if (s.won) { onWin(); break; }
      }
      game.trail.push({ x: s.x, y: s.y });
      if (game.trail.length > 26) game.trail.shift();
    }

    if (!s.dead) {
      const t = camTarget();
      const k = 1 - Math.exp(-6 * dt);
      game.camX += (t.x - game.camX) * k;
      game.camY += (t.y - game.camY) * k;
    }
  }

  // ---------- drawing ----------
  const stars = Array.from({ length: 140 }, () => ({
    x: Math.random(), y: Math.random(), d: 0.05 + Math.random() * 0.25, r: 0.6 + Math.random() * 1.8, p: Math.random() * TAU,
  }));
  const _p = { x: 0, y: 0 };

  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c0018'); g.addColorStop(0.6, '#24003f'); g.addColorStop(1, '#3a0060');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // slow spinning rays, like the hub
    ctx.save();
    ctx.translate(W / 2, H * 0.45);
    ctx.rotate(t * 0.05);
    ctx.fillStyle = 'rgba(80, 0, 140, 0.22)';
    const R = Math.hypot(W, H);
    for (let i = 0; i < 18; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, (i / 18) * TAU, ((i + 0.5) / 18) * TAU);
      ctx.fill();
    }
    ctx.restore();

    // stars (parallax)
    for (const st of stars) {
      const x = ((st.x * W * 1.3 - game.camX * scale * st.d) % W + W) % W;
      const y = ((st.y * H - game.camY * scale * st.d * 0.5) % H + H) % H;
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2 + st.p));
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, st.r, st.r);
    }
    ctx.globalAlpha = 1;

    // striped synthwave sun sitting on the horizon (the laser floor)
    const fy = (P.FLOOR - game.camY) * scale;
    const sunR = Math.min(W, H) * 0.24;
    const sx = W * 0.62 - game.camX * scale * 0.03 % (W * 0.4);
    const sy = Math.min(fy, H + sunR * 0.6) - sunR * 0.25;
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, sunR, 0, TAU); ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - sunR, 0, sy + sunR);
    sg.addColorStop(0, '#ffe81a'); sg.addColorStop(0.5, '#ff7a1a'); sg.addColorStop(1, '#ff2fd6');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = sg; ctx.fillRect(sx - sunR, sy - sunR, sunR * 2, sunR * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#24003f';
    for (let i = 0; i < 7; i++) {
      const yy = sy + sunR * (0.05 + i * 0.14);
      ctx.fillRect(sx - sunR, yy, sunR * 2, 2 + i * 1.6);
    }
    ctx.restore();
  }

  function drawFloor(t) {
    const fy = (P.FLOOR - game.camY) * scale;
    if (fy > H + 20) return;
    const g = ctx.createLinearGradient(0, fy, 0, H);
    g.addColorStop(0, '#2a0040'); g.addColorStop(1, '#0c0018');
    ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);

    // perspective grid scrolling with the camera
    ctx.save();
    ctx.beginPath(); ctx.rect(0, fy, W, H - fy); ctx.clip();
    ctx.strokeStyle = 'rgba(25, 247, 255, 0.4)'; ctx.lineWidth = 1.5;
    const depth = Math.max(H - fy, 1);
    for (let i = 1; i < 10; i++) {
      const f = (i + (t * 1.5) % 1) / 10;
      const yy = fy + depth * f * f * 1.4;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    }
    const step = 90, off = (game.camX * scale) % step;
    ctx.strokeStyle = 'rgba(255, 47, 214, 0.45)';
    for (let k = -14; k <= 14; k++) {
      const xt = W / 2 + k * step - off;
      ctx.beginPath(); ctx.moveTo(xt, fy); ctx.lineTo(W / 2 + (xt - W / 2) * 5, fy + depth * 1.4); ctx.stroke();
    }
    ctx.restore();

    // the laser line itself
    const haze = ctx.createLinearGradient(0, fy - 50, 0, fy);
    haze.addColorStop(0, 'rgba(255, 47, 214, 0)'); haze.addColorStop(1, 'rgba(255, 47, 214, 0.35)');
    ctx.fillStyle = haze; ctx.fillRect(0, fy - 50, W, 50);
    ctx.save();
    ctx.shadowColor = '#ff2fd6'; ctx.shadowBlur = 20;
    ctx.strokeStyle = '#ff7ae8'; ctx.lineWidth = 4 + Math.sin(t * 12) * 1;
    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
    ctx.restore();
  }

  function worldTransform() {
    const k = DPR * scale;
    const sx = (Math.random() - 0.5) * game.shake * DPR, sy = (Math.random() - 0.5) * game.shake * DPR;
    ctx.setTransform(k, 0, 0, k, -game.camX * k + sx, -game.camY * k + sy);
  }

  function drawBlocks() {
    for (const b of game.lvl.blocks) {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, '#4b0080'); g.addColorStop(1, '#1d0033');
      ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.save();
      ctx.shadowColor = '#19f7ff'; ctx.shadowBlur = 16;
      ctx.strokeStyle = '#19f7ff'; ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  }

  function drawPads(t) {
    for (const p of game.lvl.pads) {
      ctx.save();
      ctx.shadowColor = '#7dff2f'; ctx.shadowBlur = 20;
      ctx.fillStyle = '#7dff2f'; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.restore();
      ctx.strokeStyle = '#7dff2f'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const f = (t * 1.2 + i / 3) % 1;
        ctx.globalAlpha = 1 - f;
        const y = p.y - 14 - f * 70;
        const cx = p.x + p.w / 2;
        ctx.beginPath(); ctx.moveTo(cx - 26, y + 14); ctx.lineTo(cx, y); ctx.lineTo(cx + 26, y + 14); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHazards(t) {
    for (const h of game.lvl.hazards) {
      const p = Ph.at(h, game.s.t, _p);
      if (h.mx || h.my) {
        ctx.strokeStyle = 'rgba(255, 48, 96, 0.25)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
        ctx.strokeRect(h.x - Math.abs(h.mx), h.y - Math.abs(h.my), h.w + 2 * Math.abs(h.mx), h.h + 2 * Math.abs(h.my));
        ctx.setLineDash([]);
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(p.x, p.y, h.w, h.h); ctx.clip();
      ctx.fillStyle = '#3a0020'; ctx.fillRect(p.x, p.y, h.w, h.h);
      ctx.strokeStyle = 'rgba(255, 47, 120, 0.6)'; ctx.lineWidth = 10;
      const off = (t * 60) % 36;
      ctx.beginPath();
      for (let d = -h.h - 36; d < h.w + 36; d += 36) {
        ctx.moveTo(p.x + d + off, p.y); ctx.lineTo(p.x + d + off + h.h, p.y + h.h);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.shadowColor = '#ff3060'; ctx.shadowBlur = 18 + Math.sin(t * 10) * 5;
      ctx.strokeStyle = '#ff5a8a'; ctx.lineWidth = 4;
      ctx.strokeRect(p.x, p.y, h.w, h.h);
      ctx.restore();
    }
  }

  function drawGoal(t) {
    const g = game.lvl.goal;
    ctx.save();
    ctx.translate(g.x, g.y);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 90);
    glow.addColorStop(0, 'rgba(255,255,255,0.9)'); glow.addColorStop(0.3, 'rgba(25,247,255,0.5)'); glow.addColorStop(1, 'rgba(25,247,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 90, 0, TAU); ctx.fill();
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const r = P.GOAL_R - i * 12;
      const hue = (t * 160 + i * 90) % 360;
      ctx.strokeStyle = `hsl(${hue}, 100%, 62%)`;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16;
      const a0 = t * (i % 2 ? -3 : 2.4) + i;
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a0 + TAU * 0.7); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.font = '26px Bungee, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe81a'; ctx.shadowColor = '#ff2fd6'; ctx.shadowBlur = 14;
    ctx.fillText('EXIT', 0, -P.GOAL_R - 18 + Math.sin(t * 4) * 4);
    ctx.restore();
  }

  function drawAnchors(t, target) {
    const s = game.s;
    for (let i = 0; i < game.lvl.anchors.length; i++) {
      const a = game.lvl.anchors[i];
      if (a.mx || a.my) {
        ctx.strokeStyle = 'rgba(25, 247, 255, 0.25)'; ctx.lineWidth = 3; ctx.setLineDash([6, 10]);
        ctx.beginPath(); ctx.moveTo(a.x - a.mx, a.y - a.my); ctx.lineTo(a.x + a.mx, a.y + a.my); ctx.stroke();
        ctx.setLineDash([]);
      }
      const p = Ph.at(a, s.t, _p);
      const hooked = s.hook === i, isTarget = target === i;
      const inRange = Math.hypot(p.x - s.x, p.y - s.y) <= P.RANGE;
      const col = hooked ? '#ff2fd6' : isTarget ? '#ffe81a' : '#19f7ff';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = hooked || isTarget || inRange ? 1 : 0.45;
      ctx.shadowColor = col; ctx.shadowBlur = isTarget || hooked ? 26 : 14;
      ctx.strokeStyle = col; ctx.lineWidth = 3.5;
      ctx.setLineDash([9, 7]);
      ctx.rotate(t * (isTarget ? 4 : 1.2));
      const rr = isTarget ? 26 + Math.sin(t * 10) * 3 : 22;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawRope(target) {
    const s = game.s;
    if (s.dead) return;
    if (s.hook >= 0) {
      const a = Ph.at(game.lvl.anchors[s.hook], s.t, _p);
      const k = game.hookAnim;
      const ex = s.x + (a.x - s.x) * k, ey = s.y + (a.y - s.y) * k;
      const d = Math.hypot(a.x - s.x, a.y - s.y);
      const sag = k >= 1 ? Math.max(0, s.len - d) * 0.7 : 0;
      const mx = (s.x + ex) / 2, my = (s.y + ey) / 2 + sag;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff2fd6'; ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(255, 47, 214, 0.55)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.restore();
    } else if (target >= 0 && !s.won) {
      const a = Ph.at(game.lvl.anchors[target], s.t, _p);
      ctx.strokeStyle = 'rgba(255, 232, 26, 0.45)'; ctx.lineWidth = 2; ctx.setLineDash([4, 12]);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawTrail(t) {
    const tr = game.trail;
    if (game.s.dead || tr.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const f = i / tr.length;
      ctx.strokeStyle = `hsla(${(t * 220 + i * 14) % 360}, 100%, 60%, ${f * 0.7})`;
      ctx.lineWidth = P.R * 1.4 * f;
      ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(t, target) {
    const s = game.s;
    if (s.dead) return;
    const sp = Math.hypot(s.vx, s.vy);
    const ang = Math.atan2(s.vy, s.vx);
    const st = 1 + Math.min(sp / 3200, 0.28);
    ctx.save();
    ctx.translate(s.x, s.y);
    // squash & stretch along the velocity
    ctx.save();
    ctx.rotate(ang); ctx.scale(st, 1 / st); ctx.rotate(-ang);
    ctx.shadowColor = '#ff2fd6'; ctx.shadowBlur = 24;
    const g = ctx.createRadialGradient(-6, -7, 2, 0, 0, P.R);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#ff9cf0'); g.addColorStop(1, '#c400a0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, P.R, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffe81a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, P.R, 0, TAU); ctx.stroke();
    ctx.restore();

    // eyes look where we're going (or at the dot we're about to grab)
    let lx = s.vx, ly = s.vy;
    const look = s.hook >= 0 ? s.hook : target;
    if (look >= 0 && sp < 400) { const a = Ph.at(game.lvl.anchors[look], s.t, _p); lx = a.x - s.x; ly = a.y - s.y; }
    const ll = Math.hypot(lx, ly) || 1;
    const ox = (lx / ll) * 2.6, oy = (ly / ll) * 2.6;
    const blink = (t % 3.2) < 0.12 ? 0.15 : 1;
    for (const ex of [-6.5, 6.5]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, -4, 5, 6.5 * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#12001f';
      ctx.beginPath(); ctx.arc(ex + ox, -4 + oy * blink, 2.6 * blink, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 60, 120, 0.6)';
    ctx.beginPath(); ctx.arc(-11, 5, 3, 0, TAU); ctx.arc(11, 5, 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#12001f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (sp > 1200) {
      ctx.fillStyle = '#12001f';
      ctx.beginPath(); ctx.ellipse(0, 7, 3.5, 4.5, 0, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 4, 5, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  function drawParts() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of game.parts) {
      ctx.globalAlpha = Math.min(1, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  function draw() {
    const t = game.time;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(t);
    drawFloor(t);
    worldTransform();
    const s = game.s;
    const target = (game.mode === 'play' && s.hook < 0 && !s.dead && !s.won) ? Ph.pick(game.lvl, s) : -1;
    drawPads(t);
    drawBlocks();
    drawHazards(t);
    drawGoal(t);
    drawAnchors(t, target);
    drawTrail(t);
    drawRope(target);
    if (game.mode !== 'title') drawPlayer(t, target);
    drawParts();
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  game.s = Ph.createState(game.lvl);
  buildTitle();
  updateHud();
  requestAnimationFrame(frame);
})();
