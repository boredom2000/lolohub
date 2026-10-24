// ALIEN IN SPACE — first-person wave shooter for the Lolo Hub.
// Plain three.js (r149, global THREE). Glow comes from emissive materials, additive sprites and one
// big additive particle system, so it runs without post-processing on phones too.
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const TAU = Math.PI * 2;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', IS_TOUCH);

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- renderer / scene
// Performance: low pixel ratio, no MSAA on touch devices, Lambert materials only and no dynamic lights.
const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
$('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const FOG_COLOR = 0x1a0638;
scene.background = new THREE.Color(0x05010c);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0105);

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1600);
camera.position.set(0, 1.7, 0);
camera.rotation.order = 'YXZ';
scene.add(camera);

const raycaster = new THREE.Raycaster();

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return new THREE.CanvasTexture(c);
}

const glowTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

function glowMat(color, opacity = 1) {
  return new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}
function glow(color, size, opacity = 1, mat) {
  const s = new THREE.Sprite(mat || glowMat(color, opacity));
  s.scale.set(size, size, 1);
  return s;
}

// ---------------------------------------------------------------- sky
const skyTex = canvasTex(2048, 1024, (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#010006');
  bg.addColorStop(0.3, '#08021c');
  bg.addColorStop(0.47, '#22084a');
  bg.addColorStop(0.5, '#1a0638');
  bg.addColorStop(1, '#05010c');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const neb = ['255,47,214', '25,247,255', '120,60,255', '180,76,255', '255,90,140'];
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w, y = h * rand(0.08, 0.5), r = rand(60, 320);
    const col = pick(neb), a = rand(0.04, 0.13);
    for (const ox of [-w, 0, w]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, `rgba(${col},${a})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 2600; i++) {
    const a = Math.random();
    g.fillStyle = `rgba(255,255,255,${a * a})`;
    const s = Math.random() < 0.97 ? 1 : 2;
    g.fillRect(Math.random() * w, Math.random() * h * 0.5, s, s);
  }
  const hz = g.createLinearGradient(0, h * 0.4, 0, h * 0.52);
  hz.addColorStop(0, 'rgba(255,47,214,0)');
  hz.addColorStop(0.8, 'rgba(255,60,200,0.3)');
  hz.addColorStop(1, 'rgba(255,47,214,0)');
  g.fillStyle = hz; g.fillRect(0, h * 0.4, w, h * 0.12);
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -10;
scene.add(sky);

// crisp star points
{
  const n = 2200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const palette = [new THREE.Color(0xffffff), new THREE.Color(0x9ffcff), new THREE.Color(0xffb0f0), new THREE.Color(0xfff2a0)];
  for (let i = 0; i < n; i++) {
    const th = Math.random() * TAU, y = rand(0.02, 1);
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(th) * r * 900; pos[i * 3 + 1] = y * 900; pos[i * 3 + 2] = Math.sin(th) * r * 900;
    const c = pick(palette), k = rand(0.4, 1);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false })));
}

// ringed planet + moon
const planetTex = canvasTex(512, 256, (g, w, h) => {
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const n = Math.sin(t * 38) + Math.sin(t * 13 + 1) * 0.7 + Math.sin(t * 97) * 0.25;
    g.fillStyle = `rgb(${(130 + 60 * n) | 0},${(40 + 25 * n) | 0},${(190 + 45 * n) | 0})`;
    g.fillRect(0, y, w, 1);
  }
});
const planet = new THREE.Group();
planet.position.set(-300, 250, -620);
{
  const ball = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32),
    new THREE.MeshLambertMaterial({ map: planetTex, emissive: 0x2a0040, fog: false }));
  ball.rotation.z = 0.35;
  planet.add(ball);
  planet.add(glow(0xff3fd0, 390, 0.55));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc58cff, side: THREE.DoubleSide, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(160, 250, 128), ringMat);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(132, 152, 128), ringMat.clone());
  ring2.material.color.set(0x19f7ff); ring2.material.opacity = 0.25;
  for (const r of [ring, ring2]) { r.rotation.set(-1.25, 0.25, 0.3); planet.add(r); }
  planet.userData.ball = ball;
}
scene.add(planet);

{
  const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 20),
    new THREE.MeshLambertMaterial({ color: 0x9ff6ff, emissive: 0x0a3a44, fog: false }));
  moon.position.set(330, 170, -650);
  scene.add(moon);
  const mg = glow(0x19f7ff, 140, 0.45); mg.position.copy(moon.position); scene.add(mg);
}

// horizon glow band
{
  const t = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,60,210,0.55)');
    gr.addColorStop(0.35, 'rgba(160,60,255,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(800, 800, 160, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, fog: false }));
  band.position.y = 70;
  band.renderOrder = -9;
  scene.add(band);
}

// ---------------------------------------------------------------- ground
const gridTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.shadowColor = '#19f7ff'; g.shadowBlur = 14;
  g.strokeStyle = '#19f7ff'; g.lineWidth = 5; g.strokeRect(0, 0, w, h);
  g.shadowColor = '#b44cff'; g.shadowBlur = 6;
  g.globalAlpha = 0.45; g.strokeStyle = '#b44cff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
});
gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
gridTex.repeat.set(2400 / 6, 2400 / 6);
gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
  new THREE.MeshLambertMaterial({ color: 0x0c0420, emissive: 0xffffff, emissiveMap: gridTex, emissiveIntensity: 0.5 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------------------------------------------------------------- lights
scene.add(new THREE.AmbientLight(0x5a3a9a, 0.65));
scene.add(new THREE.HemisphereLight(0x9a6bff, 0x0a0420, 0.7));
const sun = new THREE.DirectionalLight(0x9ffcff, 0.85);
sun.position.set(60, 100, 40);
scene.add(sun);

// Flashes are pooled additive glow sprites, not point lights: dynamic lights made every lit
// material much more expensive to shade.
const flashes = [];
function flash(pos, color, intensity, dist, dur) {
  let f = flashes[0];
  for (const o of flashes) if (o.t < f.t) f = o;
  f.s.position.copy(pos);
  f.s.material.color.set(color);
  // keep flashes right at the muzzle from covering the whole screen
  f.size = Math.min(dist * 0.35, pos.distanceTo(camera.position) * 0.5);
  f.t = dur; f.dur = dur; f.i0 = Math.min(1, intensity * 0.18);
  f.s.visible = true;
}
for (let i = 0; i < 6; i++) {
  const s = glow(0xffffff, 1, 0);
  s.visible = false;
  scene.add(s);
  flashes.push({ s, t: 0, dur: 1, i0: 0, size: 1 });
}
function updateFlashes(dt) {
  for (const f of flashes) {
    if (f.t <= 0) { f.s.visible = false; continue; }
    f.t -= dt;
    const k = Math.max(0, f.t / f.dur);
    f.s.material.opacity = f.i0 * k;
    f.s.scale.setScalar(f.size * (1.3 - 0.5 * k));
  }
}

// ---------------------------------------------------------------- shared geometry
const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  oct: new THREE.OctahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 7),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  torus: new THREE.TorusGeometry(1, 0.14, 8, 28),
  beam: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
};
function stdMat(color, emissive, ei, extra) {
  return new THREE.MeshLambertMaterial(Object.assign({ color, emissive, emissiveIntensity: ei }, extra));
}
function mesh(geo, mat, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  return m;
}

// ---------------------------------------------------------------- environment / obstacles
const obstacles = [];   // { pos, r } — used for spawning and steering
const envMeshes = [];   // raycast targets
const decor = [];       // slowly spinning things

const rockMat = new THREE.MeshLambertMaterial({ color: 0x2b1655, flatShading: true, emissive: 0x0d0226 });
const crystalColors = [0x19f7ff, 0xff2fd6, 0x7dff2f, 0xb44cff];
const crystalMats = crystalColors.map((c) => stdMat(c, c, 0.9, { flatShading: true, transparent: true, opacity: 0.92 }));

function jitterGeo(geo, amt) {
  const p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let s = seen.get(k);
    if (s === undefined) { s = 1 + rand(-amt, amt); seen.set(k, s); }
    p.setXYZ(i, x * s, y * s, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function addRock(x, z, r, crystals = true) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const m = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(r, 1), 0.22), rockMat);
  m.scale.set(1, rand(0.6, 0.9), 1);
  m.position.y = r * 0.25;
  m.rotation.y = rand(0, TAU);
  g.add(m); envMeshes.push(m);
  if (crystals) {
    const ci = (Math.random() * crystalColors.length) | 0;
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(G.oct, crystalMats[ci]);
      const a = rand(0, TAU), h = rand(0.6, 1.6) * r * 0.5;
      c.scale.set(h * 0.28, h, h * 0.28);
      c.position.set(Math.cos(a) * r * rand(0.25, 0.6), r * 0.55 + rand(0, r * 0.3), Math.sin(a) * r * rand(0.25, 0.6));
      c.rotation.set(rand(-0.5, 0.5), rand(0, TAU), rand(-0.5, 0.5));
      g.add(c); envMeshes.push(c);
    }
    const gl = glow(crystalColors[ci], r * 2.8, 0.32);
    gl.position.y = r * 0.9;
    g.add(gl);
  }
  scene.add(g);
  obstacles.push({ pos: new THREE.Vector3(x, 0, z), r: r * 0.95 });
}

function addSpire(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const ci = (Math.random() * crystalColors.length) | 0, col = crystalColors[ci];
  const h = rand(7, 13);
  const main = new THREE.Mesh(G.oct, crystalMats[ci]);
  main.scale.set(1.3, h / 2, 1.3); main.position.y = h / 2 - 0.6; main.rotation.y = rand(0, TAU);
  g.add(main); envMeshes.push(main);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(G.oct, crystalMats[ci]);
    const sh = h * rand(0.25, 0.45), a = rand(0, TAU);
    s.scale.set(0.6, sh / 2, 0.6);
    s.position.set(Math.cos(a) * 1.3, sh / 2 - 0.4, Math.sin(a) * 1.3);
    s.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(s); envMeshes.push(s);
  }
  const base = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(2, 1), 0.25), rockMat);
  base.scale.y = 0.45;
  g.add(base); envMeshes.push(base);
  const top = glow(col, 6, 0.7); top.position.y = h - 0.5; g.add(top);
  const mid = glow(col, h * 1.4, 0.22); mid.position.y = h * 0.5; g.add(mid);
  scene.add(g);
  obstacles.push({ pos: new THREE.Vector3(x, 0, z), r: 2.2 });
}

const monoMat = new THREE.MeshLambertMaterial({ color: 0x1a1030, emissive: 0x05001a });
const stripMats = [new THREE.MeshBasicMaterial({ color: 0x19f7ff }), new THREE.MeshBasicMaterial({ color: 0xff2fd6 })];
function addMonolith(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.set(0, rand(0, TAU), rand(-0.12, 0.12));
  const h = rand(6, 9);
  const body = mesh(G.box, monoMat, 2.4, h, 1.0);
  body.position.y = h / 2 - 0.3;
  g.add(body); envMeshes.push(body);
  const sm = pick(stripMats);
  for (const sx of [-0.8, 0, 0.8]) {
    const s = mesh(G.box, sm, 0.12, h * rand(0.5, 0.85), 1.06);
    s.position.set(sx, h * 0.45, 0);
    g.add(s);
  }
  const ring = mesh(G.torus, sm, 1.6);
  ring.rotation.x = Math.PI / 2; ring.position.y = h + 0.8;
  g.add(ring);
  decor.push({ o: ring, spin: 1.2, axis: 'z' });
  const gl = glow(sm.color.getHex(), 5, 0.6); gl.position.y = h + 0.8; g.add(gl);
  scene.add(g);
  obstacles.push({ pos: new THREE.Vector3(x, 0, z), r: 1.8 });
}

function layout() {
  const free = (x, z, r) => obstacles.every((o) => Math.hypot(o.pos.x - x, o.pos.z - z) > o.r + r + 4);
  let count = 0, guard = 0;
  while (count < 22 && guard++ < 800) {
    const z = rand(-88, -14), x = rand(-62, 62);
    if (Math.abs(x) < 5 && z > -26) continue; // keep the near centre lane open
    const kind = Math.random();
    const r = kind < 0.55 ? rand(2.6, 4.8) : 2.3;
    if (!free(x, z, r)) continue;
    if (kind < 0.55) addRock(x, z, r);
    else if (kind < 0.8) addSpire(x, z);
    else addMonolith(x, z);
    count++;
  }
  // scenery off to the sides, visible thanks to the wide FOV
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, x = side * rand(20, 75), z = rand(-12, 40), r = rand(3, 6.5);
    if (free(x, z, r)) addRock(x, z, r, Math.random() < 0.6);
  }
  // floating asteroids
  for (let i = 0; i < 26; i++) {
    const a = rand(-1.9, 1.9), d = rand(70, 230);
    const m = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(rand(1.5, 6), 1), 0.3), rockMat);
    m.position.set(Math.sin(a) * d, rand(25, 95), -Math.cos(a) * d);
    m.rotation.set(rand(0, TAU), rand(0, TAU), 0);
    scene.add(m);
    decor.push({ o: m, spin: rand(-0.4, 0.4), axis: 'x', bob: rand(0, TAU), y0: m.position.y });
  }
}
layout();

// drifting space dust near the player
const dust = (() => {
  const n = 450, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rand(-60, 60); pos[i * 3 + 1] = rand(0.3, 25); pos[i * 3 + 2] = rand(-80, 10);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, size: 0.35, color: 0xa8e8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(p);
  return p;
})();

// ---------------------------------------------------------------- particles (one additive draw call)
const PN = 1500;
const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN);
const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
const pS0 = new Float32Array(PN), pS1 = new Float32Array(PN), pGrav = new Float32Array(PN), pDrag = new Float32Array(PN);
let pNext = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('pcolor', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('psize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('palpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
const pMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 500 } },
  vertexShader: `
    attribute vec3 pcolor; attribute float psize; attribute float palpha;
    uniform float uScale;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = psize * uScale / max(0.1, -mv.z);
      gl_Position = projectionMatrix * mv;
      vColor = pcolor; vAlpha = palpha * smoothstep(0.6, 3.5, -mv.z);
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      if (d > 1.0) discard;
      float a = pow(1.0 - d, 1.6);
      vec3 c = mix(vColor, vec3(1.0), smoothstep(0.55, 0.0, d) * 0.6);
      gl_FragColor = vec4(c, a * vAlpha);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false;
scene.add(particles);

const _c = new THREE.Color();
function emit(x, y, z, vx, vy, vz, color, life, s0, s1, grav = 0, drag = 0) {
  const i = pNext; pNext = (pNext + 1) % PN;
  const i3 = i * 3;
  pPos[i3] = x; pPos[i3 + 1] = y; pPos[i3 + 2] = z;
  pVel[i3] = vx; pVel[i3 + 1] = vy; pVel[i3 + 2] = vz;
  _c.set(color);
  pCol[i3] = _c.r; pCol[i3 + 1] = _c.g; pCol[i3 + 2] = _c.b;
  pLife[i] = pMax[i] = life; pS0[i] = s0; pS1[i] = s1; pGrav[i] = grav; pDrag[i] = drag;
  pSize[i] = s0; pAlpha[i] = 1;
}
function burst(p, color, n, speed, life, size, grav = 0, drag = 2) {
  n = Math.ceil(n * 0.6); // trimmed for frame rate
  for (let i = 0; i < n; i++) {
    _v3.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
    emit(p.x, p.y, p.z, _v3.x, _v3.y, _v3.z, Array.isArray(color) ? pick(color) : color,
      life * rand(0.6, 1.2), size * rand(0.6, 1.2), size * 0.15, grav, drag);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pAlpha[i] = 0; pSize[i] = 0; continue; }
    const k = 1 - pLife[i] / pMax[i], i3 = i * 3;
    const d = Math.max(0, 1 - pDrag[i] * dt);
    pVel[i3] *= d; pVel[i3 + 1] = pVel[i3 + 1] * d - pGrav[i] * dt; pVel[i3 + 2] *= d;
    pPos[i3] += pVel[i3] * dt; pPos[i3 + 1] += pVel[i3 + 1] * dt; pPos[i3 + 2] += pVel[i3 + 2] * dt;
    pSize[i] = pS0[i] + (pS1[i] - pS0[i]) * k;
    pAlpha[i] = 1 - k * k;
  }
  for (const n of ['position', 'pcolor', 'psize', 'palpha']) pGeo.attributes[n].needsUpdate = true;
}

// ---------------------------------------------------------------- audio (synthesized)
const Sfx = (() => {
  let ctx = null, master = null, noise = null, flameGain = null;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    flameGain = ctx.createGain(); flameGain.gain.value = 0;
    src.connect(lp).connect(flameGain).connect(master);
    src.start();
  }
  function tone(f0, f1, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(dur, f0, f1, vol = 0.3, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.4); s.stop(t + dur);
  }
  return {
    init,
    plasma() { tone(1300, 280, 0.14, 'square', 0.05); tone(700, 140, 0.12, 'sawtooth', 0.04); },
    laser() { tone(2600, 70, 0.65, 'sawtooth', 0.11); hiss(0.5, 9000, 400, 0.14, 'highpass'); tone(90, 35, 0.5, 'sine', 0.35); },
    rocket() { hiss(0.45, 500, 3200, 0.2, 'bandpass'); tone(220, 70, 0.3, 'triangle', 0.12); },
    boom() { hiss(1.0, 1400, 50, 0.55); tone(120, 28, 0.8, 'sine', 0.5); },
    kill() { tone(520, 1500, 0.1, 'square', 0.035); tone(300, 50, 0.25, 'triangle', 0.09); },
    hurt() { tone(170, 55, 0.2, 'sawtooth', 0.1); },
    ready() { tone(880, 1760, 0.1, 'sine', 0.07); tone(1320, 2640, 0.14, 'sine', 0.05, 0.07); },
    wave() { [0, 0.12, 0.24].forEach((d, i) => tone(440 * (i + 2), 440 * (i + 2) * 1.5, 0.25, 'square', 0.05, d)); },
    mg() { tone(rand(150, 190), 50, 0.05, 'square', 0.045); hiss(0.05, 3000, 800, 0.08); },
    select() { tone(600, 900, 0.06, 'square', 0.04); },
    flame(on) { if (ctx) flameGain.gain.setTargetAtTime(on ? 0.4 : 0, ctx.currentTime, 0.05); },
  };
})();

// ---------------------------------------------------------------- weapons
const ICONS = {
  plasma: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke-width="1.2" opacity=".6"/></svg>',
  laser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M2 12h20" stroke-width="8" opacity=".25"/><path d="M2 12h20" stroke-width="3.5"/><path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3" stroke-width="1.6"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5c3.2 3 4.3 7.2 3.4 12.5H8.6C7.7 8.7 8.8 4.5 12 1.5z"/><path d="M8.4 10.5L5 15.5v2l3.6-2zM15.6 10.5l3.4 5v2l-3.6-2z" opacity=".75"/><path d="M10 15.5h4l-2 7z" opacity=".55"/></svg>',
  mg: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="9" width="11" height="6" rx="1.2"/><rect x="13" y="8.6" width="9" height="1.6" rx=".8"/><rect x="13" y="11.2" width="9" height="1.6" rx=".8"/><rect x="13" y="13.8" width="9" height="1.6" rx=".8"/><rect x="4" y="15" width="4" height="6" rx="1" opacity=".7"/><circle cx="8" cy="5" r="1.4" opacity=".8"/><circle cx="12" cy="4" r="1.1" opacity=".6"/><circle cx="16" cy="5" r=".9" opacity=".45"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5c.8 4 6.5 6.2 6.5 12.5a6.5 6.5 0 0 1-13 0c0-3.2 2-5.4 3-7.4.2 3 1.3 4.3 2.4 4.6-.4-4.3-.6-6.7 1.1-9.7z"/><path d="M12 13c.6 2 3 3 3 5.3a3 3 0 0 1-6 0c0-1.5 1-2.6 1.6-3.6.3 1.3.8 1.8 1.2 1.9-.2-1.6-.3-2.4.2-3.6z" fill="#fff" opacity=".7"/></svg>',
};
const weapons = [
  { id: 'plasma', name: 'PLASMA RIFLE', short: 'PLASMA', cd: 0.3, color: '#3ad7ff', info: '0.3s' },
  { id: 'laser', name: 'LASER GUN', short: 'LASER', cd: 3, color: '#ff2fd6', info: '3s' },
  { id: 'rocket', name: 'ROCKET LAUNCHER', short: 'ROCKET', cd: 1, color: '#ff8a2a', info: '1s' },
  { id: 'flame', name: 'FLAMETHROWER', short: 'FLAME', cd: 0, color: '#ffd23a', info: 'HOLD', hold: true },
  { id: 'mg', name: 'MACHINE GUN', short: 'MACHINE', cd: 0.075, color: '#7dff2f', info: 'HOLD', hold: true },
];
for (const w of weapons) w.t = 0;

// view-model guns (children of the camera, barrel along +Z so lookAt aims them)
const gunRig = new THREE.Group();
gunRig.scale.setScalar(0.6);
camera.add(gunRig);
const gunBase = new THREE.Vector3(0.34, -0.3, -0.62);

function rotZ(m) { m.rotation.x = Math.PI / 2; return m; } // cylinder/cone axis Y -> Z
function buildGun(id) {
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x3a4062, emissive: 0x070418 });
  const muzzle = new THREE.Object3D();
  if (id === 'plasma') {
    const glowM = new THREE.MeshBasicMaterial({ color: 0x3ad7ff });
    g.add(mesh(G.box, metal, 0.11, 0.12, 0.42));
    const barrel = rotZ(mesh(G.cyl, metal, 0.032, 0.3, 0.032)); barrel.position.z = 0.32; g.add(barrel);
    for (const z of [0.15, 0.23, 0.31]) { const t = mesh(G.torus, glowM, 0.05); t.position.z = z; g.add(t); }
    const cell = mesh(G.box, glowM, 0.03, 0.04, 0.24); cell.position.set(0.06, 0.02, -0.04); g.add(cell);
    const grip = mesh(G.box, metal, 0.05, 0.14, 0.07); grip.position.set(0, -0.11, -0.1); grip.rotation.x = 0.35; g.add(grip);
    const tip = glow(0x3ad7ff, 0.14, 0.9); tip.position.z = 0.47; g.add(tip);
    muzzle.position.z = 0.48;
  } else if (id === 'laser') {
    const coreM = new THREE.MeshBasicMaterial({ color: 0xff2fd6 });
    g.add(mesh(G.box, metal, 0.09, 0.1, 0.62));
    for (const x of [-0.055, 0.055]) { const r = mesh(G.box, coreM, 0.018, 0.02, 0.74); r.position.set(x, 0.0, 0.08); g.add(r); }
    const core = rotZ(mesh(G.cyl, coreM, 0.025, 0.5, 0.025)); core.position.set(0, 0.06, 0.02); g.add(core);
    const scope = rotZ(mesh(G.cyl, metal, 0.03, 0.18, 0.03)); scope.position.set(0, 0.09, -0.1); g.add(scope);
    const grip = mesh(G.box, metal, 0.05, 0.14, 0.07); grip.position.set(0, -0.11, -0.16); grip.rotation.x = 0.35; g.add(grip);
    const tip = glow(0xff2fd6, 0.2, 0.9); tip.position.z = 0.46; g.add(tip);
    g.userData.core = coreM; g.userData.tip = tip;
    muzzle.position.z = 0.47;
  } else if (id === 'rocket') {
    const tubeM = new THREE.MeshLambertMaterial({ color: 0x4a2a66, emissive: 0x0c0418 });
    const stripe = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    const tube = rotZ(mesh(G.cyl, tubeM, 0.085, 0.72, 0.085)); tube.position.z = 0.04; g.add(tube);
    for (const z of [-0.2, 0.3]) { const t = mesh(G.torus, stripe, 0.09); t.position.z = z; g.add(t); }
    const head = rotZ(mesh(G.cone, stripe, 0.06, 0.14, 0.06)); head.position.z = 0.36; g.add(head);
    const sight = mesh(G.box, metal, 0.03, 0.07, 0.1); sight.position.set(0, 0.1, 0.1); g.add(sight);
    const grip = mesh(G.box, metal, 0.05, 0.14, 0.07); grip.position.set(0, -0.12, -0.05); grip.rotation.x = 0.35; g.add(grip);
    g.userData.head = head;
    muzzle.position.z = 0.42;
  } else if (id === 'mg') {
    const glowM = new THREE.MeshBasicMaterial({ color: 0x7dff2f });
    g.add(mesh(G.box, metal, 0.13, 0.13, 0.32));
    // rotating barrel cluster
    const barrels = new THREE.Group(); barrels.position.z = 0.3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const b = rotZ(mesh(G.cyl, metal, 0.016, 0.34, 0.016)); b.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0);
      barrels.add(b);
    }
    for (const z of [-0.1, 0.12]) { const t = mesh(G.torus, glowM, 0.055); t.position.z = z; barrels.add(t); }
    g.add(barrels);
    const ammo = mesh(G.box, glowM, 0.08, 0.1, 0.12); ammo.position.set(-0.1, -0.03, 0); g.add(ammo);
    const grip = mesh(G.box, metal, 0.05, 0.14, 0.07); grip.position.set(0, -0.12, -0.08); grip.rotation.x = 0.35; g.add(grip);
    g.userData.barrels = barrels;
    muzzle.position.z = 0.49;
  } else {
    const tankM = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    const nozzle = rotZ(mesh(G.cyl, metal, 0.035, 0.46, 0.035)); nozzle.position.z = 0.1; g.add(nozzle);
    const flare = rotZ(mesh(G.cone, metal, 0.06, 0.1, 0.06)); flare.rotation.x = -Math.PI / 2; flare.position.z = 0.35; g.add(flare);
    const tank = mesh(G.sphere, metal, 0.1, 0.1, 0.16); tank.position.set(0, -0.1, -0.04); g.add(tank);
    const band = mesh(G.torus, tankM, 0.1); band.position.set(0, -0.1, -0.04); g.add(band);
    const body = mesh(G.box, metal, 0.08, 0.08, 0.3); body.position.z = -0.12; g.add(body);
    const pilot = glow(0xff9a2a, 0.14, 1); pilot.position.z = 0.41; g.add(pilot);
    g.userData.pilot = pilot;
    muzzle.position.z = 0.4;
  }
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.visible = false;
  gunRig.add(g);
  return g;
}
const guns = weapons.map((w) => buildGun(w.id));

