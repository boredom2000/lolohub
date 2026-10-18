// CLOUD COASTER - a floating roller coaster: big climb, gap jump, corkscrew spiral down, rail-free section.
'use strict';
(function () {
  // spiral (helix) going down one full turn around (cx, cz)
  const helix = [];
  const cx = -80, cz = 80, r = 42;
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 - (k * Math.PI) / 3;
    helix.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, 44 - k * 5.8, { w: 15 }]);
  }

  LK.registerTrack({
    id: 'cloud-coaster',
    order: 3,
    name: 'CLOUD COASTER',
    blurb: 'Way up high. Do not fall off. Seriously.',
    difficulty: 3,
    seed: 33,
    theme: {
      sky: [0x2a3cff, 0x9ad8ff, 0xffffff],
      fog: 0xc8ecff, fogNear: 220, fogFar: 800,
      ground: null,
      road: '#3a3a6a',
      roadLine: 'rgba(25,247,255,0.95)',
      roadDash: 'rgba(255,255,255,0.6)',
      shoulder: 0xffffff,
      kerb: [0x19f7ff, 0xffffff],
      wall: [0x19f7ff, 0xff2fd6],
      wallHeight: 1.0,
      skirt: 0xd8e8ff, under: 0xa8b8e0,
      pillar: 0xffffff, pillarBottom: -28,
      gate: 0x19f7ff,
      killY: -20,
    },
    defaults: { width: 16, shoulder: 0, wall: true, bank: 1.2, skirt: 1.6, pillars: true },
    points: [
      [0, -110, 20], [70, -110, 20], [120, -95, 24], [145, -50, 32], [140, 0, 40],
      [110, 35, 46], [65, 52, 50],
      [32, 52, 48.5, { ramp: true }],
      [6, 52, 54, { gap: true }],       // launch
      [-12, 50, 47],                    // landing island
      ...helix,                         // spiral down
      [-125, 25, 8, { wall: false }],   // no rails here!
      [-150, -25, 7, { wall: false, w: 14 }],
      [-132, -80, 11],
      [-82, -110, 16], [-40, -110, 19],
    ],
    boosts: [
      { cp: 7, shift: -6, lane: 0, len: 9 },
      { cp: 3, shift: 0, lane: 0.3, len: 8 },
      { cp: 18, shift: 0, lane: 0, len: 8 },
    ],
    scenery(ctx) {
      const { THREE, rand } = ctx;
      // sea of clouds below
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), ctx.lambert(0xffffff, 0x8899bb));
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = -30;
      ctx.add(sea);
      for (let i = 0; i < 70; i++) {
        const a = rand(0, Math.PI * 2), d = rand(60, 600);
        ctx.cloud(Math.cos(a) * d, rand(-34, -22), Math.sin(a) * d, rand(6, 14));
      }
      for (let i = 0; i < 24; i++) {
        let x = rand(-400, 400), z = rand(-400, 400);
        if (!ctx.free(x, z, 30)) continue;
        const c = ctx.cloud(x, rand(25, 90), z, rand(3, 7));
        const y0 = c.position.y;
        ctx.onTick((t) => { c.position.y = y0 + Math.sin(t * 0.3 + i) * 2; });
      }
      // floating islands with little trees
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const x = Math.cos(a) * rand(230, 330), z = Math.sin(a) * rand(230, 330), y = rand(0, 50);
        const isl = new THREE.Mesh(new THREE.ConeGeometry(rand(18, 30), rand(25, 40), 7), ctx.lambert(0x8a6a4a));
        isl.rotation.x = Math.PI;
        isl.position.set(x, y - 12, z);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(isl.geometry.parameters.radius, isl.geometry.parameters.radius, 2, 7), ctx.toon(0x5fd34a));
        top.position.set(x, y + 1, z);
        ctx.add(isl); ctx.add(top);
        const tr = [];
        for (let k = 0; k < 5; k++) tr.push({ x: x + rand(-10, 10), y: y + 1.5, z: z + rand(-10, 10), s: rand(0.8, 1.4) });
        ctx.trees(tr, 'round');
      }
      // spinning star rings over the jump
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.6, 8, 32), ctx.toon(0xffe81a, 0x664400));
        ring.position.set(18 - k * 12, 62, 52);
        ring.rotation.y = Math.PI / 2;
        ctx.add(ring);
        ctx.onTick((t) => { ring.rotation.x = t * (0.6 + k * 0.3); });
      }
      ctx.sign('NO RAILS!', -118, 18, 40, Math.PI * 0.35, 14, 4, '#ff2fd6', '#ffe81a');
    },
  });
})();
