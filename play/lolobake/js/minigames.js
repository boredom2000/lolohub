// SUPER BAKING mini-games: short WarioWare-style games drawn on a 2D canvas.
// Every game lives on a 600x600 "stage" that is scaled to fit the screen (backgrounds stretch to the
// screen edges through `view`). MG.run(id, opts) plays one game and resolves {grade, score}.
// A game definition is { cmd, hint, dur, create(ctx) } and create() returns an object with
// update(dt, live), draw(g, view, t), a `done` getter, result() -> 0..1, and optional
// down(p) / move(p) / up(p) pointer handlers (p.key is set when Space stands in for a press)
// and key(code, isDown).
const MG = (() => {
'use strict';
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (a) => a[(Math.random() * a.length) | 0];
const OL = '#4a2338';
const CANDY = ['#ff5fa2', '#ffd23f', '#5fe0c0', '#3fc8ff', '#b58cff', '#ff8a3d'];

// ------------------------------------------------------------------ drawing kit
function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function paint(g, fill, lw = 6) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = OL; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, TAU); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
function star(g, x, y, r, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i / 10 * TAU - Math.PI / 2, q = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  g.closePath();
}
function shadow(g, x, y, rx, ry = rx * 0.2) { g.fillStyle = 'rgba(74,35,56,0.2)'; ell(g, x, y, rx, ry); g.fill(); }
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b); t = clamp(t, 0, 1);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// cute face: mood = happy | joy | grin | o | shock | worry | sad | dead
function face(g, x, y, s = 1, mood = 'happy', lx = 0, ly = 0) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(255,90,140,0.45)';
  ell(g, -24, 8, 8, 5); g.fill(); ell(g, 24, 8, 8, 5); g.fill();
  g.strokeStyle = OL; g.lineCap = 'round';
  if (mood === 'dead') {
    g.lineWidth = 3.5;
    for (const sx of [-13, 13]) { g.beginPath(); g.moveTo(sx - 5, -9); g.lineTo(sx + 5, 1); g.moveTo(sx + 5, -9); g.lineTo(sx - 5, 1); g.stroke(); }
  } else if (mood === 'joy' || mood === 'grin') {
    g.lineWidth = 4;
    for (const sx of [-13, 13]) { g.beginPath(); g.arc(sx, -2, 6, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  } else {
    const big = mood === 'shock';
    for (const sx of [-13, 13]) {
      g.fillStyle = OL; ell(g, sx + lx, -4 + ly, big ? 6.5 : 5, big ? 8.5 : 7); g.fill();
      g.fillStyle = '#fff'; circ(g, sx + lx - 1.6, -7 + ly, big ? 2.4 : 2); g.fill();
    }
  }
  g.lineWidth = 3.5; g.beginPath();
  if (mood === 'happy' || mood === 'joy') { g.arc(0, 5, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else if (mood === 'sad' || mood === 'dead') { g.arc(0, 17, 7, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
  else if (mood === 'shock' || mood === 'o') { g.fillStyle = OL; ell(g, 0, 11, 5, 6.5); g.fill(); }
  else if (mood === 'grin') { g.moveTo(-10, 5); g.quadraticCurveTo(0, 22, 10, 5); g.closePath(); g.fillStyle = OL; g.fill(); }
  else if (mood === 'worry') { g.moveTo(-8, 11); g.quadraticCurveTo(-4, 6, 0, 11); g.quadraticCurveTo(4, 16, 8, 11); g.stroke(); }
  g.restore();
}
// spinning sunburst background that covers the whole screen
function burst(g, v, c1, c2, t) {
  g.fillStyle = c1; g.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  g.save(); g.translate(300, 300); g.rotate(t * 0.15); g.fillStyle = c2;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 1600, a, a + TAU / n / 2); g.closePath(); g.fill();
  }
  g.restore();
}
function label(g, txt, x, y, size = 26, fill = '#fff', lw = 6) {
  g.font = `700 ${size}px Fredoka, Bungee, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (lw) { g.lineWidth = lw; g.strokeStyle = OL; g.strokeText(txt, x, y); }
  g.fillStyle = fill; g.fillText(txt, x, y);
}
function table(g, v, y, c = '#eaa66c') {
  g.fillStyle = c; g.fillRect(v.x0, y, v.x1 - v.x0, v.y1 - y);
  g.fillStyle = 'rgba(74,35,56,0.1)';
  for (let x = Math.floor(v.x0 / 70) * 70; x < v.x1; x += 70) g.fillRect(x, y, 5, v.y1 - y);
  g.fillStyle = OL; g.fillRect(v.x0, y - 3, v.x1 - v.x0, 6);
}
function hbar(g, x, y, w, h, f, col) {
  rr(g, x, y, w, h, h / 2); paint(g, '#fff', 0);
  if (f > 0) { g.save(); rr(g, x, y, w, h, h / 2); g.clip(); g.fillStyle = col; g.fillRect(x, y, w * clamp(f, 0, 1), h); g.restore(); }
  rr(g, x, y, w, h, h / 2); paint(g, null, 5);
}
function plate(g, x, y, r) {
  shadow(g, x, y + r * 0.08, r * 1.02, r * 0.95);
  circ(g, x, y, r); paint(g, '#ffffff', 6);
  circ(g, x, y, r * 0.86); paint(g, null, 0); g.strokeStyle = 'rgba(74,35,56,0.12)'; g.lineWidth = 4; g.stroke();
}
function Parts() {
  const list = [];
  return {
    list,
    add(o) { list.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 900, life: 0.8, t: 0, r: 6, c: '#fff', shape: 'dot', rot: 0, vr: 0 }, o)); },
    burst(x, y, n, o) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(o.sp0 || 120, o.sp1 || 380);
        this.add(Object.assign({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 150),
          r: rand(o.r0 || 4, o.r1 || 9), c: Array.isArray(o.c) ? pick(o.c) : o.c, vr: rand(-8, 8),
        }, o.extra || {}));
      }
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.t += dt;
        if (p.t > p.life) { list.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
    },
    draw(g) {
      for (const p of list) {
        g.globalAlpha = Math.min(1, (1 - p.t / p.life) * 1.5);
        g.fillStyle = p.c;
        if (p.shape === 'rod') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); rr(g, -p.r, -p.r * 0.35, p.r * 2, p.r * 0.7, p.r * 0.35); g.fill(); g.restore(); }
        else if (p.shape === 'puff') { circ(g, p.x, p.y, p.r * (1 + p.t / p.life * 1.5)); g.fill(); }
        else if (p.shape === 'star') { star(g, p.x, p.y, p.r, p.rot); g.fill(); }
        else { circ(g, p.x, p.y, p.r); g.fill(); }
      }
      g.globalAlpha = 1;
    },
  };
}
const sparkle = (P, x, y, n = 12) => P.burst(x, y, n, { c: ['#ffe14d', '#fff', '#ff8fc4'], up: 120, extra: { shape: 'star', g: 250 } });

// ------------------------------------------------------------------ path tracing (shaping / piping)
function catmull(ctrl, closed, per = 12) {
  const out = [], n = ctrl.length, segs = closed ? n : n - 1;
  const at = (i) => ctrl[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  if (!closed) out.push({ x: ctrl[n - 1].x, y: ctrl[n - 1].y });
  return out;
}
function resample(pts, step) {
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    let s = step - carry;
    while (s <= d) { out.push({ x: a.x + (b.x - a.x) * s / d, y: a.y + (b.y - a.y) * s / d }); s += step; }
    carry = d - (s - step);
  }
  return out;
}
// Tracks how much of a path the pointer has covered while pressed.
// ordered: points only count in order (continuous piping); stray: distance that counts as "off the line".
function Tracer(pts, o) {
  const T = { pts: pts.map((p) => ({ x: p.x, y: p.y, on: false })), next: 0, cov: 0, messy: 0, held: false, strokes: [], cur: null, ptr: { x: 300, y: 560 } };
  function sample(x, y, dist) {
    let near = 1e9;
    for (let i = 0; i < T.pts.length; i++) {
      const q = T.pts[i], d = Math.hypot(q.x - x, q.y - y);
      if (d < near) near = d;
      if (!q.on && d < o.R && (!o.ordered || i <= T.next + 3)) { q.on = true; T.cov++; }
    }
    if (o.ordered) while (T.next < T.pts.length && T.pts[T.next].on) T.next++;
    if (near > o.stray) T.messy += dist;
  }
  T.down = (p) => { T.held = true; T.ptr = p; T.cur = [{ x: p.x, y: p.y }]; T.strokes.push(T.cur); sample(p.x, p.y, 0); };
  T.move = (p) => {
    const pr = T.ptr; T.ptr = p;
    if (!T.held) return;
    const dist = Math.hypot(p.x - pr.x, p.y - pr.y), n = Math.max(1, Math.ceil(dist / 8));
    for (let k = 1; k <= n; k++) sample(pr.x + (p.x - pr.x) * k / n, pr.y + (p.y - pr.y) * k / n, dist / n);
    T.cur.push({ x: p.x, y: p.y });
  };
  T.up = () => { T.held = false; T.cur = null; };
  T.frac = () => T.cov / T.pts.length;
  T.drawGuide = (g, col = '#fff') => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); T.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); if (o.closed) g.closePath();
    g.lineWidth = 30; g.strokeStyle = 'rgba(255,255,255,0.28)'; g.stroke();
    for (let i = 0; i < T.pts.length; i += 2) {
      const q = T.pts[i]; if (q.on) continue;
      g.fillStyle = OL; circ(g, q.x, q.y, 6.5); g.fill();
      g.fillStyle = (o.ordered && i >= T.next && i < T.next + 6) ? '#ffe14d' : col; circ(g, q.x, q.y, 4); g.fill();
    }
    const s = T.pts[o.ordered ? Math.min(T.next, T.pts.length - 1) : 0];
    if (!T.held && T.cov < T.pts.length) { const pul = 1 + Math.sin(performance.now() / 120) * 0.15; g.fillStyle = '#ffe14d'; star(g, s.x, s.y, 16 * pul); paint(g, '#ffe14d', 4); }
  };
  T.drawStrokes = (g, w, col, hi) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1, 2]) {
      if (pass === 2 && !hi) break;
      for (const s of T.strokes) {
        g.beginPath(); g.moveTo(s[0].x, s[0].y);
        for (const q of s) g.lineTo(q.x, q.y);
        if (s.length === 1) g.lineTo(s[0].x + 0.1, s[0].y);
        if (pass === 0) { g.lineWidth = w + 9; g.strokeStyle = OL; }
        else if (pass === 1) { g.lineWidth = w; g.strokeStyle = col; }
        else { g.lineWidth = w * 0.22; g.strokeStyle = hi; g.save(); g.translate(-w * 0.18, -w * 0.18); g.stroke(); g.restore(); continue; }
        g.stroke();
      }
    }
  };
  return T;
}

const G = {};

// ------------------------------------------------------------------ POUR (pantry): auto-filling gauge, tap to stop
const INGS = {
  FLOUR: { c: '#fffaf0', bag: '#f4d29a', label: 'FLOUR' },
  SUGAR: { c: '#ffffff', bag: '#ffb8da', label: 'SUGAR' },
  COCOA: { c: '#7a4528', bag: '#c08a5a', label: 'COCOA' },
  MILK: { c: '#ffffff', bag: '#8fd3ff', label: 'MILK' },
};
G.POUR = {
  cmd: 'POUR!', hint: 'It fills by itself • TAP to stop in the green!', dur: 5,
  create(c) {
    const ing = INGS[c.p.ing] || INGS.FLOUR;
    const half = lerp(0.075, 0.045, c.d) * c.k, center = rand(0.5 + half, 0.84 - half);
    const rate0 = lerp(0.2, 0.3, c.d) * rand(0.9, 1.1) * c.slow, accel = lerp(0.07, 0.12, c.d) * c.slow;
    const J = { x: 400, top: 225, bot: 515, w: 190 }, BP = { x: 180, y: 205 };
    let level = 0, flight = 0, tilt = 0, flow = 0, pouring = true, stopped = false, over = false, done = false, t = 0, pt = 0, slosh = 0;
    const P = Parts();
    const inBand = () => Math.abs(level - center) <= half;
    return {
      get done() { return done; },
      down() { if (pouring && !done) { pouring = false; stopped = true; c.sfx.tap(); } },
      update(dt, live) {
        t += dt;
        const want = live && pouring && !over;
        tilt += ((want ? 1 : 0) - tilt) * Math.min(1, dt * (want ? 8 : 16));
        if (want) pt += dt;
        flow = tilt > 0.6 ? (rate0 + accel * pt) * (tilt - 0.6) / 0.4 : 0;
        flight += flow * dt;
        const tr = flight * Math.min(1, dt * 14); flight -= tr; level += tr;
        slosh = Math.min(8, slosh * Math.pow(0.15, dt) + tr * 60);
        if (level >= 1 && !over) { level = 1; over = true; done = true; c.sfx.bad(); P.burst(J.x, J.top + 10, 22, { c: ing.c, up: 260 }); }
        if (stopped && !done && flight < 0.002 && tilt < 0.1) {
          done = true;
          if (inBand()) sparkle(P, J.x, J.bot - 280 * level);
        }
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#ffe6a8', '#ffd88a', T);
        table(g, v, 520);
        shadow(g, J.x, 522, J.w * 0.6);
        const H = J.bot - J.top - 24, ly = (lv) => J.bot - 12 - H * lv;
        // handle
        g.beginPath(); g.ellipse(J.x + J.w / 2, J.top + 120, 42, 72, 0, -Math.PI / 2, Math.PI / 2);
        g.lineWidth = 24; g.strokeStyle = OL; g.stroke(); g.lineWidth = 13; g.strokeStyle = '#e1f4ff'; g.stroke();
        rr(g, J.x - J.w / 2, J.top, J.w, J.bot - J.top, 34); paint(g, 'rgba(206,238,255,0.8)', 0);
        // contents + target band
        const sy = ly(level);
        g.save(); rr(g, J.x - J.w / 2, J.top, J.w, J.bot - J.top, 34); g.clip();
        g.fillStyle = ing.c; g.beginPath(); g.moveTo(J.x - J.w / 2 - 5, J.bot + 5); g.lineTo(J.x - J.w / 2 - 5, sy);
        for (let x = -J.w / 2; x <= J.w / 2; x += 10) g.lineTo(J.x + x, sy + Math.sin(x * 0.08 + t * 12) * (2 + slosh));
        g.lineTo(J.x + J.w / 2 + 5, J.bot + 5); g.closePath(); g.fill();
        g.lineWidth = 4; g.strokeStyle = 'rgba(74,35,56,0.45)'; g.stroke();
        const b0 = ly(center + half), b1 = ly(center - half);
        g.fillStyle = 'rgba(60,220,110,0.38)'; g.fillRect(J.x - J.w / 2, b0, J.w, b1 - b0);
        g.setLineDash([12, 8]); g.lineWidth = 4; g.strokeStyle = '#1f9c49';
        g.beginPath(); g.moveTo(J.x - J.w / 2, b0); g.lineTo(J.x + J.w / 2, b0); g.moveTo(J.x - J.w / 2, b1); g.lineTo(J.x + J.w / 2, b1); g.stroke();
        g.setLineDash([]);
        g.restore();
        g.strokeStyle = 'rgba(74,35,56,0.5)'; g.lineWidth = 3;
        for (let i = 1; i < 10; i++) { const y = ly(i / 10); g.beginPath(); g.moveTo(J.x + J.w / 2 - 28, y); g.lineTo(J.x + J.w / 2 - 10, y); g.stroke(); }
        rr(g, J.x - J.w / 2, J.top, J.w, J.bot - J.top, 34); paint(g, null, 7);
        g.fillStyle = 'rgba(255,255,255,0.65)'; rr(g, J.x - J.w / 2 + 16, J.top + 22, 14, J.bot - J.top - 70, 7); g.fill();
        const am = (b0 + b1) / 2;
        g.beginPath(); g.moveTo(J.x - J.w / 2 - 6, am); g.lineTo(J.x - J.w / 2 - 36, am - 19); g.lineTo(J.x - J.w / 2 - 36, am + 19); g.closePath(); paint(g, '#3ddc6e', 5);
        const mood = over ? 'shock' : level > center + half ? 'worry' : inBand() ? 'joy' : 'happy';
        rr(g, J.x - 46, J.bot - 78, 92, 58, 22); paint(g, '#fff', 5); face(g, J.x, J.bot - 50, 0.8, mood);
        // stream from the bag spout
        const th = tilt * 1.15, ca = Math.cos(th), sa = Math.sin(th);
        const spx = BP.x + 60 * ca + 90 * sa, spy = BP.y + 60 * sa - 90 * ca;
        if (flow > 0.001) {
          const w = 8 + 12 * Math.min(1, tilt);
          for (const [lw, col] of [[w + 8, OL], [w, ing.c]]) {
            g.beginPath(); g.moveTo(spx, spy); g.quadraticCurveTo(spx + 50, spy + 5, J.x - 30, sy);
            g.lineWidth = lw; g.strokeStyle = col; g.lineCap = 'round'; g.stroke();
          }
        }
        g.save(); g.translate(BP.x, BP.y); g.rotate(th);
        rr(g, -62, -80, 124, 170, 26); paint(g, ing.bag);
        rr(g, -62, -96, 124, 30, 12); paint(g, mix(ing.bag, OL, 0.18));
        label(g, ing.label, 0, 52, 24);
        face(g, 0, -12, 0.9, flow > 0 ? 'grin' : 'happy');
        g.restore();
        P.draw(g);
      },
      result() {
        if (over) return 0;
        const dd = Math.abs(level - center);
        return dd <= half ? 1 - dd / half * 0.3 : Math.max(0, 0.6 - (dd - half) * 5);
      },
    };
  },
};

// ------------------------------------------------------------------ CRACK (fridge): drag the egg into the rim at the right speed
function drawEgg(g, x, y, rot, mood, s = 1) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  ell(g, 0, 0, 30, 38); paint(g, '#fffaf0', 5);
  g.fillStyle = 'rgba(255,255,255,0.8)'; ell(g, -10, -14, 7, 10, -0.4); g.fill();
  face(g, 0, 6, 0.65, mood);
  g.restore();
}
G.CRACK = {
  cmd: 'CRACK!', hint: 'Drag the egg into the bowl edge • not too slow, not too fast!', dur: 6.5,
  create(c) {
    const mid0 = lerp(860, 820, c.d), half0 = lerp(340, 180, c.d) * c.k, lo = mid0 - half0, hi = mid0 + half0, VMAX = 1700;
    const B = { x: 445, rim: 300, rx: 140 }, RIMX = B.x - B.rx - 30, home = { x: 105, y: 300 };
    let egg = { x: home.x, y: home.y, state: 'ready', rot: 0, t: 0 }, grab = null, samples = [], left = 2, scores = [];
    let done = false, t = 0, wait = 0, msg = null, spd = 0, lastHit = null;
    const yolks = [], splats = [], P = Parts();
    function speed() {
      while (samples.length > 2 && t - samples[0].t > 0.09) samples.shift();
      if (samples.length < 2) return 0;
      const a = samples[0], b = samples[samples.length - 1];
      return Math.max(0, (b.x - a.x) / Math.max(0.016, b.t - a.t));
    }
    function hitRim() {
      const vel = speed(); grab = null; lastHit = vel;
      if (vel < lo) { egg.state = 'bounce'; egg.t = 0; c.sfx.tink(); msg = { txt: 'TOO SOFT!', t: 0 }; return; }
      left--;
      if (vel > hi) {
        scores.push(0); egg.state = 'gone'; c.sfx.splat(); msg = { txt: 'SPLAT!', t: 0 };
        splats.push({ x: RIMX + 20, y: egg.y });
        P.burst(RIMX + 30, egg.y, 24, { c: ['#ffc21a', '#fffaf0', '#ffe9a0'], up: 120, sp0: 200, sp1: 520 });
      } else {
        const mid = (lo + hi) / 2, half = (hi - lo) / 2, s = clamp(1 - Math.abs(vel - mid) / half * 0.4, 0, 1);
        scores.push(s); egg.state = 'crack'; egg.t = 0; c.sfx.crack();
        msg = { txt: s >= 0.88 ? 'PERFECT CRACK!' : 'CRACK!', t: 0 };
        yolks.push({ x: B.x + rand(-50, 40), y: B.rim + rand(-6, 8) });
        P.burst(RIMX + 30, egg.y, 8, { c: ['#fff', '#ffe9c7'], extra: { shape: 'rod' } });
        if (s >= 0.88) sparkle(P, B.x, B.rim - 40);
      }
      if (left <= 0) done = true; else wait = 0.55;
    }
    return {
      get done() { return done; },
      down(p) { if (p.key || egg.state !== 'ready' || done) return; grab = { dx: egg.x - p.x, dy: egg.y - p.y }; samples = [{ t, x: egg.x }]; },
      move(p) {
        if (!grab || egg.state !== 'ready') return;
        egg.x = Math.min(p.x + grab.dx, RIMX); egg.y = clamp(p.y + grab.dy, 220, 380);
        samples.push({ t, x: egg.x });
        if (egg.x >= RIMX - 0.5) hitRim();
      },
      up() { grab = null; },
      update(dt) {
        t += dt; P.update(dt);
        if (grab) { samples.push({ t, x: egg.x }); spd = speed(); } else spd *= Math.pow(0.02, dt);
        if (msg) msg.t += dt;
        egg.t += dt;
        if (egg.state === 'bounce') {
          egg.x = lerp(egg.x, home.x, Math.min(1, dt * 7)); egg.rot = Math.sin(egg.t * 30) * 0.2 * (1 - egg.t);
          if (egg.t > 0.45) { egg.state = 'ready'; egg.rot = 0; }
        } else if (egg.state === 'crack' || egg.state === 'gone') {
          if (left > 0) { wait -= dt; if (wait <= 0) egg = { x: home.x - 120, y: home.y, state: 'slide', rot: 0, t: 0 }; }
        } else if (egg.state === 'slide') {
          egg.x = lerp(egg.x, home.x, Math.min(1, dt * 9));
          if (Math.abs(egg.x - home.x) < 2) { egg.x = home.x; egg.state = 'ready'; }
        } else if (egg.state === 'ready' && !grab) {
          egg.rot = Math.sin(t * 3) * 0.06;
        }
      },
      draw(g, v, T) {
        burst(g, v, '#c9f3ff', '#b2ebff', T);
        table(g, v, 440, '#ffb3cb');
        for (const s of splats) {
          g.fillStyle = '#fffaf0'; ell(g, s.x - 6, s.y + 8, 30, 46); g.fill();
          g.fillStyle = '#ffc21a'; circ(g, s.x - 4, s.y + 10, 15); g.fill();
        }
        // bowl
        shadow(g, B.x, 470, B.rx + 20);
        ell(g, B.x, B.rim, B.rx, 34); paint(g, '#4fb0e0', 6);
        g.save(); ell(g, B.x, B.rim, B.rx - 8, 28); g.clip();
        g.fillStyle = '#fff3cf'; ell(g, B.x, B.rim + 16, B.rx, 30); g.fill();
        for (const y of yolks) { g.fillStyle = '#fffaf0'; ell(g, y.x, y.y, 30, 15); g.fill(); g.fillStyle = '#ffc21a'; circ(g, y.x, y.y - 2, 12); g.fill(); }
        g.restore();
        g.beginPath(); g.moveTo(B.x - B.rx, B.rim);
        g.ellipse(B.x, B.rim, B.rx, 34, 0, Math.PI, 0, true);
        g.bezierCurveTo(B.x + B.rx, B.rim + 200, B.x - B.rx, B.rim + 200, B.x - B.rx, B.rim);
        g.closePath(); paint(g, '#7fd6ff');
        g.fillStyle = 'rgba(255,255,255,0.55)';
        for (const [dx, dy] of [[-90, 60], [-40, 95], [40, 95], [90, 60], [0, 125]]) { circ(g, B.x + dx, B.rim + dy, 7); g.fill(); }
        face(g, B.x, B.rim + 72, 1.05, msg && msg.t < 0.8 ? (msg.txt === 'SPLAT!' ? 'shock' : msg.txt === 'TOO SOFT!' ? 'worry' : 'joy') : 'happy');
        // rim hit marker
        g.fillStyle = '#ffe14d'; star(g, B.x - B.rx, B.rim, 14 + Math.sin(T * 8) * 3); paint(g, '#ffe14d', 4);
        // speed gauge
        const gx = 110, gy = 110, gw = 380, gh = 26, vx = (vv) => gx + gw * clamp(vv / VMAX, 0, 1);
        rr(g, gx, gy, gw, gh, 13); paint(g, '#fff', 0);
        g.save(); rr(g, gx, gy, gw, gh, 13); g.clip();
        g.fillStyle = '#9fd6ff'; g.fillRect(gx, gy, vx(lo) - gx, gh);
        g.fillStyle = '#5fe08a'; g.fillRect(vx(lo), gy, vx(hi) - vx(lo), gh);
        g.fillStyle = '#ff6b8a'; g.fillRect(vx(hi), gy, gx + gw - vx(hi), gh);
        g.restore();
        rr(g, gx, gy, gw, gh, 13); paint(g, null, 5);
        label(g, 'SOFT', (gx + vx(lo)) / 2, gy + gh / 2, 15, '#fff', 4);
        label(g, 'CRACK', (vx(lo) + vx(hi)) / 2, gy + gh / 2, 15, '#fff', 4);
        label(g, 'SPLAT', (vx(hi) + gx + gw) / 2, gy + gh / 2, 15, '#fff', 4);
        if (lastHit !== null) { g.fillStyle = '#fff'; circ(g, vx(lastHit), gy - 8, 6); paint(g, '#fff', 3); }
        const nx = vx(spd);
        g.beginPath(); g.moveTo(nx, gy + gh + 2); g.lineTo(nx - 11, gy + gh + 20); g.lineTo(nx + 11, gy + gh + 20); g.closePath(); paint(g, '#ffe14d', 4);
        // egg
        if (egg.state === 'ready' || egg.state === 'bounce' || egg.state === 'slide') {
          shadow(g, egg.x, 445, 26);
          drawEgg(g, egg.x, egg.y, egg.rot, grab ? (spd > hi ? 'shock' : 'grin') : 'worry');
          if (egg.state === 'ready' && !grab) {
            const ax = egg.x + 50 + Math.sin(T * 6) * 8;
            g.beginPath(); g.moveTo(ax + 40, egg.y); g.lineTo(ax + 10, egg.y - 18); g.lineTo(ax + 10, egg.y + 18); g.closePath(); paint(g, '#ffe14d', 4);
          }
        } else if (egg.state === 'crack' && egg.t < 0.5) {
          const k = egg.t / 0.5;
          g.globalAlpha = 1 - k;
          g.save(); g.translate(RIMX + 20, egg.y - k * 40); g.rotate(-k * 1.5); g.beginPath(); g.arc(0, 0, 30, Math.PI, 0); paint(g, '#fffaf0', 5); g.restore();
          g.save(); g.translate(RIMX + 50 + k * 40, egg.y - k * 30); g.rotate(k * 1.5); g.beginPath(); g.arc(0, 0, 30, Math.PI, 0); paint(g, '#fffaf0', 5); g.restore();
          g.globalAlpha = 1;
        }
        for (let i = 0; i < left - (egg.state === 'ready' || egg.state === 'bounce' || egg.state === 'slide' ? 1 : 0); i++) drawEgg(g, 70 + i * 50, 520, 0, 'happy', 0.6);
        if (msg && msg.t < 0.9) label(g, msg.txt, 300, 200 - msg.t * 30, 34, msg.txt === 'SPLAT!' ? '#ff6b8a' : msg.txt === 'TOO SOFT!' ? '#9fd6ff' : '#ffe14d', 7);
        P.draw(g);
      },
      result() { let s = 0; for (const x of scores) s += x; return s / 2; },
    };
  },
};

// ------------------------------------------------------------------ CATCH (fridge): catch food, dodge junk
function drawFood(g, kind, x, y, rot, s, mood) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  switch (kind) {
    case 'butter':
      rr(g, -34, -22, 68, 44, 10); paint(g, '#ffe066', 0);
      rr(g, -34, -22, 68, 14, 7); paint(g, '#fff3a8', 0);
      rr(g, -34, -22, 68, 44, 10); paint(g, null, 5); face(g, 0, 6, 0.6, mood); break;
    case 'egg': ell(g, 0, 0, 26, 33); paint(g, '#fffaf0', 5); face(g, 0, 6, 0.55, mood); break;
    case 'milk':
      rr(g, -24, -26, 48, 58, 6); paint(g, '#ffffff', 5);
      g.beginPath(); g.moveTo(-24, -26); g.lineTo(0, -46); g.lineTo(24, -26); g.closePath(); paint(g, '#6cc6ff', 5);
      g.fillStyle = '#6cc6ff'; g.fillRect(-21, 14, 42, 10); face(g, 0, -4, 0.5, mood); break;
    case 'berry':
      g.beginPath(); g.moveTo(0, 32); g.bezierCurveTo(-42, 8, -34, -26, 0, -22); g.bezierCurveTo(34, -26, 42, 8, 0, 32); paint(g, '#ff3b5c', 5);
      g.fillStyle = '#ffe680'; for (const [sx, sy] of [[-16, -6], [14, -8], [-8, 14], [10, 12], [0, -14]]) { ell(g, sx, sy, 2, 3); g.fill(); }
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ell(g, Math.cos(a) * 12, -24 + Math.sin(a) * 6, 10, 5, a); paint(g, '#4ccf5a', 3); }
      face(g, 0, 2, 0.45, mood); break;
    case 'fish':
      g.beginPath(); g.moveTo(28, 0); g.lineTo(54, -18); g.lineTo(54, 18); g.closePath(); paint(g, '#7a9db3', 5);
      ell(g, 0, 0, 38, 20); paint(g, '#8fb3c9', 5);
      g.strokeStyle = OL; g.lineWidth = 3; g.beginPath(); g.moveTo(-24, -9); g.lineTo(-14, 1); g.moveTo(-14, -9); g.lineTo(-24, 1); g.stroke(); break;
    case 'sock':
      g.beginPath(); g.moveTo(-14, -34); g.lineTo(14, -34); g.lineTo(14, 4); g.lineTo(34, 8); g.quadraticCurveTo(44, 30, 24, 32); g.lineTo(-6, 30); g.quadraticCurveTo(-16, 28, -14, 14); g.closePath();
      paint(g, '#ffffff', 0); g.save(); g.clip(); g.fillStyle = '#ff5f7a'; for (let k = -34; k < 40; k += 16) g.fillRect(-40, k, 100, 7); g.restore(); paint(g, null, 5); break;
    case 'boot':
      g.beginPath(); g.moveTo(-18, -34); g.lineTo(12, -34); g.lineTo(12, 6); g.lineTo(36, 12); g.quadraticCurveTo(44, 28, 30, 30); g.lineTo(-18, 30); g.closePath(); paint(g, '#8a5a3a', 5);
      g.fillStyle = OL; g.fillRect(-18, 24, 52, 7); break;
  }
  g.restore();
}
G.CATCH = {
  cmd: 'CATCH!', hint: 'Move the basket • grab the food, dodge the junk!', dur: 5.5,
  create(c) {
    const goods = ['butter', 'egg', 'milk', 'berry'], bads = ['fish', 'sock', 'boot'];
    const n = Math.round(lerp(8, 10, c.d)), nb = Math.round(lerp(2, 4, c.d)), total = n + nb;
    const badIdx = new Set(); while (badIdx.size < nb) badIdx.add(1 + ((Math.random() * (total - 1)) | 0));
    const items = [];
    for (let i = 0; i < total; i++) {
      const bad = badIdx.has(i);
      items.push({ at: 0.1 + i * (4.1 / total) + rand(-0.06, 0.06), bad, kind: bad ? pick(bads) : pick(goods), x: rand(70, 530), y: -50, vy: rand(0, 80), rot: rand(-1, 1), vr: rand(-3, 3), state: 'wait', t: 0 });
    }
    const bk = { x: 300, tx: 300, w: lerp(80, 64, c.d) * Math.min(c.k, 1.3) }, grav = lerp(560, 800, c.d) * c.slow, keys = { l: false, r: false };
    let t = 0, caught = 0, badHit = 0, done = false, heap = [], wince = 0;
    const P = Parts();
    return {
      get done() { return done; },
      down(p) { if (!p.key) bk.tx = p.x; }, move(p) { bk.tx = p.x; },
      key(code, dn) { if (code === 'ArrowLeft' || code === 'KeyA') keys.l = dn; if (code === 'ArrowRight' || code === 'KeyD') keys.r = dn; },
      update(dt) {
        t += dt; wince -= dt;
        if (keys.l) bk.tx -= 700 * dt; if (keys.r) bk.tx += 700 * dt;
        bk.tx = clamp(bk.tx, 60, 540); bk.x += (bk.tx - bk.x) * Math.min(1, dt * 18);
        for (const it of items) {
          if (it.state === 'wait' && t >= it.at) it.state = 'fall';
          if (it.state === 'fall') {
            it.vy += grav * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
            if (it.y >= 440 && it.y <= 490 && Math.abs(it.x - bk.x) < bk.w + 12) {
              it.state = 'caught';
              if (it.bad) { badHit++; wince = 0.6; c.sfx.bad(); P.burst(it.x, 440, 10, { c: ['#7ccf4a', '#a0e070'], extra: { shape: 'puff', g: -80 } }); }
              else { caught++; heap.push(it.kind); c.sfx.pop(); sparkle(P, it.x, 440, 6); }
            } else if (it.y > 720) it.state = 'gone';
          }
        }
        if (items.every((it) => it.state === 'caught' || it.state === 'gone')) done = true;
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#bfeaff', '#aee0fb', T);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        for (const y of [60, 150]) { g.fillRect(v.x0, y, v.x1 - v.x0, 10); }
        table(g, v, 540, '#d8f1ff');
        for (const it of items) if (it.state === 'fall') {
          drawFood(g, it.kind, it.x, it.y, it.rot, 1, it.bad ? 'dead' : 'shock');
          if (it.bad) {
            g.strokeStyle = '#6cc040'; g.lineWidth = 3.5; g.lineCap = 'round';
            for (const k of [-14, 0, 14]) { g.beginPath(); for (let j = 0; j <= 6; j++) g.lineTo(it.x + k + Math.sin(j + T * 10) * 4, it.y - 42 - j * 5); g.stroke(); }
          }
        }
        const x = bk.x, y = 470, w = bk.w;
        shadow(g, x, 548, w + 20);
        g.beginPath(); g.ellipse(x, y, w, 72, 0, Math.PI, TAU); g.lineWidth = 15; g.strokeStyle = OL; g.stroke(); g.lineWidth = 8; g.strokeStyle = '#e0a060'; g.stroke();
        ell(g, x, y, w + 14, 18); paint(g, '#8a5530', 5);
        heap.slice(-6).forEach((k, i) => drawFood(g, k, x - w + 20 + (i % 3) * (w - 20), y - 4 - Math.floor(i / 3) * 10, 0, 0.5, 'joy'));
        const front = () => {
          g.beginPath(); g.moveTo(x - w - 14, y); g.lineTo(x - w + 6, y + 70); g.lineTo(x + w - 6, y + 70); g.lineTo(x + w + 14, y);
          g.ellipse(x, y, w + 14, 18, 0, 0, Math.PI, false); g.closePath();
        };
        front(); paint(g, '#e0a060', 0);
        g.save(); g.clip(); g.strokeStyle = 'rgba(74,35,56,0.25)'; g.lineWidth = 4;
        for (let k = -120; k < 120; k += 18) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 40, y + 80); g.moveTo(x + k + 40, y); g.lineTo(x + k, y + 80); g.stroke(); }
        g.restore(); front(); paint(g, null, 5);
        face(g, x, y + 38, 0.7, wince > 0 ? 'dead' : 'happy');
        label(g, `${caught}`, 545, 515, 28, '#ffe14d');
        P.draw(g);
      },
      result() { return clamp(caught / n - badHit * 0.25, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ SHAKE (mixer): mash / wiggle
G.SHAKE = {
  cmd: 'SHAKE!', hint: 'Tap, tap, TAP! • or wiggle like crazy', dur: 4,
  create(c) {
    const target = Math.round(lerp(20, 30, c.d) / c.k), A = '#fff3dc', B = c.p.ing === 'COCOA' ? '#7a4528' : '#ffb0d2';
    let count = 0, energy = 0, t = 0, done = false, wig = 0, last = null;
    const P = Parts();
    function hit() {
      if (done) return;
      count++; energy = Math.min(1.4, energy + 0.35); c.sfx.shake(count);
      P.burst(300 + rand(-70, 70), 160, 2, { c: [A, B], up: 260 });
      if (count >= target) { done = true; c.sfx.good(); P.burst(300, 300, 26, { c: CANDY, extra: { shape: 'star' } }); }
    }
    return {
      get done() { return done; },
      down() { hit(); },
      move(p) { if (last) { wig += Math.hypot(p.x - last.x, p.y - last.y); if (wig > 150) { wig -= 150; hit(); } } last = { x: p.x, y: p.y }; },
      key(code, dn) { if (dn) hit(); },
      update(dt) { t += dt; energy = Math.max(0, energy - dt * 1.8); P.update(dt); },
      draw(g, v, T) {
        burst(g, v, '#e6d4ff', '#d9c0ff', T);
        table(g, v, 500, '#c99cff');
        const f = clamp(count / target, 0, 1);
        const sx = 300 + Math.sin(t * 45) * energy * 30, sy = 300 + Math.cos(t * 38) * energy * 14, rot = Math.sin(t * 31) * energy * 0.25;
        shadow(g, 300, 505, 110);
        g.save(); g.translate(sx, sy); g.rotate(rot);
        rr(g, -95, -140, 190, 300, 46); paint(g, 'rgba(225,245,255,0.85)', 0);
        g.save(); rr(g, -95, -140, 190, 300, 46); g.clip();
        g.fillStyle = B; g.fillRect(-100, 30, 200, 140);
        g.fillStyle = A; g.fillRect(-100, -90, 200, 125);
        g.globalAlpha = f; g.fillStyle = mix(A, B, 0.5); g.fillRect(-100, -90, 200, 260); g.globalAlpha = 1;
        g.globalAlpha = 1 - f;
        for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? A : B; circ(g, -60 + (i * 37) % 120, -40 + ((i * 53) % 150), 10 + (i % 3) * 3); g.fill(); }
        g.globalAlpha = 1;
        g.restore();
        rr(g, -95, -140, 190, 300, 46); paint(g, null, 7);
        g.fillStyle = 'rgba(255,255,255,0.7)'; rr(g, -78, -110, 16, 220, 8); g.fill();
        rr(g, -80, -180, 160, 50, 16); paint(g, '#c3cfe0');
        rr(g, -30, -205, 60, 30, 10); paint(g, '#ff5fa2');
        rr(g, -52, -12, 104, 66, 24); paint(g, '#fff', 5);
        face(g, 0, 20, 0.9, energy > 0.9 ? 'dead' : energy > 0.3 ? 'grin' : f >= 1 ? 'joy' : 'happy');
        g.restore();
        rr(g, 520, 120, 36, 340, 18); paint(g, '#fff', 0);
        g.save(); rr(g, 520, 120, 36, 340, 18); g.clip(); g.fillStyle = '#ff5fa2'; g.fillRect(520, 460 - 340 * f, 36, 340 * f); g.restore();
        rr(g, 520, 120, 36, 340, 18); paint(g, null, 5);
        label(g, `${Math.min(count, target)}/${target}`, 538, 490, 22);
        P.draw(g);
      },
      result() { return clamp(count / target, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ WHISK (mixer): circles around the bowl
G.WHISK = {
  cmd: 'WHISK!', hint: 'Drag round and round the bowl!', dur: 5,
  create(c) {
    const C = { x: 300, y: 320 }, target = Math.max(2, Math.round(lerp(4, 6, c.d) / c.k));
    let ang = 0, lastA = null, held = false, ptr = { x: 440, y: 320 }, t = 0, done = false, ticks = 0, spin = 0;
    const lumps = []; for (let i = 0; i < 14; i++) lumps.push({ a: rand(0, TAU), r: rand(30, 150), s: rand(8, 15), c: pick(['#fffaf0', '#e9c58f', '#ffd36b']) });
    const P = Parts();
    function add(da) {
      if (done) return;
      ang += da; spin += Math.abs(da);
      const rots = Math.abs(ang) / TAU;
      if (Math.floor(rots) > ticks) { ticks = Math.floor(rots); c.sfx.tick(); sparkle(P, C.x + Math.cos(lastA || 0) * 200, C.y + Math.sin(lastA || 0) * 200, 5); }
      if (rots >= target) { done = true; c.sfx.good(); P.burst(C.x, C.y, 24, { c: CANDY, extra: { shape: 'star' } }); }
    }
    return {
      get done() { return done; },
      down(p) { if (p.key) { add((ang < 0 ? -1 : 1) * TAU / 8); return; } held = true; ptr = p; lastA = null; },
      up() { held = false; lastA = null; },
      move(p) {
        ptr = p;
        if (!held) return;
        const dx = p.x - C.x, dy = p.y - C.y;
        if (Math.hypot(dx, dy) < 30) { lastA = null; return; }
        const a = Math.atan2(dy, dx);
        if (lastA !== null) { let da = a - lastA; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; add(da); }
        lastA = a;
      },
      key(code, dn) { if (dn) add((ang < 0 ? -1 : 1) * TAU / 8); },
      update(dt) { t += dt; spin = Math.max(0, spin - dt * 6); P.update(dt); },
      draw(g, v, T) {
        burst(g, v, '#c8f7e6', '#b2f0da', T);
        const f = clamp(Math.abs(ang) / TAU / target, 0, 1);
        shadow(g, C.x, C.y + 30, 240, 210);
        circ(g, C.x, C.y, 228); paint(g, '#ff9ec7', 7);
        g.beginPath(); g.arc(C.x, C.y, 244, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.lineWidth = 14; g.strokeStyle = '#ffe14d'; g.lineCap = 'round'; g.stroke();
        circ(g, C.x, C.y, 190); paint(g, mix('#f2d49a', '#fff0c8', f), 5);
        g.save(); circ(g, C.x, C.y, 188); g.clip(); g.translate(C.x, C.y); g.rotate(ang);
        g.strokeStyle = 'rgba(200,150,80,0.45)'; g.lineWidth = 6;
        for (let k = 0; k < 4; k++) { g.beginPath(); for (let i = 0; i < 40; i++) { const a = k * TAU / 4 + i * 0.09, r = 10 + i * 4.4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
        g.globalAlpha = 1 - f;
        for (const l of lumps) { g.fillStyle = l.c; circ(g, Math.cos(l.a) * l.r, Math.sin(l.a) * l.r, l.s); paint(g, l.c, 3); }
        g.globalAlpha = 1;
        face(g, 0, 0, 1.2, spin > 4 ? 'dead' : f >= 1 ? 'joy' : 'happy');
        g.restore();
        // whisk
        const dx = ptr.x - C.x, dy = ptr.y - C.y, a = Math.atan2(dy, dx);
        g.save(); g.translate(ptr.x, ptr.y); g.rotate(a + Math.PI / 2 + 0.3);
        rr(g, -10, -170, 20, 110, 10); paint(g, '#ff5fa2');
        g.strokeStyle = OL; g.lineWidth = 8;
        for (const w of [12, 26, 38]) { ell(g, 0, -30, w, 50); g.stroke(); }
        g.strokeStyle = '#dfe8f2'; g.lineWidth = 4;
        for (const w of [12, 26, 38]) { ell(g, 0, -30, w, 50); g.stroke(); }
        g.restore();
        label(g, `${Math.min(Math.floor(Math.abs(ang) / TAU), Math.ceil(target))} / ${Math.ceil(target)}`, 300, 572, 26);
        P.draw(g);
      },
      result() { return clamp(Math.abs(ang) / TAU / target, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ KNEAD (mixer): alternate left / right
function mitt(g, x, y, flip, col = '#ff8fc4') {
  g.save(); g.translate(x, y); g.scale(flip, 1);
  rr(g, -70, -30, 40, 60, 12); paint(g, '#fff');
  ell(g, -10, 0, 48, 42); paint(g, col);
  ell(g, 10, -36, 14, 22, 0.6); paint(g, col);
  g.restore();
}
G.KNEAD = {
  cmd: 'KNEAD!', hint: 'Tap LEFT, RIGHT, LEFT, RIGHT… (or ← →)', dur: 4.5,
  create(c) {
    const target = Math.round(lerp(14, 20, c.d) / c.k);
    let count = 0, last = null, sq = 0, sqv = 0, t = 0, done = false, pl = 0, pr = 0, wrong = 0;
    const P = Parts();
    function hit(side) {
      if (done) return;
      if (side === 'L') pl = 1; else pr = 1;
      if (side === last) { wrong = 0.4; c.sfx.boing(); return; }
      last = side; count++; sqv += side === 'L' ? 14 : -14; c.sfx.squish();
      P.burst(side === 'L' ? 190 : 410, 340, 4, { c: '#fffaf0', up: 120, extra: { shape: 'puff', g: -60 } });
      if (count >= target) { done = true; c.sfx.good(); sparkle(P, 300, 300, 16); }
    }
    return {
      get done() { return done; },
      down(p) { if (!p.key) hit(p.x < 300 ? 'L' : 'R'); },
      key(code, dn) { if (!dn) return; if (code === 'ArrowLeft' || code === 'KeyA') hit('L'); if (code === 'ArrowRight' || code === 'KeyD') hit('R'); },
      update(dt) {
        t += dt;
        sqv += (-sq * 160 - sqv * 9) * dt; sq += sqv * dt;
        pl = Math.max(0, pl - dt * 5); pr = Math.max(0, pr - dt * 5); wrong -= dt; P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#ffe0c2', '#ffd1a6', T);
        table(g, v, 420, '#e8a15f');
        const f = clamp(count / target, 0, 1), s = clamp(sq, -3, 3);
        shadow(g, 300, 425, 170);
        ell(g, 300 + s * 10, 360, 140 + Math.abs(s) * 14, 80 - Math.abs(s) * 7); paint(g, mix('#ffe6bf', '#fff6e6', f), 6);
        g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, 250 + s * 10, 320, 40, 14, -0.2); g.fill();
        face(g, 300 + s * 12, 362, 1.1, wrong > 0 ? 'grin' : Math.abs(s) > 1.2 ? 'o' : f >= 1 ? 'joy' : 'happy');
        mitt(g, 110 + pl * 80, 350, 1);
        mitt(g, 490 - pr * 80, 350, -1);
        const want = last === 'L' ? 'R' : last === 'R' ? 'L' : null, pul = 1 + Math.sin(T * 12) * 0.12;
        for (const side of ['L', 'R']) {
          const on = !want || want === side, x = side === 'L' ? 80 : 520, d = side === 'L' ? -1 : 1, k = on ? pul : 0.8;
          g.save(); g.translate(x, 180); g.scale(k, k);
          g.beginPath(); g.moveTo(d * 40, 0); g.lineTo(-d * 10, -38); g.lineTo(-d * 10, 38); g.closePath();
          paint(g, on ? '#ffe14d' : 'rgba(255,255,255,0.5)', 5);
          g.restore();
        }
        hbar(g, 150, 520, 300, 28, f, '#ff8a3d');
        label(g, `${Math.min(count, target)}/${target}`, 300, 534, 18, '#fff', 4);
        P.draw(g);
      },
      result() { return clamp(count / target, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ ROLL (prep): flatten to the target thickness
G.ROLL = {
  cmd: 'ROLL!', hint: 'Drag the pin back & forth • stop in the green', dur: 5.5,
  create(c) {
    const half = lerp(0.07, 0.045, c.d) * c.k, center = rand(0.3 + half, Math.max(0.3 + half, 0.42)), k = lerp(0.08, 0.095, c.d) / 360;
    let th = 1, pin = 300, held = false, lastX = null, rolled = false, idle = 0, tore = false, done = false, t = 0, rot = 0;
    const keys = { l: false, r: false }, P = Parts();
    function roll(nx) {
      if (done) return;
      const np = clamp(nx, 110, 490), moved = Math.abs(np - pin);
      pin = np; rot += moved / 25;
      if (moved > 0) { rolled = true; th -= moved * k; }
      if (th < 0.13 && !tore) { tore = true; done = true; th = 0.13; c.sfx.bad(); P.burst(300, 420, 16, { c: '#fff0d4', up: 200 }); }
    }
    const inBand = () => Math.abs(th - center) <= half;
    return {
      get done() { return done; },
      down(p) { held = true; lastX = p.x; },
      up() { held = false; },
      move(p) { if (held && lastX !== null) roll(pin + (p.x - lastX)); lastX = p.x; },
      key(code, dn) { if (code === 'ArrowLeft' || code === 'KeyA') keys.l = dn; if (code === 'ArrowRight' || code === 'KeyD') keys.r = dn; },
      update(dt) {
        t += dt;
        const kd = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
        if (kd) roll(pin + kd * 620 * dt);
        if (rolled && !done) {
          if (!held && !keys.l && !keys.r) { idle += dt; if (idle > 0.6 && th <= center + half) { done = true; if (inBand()) sparkle(P, 300, 380); } } else idle = 0;
        }
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#ffd9e8', '#ffc8de', T);
        table(g, v, 470, '#f4b6cc');
        rr(g, 50, 430, 500, 40, 14); paint(g, '#e3a86a');
        g.strokeStyle = 'rgba(74,35,56,0.18)'; g.lineWidth = 3;
        for (let x = 80; x < 540; x += 55) { g.beginPath(); g.moveTo(x, 438); g.quadraticCurveTo(x + 18, 450, x + 6, 464); g.stroke(); }
        const H = (tt) => 16 + tt * 120;
        const W = 220 + (1 - th) * 260, h = H(th);
        // target band
        const yb0 = 430 - H(center + half), yb1 = 430 - H(center - half);
        g.fillStyle = 'rgba(60,220,110,0.35)'; g.fillRect(v.x0, yb0, v.x1 - v.x0, yb1 - yb0);
        g.setLineDash([12, 8]); g.strokeStyle = '#1f9c49'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(v.x0, yb0); g.lineTo(v.x1, yb0); g.moveTo(v.x0, yb1); g.lineTo(v.x1, yb1); g.stroke(); g.setLineDash([]);
        rr(g, 300 - W / 2, 430 - h, W, h + 4, Math.min(h / 2, 40)); paint(g, '#fff0d4');
        face(g, 300, 430 - h / 2 + 2, lerp(0.45, 1, clamp(th, 0, 1)), tore ? 'dead' : th < center - half ? 'shock' : inBand() ? 'joy' : 'happy');
        const y = 430 - h - 24;
        rr(g, pin - 160, y - 9, 50, 18, 9); paint(g, '#c97e48');
        rr(g, pin + 110, y - 9, 50, 18, 9); paint(g, '#c97e48');
        rr(g, pin - 112, y - 24, 224, 48, 24); paint(g, '#f2b27a', 0);
        g.save(); rr(g, pin - 112, y - 24, 224, 48, 24); g.clip(); g.strokeStyle = 'rgba(74,35,56,0.2)'; g.lineWidth = 6;
        for (let i = -6; i < 7; i++) { const x = pin + ((i * 40 + rot * 10) % 480 + 480) % 480 - 240; g.beginPath(); g.moveTo(x, y - 24); g.lineTo(x - 12, y + 24); g.stroke(); }
        g.restore(); rr(g, pin - 112, y - 24, 224, 48, 24); paint(g, null, 6);
        if (!rolled) { const ax = Math.sin(T * 5) * 50; label(g, '←  →', 300 + ax, 140, 54, '#ffe14d', 8); }
        P.draw(g);
      },
      result() {
        if (tore) return 0;
        const dd = Math.abs(th - center);
        return dd <= half ? 1 - dd / half * 0.3 : Math.max(0, 0.6 - (dd - half) * 5);
      },
    };
  },
};

// ------------------------------------------------------------------ SHAPE (prep): trace the dough shape
const SHAPES = {
  loaf: () => catmull([[150, 330], [190, 240], [300, 215], [410, 240], [450, 330], [410, 410], [300, 430], [190, 410]].map(([x, y]) => ({ x, y })), true, 14),
  baguette: () => { const out = []; for (let i = 0; i < 60; i++) { const a = i / 60 * TAU; out.push({ x: 300 + Math.cos(a) * 225 * Math.cos(-0.35) - Math.sin(a) * 52 * Math.sin(-0.35), y: 330 + Math.cos(a) * 225 * Math.sin(-0.35) + Math.sin(a) * 52 * Math.cos(-0.35) }); } return out; },
  pretzel: () => catmull([[205, 470], [245, 400], [320, 310], [390, 235], [450, 230], [485, 285], [470, 355], [420, 395], [345, 390], [300, 345], [255, 390], [180, 395], [130, 355], [115, 285], [150, 230], [210, 235], [280, 310], [355, 400], [395, 470]].map(([x, y]) => ({ x, y })), false, 10),
  ring: () => { const out = []; for (let i = 0; i < 60; i++) { const a = i / 60 * TAU; out.push({ x: 300 + Math.cos(a) * 150, y: 330 + Math.sin(a) * 140 }); } return out; },
};
G.SHAPE = {
  cmd: 'SHAPE!', hint: 'Trace the dotted shape to form the dough', dur: 6,
  create(c) {
    const kind = SHAPES[c.p.shape] ? c.p.shape : 'loaf', closed = kind !== 'pretzel';
    const tr = Tracer(resample(SHAPES[kind](), 14), { R: lerp(28, 22, c.d) * c.k, stray: lerp(46, 38, c.d) * c.k, closed });
    let done = false, t = 0;
    const P = Parts();
    return {
      get done() { return done; },
      down(p) { if (!p.key) tr.down(p); }, move(p) { tr.move(p); }, up() { tr.up(); },
      update(dt) { t += dt; if (!done && tr.frac() >= 0.97) { done = true; c.sfx.good(); sparkle(P, 300, 330, 20); } P.update(dt); },
      draw(g, v, T) {
        burst(g, v, '#fff0c9', '#ffe6a8', T);
        table(g, v, 120, '#e3a86a');
        g.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 40; i++) { circ(g, (i * 137) % 600, 150 + (i * 89) % 430, 3 + (i % 4)); g.fill(); }
        tr.drawGuide(g);
        tr.drawStrokes(g, 40, '#ffe2a8', 'rgba(255,255,255,0.7)');
        if (tr.frac() > 0.5) face(g, 300, closed ? 330 : 300, 0.9, done ? 'joy' : 'happy');
        label(g, `${kind.toUpperCase()}  ${Math.round(tr.frac() * 100)}%`, 300, 560, 26);
        if (tr.messy > 60) label(g, 'MESSY!', 470, 190, 22, '#ff6b8a', 5);
        P.draw(g);
      },
      result() { return clamp(tr.frac() * 1.04 - tr.messy / 1600, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ SLICE (prep / decor): swipe along the guides
function drawLoaf(g, item, x0, x1, y0, y1) {
  const w = x1 - x0, h = y1 - y0;
  if (item === 'cake') {
    rr(g, x0, y0 + 20, w, h - 20, 22); paint(g, '#f6c27e', 0);
    g.fillStyle = '#fff3e0'; g.fillRect(x0, y0 + h * 0.45, w, 18); g.fillRect(x0, y0 + h * 0.72, w, 14);
    rr(g, x0, y0 + 20, w, h - 20, 22); paint(g, null, 6);
    rr(g, x0 - 6, y0, w + 12, 44, 22); paint(g, '#ff8fc4');
    for (let x = x0 + 20; x < x1 - 10; x += 46) { ell(g, x, y0 + 46, 11, 18); paint(g, '#ff8fc4', 0); }
  } else if (item === 'pie') {
    rr(g, x0, y0 + 30, w, h - 30, 30); paint(g, '#e6a24c');
    g.save(); rr(g, x0, y0 + 30, w, h - 30, 30); g.clip(); g.fillStyle = '#d0344e'; g.fillRect(x0, y0 + 60, w, h - 90);
    g.strokeStyle = '#f2c072'; g.lineWidth = 16; for (let x = x0 - h; x < x1; x += 50) { g.beginPath(); g.moveTo(x, y0 + 40); g.lineTo(x + h, y1); g.stroke(); }
    g.restore(); rr(g, x0, y0 + 30, w, h - 30, 30); paint(g, null, 6);
    for (let x = x0 + 14; x < x1; x += 28) { circ(g, x, y0 + 32, 14); paint(g, '#f2b45c', 4); }
  } else {
    g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0 + 70); g.bezierCurveTo(x0, y0 - 10, x1, y0 - 10, x1, y0 + 70); g.lineTo(x1, y1); g.closePath(); paint(g, '#d98a3c');
    g.strokeStyle = 'rgba(255,230,180,0.7)'; g.lineWidth = 8;
    for (let x = x0 + 40; x < x1 - 30; x += 70) { g.beginPath(); g.moveTo(x, y0 + 30); g.quadraticCurveTo(x + 20, y0 + 10, x + 40, y0 + 22); g.stroke(); }
  }
}
G.SLICE = {
  cmd: 'SLICE!', hint: 'Swipe DOWN along each dotted guide', dur: 5,
  create(c) {
    const item = c.p.item || 'bread', n = 3, tol = lerp(40, 28, c.d) * c.k;
    const S = { x0: 90, x1: 510, y0: 200, y1: 450 }, mid = (S.y0 + S.y1) / 2;
    const lines = []; for (let i = 0; i < n; i++) lines.push({ x: S.x0 + (S.x1 - S.x0) * (i + 1) / (n + 1), tl: c.d > 0.4 ? rand(-0.15, 0.15) : 0, cut: false, score: 0, gap: 0 });
    const lx = (L, y) => L.x + (y - mid) * Math.tan(L.tl);
    let path = null, slashes = [], misses = 0, done = false, knife = { x: 300, y: 130 }, t = 0;
    const P = Parts();
    function evalPath(pts) {
      let y0 = 1e9, y1 = -1e9;
      for (const q of pts) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const cov = (Math.min(y1, S.y1) - Math.max(y0, S.y0)) / (S.y1 - S.y0);
      if (cov < 0.5) return;
      const inside = pts.filter((q) => q.y >= S.y0 && q.y <= S.y1);
      if (inside.length < 2) return;
      let best = null, err = 1e9;
      for (const L of lines) {
        if (L.cut) continue;
        let e = 0; for (const q of inside) e += Math.abs(q.x - lx(L, q.y)) * Math.cos(L.tl);
        e /= inside.length; if (e < err) { err = e; best = L; }
      }
      slashes.push({ pts: inside, t: 0 });
      if (!best || err > tol * 1.8) { misses++; c.sfx.bad(); return; }
      best.cut = true; best.score = clamp(1 - err / tol * 0.6, 0, 1) * clamp(0.5 + cov * 0.6, 0, 1);
      c.sfx.slice();
      if (best.score >= 0.88) sparkle(P, best.x, S.y0 - 10, 10);
      if (lines.every((L) => L.cut)) done = true;
    }
    return {
      get done() { return done; },
      down(p) { if (p.key) return; path = [{ x: p.x, y: p.y }]; knife = { x: p.x, y: p.y }; },
      move(p) { knife = { x: p.x, y: p.y }; if (path) path.push({ x: p.x, y: p.y }); },
      up() { if (path) evalPath(path); path = null; },
      update(dt) { t += dt; for (const L of lines) if (L.cut) L.gap = Math.min(1, L.gap + dt * 6); for (const s of slashes) s.t += dt; P.update(dt); },
      draw(g, v, T) {
        burst(g, v, '#d4f7c9', '#c2efb3', T);
        table(g, v, 470, '#e3a86a');
        shadow(g, 300, 472, 240);
        drawLoaf(g, item, S.x0, S.x1, S.y0, S.y1);
        for (const L of lines) {
          if (L.cut) {
            g.lineWidth = 3 + L.gap * 9; g.strokeStyle = OL; g.beginPath(); g.moveTo(lx(L, S.y0 - 10), S.y0 - 10); g.lineTo(lx(L, S.y1), S.y1); g.stroke();
          } else {
            g.setLineDash([14, 12]); g.lineWidth = 6; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(lx(L, S.y0 - 30), S.y0 - 30); g.lineTo(lx(L, S.y1 + 10), S.y1 + 10); g.stroke(); g.setLineDash([]);
            const ax = lx(L, S.y0 - 50), bob = Math.sin(T * 7) * 6;
            g.beginPath(); g.moveTo(ax, S.y0 - 36 + bob); g.lineTo(ax - 14, S.y0 - 60 + bob); g.lineTo(ax + 14, S.y0 - 60 + bob); g.closePath(); paint(g, '#ffe14d', 4);
          }
        }
        face(g, S.x0 + 45, S.y1 - 50, 0.8, misses ? 'shock' : 'happy');
        for (const s of slashes) {
          if (s.t > 0.4) continue;
          g.globalAlpha = 1 - s.t / 0.4; g.beginPath(); s.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
          g.lineWidth = 10; g.strokeStyle = '#fff'; g.stroke(); g.globalAlpha = 1;
        }
        g.save(); g.translate(knife.x, knife.y); g.rotate(0.15);
        g.beginPath(); g.moveTo(-6, 0); g.lineTo(-6, -120); g.quadraticCurveTo(30, -110, 26, -40); g.lineTo(6, 0); g.closePath(); paint(g, '#e3ecf5');
        rr(g, -12, -190, 26, 74, 10); paint(g, '#8a5a3a');
        g.restore();
        P.draw(g);
      },
      result() { let s = 0; for (const L of lines) s += L.score; return clamp(s / n - misses * 0.1, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ MELT (stove): keep the temperature in the zone
G.MELT = {
  cmd: 'MELT!', hint: 'Hold for heat • keep the needle in the green', dur: 5.5,
  create(c) {
    const col = c.p.what === 'jam' ? '#e8344e' : '#7a4528';
    const zw = lerp(0.22, 0.15, c.d) * c.k, z0 = rand(0.48, 0.62), need = lerp(2.3, 2.7, c.d) / Math.sqrt(c.k);
    let temp = 0.15, vel = 0, held = false, prog = 0, over = 0, done = false, t = 0, flame = 0;
    const P = Parts();
    const zone = () => temp >= z0 && temp <= z0 + zw;
    return {
      get done() { return done; },
      down() { held = true; }, up() { held = false; },
      update(dt, live) {
        t += dt;
        const h = held && !done && live;
        flame += ((h ? 1 : 0.18) - flame) * Math.min(1, dt * 8);
        vel += ((h ? 0.6 : -0.4) - vel) * Math.min(1, dt * 3.2);
        temp = clamp(temp + vel * dt, 0, 1.08);
        if (!done) {
          if (zone()) { prog += dt / need; if (Math.random() < dt * 10) P.add({ x: rand(190, 330), y: 270, vy: -40, g: -40, r: rand(5, 10), c: mix(col, '#ffffff', 0.25), life: 0.5, shape: 'puff' }); }
          else if (temp > z0 + zw) { over += dt; prog = Math.max(0, prog - dt * 0.15); if (Math.random() < dt * 18) P.add({ x: rand(170, 350), y: 260, vx: rand(-20, 20), vy: -80, g: -60, r: rand(10, 18), c: 'rgba(90,80,90,0.6)', life: 0.9, shape: 'puff' }); }
          if (prog >= 1) { prog = 1; done = true; c.sfx.good(); sparkle(P, 260, 260, 14); }
        }
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#ffd1c4', '#ffbfad', T);
        g.fillStyle = '#5a4a5e'; g.fillRect(v.x0, 470, v.x1 - v.x0, v.y1 - 470); g.fillStyle = OL; g.fillRect(v.x0, 466, v.x1 - v.x0, 6);
        for (let i = 0; i < 7; i++) {
          const fx = 175 + i * 28, fh = (26 + Math.sin(T * 20 + i * 2) * 8) * (0.4 + flame * 1.1);
          g.beginPath(); g.moveTo(fx - 12, 470); g.quadraticCurveTo(fx - 8, 470 - fh * 0.6, fx, 470 - fh); g.quadraticCurveTo(fx + 8, 470 - fh * 0.6, fx + 12, 470); g.closePath(); paint(g, i % 2 ? '#ffb02e' : '#ff6a2f', 3);
        }
        rr(g, 100, 300, 30, 22, 8); paint(g, '#8a96a8'); rr(g, 390, 300, 30, 22, 8); paint(g, '#8a96a8');
        rr(g, 120, 260, 280, 190, 34); paint(g, '#b7c3d3');
        ell(g, 260, 266, 140, 26); paint(g, mix(col, '#2a1010', clamp(over * 0.4, 0, 0.5)), 5);
        g.save(); ell(g, 260, 266, 136, 23); g.clip();
        g.globalAlpha = 1 - prog;
        for (let i = 0; i < 8; i++) { rr(g, 160 + i * 26, 250 + (i % 3) * 6, 26, 18, 4); paint(g, mix(col, '#000000', 0.15), 3); }
        g.globalAlpha = 1; g.restore();
        g.fillStyle = 'rgba(255,255,255,0.45)'; rr(g, 140, 300, 18, 120, 9); g.fill();
        face(g, 260, 370, 1.1, temp > z0 + zw ? 'shock' : zone() ? 'joy' : 'happy');
        hbar(g, 140, 212, 240, 22, prog, '#ffd23f');
        // thermometer
        const tx = 492, ty0 = 110, ty1 = 430, ty = (tt) => ty1 - (ty1 - ty0) * clamp(tt, 0, 1);
        rr(g, tx - 18, ty0 - 10, 36, ty1 - ty0 + 30, 18); paint(g, '#fff', 0);
        g.fillStyle = 'rgba(60,220,110,0.6)'; g.fillRect(tx - 18, ty(z0 + zw), 36, ty(z0) - ty(z0 + zw));
        g.fillStyle = 'rgba(255,80,100,0.35)'; g.fillRect(tx - 18, ty0 - 10, 36, ty(z0 + zw) - ty0 + 10);
        g.fillStyle = '#ff3b5c'; rr(g, tx - 8, ty(temp), 16, ty1 - ty(temp) + 20, 8); g.fill();
        rr(g, tx - 18, ty0 - 10, 36, ty1 - ty0 + 30, 18); paint(g, null, 5);
        circ(g, tx, ty1 + 34, 28); paint(g, '#ff3b5c');
        g.beginPath(); g.moveTo(tx - 26, ty(temp)); g.lineTo(tx - 46, ty(temp) - 13); g.lineTo(tx - 46, ty(temp) + 13); g.closePath(); paint(g, '#ffe14d', 4);
        P.draw(g);
      },
      result() { return clamp(prog * (1 - Math.min(0.5, over * 0.35)), 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ FLIP (stove): toss & catch the pancake
G.FLIP = {
  cmd: 'FLIP!', hint: 'Tap to toss • move the pan to catch ×3', dur: 6.5,
  create(c) {
    const need = 3, pw = lerp(82, 64, c.d) * Math.min(c.k, 1.3), grav = 1500, PY = 470;
    const pan = { x: 300, tx: 300 }, keys = { l: false, r: false };
    let pk = { state: 'pan', x: 300, y: PY - 14, vx: 0, vy: 0, rot: 0, vr: 0, side: 0 }, caught = 0, drops = 0, wait = 0, done = false, t = 0, splats = [];
    const P = Parts();
    function toss() {
      if (pk.state !== 'pan' || done) return;
      pk.state = 'air'; pk.vy = -lerp(950, 1080, c.d); pk.vx = rand(-1, 1) * lerp(110, 230, c.d) * c.slow; pk.vr = (Math.random() < 0.5 ? -1 : 1) * rand(9, 12);
      c.sfx.whoosh();
    }
    return {
      get done() { return done; },
      down(p) { if (!p.key) pan.tx = p.x; toss(); },
      move(p) { pan.tx = p.x; },
      key(code, dn) { if (code === 'ArrowLeft' || code === 'KeyA') keys.l = dn; if (code === 'ArrowRight' || code === 'KeyD') keys.r = dn; if (dn && code === 'ArrowUp') toss(); },
      update(dt) {
        t += dt;
        if (keys.l) pan.tx -= 700 * dt; if (keys.r) pan.tx += 700 * dt;
        pan.tx = clamp(pan.tx, 80, 520); pan.x += (pan.tx - pan.x) * Math.min(1, dt * 16);
        if (pk.state === 'pan') { pk.x = pan.x; pk.y = PY - 14; }
        else if (pk.state === 'air') {
          pk.vy += grav * dt; pk.x += pk.vx * dt; pk.y += pk.vy * dt; pk.rot += pk.vr * dt;
          if (pk.x < 50 || pk.x > 550) { pk.vx *= -1; pk.x = clamp(pk.x, 50, 550); }
          if (pk.vy > 0 && pk.y >= PY - 14 && pk.y <= PY + 24 && Math.abs(pk.x - pan.x) < pw + 12) {
            pk.state = 'pan'; pk.rot = 0; pk.side ^= 1; caught++; c.sfx.pop(); sparkle(P, pk.x, PY - 30, 8);
            if (caught >= need) { done = true; c.sfx.good(); }
          } else if (pk.y > 760) { pk.state = 'splat'; drops++; c.sfx.splat(); wait = 0.6; splats.push(clamp(pk.x, 60, 540)); }
        } else if (pk.state === 'splat') { wait -= dt; if (wait <= 0) pk = { state: 'pan', x: pan.x, y: PY - 14, vx: 0, vy: 0, rot: 0, vr: 0, side: 0 }; }
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#fff0b3', '#ffe68a', T);
        g.fillStyle = '#4b3f50'; g.fillRect(v.x0, 530, v.x1 - v.x0, v.y1 - 530); g.fillStyle = OL; g.fillRect(v.x0, 526, v.x1 - v.x0, 6);
        for (const sx of splats) { g.fillStyle = '#e8b25c'; ell(g, sx, 560, 54, 14); paint(g, '#e8b25c', 4); }
        g.fillStyle = 'rgba(255,120,40,0.35)'; ell(g, pan.x, 540, pw + 30, 12); g.fill();
        g.save(); g.translate(pan.x, PY);
        rr(g, pw + 6, -2, 130, 18, 9); paint(g, '#2b2430');
        ell(g, 0, 0, pw + 18, 24); paint(g, '#3b3340');
        ell(g, 0, -2, pw + 6, 16); paint(g, '#5b5262', 0);
        g.restore();
        if (pk.state !== 'splat') {
          const cs = Math.cos(pk.rot), top = (cs >= 0) === !pk.side;
          ell(g, pk.x, pk.y, 62, 6 + 16 * Math.abs(cs)); paint(g, top ? '#f8d58a' : '#e09a3c');
          if (Math.abs(cs) > 0.5) {
            face(g, pk.x, pk.y - 1, 0.55 * Math.abs(cs), pk.state === 'air' ? 'shock' : 'happy');
            if (pk.state === 'pan') { rr(g, pk.x + 20, pk.y - 22, 22, 12, 4); paint(g, '#ffe066', 3); }
          }
        }
        for (let i = 0; i < need; i++) { ell(g, 470 + i * 44, 80, 18, 8); paint(g, i < caught ? '#e09a3c' : 'rgba(255,255,255,0.6)', 4); }
        if (pk.state === 'pan' && !done) label(g, 'TAP!', pk.x, PY - 90 + Math.sin(T * 9) * 6, 30, '#ffe14d', 7);
        P.draw(g);
      },
      result() { return clamp(caught / need - drops * 0.2, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ OVEN: pull it out when golden
function drawBake(g, item, x, y, s, col, mood) {
  g.save(); g.translate(x, y); g.scale(s, s);
  if (item === 'cookies') {
    for (const dx of [-70, 0, 70]) { ell(g, dx, 0, 32, 22); paint(g, col); g.fillStyle = '#4a2338'; for (const [a, b] of [[-10, -4], [8, 2], [0, -10], [12, -8]]) { circ(g, dx + a, b, 4); g.fill(); } }
    face(g, 0, 0, 0.5, mood);
  } else if (item === 'cupcake') {
    for (const dx of [-55, 55]) {
      g.beginPath(); g.moveTo(dx - 34, -6); g.lineTo(dx + 34, -6); g.lineTo(dx + 26, 34); g.lineTo(dx - 26, 34); g.closePath(); paint(g, '#ff8fc4');
      g.beginPath(); g.arc(dx, -6, 36, Math.PI, 0); g.closePath(); paint(g, col);
    }
    face(g, -55, 14, 0.45, mood); face(g, 55, 14, 0.45, mood);
  } else if (item === 'bread' || item === 'pretzel') {
    if (item === 'pretzel') {
      g.lineWidth = 34; g.strokeStyle = OL; g.lineCap = 'round';
      const path = () => { g.beginPath(); g.moveTo(-40, 40); g.bezierCurveTo(-120, -60, 0, -70, 0, -10); g.bezierCurveTo(0, -70, 120, -60, 40, 40); };
      path(); g.stroke(); g.lineWidth = 24; g.strokeStyle = col; path(); g.stroke();
      face(g, 0, 20, 0.5, mood);
    } else {
      rr(g, -100, -40, 200, 76, 38); paint(g, col);
      g.strokeStyle = mix(col, '#fff0c0', 0.5); g.lineWidth = 6;
      for (const dx of [-50, 0, 50]) { g.beginPath(); g.moveTo(dx - 14, -28); g.lineTo(dx + 14, -12); g.stroke(); }
      face(g, 0, 8, 0.6, mood);
    }
  } else if (item === 'pie') {
    ell(g, 0, 0, 100, 34); paint(g, col);
    g.strokeStyle = mix(col, '#4a2338', 0.25); g.lineWidth = 6;
    for (const dx of [-50, 0, 50]) { g.beginPath(); g.moveTo(dx - 20, -24); g.lineTo(dx + 20, 24); g.stroke(); }
    face(g, 0, 2, 0.55, mood);
  } else {
    rr(g, -95, -10, 190, 60, 16); paint(g, col);
    g.beginPath(); g.ellipse(0, -10, 95, 52, 0, Math.PI, 0); g.closePath(); paint(g, col);
    face(g, 0, 14, 0.7, mood);
  }
  g.restore();
}
G.OVEN = {
  cmd: 'PULL!', hint: 'Tap the moment it turns GOLDEN', dur: 4.6,
  create(c) {
    const item = c.p.item || 'cake', T0 = lerp(3.3, 2.4, c.d) / c.slow, pt = rand(0.55, 0.78), tol = lerp(0.11, 0.07, c.d) * c.k;
    let b = 0, pulled = null, t = 0, done = false, door = 0;
    const P = Parts();
    const score = () => { const dd = Math.abs((pulled === null ? b : pulled) - pt); return dd <= tol ? 1 - dd / tol * 0.35 : Math.max(0, 0.6 - (dd - tol) * 6); };
    const bakeCol = (x) => (x <= pt ? mix('#f7e6b5', '#e3a03a', x / pt) : mix('#e3a03a', '#2e1a12', (x - pt) / 0.32));
    return {
      get done() { return done; },
      down() {
        if (pulled !== null || done) return;
        pulled = b; done = true; c.sfx.ding();
        const s = score();
        if (s >= 0.88) sparkle(P, 300, 380, 18);
      },
      update(dt) {
        t += dt;
        if (pulled === null) { b += dt / T0; if (b > 1.18) { pulled = b; done = true; c.sfx.bad(); } }
        else door = Math.min(1, door + dt * 4);
        const burnt = (pulled === null ? b : pulled) - (pt + tol);
        if (burnt > 0 && Math.random() < dt * 20 * Math.min(1, burnt * 5)) P.add({ x: rand(170, 430), y: pulled === null ? 240 : 330, vx: rand(-20, 20), vy: -90, g: -50, r: rand(12, 20), c: 'rgba(70,60,70,0.55)', life: 1.1, shape: 'puff' });
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#ffcfb0', '#ffbe96', T);
        table(g, v, 500, '#c9b6d9');
        const bb = pulled === null ? b : pulled, col = bakeCol(bb), heat = pulled === null ? 1 : 1 - door;
        rr(g, 60, 110, 380, 390, 40); paint(g, '#ff6b5a');
        rr(g, 60, 110, 380, 92, 40); paint(g, '#ff9a85');
        for (const ex of [190, 310]) { circ(g, ex, 156, 26); paint(g, '#fff', 5); const lx = clamp((Math.cos(T * 2)) * 8, -8, 8); g.fillStyle = OL; circ(g, ex + lx, 160, 11); g.fill(); }
        rr(g, 96, 230 + door * 230, 308, 220 * (1 - door * 0.85), 30); paint(g, '#3a2030');
        if (door < 1) {
          g.save(); rr(g, 96, 230, 308, 220, 30); g.clip();
          const gr = g.createRadialGradient(250, 360, 10, 250, 360, 220); gr.addColorStop(0, `rgba(255,170,60,${0.75 * heat})`); gr.addColorStop(1, 'rgba(255,120,40,0)');
          g.fillStyle = gr; g.fillRect(96, 230, 308, 220);
          drawBake(g, item, 250, 380, 0.75 + 0.25 * Math.min(1, bb), col, bb > pt + tol ? 'dead' : 'happy');
          g.restore();
        }
        if (pulled !== null) {
          const s = score();
          rr(g, 110, 420 - door * 40, 290, 18, 6); paint(g, '#c3cfe0');
          drawBake(g, item, 255, 400 - door * 50, 0.9 + door * 0.2, col, s >= 0.88 ? 'joy' : s >= 0.4 ? 'happy' : 'dead');
        }
        // dial timer
        const cx = 520, cy = 300, R = 64, ang = (x) => -Math.PI / 2 + (x / 1.2) * TAU;
        circ(g, cx, cy, R + 10); paint(g, '#fff');
        g.fillStyle = '#5fe08a'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, ang(pt - tol), ang(pt + tol)); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,90,110,0.55)'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, ang(pt + tol + 0.06), ang(1.2)); g.closePath(); g.fill();
        g.strokeStyle = OL; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang(bb)) * (R - 4), cy + Math.sin(ang(bb)) * (R - 4)); g.stroke();
        circ(g, cx, cy, 8); paint(g, '#ff5fa2', 4);
        circ(g, cx, cy, R + 10); paint(g, null, 6);
        P.draw(g);
      },
      result() { return pulled === null ? 0 : score(); },
    };
  },
};

// ------------------------------------------------------------------ FROST (decor): pipe along the path without straying
function cakeTop(g, x, y, r, col, edge) {
  plate(g, x, y, r + 34);
  circ(g, x, y, r); paint(g, edge, 6);
  circ(g, x, y, r - 16); paint(g, col, 0);
  g.fillStyle = 'rgba(255,255,255,0.25)'; ell(g, x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.12, -0.5); g.fill();
}
G.FROST = {
  cmd: 'PIPE!', hint: 'Follow the line in one smooth swirl • don’t stray!', dur: 6,
  create(c) {
    const C = { x: 300, y: 330 }, k = pick([3, 4, 5]), amp = lerp(18, 30, c.d), R0 = c.p.cup ? 95 : 130, raw = [];
    if (c.p.cup) { for (let i = 0; i <= 90; i++) { const a = i / 90 * TAU * 2.2 - Math.PI / 2, r = R0 - i * 0.85; raw.push({ x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r }); } }
    else { for (let i = 0; i <= 80; i++) { const a = i / 80 * TAU - Math.PI / 2, r = R0 + amp * Math.sin(k * a); raw.push({ x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r }); } }
    const tr = Tracer(resample(raw, 14), { R: lerp(26, 21, c.d) * c.k, stray: lerp(40, 32, c.d) * c.k, ordered: true, closed: false });
    let done = false, t = 0;
    const P = Parts();
    return {
      get done() { return done; },
      down(p) { if (!p.key) tr.down(p); }, move(p) { tr.move(p); }, up() { tr.up(); },
      update(dt) { t += dt; if (!done && tr.frac() >= 0.97) { done = true; c.sfx.good(); sparkle(P, C.x, C.y, 20); } P.update(dt); },
      draw(g, v, T) {
        burst(g, v, '#ffd6f0', '#ffc3e6', T);
        table(g, v, 540, '#c9e6ff');
        if (c.p.cup) {
          g.beginPath(); g.moveTo(C.x - 150, C.y + 60); g.lineTo(C.x + 150, C.y + 60); g.lineTo(C.x + 110, C.y + 230); g.lineTo(C.x - 110, C.y + 230); g.closePath(); paint(g, '#ff8fc4');
          circ(g, C.x, C.y, 160); paint(g, '#c8834a');
        } else cakeTop(g, C.x, C.y, 200, '#ff9ccc', '#ff7ab8');
        tr.drawGuide(g);
        tr.drawStrokes(g, 26, '#fffaf0', '#ffffff');
        const p = tr.ptr;
        g.save(); g.translate(p.x, p.y); g.rotate(-0.6);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-30, -90); g.lineTo(30, -90); g.closePath(); paint(g, '#7fd6ff');
        rr(g, -36, -104, 72, 18, 8); paint(g, '#ff5fa2');
        g.restore();
        label(g, `${Math.round(tr.frac() * 100)}%`, 300, 580, 26);
        if (tr.messy > 50) label(g, 'WOBBLY!', 480, 120, 22, '#ff6b8a', 5);
        P.draw(g);
      },
      result() { return clamp(tr.frac() * 1.04 - tr.messy / 1300, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ CHERRY (decor): drop it on top of the moving cake
function drawCherry(g, x, y, rot, mood) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(0, -16); g.quadraticCurveTo(6, -40, 22, -48); g.lineWidth = 9; g.strokeStyle = OL; g.lineCap = 'round'; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#4ccf5a'; g.stroke();
  circ(g, 0, 0, 22); paint(g, '#e8243c', 5);
  g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, -8, -9, 6, 4, -0.6); g.fill();
  face(g, 0, 3, 0.4, mood);
  g.restore();
}
G.CHERRY = {
  cmd: 'DROP!', hint: 'Tap to drop the cherry right on top', dur: 4.2,
  create(c) {
    const A = lerp(150, 195, c.d), w = lerp(2.0, 3.0, c.d) * c.slow, ph = rand(0, TAU), top = 380;
    let t = 0, ch = { state: 'hold', x: 300, y: 112, vy: 0, vx: 0, rot: 0, off: 0 }, cake = 300 + A * Math.sin(ph), done = false, sc = null;
    const P = Parts();
    return {
      get done() { return done; },
      down() { if (ch.state === 'hold') { ch.state = 'fall'; c.sfx.whoosh(); } },
      update(dt) {
        t += dt; cake = 300 + A * Math.sin(t * w + ph);
        if (ch.state === 'fall') {
          ch.vy += 2400 * dt; ch.y += ch.vy * dt;
          if (ch.y >= top - 18) {
            const dx = ch.x - cake;
            if (Math.abs(dx) < 105) {
              ch.state = 'stuck'; ch.off = dx; ch.y = top - 18; sc = clamp(1.25 - Math.abs(dx) / (lerp(80, 68, c.d) * c.k), 0, 1); done = true;
              c.sfx.pop(); if (sc >= 0.88) sparkle(P, ch.x, top - 30, 16);
            } else { ch.state = 'miss'; ch.vx = dx > 0 ? 160 : -160; ch.vy = -200; sc = 0; done = true; c.sfx.bad(); }
          }
        } else if (ch.state === 'stuck') ch.x = cake + ch.off;
        else if (ch.state === 'miss') { if (ch.y < 515) { ch.vy += 2400 * dt; ch.y += ch.vy * dt; ch.x += ch.vx * dt; ch.rot += dt * 8; } else ch.y = 515; }
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#dff0ff', '#cbe4ff', T);
        table(g, v, 535, '#ffc6dc');
        shadow(g, cake, 538, 120);
        rr(g, cake - 18, 500, 36, 36, 6); paint(g, '#fff');
        ell(g, cake, 500, 130, 16); paint(g, '#fff');
        rr(g, cake - 100, top, 200, 118, 18); paint(g, '#f6c27e', 0);
        g.fillStyle = '#fff3e0'; g.fillRect(cake - 100, top + 46, 200, 14); g.fillRect(cake - 100, top + 82, 200, 12);
        rr(g, cake - 100, top, 200, 118, 18); paint(g, null, 6);
        rr(g, cake - 106, top - 8, 212, 34, 17); paint(g, '#ff8fc4');
        for (let x = cake - 85; x < cake + 90; x += 34) { ell(g, x, top + 28, 9, 15); paint(g, '#ff8fc4', 0); }
        face(g, cake, top + 70, 0.9, done ? (sc >= 0.88 ? 'joy' : sc > 0 ? 'happy' : 'sad') : 'happy', 0, -2);
        g.fillStyle = '#ffe14d'; star(g, cake, top - 8, 9 + Math.sin(T * 10) * 2); paint(g, '#ffe14d', 3);
        g.strokeStyle = OL; g.lineWidth = 8; g.beginPath(); g.moveTo(300, v.y0); g.lineTo(300, 70); g.stroke();
        const open = ch.state === 'hold' ? 0 : 1;
        for (const s of [-1, 1]) { g.save(); g.translate(300, 74); g.rotate(s * (0.3 + open * 0.5)); rr(g, -6, 0, 12, 46, 6); paint(g, '#c3cfe0', 5); g.restore(); }
        if (ch.state === 'hold') { g.setLineDash([4, 12]); g.lineWidth = 3; g.strokeStyle = 'rgba(74,35,56,0.3)'; g.beginPath(); g.moveTo(300, 140); g.lineTo(300, top - 10); g.stroke(); g.setLineDash([]); }
        drawCherry(g, ch.x, ch.y, ch.rot, ch.state === 'fall' ? 'shock' : ch.state === 'miss' ? 'dead' : ch.state === 'stuck' ? 'joy' : 'worry');
        P.draw(g);
      },
      result() { return sc === null ? 0 : sc; },
    };
  },
};

// ------------------------------------------------------------------ TOPPING (decor): drag toppings onto the glowing spots
const TOPS = {
  sprinkles: { cake: '#8a4f33', edge: '#6e3a24', name: 'SPRINKLES' },
  chips: { cake: '#e8b46a', edge: '#c98a3c', name: 'CHOCO CHIPS' },
  berries: { cake: '#f6d9a0', edge: '#d9a85c', name: 'BERRIES' },
  salt: { cake: '#b8692e', edge: '#8a4a1c', name: 'SALT' },
};
function drawTopping(g, kind, x, y, s = 1, seed = 0) {
  g.save(); g.translate(x, y); g.scale(s, s);
  if (kind === 'sprinkles') { for (let i = 0; i < 6; i++) { const a = seed + i * 1.1; g.save(); g.translate(Math.cos(a) * 12, Math.sin(a * 1.7) * 12); g.rotate(a * 2); rr(g, -9, -3.5, 18, 7, 3.5); paint(g, CANDY[i % CANDY.length], 2.5); g.restore(); } }
  else if (kind === 'chips') { g.beginPath(); g.moveTo(0, -18); g.quadraticCurveTo(18, 10, 14, 14); g.lineTo(-14, 14); g.quadraticCurveTo(-18, 10, 0, -18); paint(g, '#5a2e1c', 4); }
  else if (kind === 'berries') { circ(g, 0, 0, 20); paint(g, '#ff3b5c', 4); circ(g, 0, 0, 11); paint(g, '#ffb0bd', 0); g.fillStyle = '#ffe680'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; circ(g, Math.cos(a) * 15, Math.sin(a) * 15, 2); g.fill(); } }
  else { for (let i = 0; i < 5; i++) { const a = seed + i * 1.3; rr(g, Math.cos(a) * 10 - 5, Math.sin(a) * 10 - 5, 10, 10, 2); paint(g, '#ffffff', 2.5); } }
  g.restore();
}
G.TOPPING = {
  cmd: 'DECORATE!', hint: 'Drag toppings from the tray onto the glowing spots', dur: 6.5,
  create(c) {
    const kind = TOPS[c.p.kind] ? c.p.kind : 'sprinkles', K = TOPS[kind], C = { x: 300, y: 260 }, R = 170;
    const n = Math.round(lerp(5, 6, c.d)), snap = lerp(42, 34, c.d) * c.k, spots = [];
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do { const a = rand(0, TAU), r = Math.sqrt(Math.random()) * (R - 40); x = C.x + Math.cos(a) * r; y = C.y + Math.sin(a) * r * 0.9; tries++; }
      while (tries < 40 && spots.some((s) => Math.hypot(s.x - x, s.y - y) < 85));
      spots.push({ x, y, done: false, q: 0, seed: rand(0, 6) });
    }
    const tray = { x: 300, y: 530 };
    let hand = null, misses = 0, done = false, t = 0, falls = [];
    const P = Parts();
    function drop(p) {
      if (!hand) return;
      let best = null, bd = 1e9;
      for (const s of spots) if (!s.done) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = s; } }
      if (best && bd < snap) {
        best.done = true; best.q = clamp(1.08 - bd / snap * 0.45, 0, 1); c.sfx.pop();
        if (best.q >= 0.88) sparkle(P, best.x, best.y, 8);
        if (spots.every((s) => s.done)) { done = true; c.sfx.good(); }
      } else if (p.y < 470) { misses++; c.sfx.boing(); falls.push({ x: p.x, y: p.y, vy: 0, t: 0, seed: hand.seed }); }
      hand = null;
    }
    return {
      get done() { return done; },
      down(p) { if (p.key || done) return; hand = { x: p.x, y: p.y, seed: rand(0, 6) }; c.sfx.tap(); },
      move(p) { if (hand) { hand.x = p.x; hand.y = p.y; } },
      up(p) { drop(p || hand); },
      update(dt) {
        t += dt;
        for (const f of falls) { f.t += dt; f.vy += 1400 * dt; f.y += f.vy * dt; }
        falls = falls.filter((f) => f.t < 1);
        P.update(dt);
      },
      draw(g, v, T) {
        burst(g, v, '#d8ffe9', '#c2f8da', T);
        table(g, v, 470, '#f7c6dc');
        cakeTop(g, C.x, C.y, R, K.cake, K.edge);
        for (const s of spots) {
          if (s.done) drawTopping(g, kind, s.x, s.y, 1.1, s.seed);
          else {
            const pul = 1 + Math.sin(T * 8 + s.seed) * 0.12;
            circ(g, s.x, s.y, 24 * pul); g.fillStyle = 'rgba(255,240,120,0.4)'; g.fill();
            g.setLineDash([6, 6]); g.lineWidth = 4; g.strokeStyle = '#ffe14d'; circ(g, s.x, s.y, 24 * pul); g.stroke(); g.setLineDash([]);
          }
        }
        face(g, C.x, C.y + R * 0.62, 0.9, done ? 'joy' : misses ? 'worry' : 'happy');
        rr(g, tray.x - 150, tray.y - 36, 300, 72, 24); paint(g, '#fff');
        for (let i = 0; i < 5; i++) drawTopping(g, kind, tray.x - 110 + i * 55, tray.y, 0.8, i * 1.7);
        label(g, K.name, tray.x, tray.y - 52, 18, '#ffe14d', 5);
        for (const f of falls) drawTopping(g, kind, f.x, f.y, 1, f.seed);
        if (hand) { shadow(g, hand.x, hand.y + 26, 18); drawTopping(g, kind, hand.x, hand.y - 6, 1.25, hand.seed); }
        P.draw(g);
      },
      result() { let s = 0; for (const x of spots) s += x.q; return clamp(s / n - misses * 0.08, 0, 1); },
    };
  },
};

// ------------------------------------------------------------------ runner
const $ = (id) => document.getElementById(id);
let canvas, g, el = {}, W = 1, H = 1, dpr = 1, scale = 1, ox = 0, oy = 0, view = { x0: 0, y0: 0, x1: 600, y1: 600 };
let cur = null, last = 0, paused = false, ptr = { x: 300, y: 300 }, covering = false;
// difficulty modes: k = leniency (hit areas, target zones, fewer reps), slow = speed of moving things,
// dur = length of the fuse timer. Medium is the baseline every game is tuned for.
const MODES = {
  easy: { k: 1.45, slow: 0.75, dur: 1.3 },
  medium: { k: 1, slow: 1, dur: 1 },
  hard: { k: 0.8, slow: 1.15, dur: 0.88 },
};
const GRADES = [['PERFECT', 0.88], ['GOOD', 0.65], ['OK', 0.35], ['BAD', -1]];
const live = () => !!cur && cur.phase === 'play' && !paused;
function gradeOf(s) { for (const [n, th] of GRADES) if (s >= th) return n; return 'BAD'; }

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  scale = Math.min(W / 600, (H - 50) / 600);
  ox = (W - 600 * scale) / 2; oy = Math.max(0, (H - 40 - 600 * scale) / 2);
  view = { x0: -ox / scale, y0: -oy / scale, x1: (W - ox) / scale, y1: (H - oy) / scale };
}
const toStage = (e) => ({ x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale });

function init() {
  el.root = $('mg'); canvas = $('mgCanvas'); g = canvas.getContext('2d');
  el.cmd = $('mgCmd'); el.hint = $('mgHint'); el.grade = $('mgGrade');
  resize(); window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    ptr = toStage(e);
    if (live() && cur.inst.down) cur.inst.down(ptr);
  });
  canvas.addEventListener('pointermove', (e) => { ptr = toStage(e); if (live() && cur.inst.move) cur.inst.move(ptr); });
  const up = (e) => { ptr = toStage(e); if (live() && cur.inst.up) cur.inst.up(ptr); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  window.addEventListener('keydown', (e) => {
    if (!cur) return;
    if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    if (e.repeat || !live()) return;
    if (e.code === 'Space' || e.code === 'Enter') { if (cur.inst.down) cur.inst.down({ x: ptr.x, y: ptr.y, key: true }); }
    else if (cur.inst.key) { if (e.code.startsWith('Arrow')) e.preventDefault(); cur.inst.key(e.code, true); }
  });
  window.addEventListener('keyup', (e) => {
    if (!live()) return;
    if (e.code === 'Space' || e.code === 'Enter') { if (cur.inst.up) cur.inst.up({ x: ptr.x, y: ptr.y, key: true }); }
    else if (cur.inst.key) cur.inst.key(e.code, false);
  });
}

function iris(open, origin, done) {
  const x = origin ? origin.x : W / 2, y = origin ? origin.y : H / 2;
  const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 20;
  const a = `circle(0px at ${x}px ${y}px)`, b = `circle(${R}px at ${x}px ${y}px)`;
  let called = false;
  const fin = () => { if (!called) { called = true; if (done) done(); } };
  if (!el.root.animate) { fin(); return; }
  const dur = open ? 420 : 360;
  const anim = el.root.animate([{ clipPath: open ? a : b }, { clipPath: open ? b : a }], { duration: dur, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
  anim.onfinish = fin;
  if (open) setTimeout(() => anim.cancel(), dur + 160); // fully open: drop the clip
  setTimeout(fin, dur + 150); // animations can stall in background tabs
}

function run(id, opts = {}) {
  return new Promise((resolve) => {
    const def = G[id];
    const M = MODES[opts.mode] || MODES.medium;
    const inst = def.create({ d: opts.d || 0, p: opts.p || {}, sfx: Sfx, k: M.k, slow: M.slow });
    cur = { def, inst, dur: def.dur * M.dur, phase: 'intro', t: 0, T: 0, resolve, opts, score: 0, grade: 'BAD', closing: false };
    el.root.classList.remove('hidden');
    el.cmd.textContent = def.cmd; el.cmd.className = 'pop';
    el.hint.textContent = def.hint; el.hint.className = 'show';
    el.grade.className = ''; el.grade.innerHTML = '';
    covering = false;
    iris(true, opts.origin, () => { if (cur && !cur.closing) covering = true; });
    Sfx.cmd();
    last = performance.now();
    requestAnimationFrame(frame);
  });
}

function finish() {
  const c = cur;
  c.score = clamp(c.inst.result() || 0, 0, 1);
  c.grade = gradeOf(c.score);
  c.phase = 'outro'; c.t = 0;
  if (c.inst.up) c.inst.up({ x: ptr.x, y: ptr.y, key: true });
  const bonus = c.opts.bonus ? c.opts.bonus[c.grade] : 0;
  el.grade.className = 'show ' + c.grade;
  el.grade.innerHTML = `${c.grade === 'BAD' ? 'BAD…' : c.grade + '!'}${bonus ? `<small>+${bonus} SEC</small>` : ''}`;
  el.cmd.className = 'gone'; el.hint.className = '';
  ({ PERFECT: Sfx.perfect, GOOD: Sfx.good, OK: Sfx.ok, BAD: Sfx.bad })[c.grade]();
}

function close() {
  const c = cur; c.closing = true; covering = false;
  iris(false, c.opts.origin, () => {
    el.root.classList.add('hidden');
    if (el.root.getAnimations) el.root.getAnimations().forEach((a) => a.cancel());
    cur = null;
    c.resolve({ grade: c.grade, score: c.score });
  });
}

function frame(now) {
  if (!cur) return;
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (paused) dt = 0;
  const c = cur;
  c.T += dt;
  if (c.phase === 'intro') { c.t += dt; if (c.t >= 1.0) { c.phase = 'play'; c.t = 0; el.cmd.className = 'up'; } }
  else if (c.phase === 'play') { c.t += dt; c.inst.update(dt, true); if (c.inst.done || c.t >= c.dur) finish(); }
  else if (c.phase === 'outro') { c.t += dt; c.inst.update(dt, false); if (c.t >= 1.3 && !c.closing) close(); }
  draw();
  if (cur) requestAnimationFrame(frame);
}

function drawFuse(frac) {
  const y = H - 22, x0 = 58, x1 = W - 24, xe = x0 + (x1 - x0) * clamp(frac, 0, 1);
  g.lineCap = 'round';
  if (xe > x0) {
    g.lineWidth = 11; g.strokeStyle = OL; g.beginPath(); g.moveTo(x0, y); g.lineTo(xe, y); g.stroke();
    g.lineWidth = 5; g.strokeStyle = frac < 0.25 ? '#ff8a5a' : '#f2c27a'; g.setLineDash([10, 7]); g.stroke(); g.setLineDash([]);
  }
  if (frac > 0 && cur.phase === 'play') { g.fillStyle = '#ffe14d'; star(g, xe, y, 10 + Math.random() * 6, Math.random() * TAU); g.fill(); g.fillStyle = '#ff7a1a'; circ(g, xe, y, 4); g.fill(); }
  const sh = frac < 0.25 && cur.phase === 'play' ? Math.sin(performance.now() / 18) * 2.5 : 0;
  circ(g, 32 + sh, y - 6, 21); paint(g, '#3b2a3a', 5);
  rr(g, 40 + sh, y - 30, 14, 12, 3); paint(g, '#8a7a8a', 4);
  g.fillStyle = 'rgba(255,255,255,0.5)'; circ(g, 25 + sh, y - 13, 6); g.fill();
}

function draw() {
  const c = cur;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  c.inst.draw(g, view, c.T);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFuse(c.phase === 'intro' ? 1 : c.phase === 'play' ? 1 - c.t / c.dur : 0);
}

function setPaused(p) { paused = p; }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
return {
  run, setPaused, games: G, gradeOf,
  get active() { return !!cur; },
  get covering() { return covering; },
};
})();