function placeGun() {
  const portrait = camera.aspect < 1;
  gunBase.set(portrait ? 0.15 : 0.3, portrait ? -0.3 : -0.22, -0.62);
}

// ---------------------------------------------------------------- HUD: weapon bar
const weaponEls = [];
weapons.forEach((w, i) => {
  const b = document.createElement('button');
  b.className = 'wpn';
  b.style.setProperty('--c', w.color);
  b.title = `${w.name} (${i + 1})`;
  b.innerHTML = `<i class="cd"></i><span class="key">${i + 1}</span><span class="cdtxt">${w.info}</span><span class="icon">${ICONS[w.id]}</span><span class="nm">${w.short}</span>`;
  b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); Sfx.init(); selectWeapon(i); });
  $('weapons').appendChild(b);
  weaponEls.push({ btn: b, cd: b.querySelector('.cd') });
});

// ---------------------------------------------------------------- game state
const state = {
  mode: 'title', paused: false, time: 0, level: 1, score: 0, kills: 0,
  hp: 100, maxHp: 100, hurt: 0, spawnT: 1.5, weapon: 0, switchT: 0, recoil: 0, shake: 0,
};
const look = { yaw: 0, pitch: 0.05 };
const aim = { o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(0, 1.7, -30) };
const aimNdc = new THREE.Vector2(0, 0.05);
const aimPx = { x: innerWidth / 2, y: innerHeight * 0.475 };
let firing = false, firePointer = null;

