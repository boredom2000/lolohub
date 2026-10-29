// Race state machine. Owns kart states, the clock, laps and standings.
// It only consumes per-kart inputs each fixed tick: who produced the input (keyboard, touch, AI, a
// remote player over the network) is decided outside, in controllers.js. That is the multiplayer seam.
'use strict';
(function (LK) {
  class Race {
    // setup: { trackId, laps, seed, entrants: [{ driverId, kind: 'local'|'ai'|'remote', playerId? }] }
    // entrant order = grid order (index 0 = pole).
    constructor(setup) {
      this.setup = setup;
      this.track = LK.getTrack(setup.trackId);
      this.laps = setup.laps || LK.LAPS;
      this.rng = LK.rng(setup.seed || 1);
      this.tick = 0;
      this.time = 0;             // race clock (starts at GO)
      this.countdown = 3.6;      // seconds before GO
      this.phase = 'countdown';  // countdown -> racing -> done
      this.events = [];
      this.karts = setup.entrants.map((e, i) => {
        const d = LK.DRIVERS.find((x) => x.id === e.driverId);
        const k = LK.newKartState(i, d, i);
        k.kind = e.kind;
        k.playerId = e.playerId || null;
        LK.placeKart(k, this.track, this.track.gridSlot(i));
        k.progress = k.idx - this.track.N; // grid sits just behind the line: lap 0 until crossing it
        return k;
      });
    }

    // inputs: array indexed by kart id
    step(inputs) {
      const dt = LK.SIM_DT;
      this.tick++;
      if (this.phase === 'countdown') {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        const after = Math.ceil(this.countdown);
        if (after !== before && after > 0 && after <= 3) this.events.push({ type: 'count', n: after });
        if (this.countdown <= 0) { this.phase = 'racing'; this.events.push({ type: 'go' }); }
        return;
      }
      this.time += dt;
      const N = this.track.N;
      for (const k of this.karts) {
        LK.stepKart(k, inputs[k.id] || NO_INPUT, this.track, dt, this.events);
        const lap = Math.floor(k.progress / N) + 1;
        if (lap > k.maxLap) {
          if (k.maxLap >= 1) k.lapTimes.push(this.time - k.lapStart);
          k.maxLap = lap;
          k.lapStart = this.time;
          if (lap > this.laps && !k.finished) {
            k.finished = true;
            k.finishTime = this.time;
            this.events.push({ type: 'finish', id: k.id, place: this.placeOf(k) });
          } else if (lap > 1) {
            this.events.push({ type: 'lap', id: k.id, lap });
          }
        }
        k.lap = Math.min(Math.max(lap, 1), this.laps);
      }
      LK.collideKarts(this.karts, this.events);
      if (this.karts.every((k) => k.finished)) this.phase = 'done';
    }

    standings() {
      return this.karts.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return b.progress - a.progress;
      });
    }
    placeOf(k) { return this.standings().indexOf(k) + 1; }

    // Final results; karts still racing get a fair estimated time from their average pace.
    results() {
      const N = this.track.N, total = this.laps * N;
      return this.standings().map((k, i) => {
        let t = k.finishTime, est = false;
        if (!k.finished) {
          const done = Math.max(1, k.progress);
          t = this.time + (total - k.progress) * (this.time / done);
          est = true;
        }
        return { place: i + 1, id: k.id, driverId: k.driverId, kind: k.kind, time: t, estimated: est, best: k.lapTimes.length ? Math.min(...k.lapTimes) : null };
      }).sort((a, b) => a.time - b.time).map((r, i) => Object.assign(r, { place: i + 1 }));
    }

    drainEvents() { const e = this.events; this.events = []; return e; }

    // --- networking hooks (unused offline). Snapshot = everything needed to redraw/continue a race.
    snapshot() {
      return {
        tick: this.tick, time: this.time, countdown: this.countdown, phase: this.phase,
        karts: this.karts.map((k) => Object.assign({}, k, { lapTimes: k.lapTimes.slice() })),
      };
    }
    applySnapshot(s) {
      this.tick = s.tick; this.time = s.time; this.countdown = s.countdown; this.phase = s.phase;
      s.karts.forEach((ks, i) => Object.assign(this.karts[i], ks));
    }
  }
  const NO_INPUT = { throttle: 0, brake: 0, steer: 0 };
  LK.NO_INPUT = NO_INPUT;
  LK.Race = Race;
})(window.LK);
