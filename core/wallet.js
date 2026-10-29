// LoloHub gold and profiles, shared by the hub page, the lessons (work/) and the games (play/).
// - On the home server, a logged-in player's gold lives on the server (/_api/hub/*, see server/hub-api.js).
// - Otherwise (guest, GitHub Pages, offline) gold is kept in sessionStorage: it lasts while the tab is open.
// Rules (rewards, prices, avatars) come from catalog.json at the hub root.
// On a game page (play/<id>/) it charges the game's price when the page opens and at every loloAd() round
// break (load it after ads.js); when there isn't enough gold it covers the game with a "go WORK HARD" card.
(function () {
  'use strict';
  const ROOT = new URL('..', document.currentScript.src).href; // the hub root (this file is in core/)
  const API = '/_api/hub/';
  const GUEST_KEY = 'lolo-guest';
  const DAY = 86400000;
  const listeners = [];

  const W = window.LoloWallet = {
    root: ROOT,
    catalog: null,
    server: false, // true when the home server's profile API answers
    user: null,    // { name, avatar } when logged in
    gold: 0,
    done: {},      // lesson id -> times finished in the reward window
    onChange(fn) { listeners.push(fn); if (W.catalog) fn(W); },
  };
  const emit = () => listeners.forEach((fn) => { try { fn(W); } catch (e) { console.error(e); } });

  // ---------- guest store (this tab only) ----------
  function guest() {
    try { const g = JSON.parse(sessionStorage.getItem(GUEST_KEY)); if (g && typeof g.gold === 'number') return g; } catch (e) { /* none */ }
    return { gold: 0, done: {} };
  }
  function saveGuest(g) { try { sessionStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch (e) { /* private mode */ } }
  function recentCounts(done) {
    const cut = Date.now() - (W.catalog.rewards.windowDays || 7) * DAY, out = {};
    for (const [id, list] of Object.entries(done)) { const n = list.filter((t) => t > cut).length; if (n) out[id] = n; }
    return out;
  }
  function apply(me) {
    if (me && me.user) { W.user = { name: me.user.name, avatar: me.user.avatar }; W.gold = me.user.gold; W.done = me.user.done || {}; }
    else { const g = guest(); W.user = null; W.gold = g.gold; W.done = recentCounts(g.done); }
    emit();
  }

  async function api(route, body) {
    const opts = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }
      : { credentials: 'same-origin', cache: 'no-store' };
    const r = await fetch(API + route, opts);
    let data;
    try { data = await r.json(); } catch (e) { data = { error: 'The server did not answer.' }; }
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  W.ready = (async () => {
    try { W.catalog = await (await fetch(ROOT + 'catalog.json', { cache: 'no-cache' })).json(); }
    catch (e) { W.catalog = { rewards: {}, work: [], play: [], avatars: [] }; }
    try { const me = await api('me'); W.server = true; apply(me); }
    catch (e) { W.server = false; apply(null); }
    return W;
  })();

  // ---------- lookups ----------
  W.lessons = () => W.catalog.work.flatMap((s) => s.lessons);
  W.lesson = (id) => W.lessons().find((l) => l.id === id);
  W.game = (id) => W.catalog.play.find((g) => g.id === id);
  W.avatar = (id) => W.catalog.avatars.find((a) => a.id === id) || W.catalog.avatars[0];
  // what finishing this lesson would pay now: { gold, level 3 (lots) .. 0 (tiny), done }
  W.lessonValue = (lesson) => {
    const n = W.done[lesson.id] || 0;
    const gold = Math.round(lesson.gold * Math.pow(W.catalog.rewards.decay ?? 0.6, n));
    return { gold, done: n, level: n === 0 ? 3 : n === 1 ? 2 : n <= 3 ? 1 : 0 };
  };

  // ---------- earning and spending ----------
  // score 0..1; resolves to the gold earned (0 below the pass score)
  W.earn = async (lessonId, score) => {
    await W.ready;
    const lesson = W.lesson(lessonId);
    if (!lesson) return 0;
    score = Math.max(0, Math.min(1, score));
    if (W.user) {
      try { const r = await api('earn', { lesson: lessonId, score }); apply(r); return r.reward; }
      catch (e) { toast(e.message); return 0; }
    }
    const pass = score >= (W.catalog.rewards.passScore ?? 0.5);
    const reward = pass ? Math.round(W.lessonValue(lesson).gold * score) : 0;
    const g = guest();
    g.gold += reward;
    if (pass) (g.done[lessonId] = g.done[lessonId] || []).push(Date.now());
    saveGuest(g);
    apply(null);
    if (W.server) api('guest-done', { lesson: lessonId, score, reward }).catch(() => {}); // dashboard stats only
    return reward;
  };
  // resolves to { ok, price }
  W.spend = async (gameId) => {
    await W.ready;
    const game = W.game(gameId);
    if (!game) return { ok: true, price: 0 };
    if (W.user) {
      try { const r = await api('spend', { game: gameId }); apply(r); return { ok: r.ok, price: r.price }; }
      catch (e) { return { ok: true, price: 0 }; } // never lock a game because of a server hiccup
    }
    const g = guest();
    if (g.gold < game.price) return { ok: false, price: game.price };
    g.gold -= game.price;
    saveGuest(g);
    apply(null);
    return { ok: true, price: game.price };
  };

  // ---------- profiles (home server only) ----------
  W.register = async (name, password, avatar) => {
    const g = guest();
    const r = await api('register', { name, password, avatar, guestGold: g.gold, guestDone: g.done });
    saveGuest({ gold: 0, done: {} });
    apply(r);
  };
  W.login = async (name, password) => {
    const g = guest();
    const r = await api('login', { name, password, guestGold: g.gold });
    saveGuest({ gold: 0, done: {} });
    apply(r);
  };
  W.logout = async () => { try { await api('logout', {}); } catch (e) { /* gone anyway */ } apply(null); };
  W.setAvatar = async (avatar) => apply(await api('avatar', { avatar }));

  // ---------- shared bits of UI ----------
  W.coin = (size = 22) =>
    `<svg class="lolo-coin" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">` +
    '<circle cx="16" cy="16" r="15" fill="#b8860b"/><circle cx="16" cy="15" r="13.5" fill="#ffd23f"/>' +
    '<circle cx="16" cy="15" r="10" fill="none" stroke="#e0a800" stroke-width="1.6"/>' +
    '<path d="M16 8.5l1.9 4.1 4.4.4-3.3 3 1 4.4-4-2.3-4 2.3 1-4.4-3.3-3 4.4-.4z" fill="#fff6c9"/>' +
    '<ellipse cx="11" cy="9" rx="3.5" ry="1.6" fill="#fff" opacity=".55" transform="rotate(-30 11 9)"/></svg>';
  const css = document.createElement('style');
  css.textContent = `
.lolo-toast{position:fixed;left:50%;top:14px;transform:translate(-50%,-30px);opacity:0;z-index:2147483646;display:flex;gap:8px;align-items:center;
  padding:8px 16px;border-radius:999px;background:#1d0033;color:#ffe81a;font:800 18px/1 system-ui,sans-serif;border:2px solid #ffd23f;
  box-shadow:0 0 18px rgba(255,210,63,.6);transition:transform .35s cubic-bezier(.2,1.6,.4,1),opacity .35s;pointer-events:none}
.lolo-toast.on{transform:translate(-50%,0);opacity:1}
.lolo-gate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;
  background:radial-gradient(circle at 50% 40%,rgba(58,0,99,.92),rgba(10,0,20,.97));font-family:system-ui,sans-serif;color:#fff;text-align:center}
.lolo-gate .box{max-width:440px;padding:28px 24px;border-radius:26px;border:3px solid #ffd23f;background:#1d0033;box-shadow:0 0 40px rgba(255,210,63,.45);
  animation:loloPop .5s cubic-bezier(.2,1.6,.4,1)}
.lolo-gate h2{font:900 30px/1.1 system-ui,sans-serif;color:#ffe81a;text-shadow:0 0 14px #ff7a1a;margin:6px 0 10px}
.lolo-gate p{font-size:18px;line-height:1.45;margin:8px 0;color:#f1e6ff}
.lolo-gate .big{font-size:60px;animation:loloWobble 1.4s ease-in-out infinite}
.lolo-gate a{display:inline-block;margin:14px 6px 0;padding:12px 22px;border-radius:999px;font:900 18px system-ui,sans-serif;text-decoration:none}
.lolo-gate a.work{background:#fff6dc;color:#2b2140;box-shadow:0 5px 0 #c9a227}
.lolo-gate a.hub{background:transparent;color:#19f7ff;border:2px solid #19f7ff}
.lolo-cele{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;flex-direction:column;
  background:rgba(255,248,225,.82);font-family:system-ui,sans-serif;color:#2b2140;text-align:center;animation:loloFade .3s}
.lolo-cele .amt{display:flex;align-items:center;gap:12px;font:900 clamp(56px,14vw,110px)/1 system-ui,sans-serif;color:#d99a00;
  text-shadow:0 4px 0 #8a5a00,0 0 30px rgba(255,210,63,.9);animation:loloPop .6s cubic-bezier(.2,1.8,.4,1)}
.lolo-cele .msg{margin-top:14px;font:800 22px/1.35 system-ui,sans-serif;max-width:520px;padding:0 16px}
.lolo-cele .sub{margin-top:6px;font-size:16px;opacity:.75;max-width:520px;padding:0 16px}
.lolo-cele button{margin-top:22px;padding:12px 28px;border:0;border-radius:999px;background:#2b2140;color:#ffe81a;font:900 20px system-ui,sans-serif;cursor:pointer}
.lolo-fly{position:fixed;z-index:2147483647;pointer-events:none;animation:loloFly 1.1s cubic-bezier(.3,.6,.4,1) forwards}
@keyframes loloPop{0%{transform:scale(.2) rotate(-12deg);opacity:0}100%{transform:none;opacity:1}}
@keyframes loloWobble{50%{transform:rotate(-10deg) scale(1.1)}}
@keyframes loloFade{from{opacity:0}}
@keyframes loloFly{0%{transform:translate(0,0) scale(.4) rotate(0);opacity:0}15%{opacity:1}
  100%{transform:translate(var(--dx),var(--dy)) scale(1.1) rotate(var(--rot));opacity:0}}`;
  document.head.appendChild(css);

  let toastEl = null, toastTimer = 0;
  function toast(html) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'lolo-toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = html;
    requestAnimationFrame(() => toastEl.classList.add('on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2200);
  }
  W.toast = toast;

  // a burst of coins flying out from (x, y)
  W.coinBurst = (x, y, n = 18) => {
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'lolo-fly';
      c.innerHTML = W.coin(26 + Math.random() * 18);
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 260;
      c.style.left = x - 20 + 'px'; c.style.top = y - 20 + 'px';
      c.style.setProperty('--dx', Math.cos(a) * d + 'px');
      c.style.setProperty('--dy', Math.sin(a) * d - 80 + 'px');
      c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      c.style.animationDelay = Math.random() * 0.25 + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1600);
    }
  };

  // full-screen reward after a lesson; resolves when closed
  W.celebrate = (reward, { message, back } = {}) => new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lolo-cele';
    const loggedOutNote = !W.user && W.server ? 'Playing as a guest: make a profile on the hub to keep your gold.' : '';
    el.innerHTML = reward > 0
      ? `<div class="amt">+${reward} ${W.coin(90)}</div><div class="msg">${message || 'Gold earned! Spend it on PLAY HARD.'}</div>
         <div class="sub">You have ${W.gold} gold now. ${loggedOutNote}</div>`
      : `<div class="amt" style="color:#8a8a9a;text-shadow:none">+0</div><div class="msg">${message || 'Get at least half right to earn gold. Try again!'}</div>`;
    const btn = document.createElement('button');
    btn.textContent = back ? 'Back to WORK HARD' : 'Continue';
    btn.onclick = () => { el.remove(); resolve(); if (back) location.href = ROOT + '?tab=work'; };
    el.appendChild(btn);
    document.body.appendChild(el);
    if (reward > 0) {
      W.coinBurst(innerWidth / 2, innerHeight / 2 - 40, Math.min(40, 10 + reward));
      setTimeout(() => W.coinBurst(innerWidth / 2, innerHeight / 2 - 40, 12), 350);
    }
  });

  // finish a lesson: earn, then celebrate
  W.lessonDone = async (lessonId, score, opts = {}) => {
    const reward = await W.earn(lessonId, score);
    await W.celebrate(reward, opts);
    return reward;
  };

  // ---------- game pages: pay per round ----------
  const gamePage = /\/play\/([\w-]+)\/(index\.html)?$/.exec(location.pathname);
  if (gamePage) {
    const id = gamePage[1];
    let gate = null;
    // keys must not reach the game behind the card
    addEventListener('keydown', (e) => { if (gate) e.stopImmediatePropagation(); }, true);
    const showGate = (price) => {
      if (gate) return;
      const game = W.game(id) || { name: 'this game' };
      gate = document.createElement('div');
      gate.className = 'lolo-gate';
      const hint = W.server && !W.user ? '<p style="font-size:15px;opacity:.8">Got a profile? Log in on the hub to use your gold.</p>' : '';
      gate.innerHTML = `<div class="box"><div class="big">🪙</div><h2>NOT ENOUGH GOLD!</h2>
        <p>A round of <b>${game.name}</b> costs <b>${price} gold</b>. You have <b>${W.gold}</b>.</p>
        <p>Finish a lesson on <b>WORK HARD</b> to earn more, then come back and PLAY HARD!</p>${hint}
        <a class="work" href="${ROOT}?tab=work">📚 WORK HARD</a><a class="hub" href="${ROOT}">LOLO HUB</a></div>`;
      document.body.appendChild(gate);
    };
    const pay = async () => {
      const r = await W.spend(id);
      if (!r.ok) { showGate(r.price); return false; }
      if (r.price) toast(`−${r.price} ${W.coin(20)} <span style="color:#fff">· ${W.gold} left</span>`);
      return true;
    };
    const start = () => pay();
    if (document.body) start(); else addEventListener('DOMContentLoaded', start);
    // round breaks: every game calls loloAd(name, done) before its next round
    const orig = window.loloAd;
    if (orig) window.loloAd = (name, done) => { pay().then((ok) => { if (ok) orig(name, done); }); };
  }
})();
