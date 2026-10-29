// Builds the 3D world for a track: sky, fog, light, ground, the track meshes, start gate,
// then calls the track's own scenery(ctx) with helpers to decorate it.
'use strict';
(function (LK) {
  LK.buildWorld = function (track, scene) {
    const def = track.def, th = def.theme;
    const root = new THREE.Group();
    scene.add(root);
    scene.fog = new THREE.Fog(th.fog || th.sky[1], th.fogNear || 160, th.fogFar || 650);
    scene.background = new THREE.Color(th.sky[1]);

    // gradient sky dome
    {
      const g = new THREE.SphereGeometry(900, 24, 12);
      const top = new THREE.Color(th.sky[0]), hor = new THREE.Color(th.sky[1]), bot = new THREE.Color(th.sky[2] || th.sky[1]);
      const pos = g.attributes.position, col = [];
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 900;
        const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(bot, Math.min(1, -y * 3));
        col.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      sky.renderOrder = -1;
      root.add(sky);
      root.userData.sky = sky;
    }
    root.add(new THREE.HemisphereLight(th.hemi ? th.hemi[0] : 0xffffff, th.hemi ? th.hemi[1] : 0x445533, th.hemiIntensity || 0.75));
    const sun = new THREE.DirectionalLight(th.sun || 0xffffff, th.sunIntensity || 0.85);
    sun.position.set(120, 260, 80);
    root.add(sun);

    if (th.ground != null) {
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: th.ground, emissive: th.groundEmissive || 0 }));
      gm.rotation.x = -Math.PI / 2;
      gm.position.y = (th.groundY != null ? th.groundY : 0) - 0.06;
      root.add(gm);
      root.userData.ground = gm;
    }

    track.buildMeshes(root);
    startGate(track, root);

    const rng = LK.rng(def.seed || 1234);
    const ctx = makeCtx(track, root, rng);
    if (def.scenery) def.scenery(ctx);
    root.userData.tick = ctx._ticks;
    return root;
  };

  function textTexture(text, w, h, bg, fg) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = `${Math.floor(h * 0.62)}px Bungee, Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = h * 0.08; g.strokeStyle = '#000'; g.strokeText(text, w / 2, h / 2 + 2);
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
    return new THREE.CanvasTexture(c);
  }
  LK.textTexture = textTexture;

  function startGate(track, root) {
    const s = track.s[0], th = track.def.theme;
    const span = s.hw + 1.5;
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.yaw;
    const pm = LK.toon(th.gate || 0xff2fd6);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 9, 10), pm);
      p.position.set(sx * span, 4.5 + Math.abs(sx * span) * Math.abs(s.sb), 0);
      g.add(p);
    }
    const tex = textTexture('LOLO KART', 512, 96, th.gateBanner || '#1a0033', '#ffe81a');
    const banner = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 2, 2.6, 0.6), [pm, pm, pm, pm, new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
    banner.position.y = 9;
    g.add(banner);
    root.add(g);
  }

  function makeCtx(track, root, rng) {
    const S = track.s;
    const ticks = [];
    const ctx = {
      THREE, LK, track, root, rng, theme: track.def.theme, _ticks: ticks,
      rand: (a, b) => a + (b - a) * rng(),
      toon: LK.toon,
      lambert: (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0 }),
      add(obj) { root.add(obj); return obj; },
      // run fn(time, dt) every frame (animated scenery)
      onTick(fn) { ticks.push(fn); },
      // true if (x,z) is at least `margin` metres outside the drivable area of the track
      free(x, z, margin, yMin, yMax) {
        for (let i = 0; i < S.length; i += 2) {
          const s = S[i];
          if (yMin != null && (s.y < yMin || s.y > yMax)) continue;
          const r = s.hw + s.sh + (margin || 0);
          const dx = x - s.x, dz = z - s.z;
          if (dx * dx + dz * dz < r * r) return false;
        }
        return true;
      },
      // place fn(x, z, s, side) every `step` metres along both roadsides at `off` metres beyond the edge
      along(step, off, fn, sides) {
        const n = Math.max(1, Math.round(step / track.spacing));
        for (let i = 0; i < S.length; i += n) {
          const s = S[i];
          if (s.gap) continue;
          for (const side of sides || [-1, 1]) {
            const lat = side * (s.hw + s.sh + off);
            const x = s.x + s.rx * lat, z = s.z + s.rz * lat;
            if (ctx.free(x, z, off * 0.6)) fn(x, z, s, side);
          }
        }
      },
      // random points in a ring around the track centre
      scatter(n, rMin, rMax, margin, fn) {
        const B = track.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
        let placed = 0;
        for (let tries = 0; tries < n * 8 && placed < n; tries++) {
          const a = rng() * Math.PI * 2, r = rMin + (rMax - rMin) * Math.sqrt(rng());
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (!ctx.free(x, z, margin)) continue;
          fn(x, z, placed++);
        }
      },
      // instanced copies of one geometry: items = [{x,y,z,s,ry,color}]
      instanced(geo, mat, items) {
        if (!items.length) return null;
        const m = new THREE.InstancedMesh(geo, mat, items.length);
        const o = new THREE.Object3D(), c = new THREE.Color();
        items.forEach((it, i) => {
          o.position.set(it.x, it.y || 0, it.z);
          o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
          if (it.sv) o.scale.set(it.sv[0], it.sv[1], it.sv[2]); else o.scale.setScalar(it.s || 1);
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);
          if (it.color != null) m.setColorAt(i, c.set(it.color));
        });
        root.add(m);
        return m;
      },
      // forest of simple trees: items = [{x,z,s,y}]; style 'pine' | 'round' | 'lolly'
      trees(items, style, colors) {
        colors = colors || {};
        const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
        trunkGeo.translate(0, 1.5, 0);
        let crownGeo;
        if (style === 'pine') { crownGeo = new THREE.ConeGeometry(2.4, 6, 7); crownGeo.translate(0, 5.5, 0); }
        else if (style === 'lolly') { crownGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.8, 18); crownGeo.rotateX(Math.PI / 2); crownGeo.translate(0, 5, 0); }
        else { crownGeo = new THREE.IcosahedronGeometry(2.6, 0); crownGeo.translate(0, 4.6, 0); }
        const trunkC = colors.trunk || 0x7a4a22;
        ctx.instanced(trunkGeo, LK.toon(0xffffff), items.map((t) => ({ x: t.x, y: t.y || 0, z: t.z, s: t.s, ry: rng() * 6, color: trunkC })));
        const pal = colors.crown || [0x2fbf4a, 0x46d65a, 0x1f9a3a];
        ctx.instanced(crownGeo, LK.toon(0xffffff), items.map((t) => ({ x: t.x, y: t.y || 0, z: t.z, s: t.s, ry: style === 'lolly' ? Math.atan2(t.x, t.z) : rng() * 6, color: pal[Math.floor(rng() * pal.length)] })));
      },
      cloud(x, y, z, s, color) {
        const g = new THREE.Group();
        const m = LK.toon(color || 0xffffff);
        for (let i = 0; i < 5; i++) {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), m);
          b.position.set((i - 2) * 1.4, Math.sin(i * 1.7) * 0.4, (rng() - 0.5) * 1.2);
          b.scale.setScalar(1.2 + rng() * 1.1);
          g.add(b);
        }
        g.position.set(x, y, z);
        g.scale.setScalar(s);
        root.add(g);
        return g;
      },
      mountain(x, z, r, h, color, y) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), new THREE.MeshLambertMaterial({ color, flatShading: true }));
        m.position.set(x, (y || 0) + h / 2 - 0.5, z);
        m.rotation.y = rng() * 6;
        root.add(m);
        return m;
      },
      sign(text, x, y, z, yaw, w, h, bg, fg) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, 512, Math.round(512 * h / w), bg || '#ff2fd6', fg || '#fff'), side: THREE.DoubleSide }));
        m.position.set(x, y, z);
        m.rotation.y = yaw;
        root.add(m);
        return m;
      },
    };
    return ctx;
  }
})(window.LK);