const enemies = [], bolts = [], rockets = [], beams = [];

function selectWeapon(i) {
  if (i === state.weapon || i < 0 || i >= weapons.length) return;
  state.weapon = i;
  state.switchT = 1;
  Sfx.select();
  weaponEls.forEach((e, j) => e.btn.classList.toggle('on', j === i));
  const wn = $('weaponName');
  wn.textContent = weapons[i].name;
  wn.style.setProperty('--c', weapons[i].color);
  wn.classList.add('show');
  clearTimeout(selectWeapon.tm);
  selectWeapon.tm = setTimeout(() => wn.classList.remove('show'), 1100);
  $('crosshair').style.setProperty('--c', weapons[i].color);
}

// ---------------------------------------------------------------- enemies
const ENEMY = {
  crawler: { hp: 34, speed: 2.4, radius: 1.0, hitY: 1.0, dps: 9, points: 10, color: 0x7dff2f, colors: [0x7dff2f, 0xc8ff5a, 0xfff23a] },
  flyer: { hp: 22, speed: 4.4, radius: 0.95, hitY: 0, dps: 7, points: 15, color: 0xff2fd6, colors: [0xff2fd6, 0x19f7ff, 0xb44cff] },
  brute: { hp: 170, speed: 1.5, radius: 1.7, hitY: 1.8, dps: 20, points: 40, color: 0xff7a1a, colors: [0xff7a1a, 0xff2a2a, 0xffd23a] },
};
const hpMul = () => 1 + 0.24 * (state.level - 1);
const spdMul = () => Math.min(2.3, 1 + 0.09 * (state.level - 1));
const dpsMul = () => 1 + 0.1 * (state.level - 1);

