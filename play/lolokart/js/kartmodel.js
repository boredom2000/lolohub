// Comic karts built from primitives with toon shading + black outlines.
// The model faces +Z, sits with wheel bottoms on y=0. Shape reflects the class:
//   classic (balanced), bubble (zippy: tiny wheels, cute), truck (heavy: huge wheels), rocket (wild: long + jet).
'use strict';
(function (LK) {
  let gradientMap = null;
  const matCache = new Map();
  const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0b0716, side: THREE.BackSide });

  function toonGradient() {
    if (gradientMap) return gradientMap;
    const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
    gradientMap = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
    return gradientMap;
  }
  function toon(color, emissive) {
    const key = color + ':' + (emissive || 0);
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: emissive || 0 }));
    }
    return matCache.get(key);
  }
  LK.toon = toon;

  // Adds a mesh plus an inverted-hull outline (comic ink line).
  function part(parent, geo, color, x, y, z, opts) {
    opts = opts || {};
    const m = new THREE.Mesh(geo, opts.mat || toon(color, opts.emissive));
    m.position.set(x, y, z);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    if (opts.scale) m.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
    parent.add(m);
    if (opts.outline !== false) {
      const o = new THREE.Mesh(geo, OUTLINE);
      o.scale.setScalar(opts.outlineScale || 1.07);
      m.add(o);
    }
    return m;
  }

  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    sph: (r, ws, hs) => new THREE.SphereGeometry(r, ws || 16, hs || 12),
    cyl: (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s || 14),
    cap: (r, l) => new THREE.CapsuleGeometry(r, l, 6, 12),
  };

  function wheel(kart, r, w, x, z, front) {
    // pivot (steer) -> spinner (roll) -> tire + hub
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    kart.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    part(spin, G.cyl(r, r, w, 18), 0x1c1c22, 0, 0, 0, { rot: [0, 0, Math.PI / 2] });
    part(spin, G.cyl(r * 0.55, r * 0.55, w + 0.04, 10), 0xd8d8e0, 0, 0, 0, { rot: [0, 0, Math.PI / 2], outline: false });
    part(spin, G.box(w + 0.06, r * 0.25, r * 1.1), 0x9a9aa8, 0, 0, 0, { outline: false }); // spoke so rolling is visible
    kart.userData.wheels.push({ pivot, spin, r, front });
  }

  function driver(kart, d, y, z, s) {
    const g = new THREE.Group();
    g.position.set(0, y, z);
    g.scale.setScalar(s);
    kart.add(g);
    // torso + arms reaching to the wheel
    part(g, G.cap(0.32, 0.35), d.color, 0, 0.35, 0);
    part(g, G.cap(0.1, 0.45), d.color, 0.3, 0.42, 0.32, { rot: [1.2, 0, 0.25] });
    part(g, G.cap(0.1, 0.45), d.color, -0.3, 0.42, 0.32, { rot: [1.2, 0, -0.25] });
    // big comic head
    const head = new THREE.Group();
    head.position.set(0, 1.05, 0.05);
    g.add(head);
    part(head, G.sph(0.46), d.skin, 0, 0, 0);
    for (const sx of [-1, 1]) {
      part(head, G.sph(0.14), 0xffffff, sx * 0.16, 0.08, 0.38, { scale: [1, 1.3, 0.7] });
      part(head, G.sph(0.065), 0x111111, sx * 0.15, 0.08, 0.48, { outline: false });
    }
    part(head, G.sph(0.09), 0xff8a8a, 0, -0.06, 0.45, { outline: false }); // nose
    const ex = d.extra;
    if (ex === 'mustache') {
      part(head, G.cap(0.06, 0.22), 0x3a2416, -0.12, -0.17, 0.42, { rot: [0, 0, 1.3] });
      part(head, G.cap(0.06, 0.22), 0x3a2416, 0.12, -0.17, 0.42, { rot: [0, 0, -1.3] });
    } else if (ex === 'beard') {
      part(head, G.sph(0.36), 0x2a1a10, 0, -0.26, 0.12, { scale: [1.1, 0.8, 1] });
    } else if (ex === 'teeth') {
      part(head, G.box(0.08, 0.14, 0.06), 0xffffff, -0.12, -0.24, 0.4, { outline: false });
      part(head, G.box(0.08, 0.14, 0.06), 0xffffff, 0.12, -0.24, 0.4, { outline: false });
    } else if (ex === 'grin') {
      part(head, G.box(0.3, 0.07, 0.06), 0x222222, 0, -0.2, 0.42, { outline: false });
    } else if (ex === 'freckles') {
      for (const sx of [-1, 1]) part(head, G.sph(0.03), 0xb55a2a, sx * 0.25, -0.08, 0.37, { outline: false });
    } else if (ex === 'lashes') {
      for (const sx of [-1, 1]) part(head, G.box(0.2, 0.03, 0.03), 0x111111, sx * 0.17, 0.27, 0.38, { outline: false, rot: [0, 0, sx * 0.3] });
    }
    const hc = d.hatColor;
    if (d.hat === 'cap') {
      part(head, G.sph(0.48, 16, 8), hc, 0, 0.12, 0, { scale: [1, 0.6, 1] });
      part(head, G.box(0.5, 0.05, 0.35), hc, 0, 0.18, 0.45);
    } else if (d.hat === 'bow') {
      part(head, G.sph(0.17), hc, -0.2, 0.47, 0, { scale: [1.2, 0.8, 0.6] });
      part(head, G.sph(0.17), hc, 0.2, 0.47, 0, { scale: [1.2, 0.8, 0.6] });
      part(head, G.sph(0.08), hc, 0, 0.47, 0);
    } else if (d.hat === 'antenna') {
      for (const sx of [-1, 1]) {
        part(head, G.cyl(0.025, 0.025, 0.45), 0x222222, sx * 0.18, 0.55, 0, { outline: false, rot: [0, 0, -sx * 0.3] });
        part(head, G.sph(0.09), hc, sx * 0.25, 0.78, 0, { emissive: 0x3355ff });
      }
    } else if (d.hat === 'helmet') {
      part(head, G.sph(0.52, 16, 10), hc, 0, 0.06, -0.04, { scale: [1, 0.85, 1] });
      part(head, G.box(0.7, 0.06, 0.3), 0xffb21a, 0, 0.34, 0.28, { outline: false });
    } else if (d.hat === 'horns') {
      for (const sx of [-1, 1]) part(head, G.cyl(0.02, 0.1, 0.4, 8), hc, sx * 0.36, 0.38, 0, { rot: [0, 0, -sx * 0.6] });
    } else if (d.hat === 'goggles') {
      part(head, G.cyl(0.47, 0.47, 0.12, 18), hc, 0, 0.18, 0, { outline: false });
      for (const sx of [-1, 1]) part(head, G.cyl(0.12, 0.12, 0.1, 12), 0x88e8ff, sx * 0.16, 0.22, 0.43, { rot: [Math.PI / 2, 0, 0], emissive: 0x115566 });
    } else if (d.hat === 'mohawk') {
      for (let i = 0; i < 5; i++) part(head, G.cyl(0.0, 0.09, 0.32, 6), hc, 0, 0.5 - Math.abs(i - 2) * 0.03, 0.28 - i * 0.15, { rot: [-0.3 + i * 0.15, 0, 0] });
    }
    kart.userData.head = head;
    return g;
  }

  function steeringWheel(kart, y, z) {
    part(kart, G.cyl(0.05, 0.05, 0.4, 6), 0x333333, 0, y - 0.15, z + 0.1, { rot: [-0.9, 0, 0], outline: false });
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 6, 16), toon(0x222222));
    sw.position.set(0, y, z);
    sw.rotation.x = -0.6;
    kart.add(sw);
  }

  function flame(kart, x, y, z, scale) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 * scale, 1.0 * scale, 10), new THREE.MeshBasicMaterial({ color: 0xffa21a, transparent: true, opacity: 0.85 }));
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, y, z - 0.5 * scale);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.11 * scale, 0.6 * scale, 8), new THREE.MeshBasicMaterial({ color: 0xffffaa }));
    core.position.y = 0.15 * scale;
    f.add(core);
    kart.add(f);
    kart.userData.flames.push(f);
  }

  const BUILD = {
    classic(k, d) {
      part(k, G.box(1.5, 0.4, 2.5), d.color, 0, 0.5, 0);
      part(k, G.box(1.1, 0.3, 0.9), d.color, 0, 0.55, 1.45, { rot: [0.25, 0, 0] });
      part(k, G.box(1.9, 0.18, 0.4), d.accent, 0, 0.42, 1.75); // front bumper
      part(k, G.box(0.9, 0.5, 0.25), d.accent, 0, 0.9, -0.55); // seat back
      part(k, G.box(1.0, 0.5, 0.7), 0x555566, 0, 0.75, -1.15); // engine
      for (const sx of [-1, 1]) part(k, G.cyl(0.09, 0.12, 0.6, 8), 0xbbbbbb, sx * 0.3, 0.8, -1.55, { rot: [Math.PI / 2 + 0.3, 0, 0] });
      part(k, G.box(1.9, 0.08, 0.45), d.accent, 0, 1.35, -1.35); // spoiler
      for (const sx of [-1, 1]) part(k, G.box(0.08, 0.4, 0.3), d.accent, sx * 0.7, 1.15, -1.35);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(k, 0.4, 0.38, sx * 0.95, sz * 0.95, sz > 0);
      steeringWheel(k, 1.05, 0.55);
      driver(k, d, 0.55, -0.15, 0.95);
      flame(k, 0, 0.8, -1.8, 0.8);
    },
    bubble(k, d) {
      part(k, G.sph(1, 20, 14), d.color, 0, 0.62, 0, { scale: [0.8, 0.5, 1.05] });
      part(k, G.box(1.5, 0.12, 0.3), d.accent, 0, 0.42, 1.0);
      for (const sx of [-1, 1]) {
        part(k, G.sph(0.17), 0xffffff, sx * 0.38, 0.75, 0.95, { emissive: 0x444433 }); // big headlight "eyes"
        part(k, G.sph(0.07), 0x111111, sx * 0.38, 0.78, 1.1, { outline: false });
      }
      part(k, G.cyl(0.04, 0.04, 0.9, 6), 0x333333, -0.45, 1.1, -0.85, { outline: false, rot: [-0.3, 0, 0] });
      part(k, G.box(0.04, 0.3, 0.45), d.accent, -0.45, 1.5, -0.97, { outline: false }); // little flag
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(k, 0.28, 0.3, sx * 0.72, sz * 0.72, sz > 0);
      steeringWheel(k, 1.0, 0.45);
      driver(k, d, 0.62, -0.2, 0.92);
      flame(k, 0, 0.5, -1.0, 0.6);
    },
    truck(k, d) {
      part(k, G.box(1.9, 0.55, 2.9), d.color, 0, 1.05, 0);
      part(k, G.box(1.6, 0.4, 0.9), d.color, 0, 1.4, 1.0); // hood
      part(k, G.box(1.7, 0.18, 0.2), 0xcccccc, 0, 1.3, 1.5, { outline: false }); // grille
      for (let i = 0; i < 3; i++) part(k, G.box(1.5, 0.06, 0.08), 0x333333, 0, 1.2 + i * 0.1, 1.56, { outline: false });
      part(k, G.box(2.2, 0.3, 0.3), d.accent, 0, 0.85, 1.6); // bull bar
      part(k, G.box(1.4, 0.7, 0.9), 0x444455, 0, 1.55, -0.95); // engine block
      for (const sx of [-1, 1]) {
        part(k, G.cyl(0.12, 0.12, 1.3, 8), 0xbbbbbb, sx * 0.55, 2.2, -1.1);
        part(k, G.cyl(0.16, 0.12, 0.2, 8), 0x333333, sx * 0.55, 2.9, -1.1);
      }
      // roll cage
      for (const sx of [-1, 1]) part(k, G.cyl(0.06, 0.06, 1.3, 6), 0x222222, sx * 0.7, 2.0, -0.3, { outline: false });
      part(k, G.cyl(0.06, 0.06, 1.45, 6), 0x222222, 0, 2.65, -0.3, { rot: [0, 0, Math.PI / 2], outline: false });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(k, 0.65, 0.6, sx * 1.2, sz * 1.05, sz > 0);
      steeringWheel(k, 1.85, 0.45);
      driver(k, d, 1.25, -0.25, 1.0);
      flame(k, 0, 1.2, -1.5, 1.0);
    },
    rocket(k, d) {
      part(k, G.cyl(0.55, 0.6, 3.0, 16), d.color, 0, 0.7, -0.1, { rot: [Math.PI / 2, 0, 0] });
      part(k, G.cyl(0.0, 0.55, 1.1, 16), d.accent, 0, 0.7, 1.95, { rot: [Math.PI / 2, 0, 0] });
      part(k, G.cyl(0.35, 0.5, 0.5, 14), 0x444455, 0, 0.7, -1.85, { rot: [Math.PI / 2, 0, 0] }); // nozzle
      part(k, G.box(0.08, 1.0, 0.9), d.accent, 0, 1.45, -1.3, { rot: [0.35, 0, 0] }); // tail fin
      for (const sx of [-1, 1]) part(k, G.box(0.9, 0.06, 0.6), d.accent, sx * 0.75, 0.95, -1.35, { rot: [0, 0, sx * 0.25] });
      part(k, G.box(2.6, 0.1, 0.18), 0x333333, 0, 0.55, -1.05, { outline: false }); // rear axle
      part(k, G.box(1.3, 0.08, 0.14), 0x333333, 0, 0.32, 1.35, { outline: false }); // front axle
      wheel(k, 0.32, 0.25, -0.6, 1.35, true); wheel(k, 0.32, 0.25, 0.6, 1.35, true);
      wheel(k, 0.58, 0.55, -1.1, -1.05, false); wheel(k, 0.58, 0.55, 1.1, -1.05, false);
      steeringWheel(k, 1.35, 0.5);
      driver(k, d, 0.75, -0.25, 0.9);
      flame(k, 0, 0.7, -2.1, 1.6);
    },
  };

  LK.buildKart = function (d) {
    const root = new THREE.Group();      // world position + yaw
    const tilt = new THREE.Group();      // pitch/roll to match the road
    const body = new THREE.Group();      // bounce / wobble
    root.add(tilt); tilt.add(body);
    body.userData = { wheels: [], flames: [] };
    BUILD[d.body](body, d);
    root.userData = { tilt, body, wheels: body.userData.wheels, flames: body.userData.flames, head: body.userData.head };
    return root;
  };

  // Soft round shadow texture shared by all karts.
  let shadowTex = null;
  LK.blobShadow = function (size) {
    if (!shadowTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 4, 32, 32, 31);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      shadowTex = new THREE.CanvasTexture(c);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    return m;
  };
})(window.LK);
