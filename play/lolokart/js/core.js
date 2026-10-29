// LoloKart shared namespace + small helpers. Every other script hangs off window.LK.
'use strict';
window.LK = window.LK || {};
(function (LK) {
  LK.SIM_DT = 1 / 60;        // fixed simulation step (same on every machine -> multiplayer friendly)
  LK.LAPS = 3;
  LK.GRAVITY = 34;
  LK.KART_RADIUS = 1.15;

  LK.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  LK.lerp = (a, b, t) => a + (b - a) * t;
  LK.wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  LK.damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt); // frame-rate independent smoothing

  // Small seeded RNG (mulberry32) so a race replays identically from the same seed.
  LK.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  LK.fmtTime = function (t) {
    if (t == null || !isFinite(t)) return '--:--.--';
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };
  LK.ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

  // ---- Track registry. Each tracks/<folder>/track.js calls LK.registerTrack({...}). ----
  LK.tracks = [];
  LK.registerTrack = function (def) { LK.tracks.push(def); LK.tracks.sort((a, b) => a.order - b.order); };

  // Teasers shown as locked cards on the track screen (no folder yet).
  LK.lockedTracks = [
    { name: 'COMET COAST', hint: 'Low gravity. High hopes.', color: '#6a5cff' },
    { name: 'JELLY JUNGLE', hint: 'Bouncy. Very bouncy.', color: '#2fd36a' },
    { name: 'FROSTY PEAKS', hint: 'Ice, ice, kart-y.', color: '#7fd8ff' },
    { name: 'HAUNTED HIGHWAY', hint: 'Do not look behind you.', color: '#9b3cff' },
  ];

  // Tiny localStorage wrapper (best lap / race times). Never throws.
  LK.store = {
    get(k, d) { try { const v = localStorage.getItem('lolokart.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('lolokart.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
})(window.LK);
