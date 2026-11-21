// Duo: two players on one device, for the PLAY HARD games that have 2-player modes.
//   Keyboard: P1 = WASD + Space/F (action a) + G/Q (action b); P2 = arrows + Enter/Right Shift/Numpad 0 (a) + Period/Numpad 1 (b).
//   Touch: the screen is split in two halves (P1 left, P2 right); each half has a floating stick and the action buttons.
//
//   Duo.init({ a: 'KICK', b: 'LOCK' })   // button labels; leave b out for one-button games, a: null for none
//   Duo.start()  / Duo.stop()             // show / hide the touch controls (call start() when a 2P round begins)
//   Duo.update()                          // once per frame, before reading the pads
//   const p = Duo.pad(0)                  // { x, y } stick (screen directions, length 0..1), a / b held,
//                                         // aPressed / aReleased / bPressed (this frame), aHeld (seconds)
(function () {
  'use strict';
  const D = window.Duo = { on: false };
  const KEYS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['Space', 'KeyF', 'KeyE'], b: ['KeyG', 'KeyQ'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter', 'ShiftRight', 'Numpad0', 'NumpadEnter'], b: ['Period', 'Numpad1', 'Slash'] },
  ];
  const COLORS = ['#19f7ff', '#ff2fd6'];
  const held = new Set();
  const pads = [0, 1].map(() => ({ x: 0, y: 0, a: false, b: false, aPressed: false, aReleased: false, bPressed: false, aHeld: 0,
    _a: 0, _ar: 0, _b: 0, _t0: 0, stick: null, touchA: false, touchB: false }));
  let opts = { a: 'GO' };

  D.pad = (i) => pads[i];
  D.color = (i) => COLORS[i];

  const isKey = (i, k, code) => KEYS[i][k].includes(code);
  addEventListener('keydown', (e) => {
    if (!D.on) return;
    for (let i = 0; i < 2; i++) {
      if (isKey(i, 'a', e.code) || isKey(i, 'b', e.code) || /^Arrow/.test(e.code)) e.preventDefault();
      if (e.repeat) continue;
      if (isKey(i, 'a', e.code)) pressA(i);
      if (isKey(i, 'b', e.code)) pads[i]._b++;
    }
    held.add(e.code);
  });
  addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (!D.on) return;
    for (let i = 0; i < 2; i++) if (isKey(i, 'a', e.code) && !anyHeld(i, 'a')) releaseA(i);
  });
  addEventListener('blur', () => { held.clear(); pads.forEach((p, i) => { if (p.a) releaseA(i); p.stick = null; p.touchA = p.touchB = false; }); });
  const anyHeld = (i, k) => KEYS[i][k].some((c) => held.has(c));
  function pressA(i) { const p = pads[i]; if (!p.a) { p._a++; p._t0 = performance.now(); } }
  function releaseA(i) { pads[i]._ar++; }

  D.update = () => {
    for (let i = 0; i < 2; i++) {
      const p = pads[i];
      let x = (anyHeld(i, 'right') ? 1 : 0) - (anyHeld(i, 'left') ? 1 : 0), y = (anyHeld(i, 'down') ? 1 : 0) - (anyHeld(i, 'up') ? 1 : 0);
      if (p.stick) {
        const dx = p.stick.x - p.stick.ox, dy = p.stick.y - p.stick.oy, d = Math.hypot(dx, dy);
        if (d > 8) { const m = Math.min(1, d / 50); x = dx / d * m; y = dy / d * m; }
        const k = p.stick.el.querySelector('i'), dd = Math.min(50, d), a = Math.atan2(dy, dx);
        k.style.transform = `translate(${Math.cos(a) * dd}px, ${Math.sin(a) * dd}px)`;
      }
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      p.x = x; p.y = y;
      p.aPressed = p._a > 0; p.aReleased = p._ar > 0; p.bPressed = p._b > 0;
      p._a = p._ar = p._b = 0;
      p.a = anyHeld(i, 'a') || p.touchA;
      p.b = anyHeld(i, 'b') || p.touchB;
      p.aHeld = p.a ? (performance.now() - p._t0) / 1000 : 0;
    }
  };

  /* ---------- touch: one half of the screen per player ---------- */
  let ui = null;
  function build() {
    const css = document.getElementById('duoCss') || document.createElement('style');
    css.id = 'duoCss';
    css.textContent = `
.duo{position:fixed;inset:0;z-index:9;pointer-events:none;display:none}
.duo.on{display:block}
.duo .half{position:absolute;top:0;bottom:0;width:50%;pointer-events:auto;touch-action:none}
.duo .half.p0{left:0}.duo .half.p1{right:0;border-left:2px dashed rgba(255,255,255,.12)}
.duo .stk{position:absolute;width:100px;height:100px;margin:-50px 0 0 -50px;border-radius:50%;border:3px solid var(--c);opacity:.55;display:none}
.duo .stk i{position:absolute;left:30px;top:30px;width:40px;height:40px;border-radius:50%;background:var(--c)}
.duo .btns{position:absolute;bottom:calc(18px + env(safe-area-inset-bottom));display:flex;gap:10px}
.duo .p0 .btns{right:14px}.duo .p1 .btns{left:14px}
.duo button{width:78px;height:78px;border-radius:50%;border:3px solid var(--c);background:rgba(20,0,45,.55);color:#fff;
  font:400 13px 'Bungee',sans-serif;box-shadow:0 0 14px var(--c);touch-action:none}
.duo button.dn{background:var(--c);color:#12001f;transform:scale(.93)}
.duo button small{display:block;font-size:10px;opacity:.8}
.duo .tag{position:absolute;top:calc(64px + env(safe-area-inset-top));font:400 14px 'Bungee',sans-serif;color:var(--c);opacity:.7}
.duo .p0 .tag{left:14px}.duo .p1 .tag{right:14px}
body:not(.touch) .duo .half{pointer-events:none}body:not(.touch) .duo .btns,body:not(.touch) .duo .stk{display:none}`;
    document.head.appendChild(css);
    ui = document.createElement('div');
    ui.className = 'duo';
    ui.innerHTML = [0, 1].map((i) => `<div class="half p${i}" style="--c:${COLORS[i]}"><div class="tag">P${i + 1}</div><div class="stk"><i></i></div>
      <div class="btns">${opts.b ? `<button data-k="b"><small>P${i + 1}</small>${opts.b}</button>` : ''}${opts.a ? `<button data-k="a"><small>P${i + 1}</small>${opts.a}</button>` : ''}</div></div>`).join('');
    document.body.appendChild(ui);
    ui.querySelectorAll('.half').forEach((half, i) => {
      const p = pads[i], stk = half.querySelector('.stk');
      half.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button');
        e.preventDefault();
        try { half.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (btn) {
          btn.classList.add('dn'); btn.dataset.pid = e.pointerId;
          if (btn.dataset.k === 'a') { p.touchA = true; pressA(i); } else { p.touchB = true; p._b++; }
          return;
        }
        if (p.stick) return;
        const r = half.getBoundingClientRect();
        p.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, el: stk };
        stk.style.left = (e.clientX - r.left) + 'px'; stk.style.top = (e.clientY - r.top) + 'px'; stk.style.display = 'block';
      });
      half.addEventListener('pointermove', (e) => { if (p.stick && p.stick.id === e.pointerId) { p.stick.x = e.clientX; p.stick.y = e.clientY; } });
      const end = (e) => {
        if (p.stick && p.stick.id === e.pointerId) { p.stick = null; stk.style.display = 'none'; }
        half.querySelectorAll('button.dn').forEach((b) => {
          if (+b.dataset.pid !== e.pointerId) return;
          b.classList.remove('dn');
          if (b.dataset.k === 'a') { p.touchA = false; releaseA(i); } else p.touchB = false;
        });
      };
      half.addEventListener('pointerup', end); half.addEventListener('pointercancel', end);
    });
  }

  D.init = (o) => { opts = Object.assign({ a: 'GO' }, o); if (ui) { ui.remove(); ui = null; } };
  D.start = () => {
    if (!ui) build();
    D.on = true; ui.classList.add('on');
    pads.forEach((p) => { p._a = p._ar = p._b = 0; p.stick = null; p.touchA = p.touchB = false; });
    ui.querySelectorAll('.stk').forEach((s) => { s.style.display = 'none'; });
  };
  D.stop = () => { D.on = false; if (ui) ui.classList.remove('on'); };
  // a screen direction turned into world units through a 2x2 matrix (for games whose view is rotated)
  D.toWorld = (p, m) => {
    if (!m) return { x: p.x, y: p.y };
    const x = m.a * p.x + m.c * p.y, y = m.b * p.x + m.d * p.y, l = Math.hypot(x, y) || 1, k = Math.hypot(p.x, p.y);
    return { x: x / l * k, y: y / l * k };
  };
})();