function buildCrawler(e) {
  const g = new THREE.Group();
  const body = stdMat(0x1f6b12, 0x3cff1a, 0.35);
  const eyeM = stdMat(0xffffaa, 0xfff23a, 1.4);
  const dark = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const spot = new THREE.MeshBasicMaterial({ color: 0x9dff5a });
  const torso = mesh(G.sphere, body, 0.95, 0.72, 1.05); torso.position.y = 1.0; g.add(torso);
  for (let i = 0; i < 5; i++) {
    const a = rand(0, TAU), s = mesh(G.sphere, spot, rand(0.07, 0.13));
    s.position.set(Math.cos(a) * 0.6, 1.35 + rand(0, 0.15), Math.sin(a) * 0.6 - 0.1); g.add(s);
  }
  const eye = mesh(G.sphere, eyeM, 0.36); eye.position.set(0, 1.28, 0.78); g.add(eye);
  const pupil = mesh(G.sphere, dark, 0.16, 0.22, 0.08); pupil.position.set(0, 1.3, 1.12); g.add(pupil);
  const eg = glow(0xfff23a, 1.5, 0.75); eg.position.set(0, 1.28, 0.9); g.add(eg);
  for (const s of [-1, 1]) {
    const stalk = mesh(G.cyl, body, 0.035, 0.6, 0.035); stalk.position.set(s * 0.3, 1.82, 0.15); stalk.rotation.z = -s * 0.4; g.add(stalk);
    const tip = mesh(G.sphere, spot, 0.1); tip.position.set(s * 0.43, 2.1, 0.15); g.add(tip);
    const tg = glow(0x9dff5a, 0.7, 0.9); tg.position.copy(tip.position); g.add(tg);
  }
  e.legs = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    const sx = i < 2 ? -0.6 : 0.6;
    pivot.position.set(sx, 0.9, i % 2 ? 0.45 : -0.45);
    const leg = mesh(G.cone, body, 0.16, 0.95, 0.16); leg.rotation.x = Math.PI; leg.position.y = -0.47;
    pivot.add(leg); pivot.rotation.z = (sx < 0 ? -1 : 1) * 0.35;
    g.add(pivot); e.legs.push(pivot);
  }
  e.torso = torso;
  const halo = glow(0x7dff2f, 3.6, 0.26); halo.position.y = 1; g.add(halo);
  e.mats = [body, eyeM];
  return g;
}

function buildFlyer(e) {
  const g = new THREE.Group();
  const body = stdMat(0x6a0f5a, 0xff2fd6, 0.55);
  const eyeM = stdMat(0xaaffff, 0x19f7ff, 1.5);
  const wingM = stdMat(0x3a0a50, 0xb44cff, 0.7, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const tent = new THREE.MeshBasicMaterial({ color: 0xff6ae6 });
  g.add(mesh(G.oct, body, 0.75, 0.55, 0.95));
  const eye = mesh(G.sphere, eyeM, 0.3); eye.position.set(0, 0.1, 0.6); g.add(eye);
  const eg = glow(0x19f7ff, 1.4, 0.85); eg.position.set(0, 0.1, 0.75); g.add(eg);
  e.wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.4, 0.1, 0);
    const wing = mesh(G.box, wingM, 1.7, 0.05, 0.8); wing.position.set(s * 0.85, 0, -0.1);
    pivot.add(wing); g.add(pivot); e.wings.push(pivot);
  }
  for (let i = 0; i < 3; i++) {
    const t = mesh(G.cone, tent, 0.07, 0.8, 0.07); t.rotation.x = Math.PI;
    t.position.set((i - 1) * 0.25, -0.75, -0.1); g.add(t);
  }
  const ring = mesh(G.torus, new THREE.MeshBasicMaterial({ color: 0x19f7ff }), 0.9);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.15; g.add(ring);
  e.ring = ring;
  const halo = glow(0xff2fd6, 3.4, 0.3); g.add(halo);
  e.mats = [body, eyeM, wingM];
  return g;
}

function buildBrute(e) {
  const g = new THREE.Group();
  const body = stdMat(0x5a1d05, 0xff5a1a, 0.4);
  const eyeM = stdMat(0xff8080, 0xff1a1a, 1.8);
  const spikeM = stdMat(0xffb36b, 0xff7a1a, 1.0);
  const mouth = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const torso = mesh(G.sphere, body, 1.35, 1.25, 1.1); torso.position.y = 1.75; g.add(torso);
  const head = mesh(G.sphere, body, 0.7); head.position.set(0, 2.9, 0.45); g.add(head);
  for (const s of [-1, 1]) {
    const eye = mesh(G.sphere, eyeM, 0.14); eye.position.set(s * 0.28, 3.02, 1.05); g.add(eye);
    const eg = glow(0xff2a2a, 0.9, 1); eg.position.copy(eye.position); g.add(eg);
  }
  const m = mesh(G.box, mouth, 0.6, 0.1, 0.1); m.position.set(0, 2.68, 1.05); g.add(m);
  for (let i = 0; i < 5; i++) {
    const sp = mesh(G.cone, spikeM, 0.18, 0.7, 0.18);
    sp.position.set((i - 2) * 0.35, 2.2 + Math.sin(i) * 0.3, -1.0); sp.rotation.x = -1.1; g.add(sp);
  }
  e.arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 1.35, 2.3, 0.1);
    const arm = mesh(G.box, body, 0.45, 1.5, 0.45); arm.position.y = -0.75; pivot.add(arm);
    const fist = mesh(G.sphere, spikeM, 0.4); fist.position.y = -1.55; pivot.add(fist);
    g.add(pivot); e.arms.push(pivot);
    const leg = mesh(G.cyl, body, 0.4, 1.0, 0.4); leg.position.set(s * 0.6, 0.5, 0); g.add(leg);
  }
  const halo = glow(0xff7a1a, 6, 0.26); halo.position.y = 1.8; g.add(halo);
  e.mats = [body, eyeM, spikeM];
  return g;
}
const BUILD = { crawler: buildCrawler, flyer: buildFlyer, brute: buildBrute };

function spawnEnemy(type) {
  const T = ENEMY[type];
  const e = {
    type, T, hp: T.hp * hpMul(), radius: T.radius, hitY: T.hitY,
    speed: T.speed * spdMul() * rand(0.88, 1.12), dps: T.dps * dpsMul(),
    t: rand(0, 10), flash: 0, burn: 0, spawnT: 0, atkT: rand(0, 0.5), attacking: false, dead: false,
    side: Math.random() < 0.5 ? -1 : 1,
    vel: new THREE.Vector3(), target: new THREE.Vector3(), state: 'advance',
  };
  e.group = BUILD[type](e);
  e.base = e.mats.map((m) => ({ c: m.emissive.clone(), i: m.emissiveIntensity }));
  const p = e.group.position;

  if (type === 'flyer') {
    const a = rand(-1.05, 1.05), d = rand(60, 85);
    p.set(Math.sin(a) * d, rand(26, 44), -Math.cos(a) * d);
    const ta = a * 0.5 + rand(-0.3, 0.3), td = rand(3.6, 4.8);
    e.target.set(Math.sin(ta) * td, rand(1.8, 3.4), -Math.cos(ta) * td);
    e.state = 'dive';
    e.vel.set(0, -3, 4);
    burst(p, ENEMY.flyer.colors, 24, 10, 0.7, 2.2, 0, 2);
  } else {
    const cands = obstacles.filter((o) => o.pos.z < -16 && o.pos.length() < 80 &&
      Math.abs(Math.atan2(o.pos.x, -o.pos.z)) < 1.1 && (type !== 'brute' || o.r > 2.1));
    if (cands.length && Math.random() < 0.82) {
      const o = pick(cands);
      const away = _v1.set(o.pos.x, 0, o.pos.z).normalize();
      const tang = _v2.set(-away.z, 0, away.x).multiplyScalar(e.side);
      p.copy(o.pos).addScaledVector(away, o.r + e.radius + 0.6);
      e.target.copy(o.pos).addScaledVector(tang, o.r + e.radius + 1.6).addScaledVector(away, 0.4);
      e.state = 'emerge';
    } else {
      const a = rand(-1.0, 1.0), d = rand(72, 92);
      p.set(Math.sin(a) * d, 0, -Math.cos(a) * d);
    }
  }
  e.group.scale.setScalar(0.01);
  scene.add(e.group);
  enemies.push(e);
}

