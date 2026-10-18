// CANDY CANYON - rolling sugar hills, a banked plunge and a jump over a chocolate river.
'use strict';
LK.registerTrack({
  id: 'candy-canyon',
  order: 2,
  name: 'CANDY CANYON',
  blurb: 'Sugar hills, hops and one sweet jump.',
  difficulty: 2,
  seed: 22,
  theme: {
    sky: [0xff7ad8, 0xffd6f2, 0xffb8e0],
    fog: 0xffd0ee, fogNear: 200, fogFar: 700,
    ground: 0xffb0d8, groundY: -1,
    road: '#6b5a8a',
    roadLine: 'rgba(255,240,120,0.9)',
    shoulder: 0xfff0f8,
    kerb: [0xff2f6a, 0xffffff],
    wall: [0x2fd3ff, 0xffffff],
    skirt: 0xc8742a,          // cake sponge sides
    under: 0x8a4a1a,
    gate: 0xffd21a,
    hemi: [0xffffff, 0xff88cc],
    killY: -14,
  },
  defaults: { width: 16, shoulder: 6, wall: true, bank: 1 },
  points: [
    [0, -140, 0], [70, -140, 0], [130, -125, 3], [165, -85, 9], [175, -30, 15],
    [165, 20, 9], [170, 70, 4], [145, 112, 2], [95, 130, 2],
    [55, 124, 2.5, { ramp: true }],    // ramp up...
    [28, 120, 8, { gap: true }],       // ...lip: no road from here to the next point (chocolate river)
    [10, 118, 4],                      // landing
    [-30, 110, 3], [-80, 122, 9], [-130, 104, 15], [-160, 55, 18],
    [-158, 0, 10], [-148, -42, 2], [-118, -78, 6], [-88, -118, 1], [-45, -140, 0],
  ],
  boosts: [
    { cp: 9, shift: -6, lane: 0, len: 9 },    // at the foot of the ramp - you need the speed!
    { cp: 16, shift: 0, lane: 0.3, len: 8 },
    { cp: 1, shift: 0, lane: -0.4, len: 8 },
  ],
  scenery(ctx) {
    const { THREE, rand } = ctx;
    // chocolate river under the jump
    const river = new THREE.Mesh(new THREE.PlaneGeometry(26, 260), ctx.lambert(0x5a2a10, 0x2a1000));
    river.rotation.x = -Math.PI / 2;
    river.rotation.z = 0.15;
    river.position.set(19, -0.85, 120);
    ctx.add(river);
    // lollipop trees
    const trees = [];
    ctx.scatter(170, 15, 380, 6, (x, z) => trees.push({ x, z, s: rand(0.9, 1.6), y: -1 }));
    ctx.trees(trees, 'lolly', { trunk: 0xffffff, crown: [0xff3b6a, 0x2fd3ff, 0xffd21a, 0x9b5cff, 0x5fe36a] });
    // giant donuts & candy canes
    for (let i = 0; i < 18; i++) {
      ctx.scatter(1, 40, 420, 14, (x, z) => {
        const d = new THREE.Mesh(new THREE.TorusGeometry(6, 3, 10, 20), ctx.toon([0xff6fd2, 0x8a4a1a, 0xfff0a0][i % 3]));
        d.position.set(x, 2, z);
        d.rotation.set(Math.PI / 2 + rand(-0.4, 0.4), 0, rand(0, 6));
        ctx.add(d);
      });
    }
    ctx.along(30, 3, (x, z, s, side) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 8), ctx.toon(0xffffff));
      pole.position.y = 4.5;
      const hook = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.5, 8, 14, Math.PI), ctx.toon(0xff2f4a));
      hook.position.set(1.6, 9, 0);
      g.add(pole, hook);
      for (let k = 0; k < 4; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.8, 8), ctx.toon(0xff2f4a));
        band.position.y = 1 + k * 2.2;
        g.add(band);
      }
      g.position.set(x, s.y - 1, z);
      g.rotation.y = s.yaw + (side > 0 ? Math.PI : 0);
      ctx.add(g);
    });
    // gumdrop mountains + cotton candy clouds
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.toon([0x9b5cff, 0x2fd3ff, 0xff6fd2, 0x5fe36a][i % 4]));
      m.position.set(Math.cos(a) * 500, -1, Math.sin(a) * 500);
      m.scale.set(rand(70, 110), rand(60, 120), rand(70, 110));
      ctx.add(m);
    }
    for (let i = 0; i < 14; i++) ctx.cloud(rand(-450, 450), rand(60, 120), rand(-450, 450), rand(4, 8), [0xffffff, 0xffc8f0, 0xc8f0ff][i % 3]);
    ctx.sign('JUMP!', 72, 13, 140, Math.PI * 0.55, 14, 4, '#ffd21a', '#ff2f6a');
  },
});
