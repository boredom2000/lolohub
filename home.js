// The hub home page: WORK HARD / PLAY HARD halves (from catalog.json), the gold counter and the profile window.
// Gold and profiles themselves are core/wallet.js (LoloWallet).
(function () {
  'use strict';
  const W = window.LoloWallet;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const split = $('split');

  // ---------- which half is open: ?tab=work|play, else the last one this visit ----------
  function setTab(tab, remember = true) {
    split.classList.toggle('work-open', tab === 'work');
    split.classList.toggle('play-open', tab === 'play');
    if (remember) try { sessionStorage.setItem('lolo-tab', tab); } catch (e) { /* fine */ }
  }
  let start = new URLSearchParams(location.search).get('tab');
  try { start = start || sessionStorage.getItem('lolo-tab'); } catch (e) { /* fine */ }
  if (start === 'work' || start === 'play') setTab(start, false);
  if (location.search) history.replaceState(null, '', location.pathname);
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setTab(b.dataset.tab); }));
  // a click anywhere in the narrow half opens it (but not on a link inside the open one)
  ['work', 'play'].forEach((id) => $(id).addEventListener('click', (e) => {
    if (!split.classList.contains(id + '-open') && !e.target.closest('a')) setTab(id);
  }));

  // ---------- decoration ----------
  (function doodles() {
    const box = document.querySelector('.paper-doodles');
    const bits = ['✏️', '📐', '📏', '✒️', '📎', '⭐', '✍️', '🔢', '📚', '🧮', '∑', 'π', 'A+', '÷', '×', '拼'];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('i');
      d.textContent = bits[i % bits.length];
      d.style.left = Math.random() * 95 + '%';
      d.style.top = Math.random() * 95 + '%';
      d.style.fontSize = 1.2 + Math.random() * 2 + 'rem';
      d.style.setProperty('--d', 10 + Math.random() * 12 + 's');
      d.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
      d.style.setProperty('--dy', (Math.random() * 80 - 40) + 'px');
      d.style.setProperty('--r', (Math.random() * 60 - 30) + 'deg');
      d.style.animationDelay = -Math.random() * 10 + 's';
      box.appendChild(d);
    }
    const plane = document.createElement('i');
    plane.className = 'plane';
    plane.textContent = '✈️';
    box.appendChild(plane);
    const stars = document.querySelector('.play-bg .stars');
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i');
      const size = 2 + Math.random() * 4;
      Object.assign(s.style, { left: Math.random() * 100 + '%', top: Math.random() * 100 + '%', width: size + 'px', height: size + 'px',
        animationDelay: (Math.random() * 3).toFixed(2) + 's', animationDuration: (1.5 + Math.random() * 2.5).toFixed(2) + 's' });
      stars.appendChild(s);
    }
  })();

  // ---------- WORK HARD ----------
  function coins(level) {
    let html = '';
    for (let i = 1; i <= 3; i++) html += W.coin(22).replace('class="lolo-coin"', `class="lolo-coin${i > level ? ' dim' : ''}"`);
    return html;
  }
  function renderWork() {
    const cat = W.catalog;
    let fresh = 0;
    $('workList').innerHTML = cat.work.map((sec) => `
      <div class="section">
        <h3>${esc(sec.section)}</h3>
        ${sec.subtitle ? `<div class="sub">${esc(sec.subtitle)}</div>` : ''}
        ${sec.extra ? `<a class="extra" href="${esc(sec.extra.href)}">📖 ${esc(sec.extra.name)}</a>` : ''}
        <div class="lessons">${sec.lessons.map((l, i) => {
          const v = W.lessonValue(l);
          if (v.level === 3) fresh++;
          const stamp = v.done === 0 ? '<span class="stamp fresh">FULL GOLD</span>'
            : v.level === 0 ? '<span class="stamp tired">DONE A LOT</span>' : '';
          return `<a class="lesson" href="${esc(l.href)}" style="--tilt:${((i * 37) % 5) - 2}deg; animation-delay:${i * 0.07}s">
            ${stamp}
            <div class="l-head"><span class="l-emoji">${l.emoji}</span><span class="l-name">${esc(l.name)}</span></div>
            <p>${esc(l.blurb)}</p>
            <div class="l-foot"><span class="pay" title="Gold for finishing it now">${coins(v.level)}<b>+${v.gold}</b></span>
              <span>~${l.minutes} min${v.done ? ` · done ${v.done}× this week` : ''}</span></div>
          </a>`;
        }).join('')}</div>
      </div>`).join('');
    $('workTeaser').innerHTML = fresh
      ? `<span class="big">${fresh}</span> lesson${fresh > 1 ? 's' : ''} still pay${fresh > 1 ? '' : 's'} full gold!<br>Tap to study ✏️`
      : 'Every lesson done this week. Wow! 🏆<br>Tap to keep going';
  }

  // ---------- PLAY HARD ----------
  function renderPlay() {
    const cat = W.catalog;
    $('playList').innerHTML = cat.play.map((g, i) => `
      <article class="game-card${W.gold < g.price ? ' broke' : ''}" style="--c1:${g.colors[0]}; --c2:${g.colors[1]}; animation-delay:${i * 0.07}s">
        <div class="price-tag">${W.coin(20)}${g.price}<small>/round</small></div>
        <a class="card-art" href="play/${g.id}/" tabindex="-1" aria-hidden="true">${g.emoji}</a>
        <h2><a href="play/${g.id}/">${esc(g.name)}</a></h2>
        <div class="round">${esc(g.round)}</div>
        <p>${esc(g.blurb)}</p>
        <div class="card-btns">
          <a class="game-btn" href="play/${g.id}/"><span>PLAY</span></a>
          <a class="info-btn" href="play/${g.id}/about.html">How to play</a>
        </div>
      </article>`).join('');
    const cheapest = Math.min(...cat.play.map((g) => g.price));
    $('playTeaser').innerHTML = (W.gold >= cheapest ? `You have <b style="color:#ffd23f">${W.gold} gold</b>.<br>Tap to play! 🎮` : `Earn gold on WORK HARD,<br>then come play! 🎮`)
      + `<div class="parade">${cat.play.map((g) => `<span>${g.emoji}</span>`).join('')}</div>`;
  }

  // ---------- top bar: gold + me ----------
  document.querySelector('.coin-slot').innerHTML = W.coin(28);
  let shownGold = null;
  function renderTop() {
    const pill = document.querySelector('.gold-pill');
    if (shownGold !== null && W.gold !== shownGold) {
      pill.classList.remove('bump', 'drop'); void pill.offsetWidth;
      pill.classList.add(W.gold > shownGold ? 'bump' : 'drop');
      if (W.gold > shownGold) { const r = pill.getBoundingClientRect(); W.coinBurst(r.left + r.width / 2, r.top + r.height / 2, 14); }
      countTo($('goldAmt'), shownGold, W.gold);
    } else $('goldAmt').textContent = W.gold;
    shownGold = W.gold;
    const a = W.user ? W.avatar(W.user.avatar) : null;
    paintPortrait($('mePortrait'), a);
    $('meName').textContent = W.user ? W.user.name : 'Guest';
  }
  function countTo(el, from, to) {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function paintPortrait(el, a) {
    el.textContent = a ? a.emoji : '👤';
    el.style.setProperty('--a1', a ? a.bg[0] : '#5a4a7a');
    el.style.setProperty('--a2', a ? a.bg[1] : '#2a1a40');
  }

  // ---------- profile window ----------
  const modal = $('profileModal');
  let mode = 'create', chosen = null;
  function avatarButtons(box, current, onPick) {
    box.innerHTML = '';
    W.catalog.avatars.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'portrait' + (a.id === current ? ' on' : '');
      b.title = a.name;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', a.id === current);
      paintPortrait(b, a);
      b.onclick = () => { box.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); onPick(a.id); };
      box.appendChild(b);
    });
  }
  function setMode(m) {
    mode = m;
    $('pmTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('pmAvatars').hidden = m !== 'create';
    $('pmForm').password.autocomplete = m === 'create' ? 'new-password' : 'current-password';
    $('pmNote').textContent = W.gold > 0
      ? `Your ${W.gold} guest gold comes with you!`
      : '';
    $('pmErr').textContent = '';
    $('pmGo').textContent = m === 'create' ? "LET'S GO!" : 'LOG IN';
  }
  function openModal() {
    $('pmTitle').textContent = W.user ? W.user.name : W.server ? 'Your profile' : 'Playing as a guest';
    $('pmTabs').hidden = $('pmForm').hidden = !W.server || !!W.user;
    $('pmMe').hidden = !W.user;
    $('pmNoServer').hidden = W.server;
    if (W.user) {
      paintPortrait($('pmMePortrait'), W.avatar(W.user.avatar));
      $('pmMeName').textContent = W.user.name;
      $('pmMeGold').textContent = `${W.gold} gold`;
      avatarButtons($('pmMeAvatars'), W.user.avatar, async (id) => {
        try { await W.setAvatar(id); paintPortrait($('pmMePortrait'), W.avatar(id)); } catch (e) { W.toast(esc(e.message)); }
      });
    } else if (W.server) {
      chosen = null;
      avatarButtons($('pmAvatars'), null, (id) => { chosen = id; });
      setMode(mode);
    }
    modal.hidden = false;
    const first = modal.querySelector('input:not([hidden])');
    if (first && !$('pmForm').hidden) setTimeout(() => first.focus(), 50);
  }
  const closeModal = () => { modal.hidden = true; };
  $('meBtn').onclick = openModal;
  modal.querySelector('.modal-x').onclick = closeModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  $('pmTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); };
  $('pmForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (mode === 'create' && !chosen) { $('pmErr').textContent = 'Pick an avatar!'; return; }
    $('pmGo').disabled = true;
    try {
      if (mode === 'create') await W.register(f.name.value, f.password.value, chosen);
      else await W.login(f.name.value, f.password.value);
      f.reset();
      closeModal();
      const r = $('mePortrait').getBoundingClientRect();
      W.coinBurst(r.left + r.width / 2, r.top + r.height / 2, 24);
      W.toast(`Welcome, ${esc(W.user.name)}! ${W.avatar(W.user.avatar).emoji}`);
    } catch (err) {
      $('pmErr').textContent = err.message;
    }
    $('pmGo').disabled = false;
  };
  $('pmLogout').onclick = async () => { await W.logout(); closeModal(); W.toast('Logged out. Playing as a guest now.'); };

  // ---------- go ----------
  W.onChange(() => { renderTop(); renderWork(); renderPlay(); });
})();