function enemyCenter(e, out) {
  return out.copy(e.group.position).setY(e.group.position.y + e.hitY * e.group.scale.y);
}

function damageEnemy(e, amt, flashAmt = 1) {
  if (e.dead) return;
  e.hp -= amt;
  e.flash = Math.max(e.flash, flashAmt);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  const c = enemyCenter(e, new THREE.Vector3());
  const big = e.type === 'brute' ? 1.6 : 1;
  burst(c, e.T.colors, 46 * big, 10 * big, 0.9, 1.0 * big, 6, 1.5);
  burst(c, 0xffffff, 10, 4, 0.35, 2.2 * big, 0, 3);
  flash(c, e.T.color, 4, 16, 0.4);
  const pts = e.T.points * state.level;
  state.score += pts;
  state.kills++;
  floater(`+${pts}`, c, '#' + new THREE.Color(e.T.color).getHexString());
  hitMarker();
  Sfx.kill();
  scene.remove(e.group);
  e.group.traverse((o) => { if (o.material) o.material.dispose(); });
}

const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

function updateEnemies(dt) {
  let incoming = 0;
  const cam = camera.position;
  for (const e of enemies) {
    if (e.dead) continue;
    e.t += dt;
    const p = e.group.position;
    if (e.spawnT < 1) { e.spawnT = Math.min(1, e.spawnT + dt * 2.5); e.group.scale.setScalar(Math.max(0.01, easeOutBack(e.spawnT))); }
    e.attacking = false;

    if (e.type === 'flyer') {
      const to = _v1.subVectors(e.target, p);
      const d = to.length();
      if (e.state === 'dive') {
        const desired = to.multiplyScalar(e.speed * (d > 15 ? 1.6 : 1) / Math.max(d, 0.001));
        desired.x += Math.sin(e.t * 2.1) * 1.6;
        desired.y += Math.cos(e.t * 1.7) * 0.9;
        e.vel.lerp(desired, Math.min(1, dt * 1.6));
        p.addScaledVector(e.vel, dt);
        if (d < 1.3) e.state = 'attack';
      } else {
        const k = Math.min(1, dt * 3);
        p.x = lerp(p.x, e.target.x + Math.sin(e.t * 2) * 0.5, k);
        p.y = lerp(p.y, e.target.y + Math.sin(e.t * 3) * 0.35, k);
        p.z = lerp(p.z, e.target.z + Math.sin(e.t * 5) * 0.4, k);
        e.attacking = true;
      }
      if (p.y < 0.9) p.y = 0.9;
      const flap = Math.sin(e.t * (e.attacking ? 18 : 12)) * 0.65;
      e.wings[0].rotation.z = flap; e.wings[1].rotation.z = -flap;
      e.ring.rotation.z += dt * 4;
      e.group.lookAt(cam);
    } else {
      if (e.state === 'emerge') {
        const to = _v1.subVectors(e.target, p); to.y = 0;
        const d = to.length();
        if (d < 0.4) e.state = 'advance';
        else p.addScaledVector(to.divideScalar(d), Math.min(d, e.speed * dt));
      } else {
        const dir = _v1.set(-p.x, 0, -p.z);
        const d = dir.length();
        const stopD = 2.8 + e.radius;
        if (d <= stopD) { e.state = 'attack'; e.attacking = true; }
        else {
          if (e.state === 'attack' && d < stopD + 1) e.attacking = true;
          else {
            e.state = 'advance';
            dir.divideScalar(d);
            const fx = dir.x, fz = dir.z;
            for (const o of obstacles) {
              const ox = p.x - o.pos.x, oz = p.z - o.pos.z, od = Math.hypot(ox, oz);
              const lim = o.r + e.radius + 1.4;
              if (od < lim && od > 0.001) {
                const k = (lim - od) / lim * 2.5;
                let tx = -oz / od, tz = ox / od;
                const dot = tx * fx + tz * fz;
                if (dot < 0 || (Math.abs(dot) < 0.05 && e.side < 0)) { tx = -tx; tz = -tz; }
                dir.x += (ox / od) * k + tx * k; dir.z += (oz / od) * k + tz * k;
              }
            }
            dir.normalize();
            p.addScaledVector(dir, e.speed * dt);
          }
        }
      }
      // never stand inside a rock
      for (const o of obstacles) {
        const ox = p.x - o.pos.x, oz = p.z - o.pos.z, od = Math.hypot(ox, oz), lim = o.r + e.radius * 0.8;
        if (od < lim && od > 0.001) { p.x = o.pos.x + ox / od * lim; p.z = o.pos.z + oz / od * lim; }
      }
      const moving = !e.attacking;
      const sp = e.t * (moving ? 9 * spdMul() : 14);
      if (e.type === 'crawler') {
        p.y = Math.abs(Math.sin(sp)) * (moving ? 0.1 : 0.3);
        e.legs.forEach((l, i) => { l.rotation.x = Math.sin(sp + (i % 2 ? Math.PI : 0) + (i < 2 ? 0 : Math.PI / 2)) * 0.55; });
        e.torso.rotation.x = e.attacking ? Math.sin(sp) * 0.25 : 0;
      } else {
        p.y = Math.abs(Math.sin(sp * 0.5)) * 0.08;
        e.arms[0].rotation.x = moving ? Math.sin(sp * 0.6) * 0.5 : -1.2 - Math.sin(sp * 0.7) * 1.0;
        e.arms[1].rotation.x = moving ? -Math.sin(sp * 0.6) * 0.5 : -1.2 - Math.cos(sp * 0.7) * 1.0;
      }
      e.group.lookAt(cam.x, p.y, cam.z);
    }

    // burning
    if (e.burn > 0) {
      e.burn -= dt;
      damageEnemy(e, 8 * dt, 0);
      if (Math.random() < dt * 30) {
        const c = enemyCenter(e, _v2);
        emit(c.x + rand(-0.5, 0.5), c.y + rand(-0.4, 0.6), c.z + rand(-0.5, 0.5), 0, rand(1.5, 3), 0, pick([0xff7a1a, 0xffd23a, 0xff3a1a]), rand(0.3, 0.6), 0.5, 1.4, -1, 1);
      }
      if (e.dead) continue;
    }

    // hit flash
    if (e.flash > 0) {
      e.flash = Math.max(0, e.flash - dt * 6);
      e.mats.forEach((m, i) => {
        m.emissive.copy(e.base[i].c).lerp(WHITE, e.flash);
        m.emissiveIntensity = e.base[i].i + e.flash * 1.5;
      });
    }

    if (e.attacking) {
      incoming += e.dps * dt;
      e.atkT -= dt;
      if (e.atkT <= 0) {
        e.atkT = 0.7;
        state.hurt = Math.min(1, state.hurt + 0.25);
        state.shake += 0.08;
        Sfx.hurt();
        const c = enemyCenter(e, _v2).lerp(cam, 0.4);
        burst(c, e.T.colors, 8, 3, 0.4, 0.5, 0, 3);
      }
    }
  }

  // separation
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i]; if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j]; if (b.dead || (a.type === 'flyer') !== (b.type === 'flyer')) continue;
      const pa = a.group.position, pb = b.group.position;
      const dx = pb.x - pa.x, dz = pb.z - pa.z, dy = a.type === 'flyer' ? pb.y - pa.y : 0;
      const d = Math.hypot(dx, dy, dz), min = a.radius + b.radius;
      if (d < min && d > 0.001) {
        const push = (min - d) / d * 0.5;
        pa.x -= dx * push; pa.z -= dz * push; pb.x += dx * push; pb.z += dz * push;
        if (dy) { pa.y -= dy * push; pb.y += dy * push; }
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
  return incoming;
}
const WHITE = new THREE.Color(0xffffff);

// ---------------------------------------------------------------- hit tests
function rayEnemies(o, d, maxT) {
  const hits = [];
  for (const e of enemies) {
    if (e.dead) continue;
    const c = enemyCenter(e, _v3);
    const cx = c.x - o.x, cy = c.y - o.y, cz = c.z - o.z;
    const t = cx * d.x + cy * d.y + cz * d.z;
    if (t < 0 || t > maxT) continue;
    const r = e.radius * 1.15 * e.group.scale.x;
    const d2 = cx * cx + cy * cy + cz * cz - t * t;
    if (d2 < r * r) hits.push({ e, t: Math.max(0, t - Math.sqrt(r * r - d2)) });
  }
  return hits.sort((a, b) => a.t - b.t);
}
function rayEnv(o, d, maxT) {
  let best = maxT;
  if (d.y < -1e-4) best = Math.min(best, -o.y / d.y);
  raycaster.set(o, d);
  raycaster.near = 0; raycaster.far = best;
  const hit = raycaster.intersectObjects(envMeshes, false)[0];
  if (hit) best = hit.distance;
  return best;
}
function muzzleWorld(out) {
  return guns[state.weapon].userData.muzzle.getWorldPosition(out);
}

