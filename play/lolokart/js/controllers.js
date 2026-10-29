// Controllers turn "something" into a kart input { throttle, brake, steer } once per sim tick.
//   LocalController  - this device's keyboard / touch (LK.Input)
//   AIController     - computer driver
//   RemoteController - latest input received from LK.Net for a remote human (future multiplayer)
'use strict';
(function (LK) {
  class LocalController {
    constructor(input) { this.input = input; }
    read() { return this.input.read(); }
  }

  class RemoteController {
    constructor(playerId) { this.playerId = playerId; this.last = Object.assign({}, LK.NO_INPUT); }
    push(input) { this.last = input; }      // called by LK.Net when a packet arrives
    read() { return this.last; }
  }

  class AIController {
    constructor(race, kart, skill) {
      this.race = race; this.k = kart;
      this.skill = skill;               // 0.9 .. 1.0 share of the class top speed
      this.seed = race.rng() * 100;
      this.lane = 0;
      this.reverseT = 0;
      this.out = { throttle: 0, brake: 0, steer: 0 };
    }

    read() {
      const r = this.race, k = this.k, tr = r.track, o = this.out;
      if (r.phase !== 'racing') { o.throttle = 0; o.brake = 0; o.steer = 0; return o; }
      const dt = LK.SIM_DT;
      // rubber band against the best human so races stay close
      const humans = r.karts.filter((x) => x.kind !== 'ai');
      let band = 0;
      if (humans.length && !k.finished) {
        const lead = Math.max(...humans.map((h) => h.progress));
        const gap = (k.progress - lead) * tr.spacing; // metres ahead of the human (+) or behind (-)
        band = LK.clamp(-gap / 900, -0.07, 0.07);
      }
      k.speedMul = this.skill + band;

      if (k.respawnT > 0) { o.throttle = 1; o.brake = 0; o.steer = 0; return o; }

      // stuck against something: back up a little
      if (this.reverseT > 0) {
        this.reverseT -= dt;
        o.throttle = 0; o.brake = 1; o.steer = -Math.sign(k.lat || 1);
        return o;
      }
      if (k.stuckT > 1.2 && r.time > 3) { this.reverseT = 0.8; k.stuckT = 0; }
      if (k.wrongWayT > 2.5 || k.stuckT > 4) { LK.respawnKart(k, tr, r.events); return o; }

      const fs = Math.max(0, k.fs);
      const s = tr.s[k.idx];
      // choose a lane: wander a bit, centre up near jumps, hunt boost pads
      let want = Math.sin(r.time * 0.23 + this.seed) * 0.55;
      if (s.toGap < 90) want = 0;
      for (const b of tr.boosts) {
        let d = b.i0 - k.idx; if (d < 0) d += tr.N;
        if (d * tr.spacing < 60) want = b.lane * 0.62;
      }
      // dodge the kart right in front
      for (const o2 of r.karts) {
        if (o2 === k) continue;
        let d = o2.progress - k.progress;
        if (d > 0 && d * tr.spacing < 9 && Math.abs(o2.lat - k.lat) < 2.4) want += (o2.lat > k.lat ? -0.6 : 0.6);
      }
      this.lane = LK.damp(this.lane, LK.clamp(want, -0.8, 0.8), 1.5, dt);

      const ahead = Math.round((7 + fs * 0.5) / tr.spacing);
      const t = tr.at(k.idx + ahead);
      const lat = this.lane * t.hw;
      const tx = t.x + t.rx * lat, tz = t.z + t.rz * lat;
      const desired = Math.atan2(tx - k.x, tz - k.z);
      const diff = LK.wrapAngle(desired - k.yaw);
      o.steer = LK.clamp(-diff * 2.6, -1, 1);

      // slow for tight corners coming up
      const far = tr.at(k.idx + Math.round((14 + fs * 0.9) / tr.spacing));
      const bend = Math.abs(LK.wrapAngle(far.yaw - s.yaw));
      const st = LK.driverStats(LK.DRIVERS.find((d) => d.id === k.driverId));
      const cornerSpeed = st.maxSpeed * LK.clamp(1.25 - bend * 0.55 / Math.sqrt(st.handling), 0.45, 1);
      o.throttle = 1; o.brake = 0;
      if (fs > cornerSpeed + 2) { o.throttle = 0; if (fs > cornerSpeed + 6) o.brake = 0.6; }
      if (Math.abs(diff) > 1.1 && fs > 12) { o.throttle = 0; o.brake = 0.5; }
      return o;
    }
  }

  LK.LocalController = LocalController;
  LK.RemoteController = RemoteController;
  LK.AIController = AIController;
})(window.LK);
