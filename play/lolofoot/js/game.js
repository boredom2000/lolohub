'use strict';
// LOLO FOOT - wacky 4v4 football. Canvas 2D, no libraries.
// World: the pitch is W x H units. YOU (team 0, blue) attack toward +x, CPU (team 1, red) toward -x.
// In portrait the view is turned 90 degrees so you always attack "up"; sprites are drawn upright in screen space.
(() => {
  const $ = (id) => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');

  // ---------- tuning ----------
  const W = 1000, H = 620;
  const GOAL_HALF = 70, GOAL_DEPTH = 34, BAR_Z = 48;
  const VIEW_LONG = 760, VIEW_SHORT = 440;           // world units the camera tries to show
  const SPEED = 74, OWNER_SPEED = 62, GK_SPEED = 82, DIVE_SPEED = 260;
  const DASH_SPEED = 440, DASH_TIME = 0.32, DASH_CD = 2, CPU_DASH_CD = 2.6;
  const BALL_R = 6.5, GRAVITY = 900;
  const TAP_TIME = 0.18, CHARGE_TIME = 0.85;          // seconds (real time)
  const MATCH_TIME = 120, GOLDEN_TIME = 60;
  const TEAM = [
    { shirt: '#2f8bff', dark: '#1450b8', gk: '#ffd21a', name: 'YOU' },
    { shirt: '#ff3b55', dark: '#b0142c', gk: '#3dff8a', name: 'CPU' },
  ];
  const ROSTER = [
    [{ role: 'gk', name: 'Mitts', hair: '#2a1a40', skin: '#ffd6b0', spikes: 4 },
      { role: 'def', name: 'Bonk', hair: '#ff8a1a', skin: '#e8b285', spikes: 6 },
      { role: 'mid', name: 'Zippy', hair: '#ffe81a', skin: '#ffe0c4', spikes: 7 },
      { role: 'fwd', name: 'Lolo', hair: '#ff2fd6', skin: '#c98b5e', spikes: 5 }],
    [{ role: 'gk', name: 'Gloves', hair: '#7a3cff', skin: '#f1c08f', spikes: 4 },
      { role: 'def', name: 'Bruno', hair: '#111', skin: '#a8714a', spikes: 5 },
      { role: 'mid', name: 'Taco', hair: '#19f7ff', skin: '#ffd6b0', spikes: 6 },
      { role: 'fwd', name: 'Rocket', hair: '#fff', skin: '#e0a676', spikes: 7 }],
  ];
  const LANE = { gk: 0.5, def: 0.5, mid: 0.27, fwd: 0.73 };
  const ITEMS = {
    giant: { emoji: '\u{1F344}', label: 'GIANT MODE!', color: '#ff4fd8' },
    zoom: { emoji: '⚡', label: 'TURBO LEGS!', color: '#ffe81a' },
    fire: { emoji: '\u{1F525}', label: 'FIRE BALL READY!', color: '#ff7a1a' },
    freeze: { emoji: '❄️', label: 'FREEZE RAY!', color: '#7fe3ff' },
    bigGoal: { emoji: '\u{1F945}', label: 'MEGA GOAL!', color: '#7dff2f' },
    banana: { emoji: '\u{1F34C}', label: 'BANANA RAIN!', color: '#fff36b' },
  };
  const KO_WORDS = ['KO!', 'BONK!', 'POW!', 'WHAM!', 'KABOOM!', 'OUCH!', 'SPLAT!'];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const norm = (x, y) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };

  // ---------- state ----------
  const G = {
    mode: 'title', demo: true, phase: 'kickoff', phaseT: 0, clock: MATCH_TIME, golden: false, score: [0, 0],
    paused: false, slow: { t: 0, s: 1 }, ts: 1, hitstop: 0, ctrl: null, cpuChaser: null, time: 0,
    wind: null, moon: 0, mega: 0, goalHalf: [GOAL_HALF, GOAL_HALF], bigGoal: [0, 0], teamFire: [false, false],
    itemT: 7, eventT: 20, excite: 0, celebTeam: 0, endT: 0, stats: null,
  };
  const ball = {
    x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, fire: false, kicker: null, team: -1,
    kickId: 0, savedBy: -1, intended: null, lob: false, roll: 0, power: 0, inNet: -1, scored: false,
  };
  let players = [];
  const teams = [[], []];
  let items = [], peels = [], parts = [], floaters = [], cows = [];
  const cam = { x: W / 2, y: H / 2, zoom: 1, zoomT: 1, shake: 0 };
  const fx = { lines: 0, flash: 0, flashColor: '#fff', x: W / 2, y: H / 2 };
  const inp = { down: false, id: null, sx: 0, sy: 0, t0: 0, kind: null, charging: false, power: 0, maxed: false };

  function newStats() { return { shots: 0, supers: 0, kos: 0, tackles: 0, items: 0 }; }

  function makePlayers() {
    players = []; teams[0].length = 0; teams[1].length = 0;
    for (let t = 0; t < 2; t++) {
      ROSTER[t].forEach((r, i) => {
        const p = {
          team: t, idx: i, role: r.role, name: r.name, hair: r.hair, skin: r.skin, spikes: r.spikes,
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 13, fx: t ? -1 : 1, fy: 0, tx: 0, ty: 0, spd: 0,
          dashT: 0, dashCD: 0, dashX: 0, dashY: 0, hits: [], stun: 0, spin: 0, spinV: 0, noPick: 0,
          giant: 0, zoom: 0, frozen: 0, scale: 1, kickAnim: 0, whiff: 0, windup: 0, wx: 0, wy: 0, wpow: 0,
          hold: 0, think: 0, runPh: Math.random() * 6, diving: false, bumpT: 0, trail: [], wob: Math.random() * 6,
        };
        players.push(p); teams[t].push(p);
      });
    }
  }

  // ---------- view / camera ----------
  let dpr = 1, cw = 0, ch = 0, rot = false, S = 1;
  let M = new DOMMatrix(), MI = new DOMMatrix();
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; ch = window.innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    rot = ch > cw * 1.1;
  }
  window.addEventListener('resize', resize);
  resize();

  function updateCamera(rdt) {
    const base = rot ? Math.min(cw / VIEW_SHORT, ch / VIEW_LONG) : Math.min(cw / VIEW_LONG, ch / VIEW_SHORT);
    cam.zoom += (cam.zoomT - cam.zoom) * Math.min(1, rdt * 3.5);
    S = base * cam.zoom;
    let tx = ball.x + ball.vx * 0.25, ty = ball.y + ball.vy * 0.25;
    if (G.phase === 'kickoff' && !G.demo) { tx = W / 2; ty = H / 2; }
    if (inp.charging && ball.owner) { tx = ball.owner.x; ty = ball.owner.y; }
    cam.x += (tx - cam.x) * Math.min(1, rdt * 3.2);
    cam.y += (ty - cam.y) * Math.min(1, rdt * 3.2);
    // keep the view on the pitch (with a strip of stands); centre it when it shows the whole length
    const visX = (rot ? ch : cw) / S, visY = (rot ? cw : ch) / S, m = 80;
    cam.x = visX >= W + 2 * m ? W / 2 : clamp(cam.x, visX / 2 - m, W - visX / 2 + m);
    cam.y = visY >= H + 2 * m ? H / 2 : clamp(cam.y, visY / 2 - m, H - visY / 2 + m);
    cam.shake *= Math.exp(-rdt * 7);
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    M = new DOMMatrix().translate(cw / 2 + sx, ch / 2 + sy).rotate(rot ? -90 : 0).scale(S).translate(-cam.x, -cam.y);
    MI = M.inverse();
  }
  const w2s = (x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
  const s2w = (x, y) => ({ x: MI.a * x + MI.c * y + MI.e, y: MI.b * x + MI.d * y + MI.f });
  const dirS = (x, y) => [M.a * x + M.c * y, M.b * x + M.d * y];

  // ---------- sound (all synthesized) ----------
  const Sfx = (() => {
    let ac = null, master = null, noiseBuf = null, crowd = null, crowdGain = null, chOsc = null, chGain = null;
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // crowd murmur loop
      crowd = ac.createBufferSource(); crowd.buffer = noiseBuf; crowd.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.6;
      crowdGain = ac.createGain(); crowdGain.gain.value = 0;
      crowd.connect(f); f.connect(crowdGain); crowdGain.connect(master); crowd.start();
    }
    const on = () => ac && G.mode === 'play' && !G.paused;
    function tone(type, f0, f1, dur, vol, delay = 0) {
      const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol, freq, q = 1, delay = 0) {
      const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    return {
      init,
      kick(p) { if (!on()) return; tone('sine', 150 + p * 80, 45, 0.18, 0.45 + p * 0.35); noise(0.07, 0.25 + p * 0.3, 1800, 0.8); },
      bounce() { if (!on()) return; tone('sine', 230, 90, 0.08, 0.12); },
      trap() { if (!on()) return; tone('sine', 120, 70, 0.07, 0.2); },
      whistle(long) {
        if (!on()) return;
        const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
        const blasts = long ? [[0, 0.25], [0.35, 0.25], [0.7, 0.8]] : [[0, 0.32]];
        o.frequency.value = 2500; lfo.frequency.value = 28; lg.gain.value = 140;
        lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(master);
        g.gain.setValueAtTime(0, t);
        for (const [a, d] of blasts) { g.gain.setValueAtTime(0.13, t + a); g.gain.setValueAtTime(0, t + a + d); }
        o.start(t); lfo.start(t); const end = t + blasts[blasts.length - 1][0] + blasts[blasts.length - 1][1] + 0.05;
        o.stop(end); lfo.stop(end);
      },
      whoosh() { if (!on()) return; noise(0.22, 0.25, 2400, 0.7); },
      bonk() { if (!on()) return; tone('square', 650, 110, 0.22, 0.14); tone('sine', 260, 900, 0.32, 0.2, 0.06); },
      boing() { if (!on()) return; tone('triangle', 180, 720, 0.3, 0.3); },
      pickup() { if (!on()) return; [660, 880, 1320].forEach((f, i) => tone('triangle', f, f * 1.01, 0.12, 0.18, i * 0.07)); },
      superShot() { if (!on()) return; noise(0.6, 0.5, 900, 0.4); tone('sawtooth', 90, 40, 0.5, 0.25); tone('square', 1200, 300, 0.4, 0.08); },
      goal() {
        if (!on()) return;
        noise(3, 0.55, 700, 0.5);
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, 0.16, 0.08, 0.1 + i * 0.13));
      },
      ooh() { if (!on()) return; noise(1.2, 0.3, 500, 0.6); },
      moo() { if (!on()) return; tone('sawtooth', 160, 105, 1.0, 0.18); tone('sawtooth', 163, 108, 1.0, 0.1); },
      freeze() { if (!on()) return; [1800, 2400, 3000, 2200].forEach((f, i) => tone('sine', f, f * 0.7, 0.2, 0.1, i * 0.05)); },
      slip() { if (!on()) return; tone('sine', 900, 200, 0.35, 0.18); },
      charge(power) {
        if (!on()) return;
        if (!chOsc) {
          chOsc = ac.createOscillator(); chGain = ac.createGain(); chOsc.type = 'sawtooth';
          chGain.gain.value = 0.05; chOsc.connect(chGain); chGain.connect(master); chOsc.start();
        }
        chOsc.frequency.setTargetAtTime(160 + power * 700, ac.currentTime, 0.03);
      },
      chargeStop() { if (chOsc) { chOsc.stop(); chOsc = null; } },
      crowdLevel(v) { if (crowdGain) crowdGain.gain.setTargetAtTime(G.mode === 'play' && !G.paused ? v : 0, ac.currentTime, 0.2); },
    };
  })();

  // ---------- HUD ----------
  function banner(text, small) {
    const b = $('banner');
    b.innerHTML = text + (small ? `<small>${small}</small>` : '');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function ticker(text, color) {
    if (G.demo) return;
    const t = $('ticker');
    t.textContent = text; t.style.color = color || '';
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }
  function updateBoard(bumpTeam) {
    $('s0').textContent = G.score[0]; $('s1').textContent = G.score[1];
    if (bumpTeam != null) { const b = $('s' + bumpTeam); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }
  let lastClock = '';
  function updateClock() {
    const c = Math.max(0, Math.ceil(G.clock));
    const txt = (G.golden ? '★ ' : '') + Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0');
    if (txt !== lastClock) {
      lastClock = txt; const el = $('clock');
      el.textContent = txt; el.classList.toggle('gold', G.golden); el.classList.toggle('low', !G.golden && c <= 10);
    }
  }

  // ---------- effects ----------
  function addFloat(x, y, text, color, size, pow) {
    if (G.demo && pow) return;
    floaters.push({ x, y, text, color: color || '#fff', size: size || 30, pow: !!pow, t: 0, life: pow ? 1.1 : 0.9, rotA: rand(-0.25, 0.25) });
  }
  function slowmo(s, t) { if (G.demo) return; G.slow.s = G.slow.t > 0 ? Math.min(G.slow.s, s) : s; G.slow.t = Math.max(G.slow.t, t); }
  function burst(x, y, n, colors, spd, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(spd * 0.3, spd);
      parts.push({
        x, y, z: opt.z || 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(opt.vz0 || 40, opt.vz1 || 200),
        life: rand(0.5, 1.1) * (opt.life || 1), t: 0, color: pick(colors), size: rand(2, 5) * (opt.size || 1), kind: opt.kind || 'dot',
        spin: rand(-10, 10), g: opt.g == null ? 500 : opt.g,
      });
    }
  }
  function dust(p) { parts.push({ x: p.x, y: p.y, z: 1, vx: rand(-15, 15), vy: rand(-15, 15), vz: rand(10, 40), life: 0.4, t: 0, color: 'rgba(255,255,255,0.7)', size: rand(3, 6), kind: 'puff', g: 0 }); }

  // ---------- match flow ----------
  function setupKickoff(team) {
    G.phase = 'kickoff'; G.phaseT = G.demo ? 0.6 : 1.4;
    for (const p of players) {
      const along = { gk: 0.03, def: 0.2, mid: 0.34, fwd: 0.44 }[p.role];
      p.x = p.team ? W - along * W : along * W; p.y = H * LANE[p.role];
      p.vx = p.vy = p.vz = p.z = 0; p.dashT = 0; p.dashCD = 0; p.stun = 0; p.frozen = 0; p.windup = 0;
      p.noPick = 0; p.fx = p.team ? -1 : 1; p.fy = 0; p.tx = p.x; p.ty = p.y; p.trail.length = 0;
    }
    const f = teams[team].find((p) => p.role === 'fwd');
    f.x = W / 2 - (team ? -1 : 1) * 20; f.y = H / 2;
    Object.assign(ball, { x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, fire: false, intended: null, lob: false, inNet: -1, scored: false, kicker: null, team: team });
    ball.owner = f; f.hold = 0; f.think = rand(0.4, 0.8);
    G.ctrl = null;
    if (!G.demo) banner('KICK OFF!', team === 0 ? 'your ball' : 'their ball');
  }

  function startMatch() {
    $('title').classList.add('hidden'); $('over').classList.add('hidden');
    document.body.classList.add('playing');
    G.mode = 'play'; G.demo = false; G.paused = false;
    G.score = [0, 0]; G.clock = MATCH_TIME; G.golden = false; G.stats = newStats();
    G.wind = null; G.moon = 0; G.mega = 0; G.bigGoal = [0, 0]; G.teamFire = [false, false];
    G.itemT = 6; G.eventT = rand(18, 26); G.slow.t = 0; G.endT = 0;
    items = []; peels = []; parts = []; floaters = []; cows = [];
    for (const p of players) { p.giant = 0; p.zoom = 0; }
    updateBoard(); lastClock = ''; updateClock();
    setupKickoff(0);
    Sfx.init(); Sfx.whistle();
  }

  function startDemo() {
    G.mode = 'title'; G.demo = true; G.score = [0, 0]; G.clock = 1e9; G.stats = newStats();
    makePlayers(); setupKickoff(Math.random() < 0.5 ? 0 : 1);
  }

  function scoreGoal(team) {
    ball.scored = true;
    G.score[team]++;
    const k = ball.kicker, own = k && k.team !== team;
    G.phase = 'goal'; G.phaseT = 3.4; G.celebTeam = team;
    if (G.demo) { G.phaseT = 1.5; return; }
    updateBoard(team);
    slowmo(0.22, 1.3); cam.zoomT = 1.45; cam.shake = 16;
    fx.lines = 1.4; fx.flash = 1; fx.flashColor = team === 0 ? '#bfe0ff' : '#ffc4cc'; fx.x = ball.x; fx.y = ball.y;
    burst(ball.x, ball.y, 90, ['#ffe81a', '#ff2fd6', '#19f7ff', '#7dff2f', '#fff', '#ff7a1a'], 320, { kind: 'confetti', vz0: 150, vz1: 450, g: 220, life: 2.2 });
    const sub = own ? 'OWN GOAL by ' + k.name + '!' : k ? (ball.power >= 0.85 ? 'SUPER SHOT by ' : 'scored by ') + k.name : '';
    banner(team === 0 ? 'GOOOOAL!' : 'THEY SCORE!', sub);
    Sfx.goal(); G.excite = 1;
  }

  function endMatch() {
    G.phase = 'end'; G.endT = 2.2;
    const [a, b] = G.score;
    banner('FULL TIME!', a > b ? 'YOU WIN!' : a < b ? 'you lose...' : 'it’s a draw');
    Sfx.whistle(true);
  }

  function showResults() {
    G.mode = 'over';
    document.body.classList.remove('playing');
    Sfx.chargeStop(); Sfx.crowdLevel(0);
    const [a, b] = G.score, st = G.stats;
    const t = $('overTitle');
    t.textContent = a > b ? 'VICTORY!' : a < b ? 'DEFEAT...' : 'DRAW!';
    t.className = 'result' + (a > b ? '' : a < b ? ' lose' : ' draw');
    let wins = 0;
    try { wins = +localStorage.getItem('lolofoot.wins') || 0; if (a > b) localStorage.setItem('lolofoot.wins', ++wins); } catch (e) { /* storage blocked */ }
    $('overStats').innerHTML =
      `<span class="big"><b style="color:#2f8bff">${a}</b> - <b style="color:#ff3b55">${b}</b></span><br>` +
      `Shots <b>${st.shots}</b> &middot; Super shots <b>${st.supers}</b><br>` +
      `Tackles <b>${st.tackles}</b> &middot; Knockouts <b>${st.kos}</b> &middot; Power-ups <b>${st.items}</b><br>` +
      `Total wins <b>${wins}</b>`;
    $('over').classList.remove('hidden');
  }

  // ---------- kicking ----------
  function grav() { return GRAVITY * (G.moon > 0 ? 0.3 : 1); }
  function ballR() { return BALL_R * (G.mega > 0 ? 2.6 : 1); }

  function kickBall(p, vx, vy, vz, o) {
    ball.owner = null;
    ball.vx = vx; ball.vy = vy; ball.vz = vz; ball.z = Math.max(ball.z, 0.1);
    ball.fire = !!o.fire; ball.power = o.power || 0; ball.kicker = p; ball.team = p.team; ball.kickId++;
    ball.savedBy = -1; ball.intended = o.to || null; ball.lob = !!o.lob;
    p.noPick = 0.32; p.kickAnim = 0.25; p.hold = 0;
    Sfx.kick(o.power || 0.2);
    G.excite = Math.max(G.excite, (o.power || 0) * 0.8);
  }
  function passTo(p, tx, ty, to) {
    const dx = tx - ball.x, dy = ty - ball.y, d = Math.hypot(dx, dy) || 1;
    const spd = clamp(150 + d * 1.45, 230, 640);
    kickBall(p, dx / d * spd, dy / d * spd, 0, { to, power: 0.25 });
  }
  function lobTo(p, tx, ty, to) {
    const dx = tx - ball.x, dy = ty - ball.y, d = Math.hypot(dx, dy) || 1;
    const T = clamp(0.5 + d / 650, 0.6, 1.5), vh = d / T;
    kickBall(p, dx / d * vh, dy / d * vh, grav() * T / 2, { to, lob: true, power: 0.35 });
  }
  function shoot(p, tx, ty, power) {
    if (G.teamFire[p.team]) { G.teamFire[p.team] = false; power = 1; }
    const fire = power >= 0.6;
    const n = norm(tx - ball.x, ty - ball.y), spd = 380 + 820 * power;
    kickBall(p, n.x * spd, n.y * spd, fire ? 40 : 90, { fire, power, shot: true });
    if (p.team === 0 && G.stats) G.stats.shots++;
    if (power >= 0.85) {
      if (p.team === 0 && G.stats) G.stats.supers++;
      slowmo(0.2, 0.6); fx.lines = 1.2; fx.x = ball.x; fx.y = ball.y; cam.shake = 12; fx.flash = 0.6; fx.flashColor = '#fff3a0';
      addFloat(p.x, p.y, 'SUPER SHOT!!', '#ffe81a', 46, true);
      Sfx.superShot();
    } else if (fire) {
      fx.lines = 0.7; fx.x = ball.x; fx.y = ball.y; cam.shake = 6;
      addFloat(p.x, p.y, 'POWER SHOT!', '#ff7a1a', 34, true);
    }
  }
  function laneBlocked(p, q) {
    const ax = ball.x, ay = ball.y, bx = q.x - ax, by = q.y - ay, L2 = bx * bx + by * by || 1;
    for (const o of teams[1 - p.team]) {
      if (o.stun > 0) continue;
      const t = clamp(((o.x - ax) * bx + (o.y - ay) * by) / L2, 0, 1);
      if (Math.hypot(ax + bx * t - o.x, ay + by * t - o.y) < 26) return true;
    }
    return false;
  }
  function passOrLob(p, m) {
    const lx = m.x + m.vx * 0.5, ly = m.y + m.vy * 0.5;
    if (laneBlocked(p, m) && Math.random() < 0.8) lobTo(p, lx, ly, m); else passTo(p, lx, ly, m);
  }
  function bestMate(p) {
    const dir = p.team ? -1 : 1;
    let best = null, bs = -1e9;
    for (const q of teams[p.team]) {
      if (q === p || q.stun > 0 || q.frozen > 0) continue;
      const d = dist(p, q); if (d < 50) continue;
      let open = 1e9;
      for (const o of teams[1 - p.team]) open = Math.min(open, dist(o, q));
      const s = (q.x - p.x) * dir * 0.8 + Math.min(open, 130) * 1.2 - d * 0.15 - (q.role === 'gk' ? 260 : 0) + rand(0, 50);
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }

  // the possessing CPU player decides: shoot, pass or keep dribbling
  function cpuDecide(p) {
    const dir = p.team ? -1 : 1, goalX = p.team ? 0 : W;
    const dg = Math.hypot(goalX - p.x, H / 2 - p.y);
    let press = 1e9;
    for (const q of teams[1 - p.team]) if (q.stun <= 0) press = Math.min(press, dist(p, q));
    if (dg < 230 || (dg < 380 && Math.random() < 0.3) || (G.teamFire[p.team] && dg < 520)) { cpuShoot(p); return; }
    const m = bestMate(p);
    if (m && ((press < 55 && Math.random() < 0.6) || (p.hold > 2.6 && Math.random() < 0.5) || ((m.x - p.x) * dir > 120 && Math.random() < 0.15))) passOrLob(p, m);
  }
  function cpuShoot(p) {
    const side = p.team ? 0 : 1, gh = G.goalHalf[side], lineX = p.team ? 0 : W, dir = p.team ? -1 : 1;
    const gk = teams[1 - p.team][0];
    const ty = H / 2 + (gk.y > H / 2 ? -1 : 1) * (gh - 14) + rand(-14, 14);
    const pw = rand(0.3, 1);
    if (pw > 0.72) { // big wind-up: gives the defender a moment to tackle
      p.windup = 0.6; p.wx = lineX + dir * 10; p.wy = ty; p.wpow = pw;
      addFloat(p.x, p.y, '!!', '#ff3b55', 36);
      return;
    }
    shoot(p, lineX + dir * 10, ty, pw);
  }

  // ---------- player input ----------
  function mateNear(o, pt, r) {
    let best = null, bd = r;
    for (const q of teams[0]) { if (q === o || q.stun > 0) continue; const d = dist(q, pt); if (d < bd) { bd = d; best = q; } }
    return best;
  }
  function tapKick(o, aim) {
    // bias toward a teammate near the tap, or one roughly in that direction
    const ax = aim.x - ball.x, ay = aim.y - ball.y, ad = Math.hypot(ax, ay) || 1;
    let best = null, bs = 1e9;
    for (const q of teams[0]) {
      if (q === o || q.stun > 0 || q.frozen > 0) continue;
      const dq = dist(q, aim), qx = q.x - ball.x, qy = q.y - ball.y, qd = Math.hypot(qx, qy) || 1;
      const ang = Math.acos(clamp((ax * qx + ay * qy) / (ad * qd), -1, 1));
      if (dq < 110 || (ang < 0.4 && qd > 40 && qd < 460)) {
        const s = dq * 0.6 + ang * 220;
        if (s < bs) { bs = s; best = q; }
      }
    }
    if (best) passTo(o, best.x + best.vx * 0.4, best.y + best.vy * 0.4, best);
    else if (ad < 20) passTo(o, ball.x + o.fx * 120, ball.y + o.fy * 120, null);
    else passTo(o, aim.x, aim.y, null);
  }
  function chargedKick(o, aim, power) {
    const mate = mateNear(o, aim, 85);
    if (mate) {
      lobTo(o, mate.x + mate.vx * 0.6, mate.y + mate.vy * 0.6, mate);
      addFloat(o.x, o.y, power > 0.7 ? 'SKY PASS!' : 'LOB!', '#19f7ff', 30);
    } else {
      const ad = Math.hypot(aim.x - ball.x, aim.y - ball.y);
      if (ad < 15) shoot(o, ball.x + o.fx * 100, ball.y + o.fy * 100, power);
      else shoot(o, aim.x, aim.y, power);
    }
  }
  function dash(p, tx, ty, cpu) {
    if (!p || p.dashCD > 0 || p.stun > 0 || p.frozen > 0 || p.windup > 0) return false;
    const n = norm(tx - p.x, ty - p.y);
    p.dashX = n.x; p.dashY = n.y; p.dashT = DASH_TIME; p.dashCD = cpu ? CPU_DASH_CD : DASH_CD; p.hits = [];
    p.fx = n.x; p.fy = n.y;
    for (let i = 0; i < 4; i++) dust(p);
    Sfx.whoosh();
    return true;
  }
  function canInput() { return G.mode === 'play' && !G.paused && G.phase === 'live'; }

  cv.addEventListener('pointerdown', (e) => {
    Sfx.init();
    if (!canInput() || inp.down) return;
    inp.sx = e.clientX; inp.sy = e.clientY;
    const o = ball.owner;
    if (o && o.team === 0) {
      inp.down = true; inp.id = e.pointerId; inp.t0 = performance.now(); inp.kind = 'kick'; inp.charging = false; inp.power = 0; inp.maxed = false;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    } else {
      const p = G.ctrl, aim = s2w(e.clientX, e.clientY);
      if (p && !dash(p, aim.x, aim.y, false) && p.dashCD > 0) { p.cdNag = 0.4; }
    }
  });
  cv.addEventListener('pointermove', (e) => { if (inp.down && e.pointerId === inp.id) { inp.sx = e.clientX; inp.sy = e.clientY; } });
  function endPress(e, cancel) {
    if (!inp.down || e.pointerId !== inp.id) return;
    inp.sx = e.clientX; inp.sy = e.clientY;
    const o = ball.owner, charging = inp.charging, power = inp.power;
    inp.down = false; inp.charging = false; inp.kind = null;
    Sfx.chargeStop();
    if (cancel || !canInput() || !o || o.team !== 0) return;
    const aim = s2w(inp.sx, inp.sy);
    if (charging) chargedKick(o, aim, power); else tapKick(o, aim);
  }
  cv.addEventListener('pointerup', (e) => endPress(e, false));
  cv.addEventListener('pointercancel', (e) => endPress(e, true));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  function updateCharge() {
    if (!inp.down) return;
    const o = ball.owner;
    if (!o || o.team !== 0 || G.phase !== 'live') { // lost the ball while charging
      if (inp.charging && G.phase === 'live') addFloat(o ? o.x : ball.x, o ? o.y : ball.y, 'STOLEN!', '#ff3b55', 28);
      inp.down = false; inp.charging = false; inp.kind = null; Sfx.chargeStop(); return;
    }
    const held = (performance.now() - inp.t0) / 1000;
    if (held > TAP_TIME) {
      inp.charging = true;
      inp.power = clamp((held - TAP_TIME) / CHARGE_TIME, 0, 1);
      Sfx.charge(inp.power);
      if (inp.power >= 1 && !inp.maxed) { inp.maxed = true; fx.flash = 0.35; fx.flashColor = '#fff3a0'; cam.shake = 5; }
    }
  }

  // ---------- AI ----------
  function ballTarget() {
    let tx = ball.x, ty = ball.y;
    if (ball.z > 0.5 && ball.vz > -1e9) {
      const g = grav(), tl = (ball.vz + Math.sqrt(Math.max(0, ball.vz * ball.vz + 2 * g * ball.z))) / g;
      tx += ball.vx * tl; ty += ball.vy * tl;
    } else { tx += ball.vx * 0.35; ty += ball.vy * 0.35; }
    return { x: clamp(tx, 10, W - 10), y: clamp(ty, 10, H - 10) };
  }

  function pickCtrl() {
    const o = ball.owner;
    if (o && o.team === 0) return o;
    const cur = G.ctrl && G.ctrl.team === 0 && G.ctrl.role !== 'gk' ? G.ctrl : null;
    if (cur && cur.dashT > 0) return cur;
    if (!o && ball.intended && ball.intended.team === 0 && ball.intended.stun <= 0 && ball.intended.frozen <= 0) return ball.intended;
    let best = null, bd = 1e9;
    for (const p of teams[0]) {
      if (p.role === 'gk' || p.stun > 0 || p.frozen > 0) continue;
      let d = dist(p, ball); if (p === cur) d -= 30;
      if (d < bd) { bd = d; best = p; }
    }
    return best || cur || teams[0][1];
  }
  function pickCpuChaser(team) {
    const o = ball.owner;
    if (!o && ball.intended && ball.intended.team === team && ball.intended.stun <= 0) return ball.intended;
    const cur = G.cpuChaser && G.cpuChaser.team === team ? G.cpuChaser : null;
    let best = null, bd = 1e9;
    for (const p of teams[team]) {
      if (p.role === 'gk' || p.stun > 0 || p.frozen > 0) continue;
      let d = dist(p, ball); if (p === cur) d -= 30;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function teamAI(team, dt) {
    const o = ball.owner, have = o && o.team === team, theirs = o && o.team !== team;
    const cpu = team === 1 || G.demo;
    let chaser = null;
    if (!have) chaser = team === 0 && !G.demo ? G.ctrl : pickCpuChaser(team);
    if (team === 1) G.cpuChaser = chaser;
    if (team === 0 && G.demo) G.ctrl = chaser;
    const bt = ballTarget();
    const ballA = team ? 1 - ball.x / W : ball.x / W;
    for (const p of teams[team]) {
      if (p.stun > 0 || p.frozen > 0) continue;
      if (G.phase === 'goal' || G.phase === 'end') { celebrateAI(p, dt); continue; }
      if (p === o) { ownerAI(p, dt, cpu); continue; }
      if (p.role === 'gk') { gkAI(p); continue; }
      if (p === chaser) {
        if (theirs) {
          p.tx = o.x + o.vx * 0.3; p.ty = o.y + o.vy * 0.3; p.spd = SPEED * 1.05;
          if (cpu && dist(p, o) < 62 && p.dashCD <= 0 && Math.random() < dt * 1.2) dash(p, o.x + o.vx * 0.2, o.y + o.vy * 0.2, true);
        } else {
          p.tx = bt.x; p.ty = bt.y; p.spd = SPEED * 1.08;
          if (cpu && !o && ball.z < 15 && p.dashCD <= 0) {
            const d = dist(p, ball);
            if (d > 35 && d < 120 && Math.random() < dt * 0.7) dash(p, bt.x, bt.y, true);
          }
        }
        continue;
      }
      // supporting run: formation slots that slide with the ball
      let a;
      if (have) a = { def: Math.max(0.15, ballA - 0.32), mid: clamp(ballA + 0.04, 0.2, 0.85), fwd: clamp(ballA + 0.26, 0.4, 0.9) }[p.role];
      else if (theirs) a = { def: clamp(ballA - 0.2, 0.08, 0.55), mid: clamp(ballA - 0.1, 0.12, 0.7), fwd: clamp(ballA + 0.06, 0.3, 0.75) }[p.role];
      else a = { def: clamp(ballA - 0.24, 0.1, 0.6), mid: clamp(ballA - 0.04, 0.15, 0.8), fwd: clamp(ballA + 0.12, 0.3, 0.88) }[p.role];
      let ly = H * LANE[p.role];
      ly += (ball.y - ly) * 0.3 + Math.sin(G.time * 0.7 + p.wob) * 24;
      p.tx = team ? W - a * W : a * W; p.ty = clamp(ly, 30, H - 30); p.spd = SPEED;
    }
  }

  function ownerAI(p, dt, cpu) {
    p.hold += dt;
    if (p.windup > 0) {
      p.tx = p.x; p.ty = p.y; p.spd = 0; p.windup -= dt;
      if (Math.random() < 0.5) burst(p.x, p.y, 1, ['#ffe81a', '#ff7a1a'], 60, { vz0: 60, vz1: 160, g: 0 });
      if (p.windup <= 0) shoot(p, p.wx, p.wy, p.wpow);
      return;
    }
    if (p.role === 'gk') {
      p.tx = p.x; p.ty = p.y; p.spd = 0;
      if ((cpu && p.hold > 1.0) || p.hold > 3.5) { const m = bestMate(p) || teams[p.team][2]; passOrLob(p, m); }
      return;
    }
    const gx = p.team ? 70 : W - 70, gy = H / 2;
    // dribble toward goal, shying away from nearby defenders
    let dx = gx - p.x, dy = gy - p.y;
    const dn = Math.hypot(dx, dy) || 1; dx /= dn; dy /= dn;
    for (const q of teams[1 - p.team]) {
      if (q.stun > 0 || q.frozen > 0) continue;
      const d = dist(p, q);
      if (d < 100 && d > 0) { const w = (100 - d) / 100 * 1.4; dx += (p.x - q.x) / d * w; dy += (p.y - q.y) / d * w; }
    }
    const n = norm(dx, dy);
    p.tx = p.x + n.x * 60; p.ty = p.y + n.y * 60;
    p.spd = dn < 30 ? 0 : OWNER_SPEED * (p === G.ctrl && inp.charging ? 0.45 : 1);
    if (!cpu) return;
    p.think -= dt;
    if (p.think > 0) return;
    p.think = rand(0.3, 0.6);
    cpuDecide(p);
  }

  function gkAI(p) {
    const side = p.team, s = side ? -1 : 1, lineX = side ? W : 0, gh = G.goalHalf[side];
    const homeX = lineX + s * 24;
    let tx = homeX, ty = clamp(H / 2 + (ball.y - H / 2) * 0.4, H / 2 - gh + 12, H / 2 + gh - 12), spd = GK_SPEED;
    p.diving = false;
    const o = ball.owner, bd = (ball.x - lineX) * s;
    if (!o && ball.inNet < 0) {
      const vin = -ball.vx * s, sp = Math.hypot(ball.vx, ball.vy);
      if (vin > 120 && bd < 400) {
        const t = (bd - 24) / vin;
        if (t > 0 && t < 1.3) {
          const py = ball.y + ball.vy * t;
          if (Math.abs(py - H / 2) < gh + 30) { ty = clamp(py, H / 2 - gh - 6, H / 2 + gh + 6); spd = DIVE_SPEED; p.diving = true; }
        }
      } else if (bd < 150 && Math.abs(ball.y - H / 2) < 170 && sp < 260 && ball.z < 30) {
        tx = ball.x; ty = ball.y; spd = GK_SPEED * 1.3; // sweep a loose ball in the box
      }
    } else if (o && o.team !== p.team && bd < 260) tx = lineX + s * 44;
    p.tx = tx; p.ty = ty; p.spd = spd;
  }

  function celebrateAI(p, dt) {
    if (p.team === G.celebTeam && G.phase === 'goal') {
      if (Math.random() < dt * 1.5) { p.tx = p.x + rand(-60, 60); p.ty = p.y + rand(-60, 60); }
      p.spd = SPEED * 1.3;
      if (p.z <= 0 && Math.random() < dt * 3) p.vz = rand(150, 260);
    } else if (G.phase === 'end' && G.score[p.team] > G.score[1 - p.team]) {
      p.spd = 0; if (p.z <= 0 && Math.random() < dt * 2) p.vz = rand(150, 240);
    } else { p.tx = p.x; p.ty = p.y; p.spd = 0; }
  }

  // ---------- physics ----------
  function knock(p, vx, vy, dur, big) {
    if (ball.owner === p) looseBall(p, norm(vx, vy));
    p.stun = dur; p.dashT = 0; p.windup = 0;
    p.vx = vx; p.vy = vy; p.vz = big ? 320 : 170; p.spinV = (Math.random() < 0.5 ? -1 : 1) * (big ? 18 : 10);
    if (big) {
      if (p.team === 1 && G.stats) G.stats.kos++;
      addFloat(p.x, p.y, pick(KO_WORDS), '#fff', 40, true);
      cam.shake = Math.max(cam.shake, 10); if (!G.demo) G.hitstop = 0.07;
      burst(p.x, p.y, 14, ['#ffe81a', '#fff', '#ff7a1a'], 180, { kind: 'star', vz0: 80, vz1: 260 });
      Sfx.bonk(); G.excite = Math.max(G.excite, 0.7);
    } else Sfx.boing();
  }
  function looseBall(p, n) {
    ball.owner = null;
    ball.vx = n.x * 190 + rand(-50, 50); ball.vy = n.y * 190 + rand(-50, 50); ball.vz = 130; ball.z = 2;
    ball.kicker = p; ball.team = p.team; ball.intended = null; ball.fire = false; ball.lob = false;
    p.noPick = 0.6;
  }
  function take(p) {
    const sp = Math.hypot(ball.vx, ball.vy);
    if (ball.kicker && ball.kicker.team !== p.team && ball.intended && sp > 150 && p.role !== 'gk') addFloat(p.x, p.y, 'INTERCEPTED!', '#7dff2f', 24);
    ball.owner = p; ball.fire = false; ball.lob = false; ball.intended = null; ball.vz = 0; ball.z = 0;
    p.hold = 0; p.think = rand(0.25, 0.55);
    Sfx.trap();
  }
  function inOwnBox(p) {
    const d = p.team ? W - p.x : p.x;
    return d < 160 && Math.abs(p.y - H / 2) < 175;
  }

  function movePlayers(dt) {
    const g = grav();
    for (const p of players) {
      p.dashCD = Math.max(0, p.dashCD - dt); p.noPick = Math.max(0, p.noPick - dt);
      p.giant = Math.max(0, p.giant - dt); p.zoom = Math.max(0, p.zoom - dt); p.frozen = Math.max(0, p.frozen - dt);
      p.kickAnim = Math.max(0, p.kickAnim - dt); p.whiff = Math.max(0, p.whiff - dt); p.bumpT = Math.max(0, p.bumpT - dt);
      if (p.cdNag) p.cdNag = Math.max(0, p.cdNag - dt);
      p.scale += ((p.giant > 0 ? 1.8 : 1) - p.scale) * Math.min(1, dt * 6);
      // vertical hop / knockback flight
      if (p.z > 0 || p.vz > 0) {
        p.vz -= g * dt; p.z += p.vz * dt;
        if (p.z <= 0) { p.z = 0; p.vz = p.stun > 0 && p.vz < -120 ? -p.vz * 0.35 : 0; }
      }
      if (p.frozen > 0) { p.vx = p.vy = 0; continue; }
      if (p.stun > 0) {
        p.stun -= dt; p.spin += p.spinV * dt;
        const k = Math.exp(-(p.z > 0 ? 0.8 : 3.5) * dt); p.vx *= k; p.vy *= k;
        if (p.stun <= 0) { p.spin = 0; p.stun = 0; }
      } else if (p.dashT > 0) {
        p.dashT -= dt;
        const k = Math.max(0, p.dashT / DASH_TIME), sp = (SPEED + (DASH_SPEED - SPEED) * k) * (p.zoom > 0 ? 1.4 : 1);
        p.vx = p.dashX * sp; p.vy = p.dashY * sp;
        if (Math.random() < 0.6) dust(p);
      } else {
        const mul = (p.zoom > 0 ? 1.9 : 1) * (p.giant > 0 ? 1.12 : 1) * (G.phase === 'live' || G.phase === 'goal' || G.phase === 'end' ? 1 : 0);
        let dx = p.tx - p.x, dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        let dvx = 0, dvy = 0;
        if (d > 5) { const sp = Math.min(p.spd * mul, d * 3); dvx = dx / d * sp; dvy = dy / d * sp; }
        const acc = p.diving ? 14 : 7;
        p.vx += (dvx - p.vx) * Math.min(1, dt * acc); p.vy += (dvy - p.vy) * Math.min(1, dt * acc);
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 8) { p.x = 8; if (p.stun > 0) p.vx = Math.abs(p.vx) * 0.6; }
      if (p.x > W - 8) { p.x = W - 8; if (p.stun > 0) p.vx = -Math.abs(p.vx) * 0.6; }
      if (p.y < 8) { p.y = 8; if (p.stun > 0) p.vy = Math.abs(p.vy) * 0.6; }
      if (p.y > H - 8) { p.y = H - 8; if (p.stun > 0) p.vy = -Math.abs(p.vy) * 0.6; }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 12 && p.stun <= 0) {
        const n = norm(p.vx, p.vy);
        p.fx += (n.x - p.fx) * Math.min(1, dt * 10); p.fy += (n.y - p.fy) * Math.min(1, dt * 10);
        const f = norm(p.fx, p.fy); p.fx = f.x; p.fy = f.y;
        p.runPh += sp * dt * 0.16;
        if (G.moon > 0 && p.z <= 0) p.vz = 140;
      }
      // after-images for dashes and turbo
      if (p.dashT > 0 || p.zoom > 0) { p.trail.push({ x: p.x, y: p.y, z: p.z }); if (p.trail.length > 6) p.trail.shift(); }
      else if (p.trail.length) p.trail.shift();
    }
  }

  function collisions() {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        if (a.z > 25 || b.z > 25) continue;
        const ra = a.r * a.scale, rb = b.r * b.scale, d = dist(a, b);
        if (d < ra + rb + 4) { contact(a, b); contact(b, a); }
        if (d < ra + rb && d > 0.01) {
          const ov = ra + rb - d, nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
          const wa = b.scale / (a.scale + b.scale), wb = 1 - wa;
          a.x -= nx * ov * wa; a.y -= ny * ov * wa; b.x += nx * ov * wb; b.y += ny * ov * wb;
        }
      }
    }
  }
  function contact(p, q) {
    if (p.team === q.team || q.stun > 0) return;
    if (p.dashT > 0 && !p.hits.includes(q)) {
      p.hits.push(q);
      if (q.giant > 0 && p.giant <= 0) { knock(p, -p.dashX * 280, -p.dashY * 280, 1.1, true); addFloat(q.x, q.y, 'BOING!', '#ff4fd8', 32); return; }
      if (q.frozen > 0) { q.frozen = 0; burst(q.x, q.y, 16, ['#bff4ff', '#fff', '#7fe3ff'], 160, { kind: 'shard' }); }
      if (ball.owner === q) {
        knock(q, p.dashX * 260, p.dashY * 260, 1.2, false);
        if (p.team === 0 && G.stats) G.stats.tackles++;
        addFloat(q.x, q.y, pick(['TACKLE!', 'SNATCH!', 'YOINK!']), '#ffe81a', 34, true);
        slowmo(0.3, 0.22); fx.lines = Math.max(fx.lines, 0.55); fx.x = q.x; fx.y = q.y; cam.shake = 8;
      } else {
        knock(q, p.dashX * 200, p.dashY * 200, 0.7, false);
        addFloat(q.x, q.y, 'OOF!', '#fff', 26);
      }
      return;
    }
    if (p.giant > 0 && q.giant <= 0 && p.bumpT <= 0 && Math.hypot(p.vx, p.vy) > 25) {
      p.bumpT = 0.4;
      const n = norm(q.x - p.x, q.y - p.y);
      knock(q, n.x * 320, n.y * 320, 1.0, false);
      addFloat(q.x, q.y, 'STOMP!', '#ff4fd8', 30);
    }
  }

  function updateBall(dt) {
    const R = ballR();
    if (ball.owner) {
      const o = ball.owner, off = o.r * o.scale + R + 1;
      ball.x = o.x + o.fx * off; ball.y = o.y + o.fy * off; ball.z = 0;
      ball.vx = o.vx; ball.vy = o.vy; ball.vz = 0;
      ball.x = clamp(ball.x, R, W - R); ball.y = clamp(ball.y, R, H - R);
      ball.roll += Math.hypot(o.vx, o.vy) * dt / R;
      return;
    }
    if (ball.z > 0 || ball.vz > 0) {
      ball.vz -= grav() * dt; ball.z += ball.vz * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        if (ball.vz < -90) {
          ball.vz = -ball.vz * (G.moon > 0 ? 0.75 : 0.45);
          if (ball.lob) { ball.vx *= 0.55; ball.vy *= 0.55; ball.lob = false; }
          Sfx.bounce();
        } else ball.vz = 0;
      }
    }
    if (ball.z <= 0) { const k = Math.exp(-(ball.fire ? 0.35 : 1.05) * dt); ball.vx *= k; ball.vy *= k; }
    if (G.wind) { ball.vx += G.wind.x * dt; ball.vy += G.wind.y * dt; }
    const sp = Math.hypot(ball.vx, ball.vy);
    if (ball.fire && sp < 240) ball.fire = false;
    const ox = ball.x;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    ball.roll += sp * dt / R;
    if (ball.fire && Math.random() < 0.9) parts.push({ x: ball.x, y: ball.y, z: ball.z + R, vx: rand(-20, 20), vy: rand(-20, 20), vz: rand(20, 70), life: 0.35, t: 0, color: pick(['#ffe81a', '#ff7a1a', '#ff3b2f']), size: R * rand(0.8, 1.4), kind: 'flame', g: 0 });
    goalSide(0, ox, R); goalSide(1, ox, R);
    if (ball.inNet < 0) {
      if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy) * 0.7; }
      if (ball.y > H - R) { ball.y = H - R; ball.vy = -Math.abs(ball.vy) * 0.7; }
    }
    if (ball.inNet < 0 && G.phase === 'live') pickups(R);
  }

  // side 0 = the left goal (yours), side 1 = the right goal (theirs)
  function goalSide(side, ox, R) {
    const s = side ? -1 : 1, lineX = side ? W : 0, gh = G.goalHalf[side];
    const depth = (ball.x - lineX) * s, odepth = (ox - lineX) * s;
    if (ball.inNet === side) {
      if (Math.abs(ball.y - H / 2) > gh - R) { ball.y = H / 2 + Math.sign(ball.y - H / 2) * (gh - R); ball.vy = -ball.vy * 0.3; }
      if (depth < -GOAL_DEPTH + R) { ball.x = lineX - s * (GOAL_DEPTH - R); ball.vx = -ball.vx * 0.12; ball.vy *= 0.6; ball.vz *= 0.5; }
      ball.z = Math.min(ball.z, BAR_Z - R);
      if (depth < 0 && !ball.scored && G.phase === 'live') scoreGoal(side ? 0 : 1);
      if (ball.scored && depth > -R) { ball.x = lineX - s * R; ball.vx = 0; } // a scored ball stays in the net
      else if (depth > R + 2) ball.inNet = -1;
      return;
    }
    if (depth < R && odepth >= R - 0.01) {
      const inMouth = Math.abs(ball.y - H / 2) < gh - R * 0.5;
      if (inMouth && ball.z < BAR_Z) { ball.inNet = side; return; }
      ball.x = lineX + s * R; ball.vx = -ball.vx * 0.7;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (G.phase === 'live' && sp > 250) {
        if (inMouth) { addFloat(lineX + s * 10, ball.y, 'CROSSBAR!', '#fff', 30, true); Sfx.ooh(); }
        else if (Math.abs(Math.abs(ball.y - H / 2) - gh) < R + 8) { addFloat(lineX + s * 10, ball.y, 'POST!', '#fff', 30, true); Sfx.ooh(); cam.shake = 6; }
      }
    } else if (depth < R) { ball.x = lineX + s * R; ball.vx = Math.abs(ball.vx) * s * 0.7; }
  }

  function pickups(R) {
    const sp = Math.hypot(ball.vx, ball.vy);
    for (const p of players) {
      if (p.stun > 0 || p.frozen > 0) continue;
      const reach = p.r * p.scale + R + (p.diving ? 10 : 2);
      if (dist(p, ball) > reach) continue;
      // fire ball: bowls people over
      if (ball.fire && sp > 300 && ball.z < 30 && !(p === ball.kicker && p.noPick > 0)) {
        if (p.giant > 0) { take(p); addFloat(p.x, p.y, 'GIANT BLOCK!', '#ff4fd8', 30, true); return; }
        if (p.role === 'gk' && p.team !== ball.team && ball.savedBy !== ball.kickId) {
          ball.savedBy = ball.kickId;
          if (Math.random() < 0.3) {
            ball.vx *= -0.3; ball.vy = rand(-200, 200); ball.vz = 200; ball.fire = false; ball.kicker = p; ball.team = p.team;
            p.noPick = 0.4; addFloat(p.x, p.y, 'INCREDIBLE SAVE!', '#3dff8a', 36, true);
            slowmo(0.25, 0.5); fx.lines = 0.9; fx.x = p.x; fx.y = p.y; Sfx.ooh();
            return;
          }
        }
        knock(p, ball.vx * 0.7, ball.vy * 0.7, 2.2, true);
        ball.vx *= 0.86; ball.vy *= 0.86;
        if (p.role === 'gk') addFloat(p.x, p.y + 20, 'BLASTED!', '#ff7a1a', 34);
        continue;
      }
      if (p.noPick > 0) continue;
      if (ball.z > (p.role === 'gk' ? 46 : 22)) continue;
      if (p.role === 'gk' && sp > 280 && ball.team !== p.team && inOwnBox(p) && ball.savedBy !== ball.kickId) {
        ball.savedBy = ball.kickId;
        const chance = ball.z > 22 ? 0.6 : sp < 450 ? 0.88 : sp < 700 ? 0.65 : 0.45;
        if (Math.random() < chance) {
          if (sp > 620) {
            ball.vx *= -0.35; ball.vy = rand(-220, 220); ball.vz = 150; ball.kicker = p; ball.team = p.team; p.noPick = 0.35;
            addFloat(p.x, p.y, 'PARRIED!', '#3dff8a', 30, true); Sfx.ooh();
          } else { take(p); addFloat(p.x, p.y, 'SAVED!', '#3dff8a', 30, true); }
        } else { p.noPick = 0.6; p.whiff = 0.5; addFloat(p.x, p.y, 'WHIFF!', '#fff', 26); }
        return;
      }
      take(p);
      return;
    }
  }

  // ---------- power-ups, peels, events ----------
  function spawnItem() {
    const type = pick(Object.keys(ITEMS));
    items.push({ type, x: rand(180, W - 180), y: rand(90, H - 90), t: 0, life: 14 });
  }
  function applyItem(p, type) {
    const it = ITEMS[type], foe = 1 - p.team;
    if (p.team === 0 && G.stats) G.stats.items++;
    ticker(`${TEAM[p.team].name}: ${it.label}`, p.team ? '#ff8a9a' : '#9cd0ff');
    addFloat(p.x, p.y, it.emoji + ' ' + it.label, it.color, 26);
    Sfx.pickup();
    burst(p.x, p.y, 22, [it.color, '#fff'], 200, { kind: 'star' });
    if (type === 'giant') p.giant = 8;
    else if (type === 'zoom') p.zoom = 7;
    else if (type === 'fire') G.teamFire[p.team] = true;
    else if (type === 'freeze') {
      for (const q of teams[foe]) {
        q.frozen = 3; q.dashT = 0; q.windup = 0;
        if (ball.owner === q) looseBall(q, norm(q.fx, q.fy));
        burst(q.x, q.y, 10, ['#bff4ff', '#fff'], 120, { kind: 'shard' });
      }
      fx.flash = 0.5; fx.flashColor = '#bff4ff'; Sfx.freeze();
    } else if (type === 'bigGoal') G.bigGoal[p.team ? 0 : 1] = 10;
    else if (type === 'banana') {
      for (let i = 0; i < 7; i++) {
        const q = pick(teams[foe]);
        peels.push({ x: clamp(q.x + rand(-90, 90) + (foe ? -1 : 1) * rand(10, 60) * -1, 30, W - 30), y: clamp(q.y + rand(-80, 80), 30, H - 30), t: 0, rot: rand(0, 6) });
      }
    }
  }
  function updateItems(dt) {
    G.itemT -= dt;
    if (G.itemT <= 0) { G.itemT = rand(8, 13); if (items.length < 2) spawnItem(); }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.t += dt;
      if (it.t > it.life) { items.splice(i, 1); continue; }
      for (const p of players) {
        if (p.stun > 0 || p.frozen > 0 || p.z > 20) continue;
        if (dist(p, it) < p.r * p.scale + 14) { applyItem(p, it.type); items.splice(i, 1); break; }
      }
    }
    for (let i = peels.length - 1; i >= 0; i--) {
      const pl = peels[i]; pl.t += dt;
      if (pl.t > 20) { peels.splice(i, 1); continue; }
      for (const p of players) {
        if (p.stun > 0 || p.frozen > 0 || p.z > 5 || p.giant > 0) continue;
        if (dist(p, pl) < p.r + 6 && Math.hypot(p.vx, p.vy) > 15) {
          knock(p, p.vx * 3 + rand(-40, 40), p.vy * 3 + rand(-40, 40), 1.1, false);
          p.spinV = 22; addFloat(p.x, p.y, 'SLIP!', '#fff36b', 28); Sfx.slip();
          peels.splice(i, 1); break;
        }
      }
    }
    for (let s = 0; s < 2; s++) {
      G.bigGoal[s] = Math.max(0, G.bigGoal[s] - dt);
      const target = G.bigGoal[s] > 0 ? GOAL_HALF * 1.9 : GOAL_HALF;
      G.goalHalf[s] += (target - G.goalHalf[s]) * Math.min(1, dt * 3);
    }
  }
  function startEvent() {
    const e = pick(['cow', 'wind', 'moon', 'mega', 'cow', 'stampede']);
    if (e === 'cow' || e === 'stampede') {
      const n = e === 'stampede' ? 3 : 1, fromLeft = Math.random() < 0.5;
      for (let i = 0; i < n; i++) cows.push({ x: fromLeft ? -90 - i * 120 : W + 90 + i * 120, y: rand(70, H - 70), vx: (fromLeft ? 1 : -1) * rand(200, 260), t: rand(0, 6) });
      banner(n > 1 ? 'STAMPEDE!' : 'COW ON THE PITCH!', '\u{1F404} MOOOOO');
      Sfx.moo();
    } else if (e === 'wind') {
      const a = rand(0, Math.PI * 2);
      G.wind = { x: Math.cos(a) * 170, y: Math.sin(a) * 170, t: 6 };
      banner('WIND STORM!', '\u{1F32A} hold on to your hair');
    } else if (e === 'moon') { G.moon = 8; banner('MOON GRAVITY!', '\u{1F315} boing boing'); }
    else { G.mega = 8; banner('MEGA BALL!', '⚽ it’s HUGE'); }
  }
  function updateEvents(dt) {
    if (G.demo) return;
    G.eventT -= dt;
    if (G.eventT <= 0) { G.eventT = rand(22, 32); startEvent(); }
    if (G.wind) { G.wind.t -= dt; if (G.wind.t <= 0) G.wind = null; }
    G.moon = Math.max(0, G.moon - dt); G.mega = Math.max(0, G.mega - dt);
  }
  function updateCows(dt) {
    for (let i = cows.length - 1; i >= 0; i--) {
      const c = cows[i]; c.x += c.vx * dt; c.t += dt; c.y += Math.sin(c.t * 3) * 20 * dt;
      if ((c.vx > 0 && c.x > W + 400) || (c.vx < 0 && c.x < -400)) { cows.splice(i, 1); continue; }
      for (const p of players) {
        if (p.stun > 0 || p.z > 30) continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) < 34 + p.r * (p.scale - 1)) {
          const n = norm(p.x - c.x, (p.y - c.y) || rand(-1, 1));
          knock(p, n.x * 200 + c.vx * 1.2, n.y * 300, 1.6, true);
        }
      }
      if (!ball.owner && ball.inNet < 0 && Math.hypot(ball.x - c.x, ball.y - c.y) < 30 && ball.z < 30) {
        ball.vx = c.vx * 1.8; ball.vy = rand(-200, 200); ball.vz = 260; ball.kicker = null; ball.intended = null;
        addFloat(c.x, c.y, 'MOO!', '#fff', 30);
      }
    }
  }

  // ---------- main update ----------
  function update(dt) {
    G.time += dt;
    G.excite = Math.max(0, G.excite - dt * 0.4);
    if (G.phase === 'kickoff') {
      G.phaseT -= dt;
      if (G.phaseT <= 0) { G.phase = 'live'; Sfx.whistle(); }
    } else if (G.phase === 'live') {
      if (!G.demo) {
        G.clock -= dt;
        if (G.clock <= 0) {
          G.clock = 0;
          if (G.score[0] === G.score[1] && !G.golden) {
            G.golden = true; G.clock = GOLDEN_TIME;
            banner('GOLDEN GOAL!', 'next goal wins!'); Sfx.whistle(true);
          } else endMatch();
        }
        updateClock();
      }
    } else if (G.phase === 'goal') {
      G.phaseT -= dt;
      if (G.phaseT < 1.6) cam.zoomT = 1;
      if (G.phaseT <= 0) {
        if (!G.demo && (G.golden || G.clock <= 0)) endMatch();
        else setupKickoff(1 - G.celebTeam);
      }
    } else if (G.phase === 'end') {
      G.endT -= dt;
      if (G.endT <= 0 && G.mode === 'play') showResults();
    }
    if (!G.demo) G.ctrl = pickCtrl();
    teamAI(0, dt); teamAI(1, dt);
    if (G.phase === 'live') { updateItems(dt); updateEvents(dt); }
    updateCows(dt);
    movePlayers(dt);
    if (G.phase === 'live') collisions();
    updateBall(dt);
    updateParts(dt);
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.t += dt;
      if (q.t > q.life) { parts.splice(i, 1); continue; }
      q.vz -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.z < 0) { q.z = 0; q.vz = -q.vz * 0.3; q.vx *= 0.6; q.vy *= 0.6; }
      if (q.kind === 'confetti') { q.vx *= 0.98; q.vy *= 0.98; }
    }
  }
  function updateFx(rdt) {
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += rdt; if (f.t > f.life) floaters.splice(i, 1); }
    fx.lines = Math.max(0, fx.lines - rdt * 1.4);
    fx.flash = Math.max(0, fx.flash - rdt * 2.5);
    if (inp.charging && inp.power > 0.5) { fx.lines = Math.max(fx.lines, (inp.power - 0.5) * 1.3); if (ball.owner) { fx.x = ball.owner.x; fx.y = ball.owner.y; } }
    cam.zoomT = G.phase === 'goal' ? cam.zoomT : inp.charging ? 1 + inp.power * 0.15 : 1;
    Sfx.crowdLevel(0.03 + G.excite * 0.12);
  }

  // ---------- drawing ----------
  const CROWD = [];
  (function buildCrowd() {
    const cols = ['#ff3b55', '#2f8bff', '#ffe81a', '#fff', '#ff2fd6', '#7dff2f', '#19f7ff', '#ff7a1a'];
    for (let row = 0; row < 5; row++) {
      const m = 52 + row * 20;
      const add = (x, y) => CROWD.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), c: pick(cols), ph: rand(0, 6), team: x < W / 2 ? 0 : 1 });
      for (let x = -m; x <= W + m; x += 17) { add(x, -m); add(x, H + m); }
      for (let y = -m + 17; y < H + m; y += 17) { add(-m, y); add(W + m, y); }
    }
  })();

  function setWorld() { ctx.setTransform(M.a * dpr, M.b * dpr, M.c * dpr, M.d * dpr, M.e * dpr, M.f * dpr); }
  function setScreen() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

  function drawPitch() {
    setWorld();
    // stands
    ctx.fillStyle = '#2b1452'; ctx.fillRect(-500, -400, W + 1000, H + 800);
    const jump = 2 + G.excite * 6;
    for (const c of CROWD) {
      const b = Math.max(0, Math.sin(G.time * (6 + G.excite * 6) + c.ph)) * jump;
      ctx.fillStyle = c.c;
      ctx.beginPath(); ctx.arc(c.x, c.y - b, 7, 0, Math.PI * 2); ctx.fill();
    }
    // boards
    ctx.fillStyle = '#160a2c'; ctx.fillRect(-36, -36, W + 72, H + 72);
    const bc = ['#ffe81a', '#ff2fd6', '#19f7ff', '#ff7a1a'];
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = bc[i % 4];
      ctx.fillRect(-30 + i * (W + 60) / 12, -30, (W + 60) / 12 - 4, 18);
      ctx.fillRect(-30 + i * (W + 60) / 12, H + 12, (W + 60) / 12 - 4, 18);
    }
    ctx.font = '15px Bangers, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#160a2c';
    for (let i = 0; i < 12; i++) {
      const x = -30 + (i + 0.5) * (W + 60) / 12 - 2;
      ctx.fillText(i % 2 ? 'LOLO FOOT' : 'LOLO HUB', x, -21); ctx.fillText(i % 2 ? 'LOLO HUB' : 'LOLO FOOT', x, H + 21);
    }
    // grass stripes
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#3fc24b' : '#35b043'; ctx.fillRect(i * W / 16, -6, W / 16 + 0.5, H + 12); }
    ctx.fillStyle = '#3fc24b'; ctx.fillRect(-6, -6, 6, H + 12); ctx.fillRect(W, -6, 6, H + 12);
    // lines
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 78, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill();
    for (const s of [0, 1]) {
      const x0 = s ? W : 0, k = s ? -1 : 1;
      ctx.strokeRect(Math.min(x0, x0 + k * 150), H / 2 - 165, 150, 330);
      ctx.strokeRect(Math.min(x0, x0 + k * 55), H / 2 - 92, 55, 184);
      ctx.beginPath(); ctx.arc(x0 + k * 110, H / 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x0 + k * 110, H / 2, 70, s ? Math.PI - 0.93 : -0.93, s ? Math.PI + 0.93 : 0.93); ctx.stroke();
    }
    // goals
    for (const s of [0, 1]) {
      const gh = G.goalHalf[s], x0 = s ? W : -GOAL_DEPTH;
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, H / 2 - gh, GOAL_DEPTH, gh * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x0 + GOAL_DEPTH; x += 8) { ctx.moveTo(x, H / 2 - gh); ctx.lineTo(x, H / 2 + gh); }
      for (let y = H / 2 - gh; y <= H / 2 + gh; y += 8) { ctx.moveTo(x0, y); ctx.lineTo(x0 + GOAL_DEPTH, y); }
      ctx.stroke();
      ctx.strokeStyle = '#160a2c'; ctx.lineWidth = 7;
      ctx.strokeRect(x0, H / 2 - gh, GOAL_DEPTH, gh * 2);
      ctx.strokeStyle = G.bigGoal[s] > 0 ? '#7dff2f' : '#fff'; ctx.lineWidth = 4;
      ctx.strokeRect(x0, H / 2 - gh, GOAL_DEPTH, gh * 2);
    }
  }

  function poly(pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function starShape(cx, cy, r1, r2, n, rotA) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rotA + i * Math.PI / n, r = i % 2 ? r2 : r1;
      i ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function drawShadow(x, y, z, rx) {
    const [sx, sy] = w2s(x, y), k = Math.max(0.3, 1 - z / 120);
    ctx.fillStyle = `rgba(10,30,10,${0.35 * k})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, rx * S * k, rx * S * 0.45 * k, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawCtrlRing() {
    const p = G.ctrl;
    if (!p || G.demo || G.phase === 'goal' || G.phase === 'end' || G.mode !== 'play') return;
    const [sx, sy] = w2s(p.x, p.y), rr = (p.r * p.scale + 8) * S, own = ball.owner === p;
    const pulse = 1 + Math.sin(G.time * 10) * 0.06;
    ctx.save();
    ctx.lineWidth = Math.max(3, S * 2.2);
    ctx.strokeStyle = '#160a2c';
    ctx.beginPath(); ctx.ellipse(sx, sy, rr * pulse + 2, rr * 0.5 * pulse + 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = own ? '#ffe81a' : '#19f7ff';
    ctx.setLineDash([rr * 0.5, rr * 0.25]); ctx.lineDashOffset = -G.time * 40;
    ctx.beginPath(); ctx.ellipse(sx, sy, rr * pulse, rr * 0.5 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (!own && p.dashCD > 0) { // dash cooldown sweep
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(4, S * 3);
      const f = 1 - p.dashCD / DASH_CD;
      ctx.beginPath(); ctx.ellipse(sx, sy, rr * 1.25, rr * 0.62, 0, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawAim() {
    if (!inp.charging || !ball.owner || ball.owner.team !== 0) return;
    const o = ball.owner, aim = s2w(inp.sx, inp.sy), mate = mateNear(o, aim, 85);
    const [bx, by] = w2s(ball.x, ball.y);
    ctx.save();
    if (mate) {
      const [mx, my] = w2s(mate.x, mate.y), d = Math.hypot(mx - bx, my - by);
      ctx.strokeStyle = '#19f7ff'; ctx.lineWidth = Math.max(3, S * 2.5); ctx.setLineDash([10, 8]); ctx.lineDashOffset = -G.time * 60;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + mx) / 2, (by + my) / 2 - d * 0.45, mx, my); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(mx, my, 22 * S, 11 * S, 0, 0, Math.PI * 2); ctx.stroke();
      comicText('LOB', mx, my - 52 * S, 26, '#19f7ff', 0);
    } else {
      const n = norm(aim.x - ball.x, aim.y - ball.y), len = 90 + inp.power * 230;
      const [ex, ey] = w2s(ball.x + n.x * len, ball.y + n.y * len);
      const hot = inp.power >= 1 ? (Math.floor(G.time * 14) % 2 ? '#fff' : '#ff3b2f') : inp.power > 0.6 ? '#ff7a1a' : '#ffe81a';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#160a2c'; ctx.lineWidth = Math.max(6, S * (4 + inp.power * 6)) + 4;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = hot; ctx.lineWidth -= 4; ctx.stroke();
      const ang = Math.atan2(ey - by, ex - bx), hs = 14 + inp.power * 10;
      ctx.fillStyle = hot; ctx.strokeStyle = '#160a2c'; ctx.lineWidth = 3;
      poly([ex + Math.cos(ang) * hs, ey + Math.sin(ang) * hs, ex + Math.cos(ang + 2.4) * hs, ey + Math.sin(ang + 2.4) * hs, ex + Math.cos(ang - 2.4) * hs, ey + Math.sin(ang - 2.4) * hs]);
      ctx.fill(); ctx.stroke();
    }
    // power meter above the kicker
    const [ox, oy] = w2s(o.x, o.y), top = oy - (48 * o.scale + o.z) * S - 20, bw = 54;
    ctx.fillStyle = '#160a2c'; rrect(ox - bw / 2 - 3, top - 3, bw + 6, 14, 6); ctx.fill();
    const g = ctx.createLinearGradient(ox - bw / 2, 0, ox + bw / 2, 0);
    g.addColorStop(0, '#ffe81a'); g.addColorStop(0.6, '#ff7a1a'); g.addColorStop(1, '#ff2f4f');
    ctx.fillStyle = g; rrect(ox - bw / 2, top, Math.max(4, bw * inp.power), 8, 4); ctx.fill();
    if (inp.power >= 1) comicText('MAX!', ox, top - 16, 22, '#ff3b2f', 0);
    ctx.restore();
  }

  function drawPlayer(p) {
    const [sx, sy] = w2s(p.x, p.y);
    const u = S * p.scale, C = TEAM[p.team];
    const shirt = p.role === 'gk' ? C.gk : C.shirt;
    const sp = Math.hypot(p.vx, p.vy), moving = sp > 12 && p.stun <= 0 && p.frozen <= 0;
    const [fdx0, fdy0] = dirS(p.fx, p.fy), fn = Math.hypot(fdx0, fdy0) || 1, fdx = fdx0 / fn, fdy = fdy0 / fn;
    const away = fdy < -0.6;
    const run = moving ? Math.sin(p.runPh) : 0;
    const ko = p.stun > 0, happy = (G.phase === 'goal' && p.team === G.celebTeam) || (G.phase === 'end' && G.score[p.team] > G.score[1 - p.team]);
    // after-images
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i], [tx, ty] = w2s(t.x, t.y);
      ctx.fillStyle = p.zoom > 0 ? `rgba(255,232,26,${0.08 + i * 0.05})` : `rgba(255,255,255,${0.06 + i * 0.04})`;
      ctx.beginPath(); ctx.ellipse(tx, ty - (t.z + 20) * u, 11 * u, 18 * u, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(sx, sy - p.z * S);
    if (ko) { ctx.translate(0, -18 * u); ctx.rotate(p.spin); ctx.translate(0, 18 * u); }
    else if (p.dashT > 0) ctx.rotate(clamp(fdx, -1, 1) * 0.35);
    if (p.windup > 0 || (p.team === 0 && G.teamFire[0] && ball.owner === p) || (p.team === 1 && G.teamFire[1] && ball.owner === p)) {
      const gl = ctx.createRadialGradient(0, -18 * u, 2, 0, -18 * u, 34 * u);
      gl.addColorStop(0, 'rgba(255,200,40,0.8)'); gl.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, -18 * u, 34 * u * (1 + Math.sin(G.time * 30) * 0.08), 0, Math.PI * 2); ctx.fill();
    }
    const lw = Math.max(1.4, 1.7 * u);
    ctx.lineWidth = lw; ctx.strokeStyle = '#160a2c'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // legs
    const kick = p.kickAnim > 0 ? 1 : 0;
    for (const side of [-1, 1]) {
      const swing = (side === 1 && kick ? 7 : run * 4 * side) * u;
      ctx.fillStyle = '#f3f3f3';
      rrect(side * 4.5 * u - 2.5 * u + swing * 0.3, -11 * u, 5 * u, 9 * u, 2 * u); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#160a2c';
      ctx.beginPath(); ctx.ellipse(side * 4.5 * u + swing * 0.5, -2 * u, 4 * u, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill();
    }
    // arms
    for (const side of [-1, 1]) {
      const sw = -run * 3 * side * u;
      ctx.fillStyle = p.role === 'gk' ? '#fff' : p.skin;
      ctx.beginPath(); ctx.arc(side * 11 * u, -17 * u + sw, (p.role === 'gk' ? 4.2 : 3) * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // body
    ctx.fillStyle = shirt; rrect(-9 * u, -25 * u, 18 * u, 15 * u, 5 * u); ctx.fill(); ctx.stroke();
    ctx.fillStyle = p.role === 'gk' ? '#160a2c' : C.dark;
    ctx.fillRect(-8 * u, -15 * u, 16 * u, 3 * u);
    if (!away) {
      ctx.fillStyle = '#fff'; ctx.font = `${Math.round(8 * u)}px Bangers, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.role === 'gk' ? 1 : p.idx * 3 + 1), 0, -19.5 * u);
    }
    // head
    const hy = -33 * u, hr = 10 * u;
    ctx.fillStyle = away ? p.hair : p.skin;
    ctx.beginPath(); ctx.arc(0, hy, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // spiky anime hair
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    const n = p.spikes, flick = Math.sin(G.time * 8 + p.wob) * (moving ? 0.08 : 0.02);
    ctx.moveTo(-hr * 1.05, hy + hr * 0.15);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (1 + i / n), a2 = Math.PI * (1 + (i + 0.5) / n) + flick;
      ctx.lineTo(Math.cos(a) * hr * 1.05, hy + Math.sin(a) * hr * 1.05);
      if (i < n) ctx.lineTo(Math.cos(a2) * hr * 1.65, hy + Math.sin(a2) * hr * 1.65 - hr * 0.15);
    }
    if (away) ctx.lineTo(hr * 1.05, hy + hr * 0.5), ctx.quadraticCurveTo(0, hy + hr * 1.2, -hr * 1.05, hy + hr * 0.5);
    else ctx.quadraticCurveTo(hr * 0.2 + fdx * hr * 0.5, hy - hr * 0.1, -hr * 1.05, hy + hr * 0.15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // headband
    ctx.strokeStyle = C.dark; ctx.lineWidth = 2.2 * u;
    ctx.beginPath(); ctx.arc(0, hy, hr * 0.98, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.strokeStyle = '#160a2c'; ctx.lineWidth = lw;
    if (!away) {
      const ex = fdx * 3 * u, ey = hy + 1.5 * u + Math.max(0, fdy) * 1.5 * u;
      for (const side of [-1, 1]) {
        const x = side * 3.8 * u + ex;
        if (ko) { // spiral X eyes
          ctx.beginPath(); ctx.moveTo(x - 2 * u, ey - 2 * u); ctx.lineTo(x + 2 * u, ey + 2 * u); ctx.moveTo(x + 2 * u, ey - 2 * u); ctx.lineTo(x - 2 * u, ey + 2 * u); ctx.stroke();
        } else if (happy) {
          ctx.beginPath(); ctx.arc(x, ey + 1 * u, 2.2 * u, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        } else {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(x, ey, 2.6 * u, 3.6 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = p.team ? '#7a0f24' : '#0b3a8a';
          ctx.beginPath(); ctx.ellipse(x + fdx * 0.8 * u, ey + 0.4 * u, 1.6 * u, 2.4 * u, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x + fdx * 0.8 * u - 0.6 * u, ey - 0.8 * u, 0.7 * u, 0, Math.PI * 2); ctx.fill();
        }
      }
      // determined brows when dashing / winding up
      if (p.dashT > 0 || p.windup > 0 || (inp.charging && ball.owner === p)) {
        ctx.beginPath(); ctx.moveTo(-6 * u + ex, ey - 5 * u); ctx.lineTo(-1.5 * u + ex, ey - 3.5 * u);
        ctx.moveTo(6 * u + ex, ey - 5 * u); ctx.lineTo(1.5 * u + ex, ey - 3.5 * u); ctx.stroke();
      }
      const my = hy + 6.5 * u;
      if (ko || p.dashT > 0 || happy || p.kickAnim > 0) {
        ctx.fillStyle = '#7a1030'; ctx.beginPath(); ctx.ellipse(ex * 0.8, my, 2 * u, (happy ? 2.4 : 1.8) * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else { ctx.beginPath(); ctx.moveTo(ex * 0.8 - 1.8 * u, my); ctx.lineTo(ex * 0.8 + 1.8 * u, my); ctx.stroke(); }
      // blush
      ctx.fillStyle = 'rgba(255,90,120,0.35)';
      ctx.beginPath(); ctx.ellipse(-6.5 * u + ex * 0.6, hy + 4.5 * u, 2 * u, 1.2 * u, 0, 0, Math.PI * 2); ctx.ellipse(6.5 * u + ex * 0.6, hy + 4.5 * u, 2 * u, 1.2 * u, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // dizzy stars
    if (ko) {
      ctx.font = `${Math.round(10 * u)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) {
        const a = G.time * 6 + i * 2.1;
        ctx.fillText('⭐', sx + Math.cos(a) * 13 * u, sy - (p.z + 48) * S * p.scale + Math.sin(a) * 4 * u);
      }
    }
    if (p.frozen > 0) {
      ctx.fillStyle = 'rgba(170,235,255,0.55)'; ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2;
      rrect(sx - 15 * u, sy - 50 * u, 30 * u, 52 * u, 5 * u); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(sx - 9 * u, sy - 44 * u); ctx.lineTo(sx - 3 * u, sy - 30 * u); ctx.stroke();
    }
    if (p.whiff > 0) comicText('?!', sx, sy - 58 * u, 22, '#fff', 0);
    // marker above the ball carrier you control
    if (p === G.ctrl && !G.demo && G.mode === 'play' && G.phase !== 'goal') {
      const by = sy - (p.z + 50 * p.scale) * S - 6 - Math.abs(Math.sin(G.time * 6)) * 6;
      ctx.fillStyle = ball.owner === p ? '#ffe81a' : '#19f7ff'; ctx.strokeStyle = '#160a2c'; ctx.lineWidth = 2.5;
      poly([sx - 8, by - 10, sx + 8, by - 10, sx, by]); ctx.fill(); ctx.stroke();
      if (p.cdNag > 0) comicText('WAIT!', sx, by - 22, 20, '#fff', 0);
    }
  }

  function drawBall() {
    const R = ballR(), [sx, sy] = w2s(ball.x, ball.y), r = R * S, by = sy - ball.z * S - r;
    if (ball.fire) {
      const gl = ctx.createRadialGradient(sx, by, r * 0.5, sx, by, r * 3.4);
      gl.addColorStop(0, 'rgba(255,240,120,0.95)'); gl.addColorStop(0.4, 'rgba(255,120,20,0.6)'); gl.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sx, by, r * 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = ball.fire ? '#fff3b0' : '#fff'; ctx.strokeStyle = '#160a2c'; ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.beginPath(); ctx.arc(sx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#160a2c';
    for (let k = 0; k < 3; k++) {
      const a = ball.roll + k * 2.1;
      ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r * 0.55, by + Math.sin(a * 0.8 + k) * r * 0.45, r * 0.32, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(sx, by, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(sx - r * 0.35, by - r * 0.4, r * 0.22, 0, Math.PI * 2); ctx.fill();
  }

  function emoji(ch2, x, y, size, flip) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    ctx.font = `${Math.round(size)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch2, 0, 0); ctx.restore();
  }
  function drawItem(it) {
    const [sx, sy] = w2s(it.x, it.y), bob = Math.sin(G.time * 4 + it.x) * 4 * S, c = ITEMS[it.type].color;
    const fade = it.life - it.t < 3 && Math.floor(it.t * 8) % 2 ? 0.4 : 1, pop = Math.min(1, it.t * 4);
    ctx.globalAlpha = fade;
    ctx.fillStyle = c; ctx.strokeStyle = '#160a2c'; ctx.lineWidth = 3;
    starShape(sx, sy - 20 * S + bob, 17 * S * pop, 11 * S * pop, 8, G.time * 2); ctx.fill(); ctx.stroke();
    emoji(ITEMS[it.type].emoji, sx, sy - 20 * S + bob, 18 * S * pop);
    ctx.globalAlpha = 1;
  }

  function comicText(text, x, y, size, color, rotA, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotA); ctx.scale(scale, scale);
    ctx.font = `${size}px Bangers, Bungee, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(4, size / 5); ctx.strokeStyle = '#160a2c';
    ctx.strokeText(text, 3, 3); ctx.fillStyle = '#160a2c'; ctx.fillText(text, 3, 3);
    ctx.strokeText(text, 0, 0); ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  function drawFloaters() {
    const k = Math.min(1.4, Math.max(0.75, S / 1.4));
    for (const f of floaters) {
      const [sx, sy] = w2s(f.x, f.y), p = f.t / f.life;
      const sc = p < 0.15 ? 0.4 + p / 0.15 * 0.9 : p < 0.3 ? 1.3 - (p - 0.15) / 0.15 * 0.3 : 1;
      ctx.globalAlpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
      const y = sy - 60 * S - p * 40;
      if (f.pow) {
        ctx.fillStyle = '#ffe81a'; ctx.strokeStyle = '#160a2c'; ctx.lineWidth = 3;
        const w = f.size * k * (0.4 + f.text.length * 0.16) * sc;
        ctx.save(); ctx.translate(sx, y); ctx.rotate(f.rotA); ctx.scale(1, 0.62);
        starShape(0, 0, w, w * 0.72, 12, G.time); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#ff2f4f';
      }
      comicText(f.text, sx, y, f.size * k, f.pow ? (f.color === '#ffe81a' ? '#fff' : f.color) : f.color, f.rotA, sc);
    }
    ctx.globalAlpha = 1;
  }

  function drawParts() {
    for (const q of parts) {
      const [sx, sy] = w2s(q.x, q.y), y = sy - q.z * S, a = 1 - q.t / q.life, s = q.size * S;
      ctx.globalAlpha = Math.max(0, a);
      if (q.kind === 'confetti') {
        ctx.fillStyle = q.color; ctx.save(); ctx.translate(sx, y); ctx.rotate(q.spin * q.t); ctx.fillRect(-s, -s * 0.5, s * 2, s); ctx.restore();
      } else if (q.kind === 'star') {
        ctx.fillStyle = q.color; starShape(sx, y, s * 1.6, s * 0.7, 4, q.spin * q.t); ctx.fill();
      } else if (q.kind === 'shard') {
        ctx.fillStyle = q.color; poly([sx, y - s * 1.5, sx + s, y, sx, y + s * 1.5, sx - s, y]); ctx.fill();
      } else if (q.kind === 'puff') {
        ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(sx, y, s * (1.5 - a * 0.5), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(sx, y, s * (q.kind === 'flame' ? a : 1), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // anime speed lines radiating toward a focus point
  function drawEnergyLines() {
    if (fx.lines <= 0.02) return;
    const [cx, cy] = w2s(fx.x, fx.y), R = Math.hypot(cw, ch), it = Math.min(1, fx.lines);
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, inner = R * rand(0.22, 0.45) * (1.25 - it * 0.45), w = rand(0.003, 0.016);
      ctx.fillStyle = i % 6 === 0 ? `rgba(22,10,44,${0.5 * it})` : `rgba(255,255,255,${0.8 * it})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
      ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawWind() {
    if (!G.wind) return;
    const [dx0, dy0] = dirS(G.wind.x, G.wind.y), n = norm(dx0, dy0);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const seed = i * 97.13, t = (G.time * 0.9 + (seed % 1)) % 1;
      const bx = ((seed * 7.3) % cw), by = ((seed * 3.7) % ch);
      const x = bx + n.x * (t - 0.5) * cw, y = by + n.y * (t - 0.5) * ch;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - n.x * 60, y - n.y * 60); ctx.stroke();
    }
  }

  function render() {
    setScreen();
    ctx.fillStyle = '#2b1452'; ctx.fillRect(0, 0, cw, ch);
    drawPitch();
    setScreen();
    // ground layer
    for (const pl of peels) { const [sx, sy] = w2s(pl.x, pl.y); emoji('\u{1F34C}', sx, sy, 16 * S); }
    for (const p of players) drawShadow(p.x, p.y, p.z, 12 * p.scale);
    drawShadow(ball.x, ball.y, ball.z, ballR() * 1.2);
    for (const c of cows) drawShadow(c.x, c.y, 0, 30);
    drawCtrlRing();
    // y-sorted sprites
    const list = [];
    for (const p of players) list.push({ k: w2s(p.x, p.y)[1], d: () => drawPlayer(p) });
    list.push({ k: w2s(ball.x, ball.y)[1] + 0.5, d: drawBall });
    for (const it of items) list.push({ k: w2s(it.x, it.y)[1], d: () => drawItem(it) });
    for (const c of cows) {
      const [sx, sy] = w2s(c.x, c.y), [vx] = dirS(c.vx, 0);
      list.push({ k: sy, d: () => emoji('\u{1F404}', sx, sy - 26 * S + Math.abs(Math.sin(c.t * 10)) * -6 * S, 62 * S, vx > 0) });
    }
    list.sort((a, b) => a.k - b.k);
    for (const e of list) e.d();
    drawAim();
    drawParts();
    drawWind();
    drawEnergyLines();
    if (G.ts < 0.7 && !G.demo) { // slow-motion vignette
      const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
      v.addColorStop(0, 'rgba(20,0,40,0)'); v.addColorStop(1, `rgba(20,0,40,${(0.7 - G.ts) * 0.9})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
    }
    drawFloaters();
    if (fx.flash > 0) { ctx.globalAlpha = fx.flash * 0.55; ctx.fillStyle = fx.flashColor; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; }
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!G.paused) {
      updateCharge();
      let s = 1;
      if (G.hitstop > 0) { G.hitstop -= rdt; s = 0.03; }
      else {
        if (G.slow.t > 0) { G.slow.t -= rdt; s = G.slow.s; }
        if (inp.charging && inp.power > 0.15) s = Math.min(s, 0.4);
      }
      G.ts += (s - G.ts) * Math.min(1, rdt * 14);
      if (G.hitstop > 0) G.ts = s;
      update(rdt * G.ts);
      updateFx(rdt);
    }
    updateCamera(rdt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- menus ----------
  function goHub() { location.href = '../../'; }
  function setQuitOpen(open) {
    $('quitModal').classList.toggle('hidden', !open);
    G.paused = open;
    if (open) { inp.down = false; inp.charging = false; Sfx.chargeStop(); }
    Sfx.crowdLevel(0);
  }
  $('hubBtn').addEventListener('click', () => { if (G.mode === 'play') setQuitOpen(true); else goHub(); });
  $('quitNo').addEventListener('click', () => setQuitOpen(false));
  $('quitYes').addEventListener('click', goHub);
  $('quitModal').addEventListener('click', (ev) => { if (ev.target.id === 'quitModal') setQuitOpen(false); });
  $('playBtn').addEventListener('click', () => { Sfx.init(); startMatch(); });
  // ad break before a new match (the hub's ../../core/ads.js; skipped when ads are off or missing)
  $('againBtn').addEventListener('click', () => (window.loloAd ? loloAd('game-over', startMatch) : startMatch()));
  $('overHub').addEventListener('click', goHub);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play' && !G.paused) setQuitOpen(true); });

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

  // debug hook for testing
  window.__foot = {
    G, ball, teams, inp, startEvent, applyItem, dash, shoot, tapKick, chargedKick,
    sim(sec) { for (let i = 0; i < sec * 60; i++) { update(1 / 60); updateFx(1 / 60); } updateCamera(1 / 60); render(); },
  };

  startDemo();
  requestAnimationFrame(frame);
})();
