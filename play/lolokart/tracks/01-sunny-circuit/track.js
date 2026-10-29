// SUNNY CIRCUIT - the easy, flat starter track. See CLAUDE.md in this folder for its design notes.
'use strict';
LK.registerTrack({
  id: 'sunny-circuit',
  order: 1,
  name: 'SUNNY CIRCUIT',
  blurb: 'Flat, friendly, fast. Learn the ropes.',
  difficulty: 1,
  seed: 11,
  theme: {
    sky: [0x3aa0ff, 0xbfe8ff, 0x9ad48a],
    fog: 0xcfeeff, fogNear: 220, fogFar: 760,
    ground: 0x5fc94a,
    road: '#4a4a58',
    shoulder: 0x7ad85a,
    kerb: [0xff3b3b, 0xffffff],
    wall: [0xff3b3b, 0xffffff],
    skirt: 0x6b4a2a,
    gate: 0xff2fd6,
  },
  defaults: { width: 18, shoulder: 9, wall: true, bank: 0.6 },
  // [x, z, height, {options}] - a closed loop, driven in this order. First point = start line.
  points: [
    [0, -120, 0], [70, -120, 0], [125, -105, 0], [150, -60, 0], [140, -15, 0],
    [105, 10, 0], [95, 45, 0], [120, 80, 0], [115, 120, 0], [75, 140, 0],
    [20, 135, 0], [-30, 115, 0], [-80, 125, 0], [-125, 105, 0], [-145, 55, 0],
    [-140, 0, 0], [-145, -55, 0], [-120, -100, 0], [-65, -120, 0],
  ],
  boosts: [
    { cp: 0, shift: 40, lane: 0, len: 8 },
    { cp: 15, shift: 0, lane: -0.4, len: 8 },
    { cp: 10, shift: 10, lane: 0.4, len: 8 },
  ],
  scenery(ctx) {
    const { rand } = ctx;
    // trees around the outside and in the infield
    const trees = [];
    ctx.scatter(260, 20, 420, 6, (x, z) => trees.push({ x, z, s: rand(0.8, 1.5) }));
    ctx.trees(trees.filter((t, i) => i % 2), 'round');
    ctx.trees(trees.filter((t, i) => !(i % 2)), 'pine', { crown: [0x1f8a3a, 0x2fa84a] });
    // tyre stacks along the walls
    const tyres = [];
    ctx.along(14, 1.2, (x, z) => { for (let h = 0; h < 3; h++) tyres.push({ x, y: 0.3 + h * 0.6, z, s: 1, color: h % 2 ? 0xffffff : 0x222222 }); });
    const tg = new ctx.THREE.TorusGeometry(0.55, 0.28, 6, 12); tg.rotateX(Math.PI / 2);
    ctx.instanced(tg, ctx.toon(0xffffff), tyres);
    // grandstand by the start
    const s0 = ctx.track.s[6];
    for (const side of [-1]) {
      const lat = side * (s0.hw + s0.sh + 6);
      const g = new ctx.THREE.Group();
      g.position.set(s0.x + s0.rx * lat, 0, s0.z + s0.rz * lat);
      g.rotation.y = s0.yaw + Math.PI / 2 * side;
      for (let r = 0; r < 5; r++) {
        const step = new ctx.THREE.Mesh(new ctx.THREE.BoxGeometry(40, 1.4, 2.4), ctx.toon(r % 2 ? 0x2a7dff : 0xffe81a));
        step.position.set(0, 0.7 + r * 1.4, -r * 2.4);
        g.add(step);
        for (let c = 0; c < 16; c++) {
          const fan = new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(0.45, 8, 6), ctx.toon([0xff3b3b, 0xffffff, 0xff6fd2, 0x7dff2f, 0x19f7ff][(c + r) % 5]));
          fan.position.set(-18 + c * 2.4 + rand(-0.4, 0.4), 1.9 + r * 1.4, -r * 2.4);
          g.add(fan);
          ctx.onTick((t) => { fan.position.y = 1.9 + r * 1.4 + Math.max(0, Math.sin(t * 6 + c + r * 2)) * 0.35; });
        }
      }
      ctx.add(g);
    }
    // distant hills + clouds + balloons
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ctx.mountain(Math.cos(a) * 520, Math.sin(a) * 520, rand(60, 120), rand(50, 120), [0x4fae5a, 0x3e9a4f, 0x6fc06a][i % 3]);
    }
    for (let i = 0; i < 16; i++) ctx.cloud(rand(-500, 500), rand(70, 130), rand(-500, 500), rand(4, 8));
    const balloonColors = [0xff3b3b, 0xffe81a, 0x2a7dff, 0xff6fd2];
    for (let i = 0; i < 6; i++) {
      const b = new ctx.THREE.Group();
      const env = new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(5, 14, 10), ctx.toon(balloonColors[i % 4]));
      env.scale.y = 1.2;
      const basket = new ctx.THREE.Mesh(new ctx.THREE.BoxGeometry(1.6, 1.4, 1.6), ctx.toon(0x8a5a2a));
      basket.position.y = -7.5;
      b.add(env, basket);
      const x = rand(-260, 260), z = rand(-260, 260), y = rand(40, 80);
      b.position.set(x, y, z);
      ctx.add(b);
      ctx.onTick((t) => { b.position.y = y + Math.sin(t * 0.4 + i) * 3; });
    }
  },
});