// ---------------------------------------------------------------- firing
const boltCoreMat = new THREE.MeshBasicMaterial({ color: 0xc8f6ff });
const boltGlowMat = glowMat(0x3ad7ff, 1);
const rocketBodyMat = new THREE.MeshLambertMaterial({ color: 0xd8d0e8 });
const rocketNoseMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
const rocketGlowMat = glowMat(0xff8a2a, 1);

function firePlasma() {
  const tEnv = rayEnv(aim.o, aim.d, 180);
  const hit = rayEnemies(aim.o, aim.d, tEnv)[0];
  const end = aim.o.clone().addScaledVector(aim.d, hit ? hit.t : tEnv);
  const start = muzzleWorld(new THREE.Vector3());
  const g = new THREE.Group();
  g.add(mesh(G.sphere, boltCoreMat, 0.09, 0.09, 0.7));
  g.add(glow(0, 1.5, 1, boltGlowMat));
  g.position.copy(start);
  g.lookAt(end);
  scene.add(g);
  bolts.push({ g, end, target: hit ? hit.e : null, dmg: 13, speed: 150 });
  burst(start, [0x3ad7ff, 0xbff4ff], 6, 3, 0.15, 0.25, 0, 4);
  flash(start, 0x3ad7ff, 2, 10, 0.08);
  state.recoil = 0.6;
  Sfx.plasma();
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i], p = b.g.position;
    const to = _v1.subVectors(b.end, p), d = to.length(), step = b.speed * dt;
    const steps = Math.min(4, Math.ceil(step / 1.5));
    for (let s = 0; s < steps; s++) {
      const k = Math.random() * Math.min(step, d);
      emit(p.x + to.x / d * k, p.y + to.y / d * k, p.z + to.z / d * k, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), 0x3ad7ff, 0.25, 0.35, 0.05);
    }
    if (d <= step) {
      p.copy(b.end);
      if (b.target && !b.target.dead) { damageEnemy(b.target, b.dmg); hitMarker(); }
      burst(p, [0x3ad7ff, 0x8ff0ff, 0xffffff], 18, 7, 0.4, 0.5, 2, 3);
      flash(p, 0x3ad7ff, 2.5, 8, 0.15);
      scene.remove(b.g);
      bolts.splice(i, 1);
    } else p.addScaledVector(to, step / d);
  }
}

function fireLaser() {
  const tEnv = rayEnv(aim.o, aim.d, 240);
  const hits = rayEnemies(aim.o, aim.d, tEnv);
  const start = muzzleWorld(new THREE.Vector3());
  const end = aim.o.clone().addScaledVector(aim.d, tEnv);
  for (const h of hits) {
    damageEnemy(h.e, 230);
    const hp = aim.o.clone().addScaledVector(aim.d, h.t);
    burst(hp, [0xff2fd6, 0xffffff, 0xff9af0], 26, 9, 0.5, 0.7, 0, 2);
  }
  if (hits.length) hitMarker();
  // beam: three nested additive cylinders
  const dir = _v1.subVectors(end, start), len = dir.length();
  dir.normalize();
  const g = new THREE.Group();
  g.position.copy(start).addScaledVector(dir, len / 2);
  g.quaternion.setFromUnitVectors(UP, dir);
  const layers = [[0.05, 0xffffff, 1], [0.18, 0xff2fd6, 0.85], [0.55, 0xff2fd6, 0.25]].map(([r, c, o]) => {
    const m = new THREE.Mesh(G.beam, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.scale.set(r, len, r);
    m.userData.r = r; m.userData.o = o;
    g.add(m);
    return m;
  });
  scene.add(g);
  beams.push({ g, layers, t: 0, life: 0.55 });
  // spiral sparks along the beam
  const side = _v2.crossVectors(dir, UP).normalize(), up2 = _v3.crossVectors(side, dir);
  for (let i = 0; i < 40; i++) {
    const k = Math.random() * len, a = k * 1.4;
    const ox = (Math.cos(a) * side.x + Math.sin(a) * up2.x) * 0.35, oy = (Math.cos(a) * side.y + Math.sin(a) * up2.y) * 0.35, oz = (Math.cos(a) * side.z + Math.sin(a) * up2.z) * 0.35;
    emit(start.x + dir.x * k + ox, start.y + dir.y * k + oy, start.z + dir.z * k + oz, ox * 3, oy * 3, oz * 3,
      pick([0xff2fd6, 0xff9af0, 0xffffff]), rand(0.3, 0.7), 0.5, 0.05, 0, 2);
  }
  burst(end, [0xff2fd6, 0xffffff], 30, 10, 0.5, 0.8, 3, 2);
  flash(start, 0xff2fd6, 4, 18, 0.25);
  flash(end, 0xff2fd6, 5, 20, 0.35);
  state.shake += 0.35;
  state.recoil = 1.4;
  Sfx.laser();
}

function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.t += dt;
    const k = b.t / b.life;
    if (k >= 1) {
      scene.remove(b.g);
      b.layers.forEach((m) => m.material.dispose());
      beams.splice(i, 1);
      continue;
    }
    for (const m of b.layers) {
      const r = m.userData.r * (1 - k * 0.8) * (k < 0.08 ? 1.6 : 1);
      m.scale.x = m.scale.z = r;
      m.material.opacity = m.userData.o * (1 - k);
    }
  }
}

function fireRocket() {
  const tEnv = rayEnv(aim.o, aim.d, 220);
  const hit = rayEnemies(aim.o, aim.d, tEnv)[0];
  const target = aim.o.clone().addScaledVector(aim.d, hit ? hit.t : tEnv);
  const start = muzzleWorld(new THREE.Vector3());
  const dir = target.clone().sub(start).normalize();
  const g = new THREE.Group();
  g.add(rotZ(mesh(G.cyl, rocketBodyMat, 0.08, 0.55, 0.08)));
  const nose = rotZ(mesh(G.cone, rocketNoseMat, 0.08, 0.2, 0.08)); nose.position.z = 0.37; g.add(nose);
  const fin = mesh(G.box, rocketNoseMat, 0.32, 0.02, 0.12); fin.position.z = -0.22; g.add(fin);
  const fin2 = mesh(G.box, rocketNoseMat, 0.02, 0.32, 0.12); fin2.position.z = -0.22; g.add(fin2);
  const tail = glow(0, 1.6, 1, rocketGlowMat); tail.position.z = -0.4; g.add(tail);
  g.position.copy(start);
  g.lookAt(_v1.copy(start).add(dir));
  scene.add(g);
  rockets.push({ g, dir, speed: 28, life: 5 });
  burst(start, [0xff8a2a, 0xffd23a, 0x888899], 14, 4, 0.35, 0.6, -1, 3);
  flash(start, 0xff8a2a, 3, 12, 0.15);
  state.recoil = 1.1;
  state.shake += 0.06;
  Sfx.rocket();
}

function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i], p = r.g.position;
    r.life -= dt;
    r.speed = Math.min(75, r.speed + 70 * dt);
    const step = r.speed * dt;
    let hitT = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const c = enemyCenter(e, _v2);
      const t = clamp((c.x - p.x) * r.dir.x + (c.y - p.y) * r.dir.y + (c.z - p.z) * r.dir.z, 0, step);
      const dx = p.x + r.dir.x * t - c.x, dy = p.y + r.dir.y * t - c.y, dz = p.z + r.dir.z * t - c.z;
      const rr = e.radius * e.group.scale.x + 0.3;
      if (dx * dx + dy * dy + dz * dz < rr * rr && t < hitT) hitT = t;
    }
    const tEnv = rayEnv(p, r.dir, step);
    if (tEnv < step) hitT = Math.min(hitT, tEnv);
    if (hitT !== Infinity || r.life <= 0) {
      if (hitT !== Infinity) p.addScaledVector(r.dir, hitT);
      explode(p.clone());
      scene.remove(r.g);
      rockets.splice(i, 1);
      continue;
    }
    p.addScaledVector(r.dir, step);
    // trail
    for (let s = 0; s < 2; s++) {
      const k = -Math.random() * step;
      emit(p.x + r.dir.x * k, p.y + r.dir.y * k, p.z + r.dir.z * k, rand(-0.6, 0.6), rand(-0.2, 0.8), rand(-0.6, 0.6),
        pick([0x6a5a8a, 0x8a7aa0, 0x4a3a6a]), rand(0.6, 1.1), 0.5, 2.2, -0.6, 1.2);
    }
    emit(p.x - r.dir.x * 0.4, p.y - r.dir.y * 0.4, p.z - r.dir.z * 0.4, -r.dir.x * 4, -r.dir.y * 4, -r.dir.z * 4,
      pick([0xffd23a, 0xff8a2a]), 0.2, 0.7, 0.1, 0, 2);
  }
}

