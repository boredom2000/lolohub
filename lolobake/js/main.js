// SUPER BAKING: game rules, HUD and input. Customers order recipes at the counter; each recipe is a
// list of station steps, and every step is one short mini-game (minigames.js). Up to three orders
// run at once, each with its own color. Good grades add time to the global countdown.
(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const IS_TOUCH = Kitchen.isTouch;
document.body.classList.toggle('touch', IS_TOUCH);

const START_TIME = 45, MAX_TIME = 99, SERVE_TIME = 5, ANGRY_PENALTY = 5;
const BONUS = { PERFECT: { t: 6, pts: 300 }, GOOD: { t: 4, pts: 200 }, OK: { t: 2, pts: 100 }, BAD: { t: 0, pts: 0 } };
const BONUS_T = { PERFECT: 6, GOOD: 4, OK: 2, BAD: 0 };
const COLORS = ['#ff4f9a', '#1fb0ff', '#ffa800'];

const STATION_INFO = {
  FRIDGE: { name: 'FRIDGE', icon: '❄️' }, PANTRY: { name: 'PANTRY', icon: '🌾' },
  STOVE: { name: 'STOVE', icon: '🔥' }, OVEN: { name: 'OVEN', icon: '♨️' },
  MIXER: { name: 'MIXER', icon: '🥣' }, BOARD: { name: 'PREP', icon: '🥖' },
  DECOR: { name: 'DECOR', icon: '🎨' },
};
const ING_ICON = { FLOUR: '🌾', SUGAR: '🍬', COCOA: '🍫', MILK: '🥛' };
const TOP_ICON = { sprinkles: '✨', chips: '🍫', berries: '🍓', salt: '🧂' };
function stepInfo(g, p) {
  switch (g) {
    case 'POUR': return { icon: ING_ICON[p.ing] || '🥛', label: 'Pour ' + (p.ing || 'flour').toLowerCase() };
    case 'CRACK': return { icon: '🥚', label: 'Crack eggs' };
    case 'CATCH': return { icon: '🧈', label: 'Grab butter & milk' };
    case 'SHAKE': return { icon: '🌀', label: 'Shake it up' };
    case 'WHISK': return { icon: '🥣', label: 'Whisk the batter' };
    case 'KNEAD': return { icon: '👊', label: 'Knead the dough' };
    case 'ROLL': return { icon: '📏', label: 'Roll it flat' };
    case 'SHAPE': return { icon: '✏️', label: 'Shape the ' + (p.shape || 'loaf') };
    case 'SLICE': return { icon: '🔪', label: 'Slice it up' };
    case 'MELT': return { icon: p.what === 'jam' ? '🍓' : '🍫', label: p.what === 'jam' ? 'Cook the jam' : 'Melt chocolate' };
    case 'FLIP': return { icon: '🥞', label: 'Flip pancakes' };
    case 'OVEN': return { icon: '⏲️', label: 'Bake it' };
    case 'FROST': return { icon: '🍦', label: 'Pipe the frosting' };
    case 'CHERRY': return { icon: '🍒', label: 'Cherry on top' };
    case 'TOPPING': return { icon: TOP_ICON[p.kind] || '✨', label: 'Add ' + (p.kind || 'sprinkles') };
  }
  return { icon: '?', label: g };
}
const RECIPES = [
  { name: 'BIRTHDAY CAKE', icon: '🎂', steps: [['PANTRY', 'POUR', { ing: 'FLOUR' }], ['FRIDGE', 'CRACK'], ['MIXER', 'WHISK'], ['OVEN', 'OVEN', { item: 'cake' }], ['DECOR', 'FROST'], ['DECOR', 'CHERRY']] },
  { name: 'COOKIES', icon: '🍪', steps: [['PANTRY', 'POUR', { ing: 'SUGAR' }], ['FRIDGE', 'CATCH'], ['MIXER', 'SHAKE'], ['BOARD', 'ROLL'], ['OVEN', 'OVEN', { item: 'cookies' }], ['DECOR', 'TOPPING', { kind: 'chips' }]] },
  { name: 'CUPCAKES', icon: '🧁', steps: [['FRIDGE', 'CRACK'], ['PANTRY', 'POUR', { ing: 'COCOA' }], ['MIXER', 'SHAKE', { ing: 'COCOA' }], ['OVEN', 'OVEN', { item: 'cupcake' }], ['DECOR', 'FROST', { cup: true }], ['DECOR', 'TOPPING', { kind: 'sprinkles' }]] },
  { name: 'FLUFFY BREAD', icon: '🍞', steps: [['PANTRY', 'POUR', { ing: 'FLOUR' }], ['FRIDGE', 'CATCH'], ['MIXER', 'KNEAD'], ['BOARD', 'SHAPE', { shape: 'loaf' }], ['OVEN', 'OVEN', { item: 'bread' }], ['BOARD', 'SLICE', { item: 'bread' }]] },
  { name: 'BAGUETTE', icon: '🥖', steps: [['PANTRY', 'POUR', { ing: 'FLOUR' }], ['MIXER', 'KNEAD'], ['BOARD', 'SHAPE', { shape: 'baguette' }], ['OVEN', 'OVEN', { item: 'bread' }], ['BOARD', 'SLICE', { item: 'bread' }]] },
  { name: 'PRETZEL', icon: '🥨', steps: [['PANTRY', 'POUR', { ing: 'FLOUR' }], ['FRIDGE', 'CATCH'], ['MIXER', 'KNEAD'], ['BOARD', 'SHAPE', { shape: 'pretzel' }], ['OVEN', 'OVEN', { item: 'pretzel' }], ['DECOR', 'TOPPING', { kind: 'salt' }]] },
  { name: 'CHERRY PIE', icon: '🥧', steps: [['PANTRY', 'POUR', { ing: 'FLOUR' }], ['FRIDGE', 'CATCH'], ['BOARD', 'ROLL'], ['STOVE', 'MELT', { what: 'jam' }], ['OVEN', 'OVEN', { item: 'pie' }], ['BOARD', 'SLICE', { item: 'pie' }]] },
  { name: 'PANCAKES', icon: '🥞', steps: [['FRIDGE', 'CRACK'], ['PANTRY', 'POUR', { ing: 'MILK' }], ['MIXER', 'WHISK'], ['STOVE', 'FLIP'], ['STOVE', 'MELT', { what: 'choco' }], ['DECOR', 'TOPPING', { kind: 'berries' }]] },
  { name: 'CHOCO DONUT', icon: '🍩', steps: [['PANTRY', 'POUR', { ing: 'SUGAR' }], ['FRIDGE', 'CRACK'], ['MIXER', 'KNEAD'], ['BOARD', 'SHAPE', { shape: 'ring' }], ['STOVE', 'MELT', { what: 'choco' }], ['DECOR', 'TOPPING', { kind: 'sprinkles' }]] },
  { name: 'LAYER CAKE', icon: '🍰', steps: [['FRIDGE', 'CRACK'], ['PANTRY', 'POUR', { ing: 'SUGAR' }], ['MIXER', 'WHISK'], ['OVEN', 'OVEN', { item: 'cake' }], ['DECOR', 'FROST'], ['BOARD', 'SLICE', { item: 'cake' }], ['DECOR', 'CHERRY']] },
];
function makeOrder(recipe, slot) {
  const steps = recipe.steps.map(([st, g, p]) => Object.assign({ st, g, p: p || {} }, stepInfo(g, p || {})));
  steps.push({ st: 'SERVE', g: null, icon: '🛎️', label: 'Serve it!' });
  const patMax = 30 + 10 * recipe.steps.length;
  return { slot, recipe, steps, idx: 0, pat: patMax, patMax, color: COLORS[slot] };
}

// ------------------------------------------------------------------ state
const S = { mode: 'title', paused: false };
let dirty = true;
function reset() {
  Object.assign(S, {
    mode: 'hub', paused: false, time: START_TIME, score: 0, served: 0, perfects: 0, steps: 0, lost: 0,
    slots: [null, null, null], spawnT: [0.5, 5, 11], d: 0, lowBeep: 0, tips: { accepted: false, ready: false, stepped: false },
  });
  Kitchen.reset();
  popups.forEach((p) => p.el.remove()); popups.length = 0;
  dirty = true;
}
const orders = () => S.slots ? S.slots.filter((s) => s && s.order).map((s) => s.order) : [];
const drain = () => 1 + Math.min(1.2, S.served * 0.08);
let best = 0; try { best = +localStorage.getItem('lolobake.best') || 0; } catch (e) {}

// ------------------------------------------------------------------ labels (station markers, bubbles, popups)
const labelsEl = $('labels');
const stEls = {};
for (const id in STATION_INFO) {
  const el = document.createElement('div'); el.className = 'st';
  el.innerHTML = `<div class="in"><div class="marks"></div><div class="pips"></div><button class="st-tag" data-st="${id}">${STATION_INFO[id].icon} ${STATION_INFO[id].name}</button></div>`;
  labelsEl.appendChild(el);
  stEls[id] = { el, marks: el.querySelector('.marks'), pips: el.querySelector('.pips') };
}
const custEls = [0, 1, 2].map((i) => { const el = document.createElement('div'); el.className = 'cust'; el.dataset.slot = i; labelsEl.appendChild(el); return el; });
const popups = [];
function popup(anchor, html, cls = '') {
  const el = document.createElement('div'); el.className = 'popw';
  el.innerHTML = `<div class="pop ${cls}">${html}</div>`;
  labelsEl.appendChild(el);
  popups.push({ el, anchor: anchor.clone(), t: 0 });
}
let toastT = 0;
function toast(msg, dur = 2.8) { const el = $('toast'); el.innerHTML = msg; el.classList.add('show'); toastT = dur; }

function markHTML(o) {
  const s = o.steps[o.idx];
  return `<button class="mark" data-slot="${o.slot}" style="--c:${o.color}" title="${s.label}"><span class="em">${o.recipe.icon}</span><b>${o.idx + 1}</b><i>${s.icon}</i></button>`;
}
function render() {
  dirty = false;
  const os = orders();
  for (const id in stEls) {
    const now = os.filter((o) => o.steps[o.idx].st === id);
    const later = [];
    for (const o of os) o.steps.forEach((s, k) => { if (k > o.idx && s.st === id) later.push(`<span class="pip" style="--c:${o.color}">${k + 1}</span>`); });
    stEls[id].marks.innerHTML = now.map(markHTML).join('');
    stEls[id].pips.innerHTML = later.join('');
    stEls[id].el.classList.toggle('on', now.length > 0);
    Kitchen.setRing(id, now.map((o) => o.color));
  }
  for (let i = 0; i < 3; i++) {
    const sl = S.slots && S.slots[i], el = custEls[i];
    if (!sl) { el.innerHTML = ''; continue; }
    if (!sl.order) el.innerHTML = `<button class="bubble wait" data-slot="${i}"><span class="em">${sl.recipe.icon}</span><small>NEW ORDER!</small></button>`;
    else {
      const o = sl.order, serve = o.steps[o.idx].st === 'SERVE';
      el.innerHTML = serve
        ? `<button class="bubble serve" data-slot="${i}" style="--c:${o.color}"><span class="em">${o.recipe.icon}</span><b>${o.idx + 1}</b><small>SERVE!</small></button>`
        : `<button class="bubble order" data-slot="${i}" style="--c:${o.color}"><span class="em">${o.recipe.icon}</span><div class="pat"><i></i></div></button>`;
    }
  }
  $('tickets').innerHTML = os.sort((a, b) => a.slot - b.slot).map((o) => `
    <div class="ticket" data-slot="${o.slot}" style="--c:${o.color}">
      <div class="th"><span class="em">${o.recipe.icon}</span><span class="nm">${o.recipe.name}</span>${IS_TOUCH ? '' : `<kbd>${o.slot + 1}</kbd>`}</div>
      <div class="pat"><i></i></div>
      <div class="chips">${o.steps.map((s, k) => `<span class="chip ${k < o.idx ? 'done' : k === o.idx ? 'now' : ''}" title="${s.label}"><i>${s.icon}</i><b>${k + 1}</b></span>`).join('')}</div>
      <div class="next">${o.steps[o.idx].label}${o.steps[o.idx].st !== 'SERVE' ? ` @ ${STATION_INFO[o.steps[o.idx].st].name}` : ''}</div>
    </div>`).join('');
}
function place(el, v) {
  const p = Kitchen.toScreen(v);
  el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
}
function updateLabels(dt) {
  if (dirty) render();
  for (const id in stEls) place(stEls[id].el, Kitchen.stations[id].anchor);
  for (let i = 0; i < 3; i++) place(custEls[i], Kitchen.custAnchor(i));
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]; p.t += dt;
    if (p.t > 1.6) { p.el.remove(); popups.splice(i, 1); continue; }
    place(p.el, p.anchor);
  }
  for (const o of orders()) {
    const f = Math.max(0, o.pat / o.patMax), w = (f * 100).toFixed(1) + '%', low = f < 0.3;
    document.querySelectorAll(`[data-slot="${o.slot}"] .pat`).forEach((el) => { el.firstElementChild.style.width = w; el.classList.toggle('low', low); });
  }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (S.mode === 'hub' || S.mode === 'mini') {
    $('clockVal').textContent = Math.ceil(S.time);
    $('clock').classList.toggle('low', S.time < 10);
    $('clock').style.setProperty('--f', Math.min(1, S.time / 60));
    $('scoreVal').textContent = S.score;
    $('servedVal').textContent = `${S.served} served${S.served ? ` · ×${drain().toFixed(1)} speed` : ''}`;
  }
}

