// Lolo Exam Prep: offline support shared by every exam page. Registers exam/sw.js (scope exam/) so the
// pages, the lesson kit, the wallet and the catalog are saved on the device; the exam home page calls
// LoloExam.save() from its "SAVE FOR OFFLINE" button. Service workers need https or localhost.
(function () {
  'use strict';
  var base = new URL('.', document.currentScript.src).href; // .../exam/
  var X = window.LoloExam = { supported: 'serviceWorker' in navigator, base: base };
  function remembered() { try { return localStorage.getItem('lolo-exam-offline') === '1'; } catch (e) { return false; } }
  X.saved = remembered;
  X.save = function () {
    if (!X.supported) return Promise.resolve({ ok: false });
    return navigator.serviceWorker.register(base + 'sw.js', { scope: base })
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) {
        return new Promise(function (resolve) {
          var ch = new MessageChannel();
          ch.port1.onmessage = function (e) { resolve(e.data || {}); };
          (reg.active || reg.waiting || reg.installing).postMessage('sync', [ch.port2]);
        });
      })
      .then(function (r) { if (r.ok) { try { localStorage.setItem('lolo-exam-offline', '1'); } catch (e) { /* private mode */ } } return r; },
        function () { return { ok: false }; });
  };
  // saved once already: keep the copy fresh in the background
  if (X.supported && remembered()) addEventListener('load', function () { X.save(); });
})();