function explode(p) {
  const R = 6.5;
  let any = false;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.max(0, enemyCenter(e, _v2).distanceTo(p) - e.radius);
    if (d < R) { damageEnemy(e, 100 * (1 - 0.65 * d / R)); any = true; }
  }
  if (any) hitMarker();
  burst(p, [0xffd23a, 0xff8a2a, 0xff5a1a, 0xffffff], 80, 16, 0.8, 2.6, 2, 2.5);
  burst(p, [0x5a4a7a, 0x7a6a9a, 0x3a2a5a], 30, 6, 1.6, 3.6, -1, 1.2);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    emit(p.x, p.y + 0.2, p.z, Math.cos(a) * 20, 0.5, Math.sin(a) * 20, 0xff8a2a, 0.45, 1.2, 0.3, 0, 4);
  }
  flash(p, 0xff8a2a, 7, 34, 0.6);
  const dist = p.distanceTo(camera.position);
  state.shake += clamp(0.5 - dist * 0.012, 0.08, 0.5);
  Sfx.boom();
}

let flameAcc = 0, flameOn = false;
function updateFlame(dt, active) {
  if (active !== flameOn) { flameOn = active; Sfx.flame(active); }
  const pilot = guns[3].userData.pilot;
  pilot.scale.setScalar(0.14 * (active ? 2.2 : 1) * rand(0.8, 1.2));
  if (!active) return;
  const start = muzzleWorld(_v2);
  const d = aim.d;
  flameAcc += dt * 55;
  while (flameAcc > 1) {
    flameAcc--;
    const s = rand(16, 21);
    const vx = (d.x + rand(-0.11, 0.11)) * s, vy = (d.y + rand(-0.08, 0.11)) * s, vz = (d.z + rand(-0.11, 0.11)) * s;
    const r = Math.random();
    const col = r < 0.1 ? 0x3a80ff : r < 0.4 ? 0xffb020 : r < 0.85 ? 0xff5a10 : 0xd02008;
    const j = Math.random() * 0.3;
    emit(start.x + vx * j * 0.05, start.y + vy * j * 0.05, start.z + vz * j * 0.05, vx, vy, vz, col, rand(0.4, 0.62), 0.18, rand(1.4, 2.2), -2.5, 1.0);
  }
  const RANGE = 9.5;
  const cam = camera.position;
  let hitAny = false;
  for (const e of enemies) {
    if (e.dead) continue;
    const c = enemyCenter(e, _v1);
    const rx = c.x - cam.x, ry = c.y - cam.y, rz = c.z - cam.z;
    const t = rx * d.x + ry * d.y + rz * d.z;
    if (t < 0 || t > RANGE) continue;
    const px = rx - d.x * t, py = ry - d.y * t, pz = rz - d.z * t;
    if (Math.hypot(px, py, pz) < 1.5 + t * 0.09 + e.radius * 0.6) {
      damageEnemy(e, 55 * dt, 0.4);
      e.burn = 1.4;
      hitAny = true;
    }
  }
  if (hitAny && Math.random() < dt * 8) hitMarker();
  if (Math.random() < dt * 25) flash(_v1.copy(start).addScaledVector(d, 3), 0xff8a2a, rand(2, 3.5), 14, 0.1);
  state.recoil = Math.max(state.recoil, 0.25 + Math.random() * 0.15);
}