// ------------------------------------------------------------------ actions
function spawn(i) {
  const waiting = S.slots.filter((s) => s).map((s) => s.recipe);
  let r = pick(RECIPES), tries = 0;
  while (waiting.includes(r) && tries++ < 8) r = pick(RECIPES);
  S.slots[i] = { recipe: r, order: null };
  Kitchen.addCustomer(i, true);
  Sfx.boing();
  dirty = true;
}
function accept(i) {
  const sl = S.slots[i];
  sl.order = makeOrder(sl.recipe, i);
  Kitchen.custWaiting(i, false); Kitchen.custWobble(i);
  Sfx.accept();
  popup(Kitchen.custAnchor(i), `${sl.recipe.name}!`, 'c' + i);
  if (!S.tips.accepted) { S.tips.accepted = true; toast(`Follow the <b style="color:${COLORS[i]}">colored number 1</b> — tap that station!`, 4); }
  dirty = true;
}
function tapCustomer(i) {
  if (S.mode !== 'hub') return;
  const sl = S.slots[i]; if (!sl) return;
  if (!sl.order) { accept(i); return; }
  const o = sl.order;
  if (o.steps[o.idx].st === 'SERVE') doStep(o);
  else { Kitchen.custWobble(i); Sfx.boing(); toast(`Next for ${o.recipe.icon}: <b>${o.steps[o.idx].label}</b> at the ${STATION_INFO[o.steps[o.idx].st].name}`); }
}
function tapStation(id) {
  if (S.mode !== 'hub') return;
  const list = orders().filter((o) => o.steps[o.idx].st === id).sort((a, b) => a.pat - b.pat);
  if (!list.length) {
    Kitchen.chef.shrug(); Sfx.boing();
    popup(Kitchen.chefAnchor(), '?', 'q');
    toast(orders().length ? `Nothing to do at the ${STATION_INFO[id].name} yet — follow the numbers!` : 'Tap a customer to take an order first!');
    return;
  }
  doStep(list[0]);
}
function doStep(o) {
  if (S.mode !== 'hub' || !o) return;
  const step = o.steps[o.idx], idx = o.idx;
  Sfx.tap();
  Kitchen.chef.carry(o.color);
  const spot = step.st === 'SERVE' ? Kitchen.counterSpot(o.slot) : Kitchen.stationSpot(step.st);
  Kitchen.chef.goTo(spot, () => arrive(o, idx));
}
function arrive(o, idx) {
  const sl = S.slots[o.slot];
  if (S.mode !== 'hub' || !sl || sl.order !== o || o.idx !== idx) { Kitchen.chef.carry(null); return; }
  const step = o.steps[idx];
  if (step.st === 'SERVE') { serve(o); return; }
  S.mode = 'mini';
  Kitchen.poke(step.st);
  const origin = Kitchen.toScreen(Kitchen.chefAnchor());
  MG.run(step.g, { d: S.d, p: step.p, origin, bonus: BONUS_T }).then((res) => {
    if (S.mode !== 'mini') return;
    S.mode = 'hub';
    const b = BONUS[res.grade];
    S.time = Math.min(MAX_TIME, S.time + b.t);
    S.score += b.pts; S.steps++;
    if (res.grade === 'PERFECT') S.perfects++;
    o.idx++;
    Kitchen.chef.carry(null); Kitchen.chef.cheer(res.grade);
    popup(Kitchen.chefAnchor(), `${b.t ? `+${b.t}s ` : ''}${res.grade}`, res.grade);
    if (o.steps[o.idx].st === 'SERVE') {
      Kitchen.custWobble(o.slot);
      if (!S.tips.ready) { S.tips.ready = true; toast(`${o.recipe.icon} is ready! Tap the customer to <b>SERVE</b> it`, 4); }
    } else if (!S.tips.stepped) { S.tips.stepped = true; toast('Nice! Good grades add time to the clock ⏱'); }
    dirty = true;
  });
}
function serve(o) {
  const tip = Math.round(300 * Math.max(0, o.pat / o.patMax) / 10) * 10;
  S.score += 500 + tip; S.served++; S.d = Math.min(1, S.served / 10);
  S.time = Math.min(MAX_TIME, S.time + SERVE_TIME);
  Sfx.serve();
  Kitchen.chef.carry(null); Kitchen.chef.cheer('PERFECT');
  Kitchen.removeCustomer(o.slot, true);
  popup(Kitchen.custAnchor(o.slot), `+${SERVE_TIME}s YUM! +${500 + tip}`, 'serve');
  S.slots[o.slot] = null; S.spawnT[o.slot] = rand(2.5, 4.5);
  dirty = true;
}
function angryLeave(i) {
  const sl = S.slots[i];
  Sfx.angry();
  Kitchen.removeCustomer(i, false);
  popup(Kitchen.custAnchor(i), `-${ANGRY_PENALTY}s TOO SLOW! 😤`, 'BAD');
  S.slots[i] = null; S.spawnT[i] = rand(3, 5); S.lost++;
  S.time = Math.max(0, S.time - ANGRY_PENALTY);
  if (sl.order && Kitchen.chef.walking) Kitchen.chef.carry(null);
  dirty = true;
}
function tickHub(dt) {
  S.time -= dt * drain();
  if (S.time <= 0) { S.time = 0; gameOver(); return; }
  if (S.time < 10) { S.lowBeep -= dt; if (S.lowBeep <= 0) { Sfx.tick(); S.lowBeep = S.time < 5 ? 0.5 : 1; } }
  for (let i = 0; i < 3; i++) {
    const sl = S.slots[i];
    if (!sl) { S.spawnT[i] -= dt; if (S.spawnT[i] <= 0) spawn(i); }
    else if (sl.order) { sl.order.pat -= dt; if (sl.order.pat <= 0) angryLeave(i); }
  }
}
function gameOver() {
  S.mode = 'over';
  Sfx.over();
  Kitchen.faint();
  document.body.classList.remove('playing');
  const isBest = S.score > best;
  if (isBest) { best = S.score; try { localStorage.setItem('lolobake.best', best); } catch (e) {} }
  $('overStats').innerHTML = `Score <b>${S.score}</b><br>Orders served <b>${S.served}</b> &middot; Perfects <b>${S.perfects}</b><br><span class="best">${isBest ? '★ NEW BEST! ★' : `Best ${best}`}</span>`;
  setTimeout(() => $('over').classList.remove('hidden'), 1100);
}
function startGame() {
  Sfx.unlock();
  $('title').classList.add('hidden'); $('over').classList.add('hidden');
  reset();
  document.body.classList.add('playing');
  toast('Tap a customer at the counter to take an order!', 4);
}

