// VOLCANO VAULT - a figure-8 over a lava lake: high bridge crossing, two lava jumps, banked lobes.
'use strict';
(function () {
  // Figure-8 (lemniscate) generated from a formula, then features stamped on by angle.
  const A = 185, COUNT = 56, T0 = Math.PI * 1.5 + 0.35; // start just after the low crossing
  const pts = [];
  for (let k = 0; k < COUNT; k++) {
    const t = T0 + (k / COUNT) * Math.PI * 2;
    const d = 1 + Math.sin(t) ** 2;
    const x = (A * Math.cos(t)) / d, z = (A * Math.sin(t) * Math.cos(t)) / d * 1.25;
    const h = 11 + 10 * Math.sin(t); // 21 m at the high crossing, 1 m at the low one
    pts.push([x, z, h, {}, t]);
  }
  const near = (ang) => {
    let best = 0, bd = 9;
    pts.forEach((p, i) => { const d = Math.abs(Math.atan2(Math.sin(p[4] - ang), Math.cos(p[4] - ang))); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  function jump(ang, lift, drop) {
    const i = near(ang);
    pts[i - 1][3].ramp = true;
    pts[i][2] += lift; pts[i][3].gap = true; pts[i][3].wall = false;
    pts[i + 1][2] -= drop;
  }
  jump(Math.PI * 0.5 + 0.55, 5, 3);   // after the bridge, flying down into the left lobe
  jump(Math.PI * 1.5 - 0.62, 4.5, 0); // over the lava just before the low crossing
  const JUMP1 = near(Math.PI * 0.5 + 0.55), JUMP2 = near(Math.PI * 1.5 - 0.62);

  LK.registerTrack({
    id: 'volcano-vault',
    order: 4,
    name: 'VOLCANO VAULT',
    blurb: 'Figure-8 over lava. Two jumps. Zero mercy.',
    difficulty: 3,
    seed: 44,
    theme: {
      sky: [0x1a0010, 0xff5a1a, 0x3a0a00],
      fog: 0x5a1408, fogNear: 140, fogFar: 600,
      ground: 0xff4a00, groundEmissive: 0xcc2200, groundY: -2,
      road: '#2a2228',
      roadLine: 'rgba(255,140,0,0.95)',
      roadDash: 'rgba(255,220,120,0.6)',
      shoulder: 0x3a2a26,
      kerb: [0xff7a1a, 0x111111],
      wall: [0x111111, 0xff7a1a],
      skirt: 0x2a1a18, under: 0x1a1010,
      pillar: 0x2a1a18, pillarBottom: -2,
      gate: 0xff7a1a, gateBanner: '#220000',
      hemi: [0xffaa66, 0xff3300], hemiIntensity: 0.8, sun: 0xffc080, sunIntensity: 0.7,
      killY: -8,
    },
    defaults: { width: 16, shoulder: 3, wall: true, bank: 1.3, pillars: true },
    points: pts.map((p) => p.slice(0, 4)),
    boosts: [
      { cp: JUMP1 - 1, shift: -6, lane: 0, len: 9 },
      { cp: JUMP2 - 1, shift: -6, lane: 0, len: 9 },
      { cp: 14, shift: 0, lane: 0.4, len: 8 },
      { cp: 42, shift: 0, lane: -0.4, len: 8 },
    ],
    scenery(ctx) {
      const { THREE, rand } = ctx;
      // two volcanoes inside the lobes, puffing smoke
      for (const sx of [-1, 1]) {
        const x = sx * 112;
        const v = new THREE.Mesh(new THREE.CylinderGeometry(9, 34, 34, 9, 1, true), ctx.lambert(0x3a2420));
        v.position.set(x, 15, 0);
        ctx.add(v);
        const glow = new THREE.Mesh(new THREE.CircleGeometry(9, 12), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(x, 31, 0);
        ctx.add(glow);
        const puffs = [];
        for (let i = 0; i < 8; i++) {
          const p = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), ctx.toon(0x555555));
          ctx.add(p); puffs.push(p);
        }
        ctx.onTick((t) => puffs.forEach((p, i) => {
          const f = (t * 0.25 + i / puffs.length) % 1;
          p.position.set(x + Math.sin(i * 3 + t * 0.2) * 4 * f, 33 + f * 45, Math.cos(i * 2) * 4 * f);
          p.scale.setScalar(0.6 + f * 2.6);
        }));
      }
      // jagged rocks around the lake
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2), d = rand(260, 520);
        ctx.mountain(Math.cos(a) * d, Math.sin(a) * d, rand(20, 60), rand(30, 140), [0x2a1a18, 0x3a2420, 0x1a1010][i % 3], -2);
      }
      ctx.scatter(40, 30, 240, 6, (x, z) => ctx.mountain(x, z, rand(2, 6), rand(4, 12), 0x2a1a18, -2));
      // lava bubbles
      const bubbles = [];
      for (let i = 0; i < 30; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd040 }));
        let x, z, n = 0;
        do { x = rand(-220, 220); z = rand(-120, 120); } while (!ctx.free(x, z, 3) && n++ < 20);
        b.position.set(x, -2, z);
        ctx.add(b); bubbles.push({ b, ph: rand(0, 6) });
      }
      ctx.onTick((t) => bubbles.forEach(({ b, ph }) => {
        const f = (t * 0.5 + ph) % 3;
        b.position.y = -2.2 + (f < 1 ? Math.sin(f * Math.PI) * 1.2 : -2);
      }));
      ctx.sign('HOT!', -40, 30, 0, Math.PI / 2, 12, 4, '#ff7a1a', '#220000');
    },
  });
})();