// Machine gun: hitscan bullets, tiny damage, long range, slight spread. Tracers are a small pool
// of thin additive cylinders that are reused instead of created per shot.
const tracers = [];
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(G.beam, new THREE.MeshBasicMaterial({ color: 0xd8ff8a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false;
  scene.add(m);
  tracers.push({ m, t: 0 });
}
let tracerNext = 0;
function fireMG() {
  const d = _v1.copy(aim.d);
  d.x += rand(-0.014, 0.014); d.y += rand(-0.012, 0.012); d.z += rand(-0.014, 0.014);
  d.normalize();
  const tEnv = rayEnv(aim.o, d, 300);
  const hit = rayEnemies(aim.o, d, tEnv)[0];
  const end = aim.o.clone().addScaledVector(d, hit ? hit.t : tEnv);
  const start = muzzleWorld(new THREE.Vector3());
  if (hit) {
    damageEnemy(hit.e, 2.5, 0.5);
    hitMarker();
    burst(end, [0x7dff2f, 0xffffff, 0xd8ff8a], 6, 5, 0.25, 0.35, 0, 3);
  } else {
    burst(end, [0xffd23a, 0xd8ff8a], 4, 4, 0.25, 0.3, 6, 2);
  }
  // tracer: a short streak from the muzzle toward the end point
  const tr = tracers[tracerNext]; tracerNext = (tracerNext + 1) % tracers.length;
  const dir = _v2.subVectors(end, start);
  const len = dir.length();
  dir.divideScalar(len);
  const streak = Math.min(len, 14);
  tr.m.position.copy(start).addScaledVector(dir, Math.min(len - streak / 2, rand(2, 10) + streak / 2));
  tr.m.quaternion.setFromUnitVectors(UP, dir);
  tr.m.scale.set(0.025, streak, 0.025);
  tr.m.material.opacity = 0.9;
  tr.m.visible = true;
  tr.t = 0.06;
  emit(start.x, start.y, start.z, dir.x * 2, dir.y * 2, dir.z * 2, 0xd8ff8a, 0.06, 0.35, 0.1);
  state.recoil = Math.max(state.recoil, 0.35);
  state.shake += 0.012;
  Sfx.mg();
}
function updateTracers(dt) {
  for (const tr of tracers) {
    if (tr.t <= 0) { tr.m.visible = false; continue; }
    tr.t -= dt;
    tr.m.material.opacity = Math.max(0, tr.t / 0.06) * 0.9;
  }
}

function updateWeapons(dt) {
  for (let i = 0; i < weapons.length; i++) {
    const w = weapons[i];
    if (w.t > 0) {
      w.t = Math.max(0, w.t - dt);
      if (w.t === 0 && w.cd >= 1) {
        weaponEls[i].btn.classList.remove('ready'); void weaponEls[i].btn.offsetWidth; weaponEls[i].btn.classList.add('ready');
        if (i === state.weapon && w.id === 'laser') Sfx.ready();
      }
    }
    weaponEls[i].cd.style.transform = `scaleY(${w.cd && !w.hold ? w.t / w.cd : 0})`;
  }
  const w = weapons[state.weapon];
  const canFire = firing && state.switchT < 0.5;
  if (w.id === 'flame') updateFlame(dt, canFire);
  else {
    updateFlame(dt, false);
    if (canFire && w.t <= 0) {
      if (w.id === 'plasma') firePlasma();
      else if (w.id === 'laser') fireLaser();
      else if (w.id === 'mg') fireMG();
      else fireRocket();
      w.t = w.cd;
    }
  }
  // machine gun barrels spin up while firing and wind down after
  const mgSpin = guns[4].userData;
  mgSpin.spin = lerp(mgSpin.spin || 0, canFire && w.id === 'mg' ? 40 : 0, Math.min(1, dt * 4));
  mgSpin.barrels.rotation.z += mgSpin.spin * dt;
  const ch = $('crosshair');
  ch.style.setProperty('--p', w.cd && !w.hold ? (1 - w.t / w.cd).toFixed(3) : 1);

  // gun-specific readiness visuals
  const lz = guns[1].userData;
  const lr = 1 - weapons[1].t / weapons[1].cd;
  lz.core.color.setRGB(0.25 + 0.75 * lr, 0.1 + 0.1 * lr, 0.25 + 0.6 * lr);
  lz.tip.material.opacity = lr >= 1 ? 0.7 + Math.sin(performance.now() * 0.012) * 0.3 : 0.15;
  guns[2].userData.head.visible = weapons[2].t < 0.5;
}

// ---------------------------------------------------------------- HUD helpers
function floater(text, worldPos, color) {
  const v = _v3.copy(worldPos).project(camera);
  if (v.z > 1) return;
  const el = document.createElement('div');
  el.className = 'fl';
  el.textContent = text;
  el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px';
  el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  el.style.color = color;
  el.style.textShadow = `0 0 8px ${color}, 0 0 18px ${color}`;
  $('floaters').appendChild(el);
  setTimeout(() => el.remove(), 950);
}
let hitTm = 0;
function hitMarker() {
  const ch = $('crosshair');
  ch.classList.add('hit');
  clearTimeout(hitTm);
  hitTm = setTimeout(() => ch.classList.remove('hit'), 90);
}
function banner(big, small) {
  const b = $('banner');
  b.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
let lastHud = '';
function updateHud() {
  const hpK = clamp(state.hp / state.maxHp, 0, 1);
  const key = `${Math.ceil(state.hp)}|${state.score}|${state.level}`;
  if (key !== lastHud) {
    lastHud = key;
    $('hpFill').style.transform = `scaleX(${hpK})`;
    $('hpText').textContent = Math.max(0, Math.ceil(state.hp));
    $('hp').classList.toggle('low', hpK < 0.3);
    $('scoreVal').textContent = state.score;
    $('wave').textContent = `WAVE ${state.level}`;
  }
  $('hurt').style.opacity = state.hurt.toFixed(3);
  const ch = $('crosshair');
  ch.style.transform = `translate(${aimPx.x}px, ${aimPx.y}px)`;
}

// ---------------------------------------------------------------- flow
function clearWorld() {
  for (const e of enemies) { scene.remove(e.group); e.group.traverse((o) => { if (o.material) o.material.dispose(); }); }
  enemies.length = 0;
  for (const b of bolts) scene.remove(b.g);
  bolts.length = 0;
  for (const r of rockets) scene.remove(r.g);
  rockets.length = 0;
  for (const b of beams) { scene.remove(b.g); b.layers.forEach((m) => m.material.dispose()); }
  beams.length = 0;
}

function startGame() {
  Sfx.init();
  clearWorld();
  Object.assign(state, { mode: 'play', paused: false, time: 0, level: 1, score: 0, kills: 0, hp: 100, hurt: 0, spawnT: 1.2, switchT: 0, recoil: 0, shake: 0 });
  for (const w of weapons) w.t = 0;
  state.weapon = -1;
  selectWeapon(0);
  $('title').classList.add('hidden');
  $('over').classList.add('hidden');
  document.body.classList.add('playing');
  document.body.classList.remove('over');
  lastHud = '';
  banner('WAVE 1', 'HERE THEY COME');
  Sfx.wave();
}

function bestScore(s) {
  try {
    const b = Math.max(s, Number(localStorage.getItem('lolospace.best')) || 0);
    localStorage.setItem('lolospace.best', String(b));
    return b;
  } catch (_) { return s; }
}

function gameOver() {
  state.mode = 'over';
  firing = false; firePointer = null;
  updateFlame(0, false);
  document.body.classList.remove('playing');
  document.body.classList.add('over');
  const best = bestScore(state.score);
  $('overStats').innerHTML = `Score <b>${state.score}</b><br>Wave <b>${state.level}</b> &middot; Aliens zapped <b>${state.kills}</b><br><span class="best">Best ${best}</span>`;
  $('over').classList.remove('hidden');
  Sfx.boom();
}

function goHub() { location.href = '../'; }
function setQuitOpen(open) {
  $('quitModal').classList.toggle('hidden', !open);
  state.paused = open;
  if (open) { firing = false; firePointer = null; updateFlame(0, false); }
}
$('hubBtn').addEventListener('click', () => { if (state.mode === 'play') setQuitOpen(true); else goHub(); });
$('quitNo').addEventListener('click', () => setQuitOpen(false));
$('quitYes').addEventListener('click', goHub);
$('quitModal').addEventListener('click', (ev) => { if (ev.target.id === 'quitModal') setQuitOpen(false); });
$('playBtn').addEventListener('click', startGame);
// ad break before a new run (the hub's ../ads.js; skipped when ads are off or missing)
$('againBtn').addEventListener('click', () => (window.loloAd ? loloAd('game-over', startGame) : startGame()));
$('overHub').addEventListener('click', goHub);

// Full screen toggle. Hidden where the browser can't do it (e.g. iPhone Safari).
{
  const fsBtn = $('fsBtn');
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.style.display = 'none';
  fsBtn.addEventListener('click', () => {
    const de = document.documentElement;
    const p = fsEl()
      ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      : (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
    if (p && p.catch) p.catch(() => {});
  });
  const fsSync = () => {
    fsBtn.classList.toggle('on', !!fsEl());
    fsBtn.title = fsEl() ? 'Exit full screen' : 'Full screen';
  };
  document.addEventListener('fullscreenchange', fsSync);
  document.addEventListener('webkitfullscreenchange', fsSync);
}

function director(dt) {
  const L = 1 + Math.floor(state.time / 28);
  if (L > state.level) {
    state.level = L;
    state.hp = Math.min(state.maxHp, state.hp + 15);
    banner(`WAVE ${L}`, L === 3 ? 'BRUTES INCOMING' : 'THEY GROW STRONGER');
    Sfx.wave();
  }
  state.spawnT -= dt;
  if (state.spawnT > 0) return;
  const maxAlive = Math.min(40, 6 + L * 3);
  if (enemies.length < maxAlive) {
    const r = Math.random();
    const brute = L >= 3 ? Math.min(0.22, 0.05 * L) : 0;
    const fly = L >= 2 ? 0.32 : 0.15;
    const type = r < brute ? 'brute' : r < brute + fly ? 'flyer' : 'crawler';
    spawnEnemy(type);
    if (type === 'flyer' && L >= 4 && Math.random() < 0.45) spawnEnemy('flyer');
    if (type === 'crawler' && L >= 5 && Math.random() < 0.35) spawnEnemy('crawler');
  }
  state.spawnT = Math.max(0.4, 2.3 * Math.pow(0.88, L - 1)) * rand(0.7, 1.3);
}

// ---------------------------------------------------------------- input
function setAim(x, y) {
  x = clamp(x, 0, innerWidth); y = clamp(y, 0, innerHeight);
  aimPx.x = x; aimPx.y = y;
  aimNdc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
}
canvas.addEventListener('pointerdown', (ev) => {
  Sfx.init();
  if (state.mode !== 'play' || state.paused) return;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  ev.preventDefault();
  firePointer = ev.pointerId;
  firing = true;
  setAim(ev.clientX, ev.clientY);
  try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
});
window.addEventListener('pointermove', (ev) => {
  if (ev.pointerType === 'mouse' || ev.pointerId === firePointer) setAim(ev.clientX, ev.clientY);
});
const endPointer = (ev) => { if (ev.pointerId === firePointer) { firing = false; firePointer = null; } };
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', () => { firing = false; firePointer = null; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
window.addEventListener('keydown', (ev) => {
  if (ev.key >= '1' && ev.key <= String(weapons.length) && state.mode === 'play') selectWeapon(+ev.key - 1);
  else if (ev.key === 'Escape' && state.mode === 'play') setQuitOpen(!state.paused);
  else if ((ev.key === 'Enter' || ev.key === ' ') && state.mode !== 'play') { ev.preventDefault(); startGame(); }
});
let wheelLock = 0;
window.addEventListener('wheel', (ev) => {
  if (state.mode !== 'play' || state.paused) return;
  const now = performance.now();
  if (now < wheelLock || Math.abs(ev.deltaY) < 4) return;
  wheelLock = now + 140;
  selectWeapon((state.weapon + (ev.deltaY > 0 ? 1 : weapons.length - 1)) % weapons.length);
}, { passive: true });

// ---------------------------------------------------------------- resize
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const hFov = 108 * Math.PI / 180;
  camera.fov = clamp(2 * Math.atan(Math.tan(hFov / 2) / camera.aspect) * 180 / Math.PI, 64, 100);
  camera.updateProjectionMatrix();
  pMat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  placeGun();
  if (state.mode !== 'play') setAim(w / 2, h * 0.475);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  step(now);
}
function step(now) {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = state.paused ? 0 : realDt;
  const playing = state.mode === 'play' && !state.paused;

  // camera look follows the aim point (bounded), giving a wider view toward the edges
  const tYaw = state.mode === 'play' ? -aimNdc.x * 0.5 : Math.sin(now * 0.00012) * 0.35;
  const tPitch = state.mode === 'play' ? aimNdc.y * 0.26 + 0.03 : 0.1;
  const k = 1 - Math.exp(-realDt * 5);
  look.yaw = lerp(look.yaw, tYaw, k);
  look.pitch = lerp(look.pitch, tPitch, k);
  camera.rotation.set(look.pitch, look.yaw, 0);
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(aimNdc, camera);
  aim.o.copy(raycaster.ray.origin);
  aim.d.copy(raycaster.ray.direction);

  // gun follows the aim
  const tAim = rayEnv(aim.o, aim.d, 60);
  const eh = rayEnemies(aim.o, aim.d, tAim)[0];
  aim.point.copy(aim.o).addScaledVector(aim.d, Math.max(4, eh ? eh.t : tAim));
  state.switchT = Math.max(0, state.switchT - realDt * 4);
  state.recoil = Math.max(0, state.recoil - realDt * 7);
  guns.forEach((g, i) => { g.visible = i === state.weapon && (state.mode === 'play' || state.mode === 'over'); });
  gunRig.position.set(gunBase.x, gunBase.y - state.switchT * 0.35 + Math.sin(now * 0.002) * 0.006, gunBase.z + state.recoil * 0.07);
  gunRig.lookAt(aim.point);
  gunRig.rotateX(-state.recoil * 0.12);

  if (playing) {
    state.time += dt;
    director(dt);
    updateWeapons(dt);
    const incoming = updateEnemies(dt);
    if (incoming > 0) {
      state.hp -= incoming;
      if (state.hp <= 0) { state.hp = 0; gameOver(); }
    }
  }
  updateBolts(dt);
  updateRockets(dt);
  updateBeams(dt);
  updateTracers(dt);
  updateParticles(dt);
  updateFlashes(realDt);
  for (const d of decor) {
    d.o.rotation[d.axis] += d.spin * realDt;
    if (d.y0 !== undefined) d.o.position.y = d.y0 + Math.sin(now * 0.0004 + d.bob) * 2;
  }
  planet.userData.ball.rotation.y += realDt * 0.01;
  dust.position.x = Math.sin(now * 0.00007) * 6;
  dust.position.z = (now * 0.0012) % 10;
  state.hurt = Math.max(0, state.hurt - realDt * 1.2);

  // screen shake (applied after aiming so it only affects the view)
  state.shake = Math.min(0.7, state.shake) * Math.exp(-realDt * 7);
  if (state.shake > 0.002) {
    camera.rotation.x += rand(-1, 1) * state.shake * 0.04;
    camera.rotation.y += rand(-1, 1) * state.shake * 0.04;
  }
  if (state.mode === 'play' || state.mode === 'over') updateHud();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
// console debugging: __space.run(seconds) advances the game without requestAnimationFrame
window.__space = {
  state, enemies, camera, spawnEnemy, selectWeapon, setAim,
  setFiring: (on) => { firing = on; },
  run(sec) { for (let i = 0; i < sec * 60; i++) step(last + 1000 / 60); },
};
})();