// ------------------------------------------------------------------ input
Kitchen.canvas.addEventListener('pointerdown', (e) => {
  Sfx.unlock();
  if (S.mode !== 'hub' || S.paused) return;
  const h = Kitchen.pick(e.clientX, e.clientY);
  if (!h) return;
  if (h.type === 'station') tapStation(h.id); else if (h.type === 'cust') tapCustomer(h.slot);
});
Kitchen.canvas.addEventListener('pointermove', (e) => {
  if (IS_TOUCH || S.mode !== 'hub') return;
  document.body.classList.toggle('hover-hit', !!Kitchen.pick(e.clientX, e.clientY));
});
labelsEl.addEventListener('click', (e) => {
  if (S.mode !== 'hub' || S.paused) return;
  const mark = e.target.closest('.mark'), bub = e.target.closest('.bubble'), tag = e.target.closest('.st-tag');
  if (mark) { const sl = S.slots[+mark.dataset.slot]; if (sl && sl.order) doStep(sl.order); }
  else if (bub) tapCustomer(+bub.dataset.slot);
  else if (tag) tapStation(tag.dataset.st);
});
$('tickets').addEventListener('click', (e) => {
  const t = e.target.closest('.ticket'); if (!t || S.mode !== 'hub' || S.paused) return;
  const sl = S.slots[+t.dataset.slot]; if (sl && sl.order) doStep(sl.order);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { if (S.mode === 'hub' || S.mode === 'mini') setQuitOpen($('quitModal').classList.contains('hidden')); return; }
  if (S.mode !== 'hub' || S.paused || e.repeat) return;
  const k = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
  if (k < 0) return;
  const n = k % 3;
  const sl = S.slots[n]; if (!sl) return;
  if (!sl.order) accept(n); else doStep(sl.order);
});

