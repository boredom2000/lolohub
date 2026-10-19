// SUPER BAKING sound effects: a tiny WebAudio synth, no sound files.
// Sfx.unlock() must run from a user tap before anything is heard.
const Sfx = (() => {
  'use strict';
  let ac = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('lolobake.muted') === '1'; } catch (e) {}
  const VOL = 0.5;

  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.2, f0 = 1200, f1 = 400, delay = 0, q = 1) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(gn); gn.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const arp = (notes, step, type, vol) => notes.forEach((n, i) => tone(n, step * 1.6, type, vol, 0, i * step));

  return {
    unlock,
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('lolobake.muted', m ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = m ? 0 : VOL;
    },
    tap() { tone(700, 0.06, 'triangle', 0.12); },
    pop() { tone(520, 0.09, 'sine', 0.22, 500); },
    boing() { tone(220, 0.22, 'sine', 0.2, 260); },
    tink() { tone(1900, 0.08, 'sine', 0.15); tone(2600, 0.06, 'sine', 0.08, 0, 0.03); },
    whoosh() { noise(0.25, 0.18, 400, 2400, 0, 0.8); },
    crack() { noise(0.08, 0.35, 3000, 1500, 0, 2); tone(900, 0.05, 'square', 0.06); },
    splat() { noise(0.3, 0.3, 900, 150, 0, 0.7); tone(160, 0.2, 'sine', 0.15, -80); },
    squish() { tone(180 + Math.random() * 60, 0.1, 'sine', 0.2, -60); noise(0.08, 0.08, 600, 300); },
    shake(n) { noise(0.06, 0.15, 2500 + (n % 3) * 500, 1800, 0, 3); },
    slice() { noise(0.18, 0.25, 5000, 1200, 0, 1.5); },
    tick() { tone(1200, 0.03, 'square', 0.06); },
    ding() { tone(1568, 0.5, 'sine', 0.2); tone(2093, 0.4, 'sine', 0.1, 0, 0.02); },
    cmd() { arp([523, 659, 784], 0.07, 'square', 0.1); },
    perfect() { arp([784, 988, 1175, 1568], 0.07, 'square', 0.12); },
    good() { arp([659, 784, 988], 0.08, 'triangle', 0.16); },
    ok() { arp([523, 587], 0.1, 'triangle', 0.14); },
    bad() { tone(196, 0.35, 'sawtooth', 0.12, -90); },
    accept() { arp([880, 1320], 0.06, 'sine', 0.18); },
    serve() { arp([1047, 1319, 1568, 2093], 0.06, 'triangle', 0.15); noise(0.15, 0.1, 6000, 4000, 0.2, 2); },
    step() { tone(300 + Math.random() * 80, 0.04, 'sine', 0.05); },
    angry() { tone(300, 0.15, 'sawtooth', 0.12, -120); tone(220, 0.25, 'sawtooth', 0.12, -100, 0.15); },
    over() { arp([523, 440, 349, 262], 0.16, 'triangle', 0.18); },
  };
})();
