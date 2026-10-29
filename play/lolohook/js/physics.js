// Lolo Hook physics: pure functions, no DOM, so the same code runs in the game and in tests.
// World units: y grows downward, the deadly laser floor is at y = FLOOR.
(function (root) {
  'use strict';

  const P = {
    G: 2000,           // gravity
    R: 18,             // player radius
    RANGE: 470,        // max hook distance
    MAX_SPEED: 2300,
    PUMP: 420,         // tangential boost while swinging on a taut rope
    REEL_SPEED: 700,   // rope reels in after it hooks...
    REEL_RATIO: 0.8,   // ...down to this fraction of the hook distance
    MIN_LEN: 90,
    PAD_POWER: 1550,   // upward speed given by a bounce pad
    REST: 0.35,        // bounciness of solid blocks
    FLOOR: 1000,
    GOAL_R: 46,
    DT: 1 / 240,
  };

  // Level definitions use compact arrays; turn them into objects once.
  function mover(a, i) {
    return { mx: a[i] || 0, my: a[i + 1] || 0, sp: a[i + 2] || 1, ph: a[i + 3] || 0 };
  }
  function build(def) {
    return {
      name: def.name,
      width: def.width,
      start: { x: def.start[0], y: def.start[1] },
      goal: { x: def.goal[0], y: def.goal[1] },
      anchors: (def.anchors || []).map((a) => Object.assign({ x: a[0], y: a[1] }, mover(a, 2))),
      blocks: (def.blocks || []).map((b) => ({ x: b[0], y: b[1], w: b[2], h: b[3] })),
      hazards: (def.hazards || []).map((h) => Object.assign({ x: h[0], y: h[1], w: h[2], h: h[3] }, mover(h, 4))),
      pads: (def.pads || []).map((p) => ({ x: p[0], y: p[1], w: p[2], h: 16 })),
    };
  }

  // Current position of a (possibly moving) object at time t, written into out.
  function at(o, t, out) {
    const s = (o.mx || o.my) ? Math.sin(t * o.sp + o.ph) : 0;
    out.x = o.x + o.mx * s;
    out.y = o.y + o.my * s;
    return out;
  }

  function createState(lvl) {
    return {
      x: lvl.start.x, y: lvl.start.y, vx: 0, vy: 0, t: 0,
      hook: -1, len: 0, target: 0, last: -1,
      dead: false, won: false, bounced: false, landed: false,
    };
  }

  const _a = { x: 0, y: 0 };

  // Which anchor a press would grab right now (-1 if none in range).
  function pick(lvl, s) {
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < lvl.anchors.length; i++) {
      const a = at(lvl.anchors[i], s.t, _a);
      const dx = a.x - s.x, dy = a.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > P.RANGE) continue;
      let score = d;
      if (dy > 60) score += 140;                                       // prefer anchors above
      if (i === s.last) score += 260;                                   // and not the one just let go
      if (Math.abs(s.vx) > 200 && Math.sign(dx) !== Math.sign(s.vx)) score += 170; // nor behind us
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  function press(lvl, s) {
    if (s.hook >= 0 || s.dead || s.won) return false;
    const i = pick(lvl, s);
    if (i < 0) return false;
    const a = at(lvl.anchors[i], s.t, _a);
    const d = Math.hypot(a.x - s.x, a.y - s.y);
    s.hook = i;
    s.len = d;
    s.target = Math.min(d, Math.max(P.MIN_LEN, d * P.REEL_RATIO));
    return true;
  }

  function release(s) {
    if (s.hook < 0) return false;
    s.last = s.hook;
    s.hook = -1;
    return true;
  }

  function overlap(s, r, shrink) {
    const cx = Math.max(r.x, Math.min(s.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(s.y, r.y + r.h));
    const rr = P.R - shrink;
    return (s.x - cx) * (s.x - cx) + (s.y - cy) * (s.y - cy) < rr * rr;
  }

  const _h = { x: 0, y: 0, w: 0, h: 0 };

  function step(lvl, s, dt) {
    if (s.dead || s.won) return;
    s.t += dt;
    s.bounced = false;
    s.landed = false;
    s.vy += P.G * dt;

    let reel = 0;
    if (s.hook >= 0) {
      const a = at(lvl.anchors[s.hook], s.t, _a);
      const dx = s.x - a.x, dy = s.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6 && d >= s.len - 2) {
        // pump along the swing direction so swings grow instead of dying out
        const tx = -dy / d, ty = dx / d;
        const dir = (s.vx * tx + s.vy * ty) >= 0 ? 1 : -1;
        s.vx += tx * P.PUMP * dt * dir;
        s.vy += ty * P.PUMP * dt * dir;
      }
      if (s.len > s.target) {
        reel = Math.min(P.REEL_SPEED * dt, s.len - s.target);
        s.len -= reel;
      }
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;

    if (s.hook >= 0) {
      const a = at(lvl.anchors[s.hook], s.t, _a);
      const dx = s.x - a.x, dy = s.y - a.y;
      const d = Math.hypot(dx, dy);
      // already closer than the reel would bring us: the rope just takes up the slack
      if (reel > 0 && d < s.len) s.len = Math.max(s.target, d);
      if (d > 1e-6 && (d > s.len || (reel > 0 && d >= s.len - 1))) {
        const nx = dx / d, ny = dy / d;
        s.x = a.x + nx * s.len;
        s.y = a.y + ny * s.len;
        const vr = s.vx * nx + s.vy * ny;
        const inward = s.len > s.target ? reel / dt : 0; // reel just finished: stop moving inward
        if (reel > 0) {
          // reeling acts like a rod: radial speed is exactly the reel speed (so the ball doesn't
          // overshoot once reeling stops) and the swing speeds up as the rope shortens
          const spin = (s.len + reel) / s.len;
          const vt = (s.vx * -ny + s.vy * nx) * spin;
          s.vx = -nx * inward - ny * vt;
          s.vy = -ny * inward + nx * vt;
        } else if (vr > 0) {
          s.vx -= vr * nx;
          s.vy -= vr * ny;
        }
      }
    }

    // solid blocks
    for (const b of lvl.blocks) {
      const cx = Math.max(b.x, Math.min(s.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(s.y, b.y + b.h));
      let dx = s.x - cx, dy = s.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= P.R * P.R) continue;
      let nx, ny, push;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; push = P.R - d;
      } else {
        // centre inside the block: leave by the closest side
        const l = s.x - b.x, r = b.x + b.w - s.x, t = s.y - b.y, bt = b.y + b.h - s.y;
        const m = Math.min(l, r, t, bt);
        nx = m === l ? -1 : m === r ? 1 : 0;
        ny = m === t ? -1 : m === bt ? 1 : 0;
        if (nx && ny) ny = 0;
        push = m + P.R;
      }
      s.x += nx * push;
      s.y += ny * push;
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) {
        if (vn < -250) s.landed = true;
        s.vx -= (1 + P.REST) * vn * nx;
        s.vy -= (1 + P.REST) * vn * ny;
      }
      if (ny < -0.7) s.vx *= Math.max(0, 1 - 5 * dt); // ground friction
    }

    // bounce pads
    for (const p of lvl.pads) {
      if (s.vy > -300 && overlap(s, p, 0)) {
        s.vy = -P.PAD_POWER;
        s.y = Math.min(s.y, p.y - P.R);
        s.bounced = true;
      }
    }

    // left edge of the world
    if (s.x < P.R) { s.x = P.R; s.vx = Math.abs(s.vx) * 0.4; }

    const sp = Math.hypot(s.vx, s.vy);
    if (sp > P.MAX_SPEED) { s.vx *= P.MAX_SPEED / sp; s.vy *= P.MAX_SPEED / sp; }

    for (const h of lvl.hazards) {
      const p = at(h, s.t, _h);
      _h.w = h.w; _h.h = h.h;
      if (overlap(s, p, 4)) { s.dead = true; return; }
    }
    if (s.y > P.FLOOR) { s.dead = true; return; }
    if (Math.hypot(s.x - lvl.goal.x, s.y - lvl.goal.y) < P.GOAL_R + P.R * 0.5) s.won = true;
  }

  const api = { P, build, at, createState, pick, press, release, step };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoloHookPhys = api;
})(this);