function goHub() { location.href = '../'; }
function setQuitOpen(open) {
  $('quitModal').classList.toggle('hidden', !open);
  S.paused = open; MG.setPaused(open);
}
$('hubBtn').addEventListener('click', () => { if (S.mode === 'hub' || S.mode === 'mini') setQuitOpen(true); else goHub(); });
$('quitNo').addEventListener('click', () => setQuitOpen(false));
$('quitYes').addEventListener('click', goHub);
$('quitModal').addEventListener('click', (ev) => { if (ev.target.id === 'quitModal') setQuitOpen(false); });
$('playBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('overHub').addEventListener('click', goHub);
const muteSync = () => { $('muteBtn').innerHTML = Sfx.muted ? '🔇' : '🔊'; $('muteBtn').title = Sfx.muted ? 'Sound on' : 'Mute'; };
$('muteBtn').addEventListener('click', () => { Sfx.unlock(); Sfx.setMuted(!Sfx.muted); muteSync(); });
muteSync();

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

// ------------------------------------------------------------------ boot
{
  const sky = $('sky'), cols = ['#ff5fa2', '#ffd23f', '#5fe0c0', '#3fc8ff', '#b58cff', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = pick(cols);
    s.style.setProperty('--r', (Math.random() * 360 | 0) + 'deg');
    s.style.animationDuration = (7 + Math.random() * 9).toFixed(1) + 's';
    s.style.animationDelay = (-Math.random() * 16).toFixed(1) + 's';
    sky.appendChild(s);
  }
  if (best) $('titleBest').textContent = `Best ${best}`;
  const syncMargins = () => { const small = window.innerWidth < 600; Kitchen.setMargins({ top: small ? 150 : 110, bottom: small ? 140 : 150 }); };
  window.addEventListener('resize', syncMargins); syncMargins();
  // a couple of customers hang around on the title screen
  Kitchen.addCustomer(0, false); Kitchen.addCustomer(2, false);
}
let last = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  if (S.mode === 'hub' && !S.paused) tickHub(dt);
  Kitchen.update(S.paused ? 0 : dt, T);
  if (!MG.covering) Kitchen.render();
  updateLabels(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
