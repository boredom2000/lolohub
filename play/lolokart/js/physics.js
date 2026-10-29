// Arcade kart physics. Pure data in, pure data out (no THREE objects, no DOM) so the same code can
// run on a future server / host and on every client.
'use strict';
(function (LK) {
  const PROJ = {};

  LK.newKartState = function (id, driver, slot) {
    return {
      id, driverId: driver.id, slot,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0,
      idx: 0, lat: 0, t: 0,
      grounded: true, airTime: 0,
      boostT: 0, offroad: false, wrongWayT: 0, stuckT: 0,
      progress: 0, lap: 0, maxLap: 0, lapStart: 0, lapTimes: [], finished: false, finishTime: null,
      lastSafeIdx: 0, respawnT: 0,
      speedMul: 1,       // AI skill / rubber band (1 for humans)
      fs: 0,             // forward speed, cached for HUD / audio
      bumpT: 0, landT: 0, steerVis: 0,
    };
  };

  LK.placeKart = function (k, track, pose) {
    k.x = pose.x; k.y = pose.y; k.z = pose.z; k.yaw = pose.yaw;
    k.vx = k.vy = k.vz = 0;
    k.idx = pose.idx; k.lastSafeIdx = pose.idx;
    const p = track.project(k.x, k.y, k.z, k.idx, PROJ);
    k.idx = p.i; k.t = p.t; k.lat = p.lat;
  };

  // input: { throttle 0..1, brake 0..1, steer -1..1 (+ = right) }
  LK.stepKart = function (k, input, track, dt, events) {
    const st = LK.driverStats(LK.DRIVERS.find((d) => d.id === k.driverId));
    if (k.bumpT > 0) k.bumpT -= dt;
    if (k.landT > 0) k.landT -= dt;

    if (k.respawnT > 0) {
      k.respawnT -= dt;
      if (k.respawnT <= 0) {
        const s = track.at(k.idx);
        const sp = st.maxSpeed * 0.45;
        k.vx = s.tx * sp; k.vz = s.tz * sp; k.vy = 0;
        k.boostT = 0.6;
      }
      return;
    }

    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const rx = -fz, rz = fx;
    let fs = k.vx * fx + k.vz * fz;
    let ls = k.vx * rx + k.vz * rz;
    const steer = LK.clamp(input.steer || 0, -1, 1);
    const thr = LK.clamp(input.throttle || 0, 0, 1);
    const brk = LK.clamp(input.brake || 0, 0, 1);
    k.steerVis = LK.damp(k.steerVis, steer, 12, dt);

    const s0 = track.s[k.idx];
    const onRoad = Math.abs(k.lat) <= s0.hw + 0.3;
    k.offroad = k.grounded && !onRoad;
    if (k.boostT > 0) k.boostT -= dt;
    const boosting = k.boostT > 0;
    let maxS = st.maxSpeed * k.speedMul * (k.offroad && !boosting ? 0.55 : 1) * (boosting ? 1.38 : 1);

    if (k.grounded) {
      if (thr > 0 && fs < maxS) {
        const r = Math.max(0, fs) / maxS;
        fs += (st.accel * thr * (1 - r * r) + (boosting ? 30 : 0)) * dt;
        if (fs > maxS) fs = maxS;
      }
      if (fs > maxS) fs = Math.max(maxS, fs - 22 * dt);
      if (brk > 0) {
        if (fs > 0.5) fs -= 36 * brk * dt;
        else fs = Math.max(-9, fs - 14 * brk * dt);
      }
      if (thr === 0 && brk === 0) fs -= Math.sign(fs) * Math.min(Math.abs(fs), 5 * dt);
      // gravity along the slope (going up hills costs speed)
      const along = fx * s0.tx + fz * s0.tz;
      fs -= LK.GRAVITY * s0.slope * along * 0.3 * dt;
      // grip: kill sideways sliding. Low handling = more slide.
      const grip = (k.offroad ? 6 : 9) * st.handling;
      ls *= Math.exp(-grip * dt);
      // steering
      const af = Math.abs(fs);
      const turn = steer * 2.35 * st.handling * Math.min(1, af / 5) * (1 - 0.28 * Math.min(1, af / st.maxSpeed));
      k.yaw -= turn * Math.sign(fs || 1) * dt;
    } else {
      k.yaw -= steer * 0.9 * st.handling * dt; // a little air control
      fs -= Math.sign(fs) * Math.min(Math.abs(fs), 1.2 * dt);
    }
    k.yaw = LK.wrapAngle(k.yaw);
    k.vx = fx * fs + rx * ls;
    k.vz = fz * fs + rz * ls;
    k.fs = fs;

    const px = k.x, pz = k.z, py = k.y;
    k.x += k.vx * dt;
    k.z += k.vz * dt;

    // --- vertical: follow ground, or fly
    let p = track.project(k.x, k.y, k.z, k.idx, PROJ);
    let g = track.groundAt(p);
    const vyN = k.vy - LK.GRAVITY * dt;
    const yb = k.y + vyN * dt;
    if (k.grounded) {
      if (g == null || yb > g + 0.03) {
        k.grounded = false; k.y = yb; k.vy = vyN; k.airTime = 0;
      } else {
        k.vy = LK.clamp((g - k.y) / dt, -25, 22);
        k.y = g;
      }
    } else {
      k.airTime += dt;
      k.vy = vyN; k.y = yb;
      if (g != null && k.y <= g && py >= g - 2.5) {
        if (k.vy < -9) { k.landT = 0.25; events.push({ type: 'land', id: k.id, power: -k.vy }); }
        k.y = g; k.vy = 0; k.grounded = true;
      }
    }

    // --- walls
    const s = track.s[p.i];
    if (s.wall && !s.gap) {
      const lim = s.hw + s.sh - LK.KART_RADIUS * 0.8;
      if (Math.abs(p.lat) > lim && k.y < p.cy + 3) {
        const sg = Math.sign(p.lat), over = Math.abs(p.lat) - lim;
        k.x -= s.rx * over * sg; k.z -= s.rz * over * sg;
        const vr = k.vx * s.rx + k.vz * s.rz;
        if (vr * sg > 0) {
          k.vx -= s.rx * vr * 1.35; k.vz -= s.rz * vr * 1.35;
          if (Math.abs(vr) > 5) events.push({ type: 'wall', id: k.id, power: Math.abs(vr) });
          k.vx *= 0.97; k.vz *= 0.97;
        }
        p = track.project(k.x, k.y, k.z, p.i, PROJ);
      }
    }

    // --- progress (in samples, unwrapped)
    const N = track.N;
    const before = k.idx + k.t;
    let d = (p.i + p.t) - before;
    if (d > N / 2) d -= N; else if (d < -N / 2) d += N;
    k.progress += d;
    k.idx = p.i; k.t = p.t; k.lat = p.lat;

    if (k.grounded && Math.abs(p.lat) <= s.hw && !s.gap) k.lastSafeIdx = p.i;
    if (k.grounded && track.onBoost(p.i, p.lat)) {
      if (k.boostT < 0.2) events.push({ type: 'boost', id: k.id });
      k.boostT = Math.max(k.boostT, 1.25);
    }

    // wrong way / stuck bookkeeping
    const fwd = Math.sin(k.yaw) * s.tx + Math.cos(k.yaw) * s.tz;
    k.wrongWayT = fwd < -0.35 && Math.abs(fs) > 2 ? k.wrongWayT + dt : 0;
    const moved = Math.hypot(k.x - px, k.z - pz) / dt;
    k.stuckT = moved < 1.5 ? k.stuckT + dt : 0;

    // fell off the world
    const killY = track.def.theme.killY != null ? track.def.theme.killY : -40;
    if (!k.grounded && (k.y < p.cy - 18 || k.y < killY)) LK.respawnKart(k, track, events);
  };

  LK.respawnKart = function (k, track, events) {
    let i = k.lastSafeIdx;
    // step back until the next 60 m are free of gaps, so you get a run-up
    for (let n = 0; n < 80 && track.at(i).toGap < 60; n++) i = (i - 1 + track.N) % track.N;
    const s = track.at(i);
    const before = k.idx + k.t;
    let d = i - before;
    if (d > track.N / 2) d -= track.N; else if (d < -track.N / 2) d += track.N;
    k.progress += d;
    k.idx = i; k.t = 0; k.lat = 0;
    k.x = s.x; k.z = s.z; k.y = s.y; k.yaw = s.yaw;
    k.vx = k.vy = k.vz = 0; k.fs = 0;
    k.grounded = true; k.respawnT = 1.1; k.boostT = 0; k.stuckT = 0; k.wrongWayT = 0;
    k.lastSafeIdx = i;
    events.push({ type: 'respawn', id: k.id });
  };

  // Kart vs kart bumping. Heavier karts shove lighter ones.
  LK.collideKarts = function (karts, events) {
    const R2 = LK.KART_RADIUS * 2;
    for (let a = 0; a < karts.length; a++) {
      const A = karts[a];
      if (A.respawnT > 0) continue;
      const mA = LK.driverStats(LK.DRIVERS.find((d) => d.id === A.driverId)).weight;
      for (let b = a + 1; b < karts.length; b++) {
        const B = karts[b];
        if (B.respawnT > 0 || Math.abs(A.y - B.y) > 1.6) continue;
        let nx = B.x - A.x, nz = B.z - A.z;
        const dd = nx * nx + nz * nz;
        if (dd >= R2 * R2 || dd < 1e-6) continue;
        const dist = Math.sqrt(dd);
        nx /= dist; nz /= dist;
        const mB = LK.driverStats(LK.DRIVERS.find((d) => d.id === B.driverId)).weight;
        const over = R2 - dist, wA = mB / (mA + mB), wB = mA / (mA + mB);
        A.x -= nx * over * wA; A.z -= nz * over * wA;
        B.x += nx * over * wB; B.z += nz * over * wB;
        const vrel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (vrel < 0) {
          const j = (-(1 + 0.9) * vrel) / (1 / mA + 1 / mB) + 2.5; // extra kick so bumps feel punchy
          A.vx -= (j / mA) * nx; A.vz -= (j / mA) * nz;
          B.vx += (j / mB) * nx; B.vz += (j / mB) * nz;
          A.bumpT = B.bumpT = 0.3;
          if (-vrel > 1.5) events.push({ type: 'bump', a: A.id, b: B.id, power: -vrel });
        }
      }
    }
  };
})(window.LK);
