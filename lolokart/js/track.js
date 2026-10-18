// Track engine: turns a track definition (tracks/<folder>/track.js) into
//  - a sampled centerline (every ~2 m) used by physics, AI, lap counting and the minimap
//  - meshes (road, kerbs, shoulders, walls, skirts, pillars, ramps, boost pads, start line)
// Track definition format is documented in tracks/README.md (kept next to the track folders).
'use strict';
(function (LK) {
  const DEF = { width: 16, shoulder: 8, wall: true, bank: 1, skirt: 'ground', pillars: false };

  class Track {
    constructor(def) {
      this.def = def;
      const o = Object.assign({}, DEF, def.defaults || {});
      this.opt = o;
      const ctrl = def.points.map((p) => {
        const e = p[3] || {};
        return {
          v: new THREE.Vector3(p[0], p[2] || 0, p[1]),
          w: e.w != null ? e.w : o.width,
          sh: e.shoulder != null ? e.shoulder : o.shoulder,
          wall: e.wall != null ? e.wall : o.wall,
          bank: e.bank != null ? e.bank : o.bank,
          gap: !!e.gap,
          ramp: !!e.ramp,
        };
      });
      this.ctrl = ctrl;
      const curve = new THREE.CatmullRomCurve3(ctrl.map((c) => c.v), true, 'centripetal');
      this.curve = curve;
      const len = curve.getLength();
      const N = Math.max(60, Math.round(len / 2));
      this.N = N;
      this.length = len;
      this.spacing = len / N;
      const pts = curve.getSpacedPoints(N);
      const nc = ctrl.length;
      const S = (this.s = []);
      for (let i = 0; i < N; i++) {
        const u = i / N;
        const t = curve.getUtoTmapping(u);
        const sf = t * nc;
        const k = Math.floor(sf) % nc, f = sf - Math.floor(sf);
        const a = ctrl[k], b = ctrl[(k + 1) % nc];
        // ramps and gaps keep a straight slope (the spline would round the lip off and kill the launch)
        const y = a.ramp || a.gap ? LK.lerp(a.v.y, b.v.y, f) : pts[i].y;
        S.push({
          i, x: pts[i].x, y, z: pts[i].z,
          hw: LK.lerp(a.w, b.w, f) / 2,
          sh: LK.lerp(a.sh, b.sh, f),
          bankMul: LK.lerp(a.bank, b.bank, f),
          wall: a.wall, gap: a.gap, ramp: a.ramp,
          dist: i * this.spacing,
        });
      }
      // tangents, right vectors, slope, curvature -> auto-bank
      for (let i = 0; i < N; i++) {
        const p = S[(i - 1 + N) % N], n = S[(i + 1) % N], s = S[i];
        let tx = n.x - p.x, tz = n.z - p.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        s.tx = tx; s.tz = tz;
        s.rx = -tz; s.rz = tx; // right-hand side when driving forward
        s.slope = (n.y - p.y) / (2 * this.spacing);
        s.yaw = Math.atan2(tx, tz);
      }
      for (let i = 0; i < N; i++) {
        const a = S[(i - 3 + N) % N], b = S[(i + 3) % N];
        S[i].curv = LK.wrapAngle(b.yaw - a.yaw) / (6 * this.spacing);
      }
      // smooth curvature then bank (outer edge raised). sb = height change per metre of lateral offset
      for (let i = 0; i < N; i++) {
        let c = 0;
        for (let j = -5; j <= 5; j++) c += S[(i + j + N) % N].curv;
        const ang = LK.clamp((c / 11) * 9 * S[i].bankMul, -0.42, 0.42);
        S[i].sb = -Math.tan(ang); // right turn (curv<0) -> left side (lat<0) higher
      }
      // distance to the next gap (metres), used by AI and respawn
      let next = Infinity;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = N - 1; i >= 0; i--) {
          if (S[i].gap) next = 0; else next += this.spacing;
          S[i].toGap = next;
        }
      }
      this.boosts = (def.boosts || []).map((b) => {
        let i0;
        if (b.cp != null) i0 = this.nearestSample(ctrl[b.cp].v) + Math.round((b.shift || 0) / this.spacing);
        else i0 = Math.round((((b.at % 1) + 1) % 1) * N);
        i0 = ((i0 % N) + N) % N;
        const n = Math.max(2, Math.round((b.len || 8) / this.spacing));
        return { i0, n, lane: b.lane || 0, w: b.width || 4.2 };
      });
      this.bounds = this.computeBounds();
    }

    computeBounds() {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const s of this.s) {
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x);
        z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z);
        y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
      }
      return { x0, x1, z0, z1, y0, y1 };
    }

    at(i) { return this.s[((i % this.N) + this.N) % this.N]; }

    nearestSample(v) {
      let best = Infinity, bi = 0;
      for (const s of this.s) {
        const d = (s.x - v.x) ** 2 + (s.y - v.y) ** 2 + (s.z - v.z) ** 2;
        if (d < best) { best = d; bi = s.i; }
      }
      return bi;
    }

    // Closest point on the centerline near sample `hint` (or anywhere when hint < 0).
    // Returns { i, t, lat, cy } where cy is the centerline height there.
    project(x, y, z, hint, out) {
      out = out || {};
      const N = this.N, S = this.s;
      let best = Infinity;
      const from = hint < 0 ? 0 : hint - 8, to = hint < 0 ? N - 1 : hint + 14;
      for (let j = from; j <= to; j++) {
        const a = S[((j % N) + N) % N], b = S[(((j + 1) % N) + N) % N];
        const ex = b.x - a.x, ez = b.z - a.z;
        let t = ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a.x + ex * t, qz = a.z + ez * t;
        const dx = x - qx, dz = z - qz;
        const cy = a.y + (b.y - a.y) * t;
        const dy = y - cy;
        const cost = dx * dx + dz * dz + (dy > 9 || dy < -7 ? 4000 : 0);
        if (cost < best) {
          best = cost;
          out.i = ((j % N) + N) % N;
          out.t = t;
          out.cy = cy;
          const rx = a.rx + (b.rx - a.rx) * t, rz = a.rz + (b.rz - a.rz) * t;
          out.lat = dx * rx + dz * rz;
        }
      }
      return out;
    }

    // Surface height at a projected point, or null when there is no ground (gap / off an open edge).
    groundAt(p) {
      const a = this.s[p.i], b = this.at(p.i + 1);
      if (a.gap) return null;
      const lim = a.hw + a.sh;
      const al = Math.abs(p.lat);
      if (al > lim + (a.wall ? 0.5 : 0)) return null;
      const sb = a.sb + (b.sb - a.sb) * p.t;
      const latC = LK.clamp(p.lat, -a.hw, a.hw); // shoulders stay level with the road edge
      return p.cy + latC * sb;
    }

    // World position on the track: sample i, lateral offset (metres, + = right), on the road surface.
    pointAt(i, lat) {
      const s = this.at(Math.round(i));
      return { x: s.x + s.rx * lat, y: s.y + LK.clamp(lat, -s.hw, s.hw) * s.sb, z: s.z + s.rz * lat, yaw: s.yaw, s };
    }

    // Starting grid: slot 0 is pole position.
    gridSlot(k) {
      const row = Math.floor(k / 2);
      const back = Math.round((5 + row * 7 + (k % 2) * 3) / this.spacing);
      const i = this.N - back;
      const s = this.at(i);
      const lat = (k % 2 ? 1 : -1) * s.hw * 0.42;
      const p = this.pointAt(i, lat);
      return { x: p.x, y: p.y, z: p.z, yaw: s.yaw, idx: ((i % this.N) + this.N) % this.N };
    }

    // ---------------------------------------------------------------- meshes
    buildMeshes(scene) {
      const th = this.def.theme;
      const S = this.s, N = this.N;
      const group = new THREE.Group();
      scene.add(group);
      this.group = group;

      const road = new Ribbons();
      const deco = new Ribbons();
      const kerbA = new THREE.Color(th.kerb[0]), kerbB = new THREE.Color(th.kerb[1]);
      const wallA = new THREE.Color(th.wall[0]), wallB = new THREE.Color(th.wall[1]);
      const shoulderC = new THREE.Color(th.shoulder), skirtC = new THREE.Color(th.skirt), underC = new THREE.Color(th.under || th.skirt);
      const rampA = new THREE.Color(0xffd21a), rampB = new THREE.Color(0x222222);
      const groundY = th.groundY != null ? th.groundY : 0;
      const skirtDepth = this.opt.skirt === 'ground' ? null : this.opt.skirt;
      const KERB = 1.2;

      const P = (s, lat, dy) => {
        const lc = LK.clamp(lat, -s.hw, s.hw);
        return [s.x + s.rx * lat, s.y + lc * s.sb + (dy || 0), s.z + s.rz * lat];
      };
      for (let i = 0; i < N; i++) {
        const a = S[i], b = S[(i + 1) % N];
        if (a.gap) continue;
        const v0 = a.dist / (a.hw * 2), v1 = v0 + this.spacing / (a.hw * 2);
        road.quad(P(a, -a.hw), P(a, a.hw), P(b, b.hw), P(b, -b.hw), null, [0, v0, 1, v0, 1, v1, 0, v1]);
        if (a.ramp) {
          const c = Math.floor(i / 1) % 2 ? rampA : rampB;
          deco.quad(P(a, -a.hw, 0.04), P(a, a.hw, 0.04), P(b, b.hw, 0.04), P(b, -b.hw, 0.04), c);
        }
        for (const side of [-1, 1]) {
          const ea = a.hw * side, eb = b.hw * side;
          const order = side < 0 ? (q0, q1, q2, q3) => [q1, q0, q3, q2] : (q0, q1, q2, q3) => [q0, q1, q2, q3];
          let outA = ea, outB = eb;
          if (a.sh > 0.5) {
            const kc = Math.floor(i / 2) % 2 ? kerbA : kerbB;
            const k = order(P(a, ea, 0.02), P(a, ea + side * KERB, 0.02), P(b, eb + side * KERB, 0.02), P(b, eb, 0.02));
            deco.quad(k[0], k[1], k[2], k[3], kc);
            const s2 = order(P(a, ea + side * KERB, 0.01), P(a, ea + side * a.sh, 0.01), P(b, eb + side * b.sh, 0.01), P(b, eb + side * KERB, 0.01));
            deco.quad(s2[0], s2[1], s2[2], s2[3], shoulderC);
            outA = ea + side * a.sh; outB = eb + side * b.sh;
          }
          const ta = P(a, outA), tb = P(b, outB);
          if (a.wall) {
            const wc = Math.floor(i / 3) % 2 ? wallA : wallB;
            const h = th.wallHeight || 1.1;
            deco.quad(ta, [ta[0], ta[1] + h, ta[2]], [tb[0], tb[1] + h, tb[2]], tb, wc, null, true);
          }
          // skirt down to the ground (or a slab of fixed depth for floating tracks)
          const ba = skirtDepth == null ? groundY - 0.5 : ta[1] - skirtDepth;
          const bb = skirtDepth == null ? groundY - 0.5 : tb[1] - skirtDepth;
          if (ta[1] - ba > 0.2 || tb[1] - bb > 0.2) {
            deco.quad(ta, tb, [tb[0], bb, tb[2]], [ta[0], ba, ta[2]], skirtC, null, true);
          }
        }
        if (skirtDepth != null || a.y > groundY + 1) {
          // underside so you never see through the track from below
          const wa = a.hw + (a.sh > 0.5 ? a.sh : 0), wb = b.hw + (b.sh > 0.5 ? b.sh : 0);
          const d = skirtDepth == null ? null : skirtDepth;
          const yA = (pt) => (d == null ? groundY - 0.4 : pt[1] - d);
          const l0 = P(a, -wa), r0 = P(a, wa), l1 = P(b, -wb), r1 = P(b, wb);
          deco.quad([l0[0], yA(l0), l0[2]], [l1[0], yA(l1), l1[2]], [r1[0], yA(r1), r1[2]], [r0[0], yA(r0), r0[2]], underC);
        }
      }
      // pillars under elevated road
      if (this.opt.pillars) {
        const pc = new THREE.Color(th.pillar || th.skirt);
        const bottom = th.pillarBottom != null ? th.pillarBottom : groundY;
        let last = -99;
        for (let i = 0; i < N; i++) {
          const s = S[i];
          if (s.gap || s.y - bottom < 4 || i - last < Math.round(26 / this.spacing)) continue;
          // no pillar through another part of the track running underneath
          let blocked = false;
          for (let j = 0; j < N && !blocked; j += 2) {
            const o = S[j];
            if (Math.abs(j - i) > 20 && Math.abs(j - i) < N - 20 && o.y < s.y - 1 && (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < (o.hw + 4) ** 2) blocked = true;
          }
          if (blocked) continue;
          last = i;
          const top = s.y - (skirtDepth || 0.5);
          deco.box(s.x, (top + bottom) / 2, s.z, 2.2, top - bottom, 2.2, s.yaw, pc);
        }
      }
      // start line (checkered)
      {
        const s = S[0], b = S[1];
        const cols = 10;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < 2; r++) {
            const l0 = -s.hw + (c / cols) * s.hw * 2, l1 = -s.hw + ((c + 1) / cols) * s.hw * 2;
            const f0 = r * 1.2, f1 = (r + 1) * 1.2;
            const at = (lat, f) => { const p = P(s, lat, 0.05); return [p[0] + s.tx * f, p[1] + s.slope * f, p[2] + s.tz * f]; };
            deco.quad(at(l0, f0), at(l1, f0), at(l1, f1), at(l0, f1), (c + r) % 2 ? new THREE.Color(0x111111) : new THREE.Color(0xffffff));
          }
        }
        void b;
      }

      const roadMat = new THREE.MeshLambertMaterial({ map: roadTexture(th), side: THREE.DoubleSide });
      group.add(road.mesh(roadMat));
      const decoMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      group.add(deco.mesh(decoMat));

      // boost pads: scrolling chevrons, glowing
      const padTex = chevronTexture();
      this.padTex = padTex;
      const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false });
      const pads = new Ribbons();
      for (const bp of this.boosts) {
        for (let k = 0; k < bp.n; k++) {
          const a = this.at(bp.i0 + k), b = this.at(bp.i0 + k + 1);
          const la = bp.lane * a.hw * 0.62, lb = bp.lane * b.hw * 0.62;
          const v0 = k / bp.n * (bp.n * this.spacing / bp.w), v1 = (k + 1) / bp.n * (bp.n * this.spacing / bp.w);
          pads.quad(P(a, la - bp.w / 2, 0.07), P(a, la + bp.w / 2, 0.07), P(b, lb + bp.w / 2, 0.07), P(b, lb - bp.w / 2, 0.07), null, [0, v0, 1, v0, 1, v1, 0, v1]);
        }
      }
      if (this.boosts.length) group.add(pads.mesh(padMat));
      return group;
    }

    // Is the kart (sample i, lateral lat) on a boost pad?
    onBoost(i, lat) {
      for (const b of this.boosts) {
        let d = i - b.i0;
        if (d < 0) d += this.N;
        if (d >= 0 && d <= b.n) {
          const s = this.s[i];
          if (Math.abs(lat - b.lane * s.hw * 0.62) < b.w / 2 + 0.6) return true;
        }
      }
      return false;
    }

    // Top-down drawing for the minimap & track cards. Returns a mapper world->canvas.
    drawMap(g, w, h, opts) {
      opts = opts || {};
      const B = this.bounds, pad = opts.pad || 10;
      const sx = (w - pad * 2) / (B.x1 - B.x0 || 1), sz = (h - pad * 2) / (B.z1 - B.z0 || 1);
      const sc = Math.min(sx, sz);
      const ox = (w - (B.x1 - B.x0) * sc) / 2, oz = (h - (B.z1 - B.z0) * sc) / 2;
      // x mirrored so the map matches the driver's left/right (we look down from above with +z up the screen)
      const map = (x, z) => [w - (ox + (x - B.x0) * sc), h - (oz + (z - B.z0) * sc)];
      const S = this.s;
      g.lineCap = 'round'; g.lineJoin = 'round';
      const pass = (lw, colorFn) => {
        for (let i = 0; i < this.N; i++) {
          const a = S[i], b = this.at(i + 1);
          if (a.gap) continue;
          const p0 = map(a.x, a.z), p1 = map(b.x, b.z);
          g.strokeStyle = colorFn(a);
          g.lineWidth = lw;
          g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        }
      };
      const yr = (B.y1 - B.y0) || 1;
      pass(opts.outline || 7, () => opts.outlineColor || 'rgba(0,0,0,0.75)');
      pass(opts.line || 4, (s) => {
        if (!opts.heightColors) return opts.color || '#fff';
        const f = (s.y - B.y0) / yr;
        return `hsl(${200 - f * 160}, 100%, ${60 + f * 15}%)`;
      });
      const s0 = map(S[0].x, S[0].z);
      g.fillStyle = '#ff2fd6';
      g.beginPath(); g.arc(s0[0], s0[1], opts.start || 4, 0, Math.PI * 2); g.fill();
      return map;
    }
  }

  // Simple triangle-soup builder (positions, vertex colors, uvs).
  class Ribbons {
    constructor() { this.p = []; this.c = []; this.uv = []; }
    quad(a, b, c, d, color, uv) {
      this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
      const col = color || WHITE;
      for (let k = 0; k < 6; k++) this.c.push(col.r, col.g, col.b);
      if (uv) this.uv.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]);
      else for (let k = 0; k < 6; k++) this.uv.push(0, 0);
    }
    box(x, y, z, w, h, d, yaw, color) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const pt = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
      const X = w / 2, Y = h / 2, Z = d / 2;
      const v = [pt(-X, -Y, -Z), pt(X, -Y, -Z), pt(X, Y, -Z), pt(-X, Y, -Z), pt(-X, -Y, Z), pt(X, -Y, Z), pt(X, Y, Z), pt(-X, Y, Z)];
      const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7]];
      for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], color);
    }
    mesh(mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.computeVertexNormals();
      return new THREE.Mesh(g, mat);
    }
  }
  const WHITE = new THREE.Color(1, 1, 1);
  LK.Ribbons = Ribbons;

  function roadTexture(th) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = th.road;
    g.fillRect(0, 0, 256, 256);
    const rnd = LK.rng(7);
    for (let i = 0; i < 2600; i++) {
      const v = rnd() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${0.04 + rnd() * 0.06})`;
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    g.fillStyle = th.roadLine || 'rgba(255,255,255,0.85)';
    g.fillRect(6, 0, 6, 256);
    g.fillRect(244, 0, 6, 256);
    g.fillStyle = th.roadDash || 'rgba(255,255,255,0.55)';
    g.fillRect(125, 0, 6, 80);
    g.fillRect(125, 128, 6, 80);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  function chevronTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,90,0,0.85)';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ffee44';
    g.lineWidth = 9;
    g.lineJoin = 'miter';
    for (const y of [10, 42]) {
      g.beginPath(); g.moveTo(8, y + 18); g.lineTo(32, y); g.lineTo(56, y + 18); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  LK.Track = Track;
  const cache = new Map();
  LK.getTrack = function (id) {
    if (!cache.has(id)) cache.set(id, new Track(LK.tracks.find((t) => t.id === id)));
    return cache.get(id);
  };
})(window.LK);
