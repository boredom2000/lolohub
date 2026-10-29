// Game flow + rendering: driver select -> track select -> race -> results.
'use strict';
(function (LK) {
  const UI = LK.UI, $ = UI.$, Input = LK.Input, Sfx = LK.Sfx;
  Input.init();

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  $('game').appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 2000);
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- menu scene (kart on a spinning podium)
  const menu = { scene: new THREE.Scene(), kart: null, spin: 0 };
  {
    const sc = menu.scene;
    sc.background = new THREE.Color(0x14002a);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x6633aa, 0.85));
    const l = new THREE.DirectionalLight(0xffffff, 0.9); l.position.set(5, 10, 8); sc.add(l);
    // radial ray backdrop
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#2a0055'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? '#ff2fd6' : '#6a00ff';
      g.beginPath(); g.moveTo(256, 256);
      g.arc(256, 256, 400, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2); g.fill();
    }
    const rays = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
    rays.position.set(0, 2, -18);
    sc.add(rays);
    menu.rays = rays;
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4, 0.8, 32), LK.toon(0xffe81a));
    pod.position.y = -0.4;
    sc.add(pod);
    const pod2 = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 0.6, 32), LK.toon(0x19f7ff));
    pod2.position.y = -1.0;
    sc.add(pod2);
  }
  function setMenuKart(i) {
    if (menu.kart) menu.scene.remove(menu.kart);
    menu.kart = LK.buildKart(LK.DRIVERS[i]);
    menu.kart.userData.flames.forEach((f) => (f.visible = false));
    menu.scene.add(menu.kart);
  }

  // ---------------------------------------------------------------- state
  const S = {
    screen: 'driver', driver: LK.store.get('driver', 0), trackIdx: LK.store.get('track', 0),
    race: null, world: null, worldScene: null, karts3d: [], controllers: [], me: null,
    acc: 0, paused: false, finishT: 0, resultsShown: false, camYaw: 0, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(),
    shake: 0, clock: 0,
  };
  S.driver = LK.clamp(S.driver, 0, LK.DRIVERS.length - 1);
  S.trackIdx = LK.clamp(S.trackIdx, 0, LK.tracks.length - 1);

  function setScreen(name) {
    S.screen = name;
    $('screenDriver').classList.toggle('hidden', name !== 'driver');
    $('screenTrack').classList.toggle('hidden', name !== 'track');
    document.body.classList.toggle('menu', name === 'driver' || name === 'track');
    document.body.classList.toggle('racing', name === 'race');
    if (name !== 'race') $('results').classList.add('hidden');
    if (name === 'track') {
      UI.selectTrack(S.trackIdx);
      const d = LK.DRIVERS[S.driver];
      $('trackDriver').textContent = 'DRIVER: ' + d.name;
    }
  }

  // ---------------------------------------------------------------- menus
  UI.buildDriverGrid((i) => { pickDriver(i); }, () => goTrackSelect());
  UI.buildTrackGrid((i) => { S.trackIdx = i; Sfx.click(); startRace(); });
  function pickDriver(i) {
    S.driver = i; LK.store.set('driver', i);
    UI.showDriver(i); setMenuKart(i); Sfx.click();
  }
  function goTrackSelect() { Sfx.unlock(); Sfx.click(); setScreen('track'); }
  UI.showDriver(S.driver); setMenuKart(S.driver);
  $('driverNext').addEventListener('click', goTrackSelect);
  $('trackBack').addEventListener('click', () => { Sfx.click(); setScreen('driver'); });

  // ---------------------------------------------------------------- race lifecycle
  function disposeWorld() {
    if (!S.worldScene) return;
    S.worldScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); if (!m.isMeshToonMaterial) m.dispose(); });
    });
    S.worldScene = null; S.world = null;
  }

  function startRace() {
    Sfx.unlock();
    disposeWorld();
    const t = LK.tracks[S.trackIdx];
    LK.store.set('track', S.trackIdx);
    // grid: AI drivers first, the player starts last (P8) - plenty to overtake
    const others = LK.DRIVERS.map((d, i) => i).filter((i) => i !== S.driver);
    const rng = LK.rng(Date.now() & 0xffff);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const setup = {
      trackId: t.id, laps: LK.LAPS, seed: (Date.now() & 0xffffff) || 1,
      entrants: others.map((i) => ({ driverId: LK.DRIVERS[i].id, kind: 'ai' })).concat([{ driverId: LK.DRIVERS[S.driver].id, kind: 'local', playerId: LK.Net.playerId }]),
    };
    const race = new LK.Race(setup);
    S.race = race;
    S.controllers = race.karts.map((k, i) => {
      if (k.kind === 'local') return new LK.LocalController(Input);
      if (k.kind === 'remote') return LK.Net.remote(k.playerId);
      return new LK.AIController(race, k, 0.985 - i * 0.011);
    });
    S.me = race.karts.find((k) => k.kind === 'local');

    const scene = new THREE.Scene();
    S.worldScene = scene;
    S.world = LK.buildWorld(race.track, scene);
    S.karts3d = race.karts.map((k) => {
      const d = LK.DRIVERS.find((x) => x.id === k.driverId);
      const m = LK.buildKart(d);
      const sh = LK.blobShadow(d.body === 'truck' ? 3.6 : 3);
      scene.add(m); scene.add(sh);
      return { m, sh, d };
    });
    UI.initMinimap(race.track);
    UI.lastPos = 0;
    UI.clearBanner();
    S.acc = 0; S.paused = false; S.finishT = 0; S.resultsShown = false;
    S.camYaw = S.me.yaw;
    S.camPos.set(S.me.x, S.me.y + 30, S.me.z);
    Input.reset();
    setScreen('race');
    $('pauseModal').classList.add('hidden');
    $('quitModal').classList.add('hidden');
  }

  function quitToTracks() {
    S.race = null;
    disposeWorld();
    Sfx.engine(0, 1, 0, false);
    $('pauseModal').classList.add('hidden');
    UI.buildTrackGrid((i) => { S.trackIdx = i; Sfx.click(); startRace(); }); // refresh best times
    setScreen('track');
  }

  function setPaused(p) {
    if (!S.race) return;
    S.paused = p;
    $('pauseModal').classList.toggle('hidden', !p);
    if (p) Sfx.engine(0, 1, 0, false);
  }
  $('pauseBtn').addEventListener('click', () => setPaused(true));
  $('pResume').addEventListener('click', () => setPaused(false));
  $('pRestart').addEventListener('click', () => startRace());
  $('pQuit').addEventListener('click', quitToTracks);
  // ad break after a race (the hub's ../../core/ads.js; skipped when ads are off or missing)
  const afterAd = (fn) => (window.loloAd ? loloAd('race-over', fn) : fn());
  $('resTracks').addEventListener('click', () => afterAd(quitToTracks));
  $('resAgain').addEventListener('click', () => afterAd(startRace));

  // hub + full screen + mute
  function goHub() { location.href = '../../'; }
  $('hubBtn').addEventListener('click', () => {
    if (S.screen === 'race' && S.race && !S.resultsShown) { $('quitModal').classList.remove('hidden'); S.paused = true; Sfx.engine(0, 1, 0, false); }
    else goHub();
  });
  $('quitNo').addEventListener('click', () => { $('quitModal').classList.add('hidden'); S.paused = !$('pauseModal').classList.contains('hidden'); });
  $('quitYes').addEventListener('click', goHub);
  {
    const fsBtn = $('fsBtn');
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.style.display = 'none';
    fsBtn.addEventListener('click', () => {
      const de = document.documentElement;
      const p = fsEl() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
      if (p && p.catch) p.catch(() => {});
    });
    const fsSync = () => { fsBtn.classList.toggle('on', !!fsEl()); fsBtn.title = fsEl() ? 'Exit full screen' : 'Full screen'; };
    document.addEventListener('fullscreenchange', fsSync);
    document.addEventListener('webkitfullscreenchange', fsSync);
  }
  const muteSync = () => { $('muteBtn').classList.toggle('off', Sfx.muted); $('muteBtn').innerHTML = Sfx.muted ? '&#x1F507;' : '&#x1F50A;'; };
  $('muteBtn').addEventListener('click', () => { Sfx.unlock(); Sfx.setMuted(!Sfx.muted); muteSync(); });
  muteSync();
  addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  // keyboard navigation for menus + pause
  addEventListener('keydown', (e) => {
    Sfx.unlock();
    if (S.screen === 'driver') {
      const n = LK.DRIVERS.length;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') pickDriver((S.driver + 1) % n);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') pickDriver((S.driver + n - 1) % n);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') pickDriver((S.driver + 4) % n);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') pickDriver((S.driver + n - 4) % n);
      else if (e.code === 'Enter' || e.code === 'Space') goTrackSelect();
    } else if (S.screen === 'track') {
      const n = LK.tracks.length;
      if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ArrowDown' || e.code === 'KeyS') { S.trackIdx = (S.trackIdx + 1) % n; UI.selectTrack(S.trackIdx); Sfx.click(); }
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowUp' || e.code === 'KeyW') { S.trackIdx = (S.trackIdx + n - 1) % n; UI.selectTrack(S.trackIdx); Sfx.click(); }
      else if (e.code === 'Enter' || e.code === 'Space') startRace();
      else if (e.code === 'Escape' || e.code === 'Backspace') { Sfx.click(); setScreen('driver'); }
    } else if (S.screen === 'race') {
      if (S.resultsShown) {
        if (e.code === 'Enter') afterAd(quitToTracks);
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!$('quitModal').classList.contains('hidden')) { $('quitModal').classList.add('hidden'); S.paused = false; }
        else setPaused(!S.paused);
      } else if (e.code === 'KeyR' && S.me && S.me.respawnT <= 0 && S.race.phase !== 'countdown') {
        LK.respawnKart(S.me, S.race.track, S.race.events);
      }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.screen === 'race' && !S.resultsShown) setPaused(true); });

  // ---------------------------------------------------------------- race events -> sound / HUD
  function handleEvents() {
    const me = S.me;
    for (const e of S.race.drainEvents()) {
      const mine = e.id === me.id || e.a === me.id || e.b === me.id;
      switch (e.type) {
        case 'count': UI.countdown(String(e.n)); Sfx.count(); break;
        case 'go': UI.countdown('GO!', true); Sfx.go(); break;
        case 'lap':
          if (mine) {
            if (e.lap === S.race.laps) UI.banner('FINAL LAP!'); else UI.banner('LAP ' + e.lap);
            Sfx.lap();
          }
          break;
        case 'finish':
          if (mine) {
            UI.banner('FINISH! ' + LK.ordinal(e.place).toUpperCase(), true);
            Sfx.finish();
            S.finishT = 3.8;
            // the computer drives your kart for the victory lap
            S.controllers[me.id] = new LK.AIController(S.race, me, 0.9);
            const best = LK.store.get('best.' + S.race.track.def.id, null);
            if (!best || me.finishTime < best) LK.store.set('best.' + S.race.track.def.id, me.finishTime);
          }
          break;
        case 'bump': if (mine) { Sfx.bump(e.power); S.shake = Math.min(0.6, e.power * 0.05); } break;
        case 'wall': if (mine) { Sfx.wall(); S.shake = Math.max(S.shake, 0.15); } break;
        case 'boost': if (mine) Sfx.boost(); break;
        case 'land': if (mine) { Sfx.land(); S.shake = Math.max(S.shake, Math.min(0.4, e.power * 0.02)); } break;
        case 'respawn': if (mine) Sfx.respawn(); break;
      }
    }
  }

  // ---------------------------------------------------------------- per-frame kart visuals
  const tmpP = {};
  function syncKart(k, v, dt) {
    const tr = S.race.track, m = v.m, ud = m.userData;
    const s = tr.s[k.idx];
    m.position.set(k.x, k.y, k.z);
    m.rotation.y = k.yaw;
    const along = Math.sin(k.yaw) * s.tx + Math.cos(k.yaw) * s.tz;
    let pitch, roll;
    if (k.grounded) {
      pitch = -Math.atan(s.slope * along);
      roll = Math.abs(k.lat) <= s.hw ? -Math.atan(s.sb * along) : 0;
    } else {
      pitch = LK.clamp(-k.vy * 0.025, -0.5, 0.5);
      roll = 0;
    }
    ud.tilt.rotation.x = LK.damp(ud.tilt.rotation.x, pitch, 12, dt);
    ud.tilt.rotation.z = LK.damp(ud.tilt.rotation.z, roll + k.steerVis * -0.05 * Math.min(1, Math.abs(k.fs) / 20), 10, dt);
    // squash on landing, wobble on bumps, idle engine shiver
    const sq = k.landT > 0 ? 1 - Math.sin((k.landT / 0.25) * Math.PI) * 0.25 : 1;
    ud.body.scale.set(2 - sq, sq, 2 - sq);
    ud.body.rotation.z = k.bumpT > 0 ? Math.sin(k.bumpT * 40) * 0.12 : 0;
    ud.body.position.y = Math.sin(S.clock * 40 + k.id) * 0.02 * (1 - Math.min(1, Math.abs(k.fs) / 10));
    for (const w of ud.wheels) {
      w.spin.rotation.x += (k.fs * dt) / w.r;
      if (w.front) w.pivot.rotation.y = -k.steerVis * 0.45;
    }
    const boosting = k.boostT > 0;
    for (const f of ud.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    }
    if (ud.head) ud.head.rotation.y = LK.damp(ud.head.rotation.y, -k.steerVis * 0.4, 8, dt);
    // respawn: blink and drop in from above
    if (k.respawnT > 0) {
      m.visible = Math.floor(k.respawnT * 12) % 2 === 0;
      m.position.y += k.respawnT * 4;
    } else m.visible = true;
    // blob shadow on the road below
    const p = tr.project(k.x, k.y, k.z, k.idx, tmpP);
    const g = tr.groundAt(p);
    if (g != null && k.y - g < 25) {
      v.sh.visible = true;
      v.sh.position.set(k.x, g + 0.08, k.z);
      v.sh.rotation.z = k.yaw;
      const hgt = Math.max(0, k.y - g);
      v.sh.material.opacity = 1 / (1 + hgt * 0.25);
      v.sh.scale.setScalar(1 + hgt * 0.05);
    } else v.sh.visible = false;
  }

  // ---------------------------------------------------------------- camera
  function updateCamera(dt) {
    const k = S.me, race = S.race;
    let yawTarget = k.yaw;
    // during the countdown swing around from the front
    const big = S.karts3d[k.id].d.body === 'truck' ? 1.4 : 0;
    let dist = 8.4 + big, height = 3.6 + big * 0.6;
    if (race.phase === 'countdown') {
      const f = LK.clamp(race.countdown / 3.6, 0, 1);
      yawTarget += f * f * Math.PI;
      dist += f * 4; height += f * 2;
    }
    if (k.finished) { S.orbit = (S.orbit || 0) + dt * 0.5; yawTarget = k.yaw + Math.PI * 0.75 + S.orbit; dist = 9; height = 3.5; }
    if (race.phase === 'countdown' || k.finished) S.camYaw = yawTarget;
    else {
      let d = LK.wrapAngle(yawTarget - S.camYaw);
      S.camYaw += d * (1 - Math.exp(-7 * dt));
    }
    const boost = k.boostT > 0 ? 1 : 0;
    dist += boost * 1.2;
    const fx = Math.sin(S.camYaw), fz = Math.cos(S.camYaw);
    const tx = k.x - fx * dist, tz = k.z - fz * dist, ty = k.y + height;
    S.camPos.x = LK.damp(S.camPos.x, tx, 14, dt);
    S.camPos.z = LK.damp(S.camPos.z, tz, 14, dt);
    S.camPos.y = LK.damp(S.camPos.y, ty, 6, dt);
    S.camLook.set(k.x + fx * 4, k.y + 1.3, k.z + fz * 4);
    camera.position.copy(S.camPos);
    if (S.shake > 0) {
      S.shake = Math.max(0, S.shake - dt * 1.8);
      camera.position.x += (Math.random() - 0.5) * S.shake;
      camera.position.y += (Math.random() - 0.5) * S.shake;
    }
    camera.lookAt(S.camLook);
    const fov = 68 + Math.min(1, Math.abs(k.fs) / 35) * 6 + boost * 8;
    camera.fov = LK.damp(camera.fov, fov, 5, dt);
    camera.far = 2000;
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- main loop
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    S.clock += dt;
    Input.update(dt);

    if (S.screen === 'race' && S.race) {
      const race = S.race;
      if (!S.paused) {
        S.acc += dt;
        let steps = 0;
        while (S.acc >= LK.SIM_DT && steps < 5) {
          const inputs = S.controllers.map((c) => c.read());
          LK.Net.sendInput(race.tick, inputs[S.me.id]);
          race.step(inputs);
          S.acc -= LK.SIM_DT;
          steps++;
        }
        if (steps === 5) S.acc = 0;
        handleEvents();
        if (S.finishT > 0) {
          S.finishT -= dt;
          if (S.finishT <= 0 && !S.resultsShown) { S.resultsShown = true; UI.clearBanner(); UI.showResults(race, S.me.id); }
        }
      }
      for (const t of S.world.userData.tick) t(S.clock, dt);
      if (S.world.userData.sky) S.world.userData.sky.position.copy(camera.position);
      if (race.track.padTex) race.track.padTex.offset.y = -S.clock * 2;
      race.karts.forEach((k, i) => syncKart(k, S.karts3d[i], dt));
      updateCamera(dt);
      UI.hud(race, S.me);
      const st = LK.driverStats(S.karts3d[S.me.id].d);
      Sfx.engine(S.me.fs, st.maxSpeed, S.paused ? 0 : Input.state.throttle, !S.paused && !S.resultsShown);
      renderer.render(S.worldScene, camera);
    } else {
      // menu: spin the selected kart
      menu.spin += dt * 0.7;
      if (menu.kart) {
        menu.kart.rotation.y = menu.spin;
        menu.kart.position.y = Math.sin(S.clock * 2) * 0.08;
        for (const w of menu.kart.userData.wheels) w.spin.rotation.x += dt * 3;
      }
      menu.rays.rotation.z -= dt * 0.15;
      const portrait = innerHeight > innerWidth;
      camera.fov = portrait ? 60 : 40;
      if (S.screen === 'track') {
        camera.position.set(0, 4, 13);
        camera.lookAt(0, 1.5, 0);
      } else if (portrait) {
        camera.position.set(0, 4.2, 13);
        camera.lookAt(0, -3.4, 0);
      } else {
        camera.position.set(0, 3.8, 12.5);
        camera.lookAt(3.6 * (innerWidth / innerHeight) / 1.8, 1.4, 0); // kart shows on the left, beside the info panel
      }
      camera.updateProjectionMatrix();
      renderer.render(menu.scene, camera);
    }
  }
  setScreen('driver');
  requestAnimationFrame(frame);

  // handy for debugging from the console
  LK.debug = { S, startRace, renderer };
})(window.LK);
