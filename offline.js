// "PLAY OFFLINE" button: saves the hub and every game on the device (see sw.js)
// and offers to install the hub as an app on the home screen.
(function () {
  var btn = document.querySelector('.offline-btn');
  var tip = document.querySelector('.offline-tip');
  // service workers only exist on https:// (or localhost), so the button stays hidden on plain http
  if (!btn || !('serviceWorker' in navigator)) return;

  var standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var installPrompt = null;
  var state = 'idle'; // idle | saving | saved | failed

  function remembered() { try { return localStorage.getItem('lolo-offline') === '1'; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem('lolo-offline', '1'); } catch (e) {} }

  function render() {
    // the installed app saves itself quietly; no button needed there
    btn.hidden = standalone;
    btn.disabled = state === 'saving';
    var label =
      state === 'saving' ? 'SAVING…' :
      state === 'failed' ? '⚠ TRY AGAIN' :
      state === 'saved' && installPrompt ? '📲 INSTALL APP' :
      state === 'saved' ? '✔ READY OFFLINE' :
      '⬇ PLAY OFFLINE';
    btn.querySelector('span').textContent = label;
  }

  function save() {
    state = 'saving';
    render();
    return navigator.serviceWorker.ready.then(function (reg) {
      return new Promise(function (resolve) {
        var ch = new MessageChannel();
        ch.port1.onmessage = function (e) { resolve(e.data || {}); };
        reg.active.postMessage('sync', [ch.port2]);
      });
    }).then(function (r) {
      state = r.ok ? 'saved' : 'failed';
      if (r.ok) remember();
      render();
    }, function () { state = 'failed'; render(); });
  }

  btn.addEventListener('click', function () {
    // the install prompt must open right inside the tap, before the (slower) save finishes
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then(function () { installPrompt = null; render(); });
    } else if (ios && !standalone) {
      tip.hidden = false;
    }
    if (state !== 'saved') save();
  });
  tip.querySelector('button').addEventListener('click', function () { tip.hidden = true; });

  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installPrompt = e; render(); });
  addEventListener('appinstalled', function () { installPrompt = null; render(); });

  navigator.serviceWorker.register('sw.js').then(function () {
    // already saved once (or running as the installed app): refresh the copy if the games changed
    if (standalone || remembered()) save();
  });
  render();
})();
