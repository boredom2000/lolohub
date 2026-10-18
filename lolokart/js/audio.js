// Tiny synthesized sound: engine hum for the player, plus blips for countdown, bumps, boosts, laps.
'use strict';
(function (LK) {
  let ac = null, master = null, eng = null;
  const Sfx = {
    muted: LK.store.get('muted', false),
    unlock() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = ac.createGain();
      master.gain.value = this.muted ? 0 : 0.5;
      master.connect(ac.destination);
    },
    setMuted(m) { this.muted = m; LK.store.set('muted', m); if (master) master.gain.value = m ? 0 : 0.5; },
    tone(freq, dur, type, vol, slide) {
      if (!ac) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq) {
      if (!ac) return;
      const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq || 800; g.gain.value = vol || 0.3;
      s.connect(f); f.connect(g); g.connect(master); s.start();
    },
    count() { this.tone(440, 0.25, 'square', 0.18); },
    go() { this.tone(880, 0.5, 'square', 0.2); this.tone(1320, 0.5, 'triangle', 0.12); },
    bump(p) { this.noise(0.18, Math.min(0.5, 0.1 + p * 0.03), 500); this.tone(120, 0.15, 'triangle', 0.2, 60); },
    wall() { this.noise(0.12, 0.2, 1200); },
    boost() { this.tone(300, 0.5, 'sawtooth', 0.12, 900); this.noise(0.4, 0.15, 3000); },
    land() { this.noise(0.15, 0.25, 300); },
    lap() { [660, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'square', 0.15), i * 120)); },
    finish() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'square', 0.15), i * 140)); },
    respawn() { this.tone(900, 0.4, 'sine', 0.15, 300); },
    click() { this.tone(700, 0.06, 'square', 0.08); },
    engine(speed, max, throttle, on) {
      if (!ac) return;
      if (!eng) {
        const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'sawtooth'; o2.type = 'square';
        f.type = 'lowpass'; f.frequency.value = 700;
        g.gain.value = 0;
        o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        o.start(); o2.start();
        eng = { o, o2, g, f };
      }
      const r = Math.min(1.4, Math.abs(speed) / max);
      const t = ac.currentTime;
      eng.o.frequency.setTargetAtTime(55 + r * 120, t, 0.05);
      eng.o2.frequency.setTargetAtTime(27 + r * 60, t, 0.05);
      eng.f.frequency.setTargetAtTime(400 + r * 900 + throttle * 300, t, 0.05);
      eng.g.gain.setTargetAtTime(on ? 0.05 + throttle * 0.05 + r * 0.04 : 0, t, 0.08);
    },
  };
  LK.Sfx = Sfx;
})(window.LK);
