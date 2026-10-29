// Shared Google AdSense loader for the hub pages and every game (games load it as ../../core/ads.js).
// On the home server it also reports game opens and rounds to the dashboard (see count() below).
// Ads stay OFF while ADSENSE_CLIENT is the placeholder, so nothing is loaded from Google yet.
// To turn ads on (needs a custom domain, see CLAUDE.md):
//   1. put your real publisher ID here and in /ads.txt
//   2. keep ADSENSE_TEST = true until AdSense approves the site, then set it to false
//   3. for display ads on the text pages, put your ad unit IDs in the data-slot of each .ad-slot
// The site is child-directed: ads are requested as non-personalized, and the site must also be
// marked as directed at children in the AdSense account settings.
(function () {
  var ADSENSE_CLIENT = 'ca-pub-XXXXXXXXXXXXXXXX';
  var ADSENSE_TEST = true;

  window.adsReady = false; // true once adsbygoogle.js has loaded

  // loloAd(name, done): show an interstitial ad break (H5 Games Ads) if one is available, then call
  // done() exactly once. Without ads (placeholder ID, blocked, offline) done() runs right away.
  // on the local server (plain http) tell its dashboard when a game is opened and each round break;
  // GitHub Pages is https, so nothing is sent there
  var gamePage = /\/play\/([\w-]+)\/(index\.html)?$/.exec(location.pathname);
  function count(kind) {
    if (!gamePage || location.protocol !== 'http:' || !navigator.sendBeacon) return;
    try { navigator.sendBeacon('/_api/' + kind + '?game=' + encodeURIComponent(gamePage[1])); } catch (e) {}
  }
  count('play');

  window.loloAd = function (name, done) {
    count('round');
    if (!window.adsReady || typeof window.adBreak !== 'function') return done();
    var called = false, showing = false;
    var finish = function () { if (called) return; called = true; clearTimeout(fallback); done(); };
    var fallback = setTimeout(function () { if (!showing) finish(); }, 3000); // no answer: carry on
    try {
      window.adBreak({
        type: 'next',
        name: name,
        beforeAd: function () { showing = true; },
        afterAd: function () { showing = false; },
        adBreakDone: finish,
      });
    } catch (e) { finish(); }
  };

  if (!/^ca-pub-\d{16}$/.test(ADSENSE_CLIENT)) return;

  window.adsbygoogle = window.adsbygoogle || [];
  adsbygoogle.requestNonPersonalizedAds = 1; // kids site: never personalized
  window.adBreak = window.adConfig = function (o) { adsbygoogle.push(o); };
  var s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_CLIENT;
  if (ADSENSE_TEST) s.setAttribute('data-adbreak-test', 'on');
  s.onload = function () { window.adsReady = true; };
  s.onerror = function () { window.adsReady = false; }; // blocked or offline
  document.head.appendChild(s);
  adConfig({ preloadAdBreaks: 'on', sound: 'off' });

  // display ad units on the text pages: <div class="ad-slot" data-slot="1234567890"></div>
  function fillSlots() {
    var slots = document.querySelectorAll('.ad-slot');
    for (var i = 0; i < slots.length; i++) {
      var id = slots[i].getAttribute('data-slot');
      if (!/^\d+$/.test(id || '')) continue;
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
      ins.setAttribute('data-ad-slot', id);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      if (ADSENSE_TEST) ins.setAttribute('data-adtest', 'on');
      slots[i].appendChild(ins);
      slots[i].classList.add('on');
      adsbygoogle.push({});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fillSlots);
  else fillSlots();
})();
