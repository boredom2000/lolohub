// SUPER BAKING kitchen diorama: three.js r149 (global THREE). A cut-away kitchen sitting on a giant
// slice of cake, with googly-eyed appliances, a waddling chef and blobby customers.
// main.js owns the game rules; this file only builds, animates and picks the 3D scene.
const Kitchen = (() => {
'use strict';
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const canvas = renderer.domElement;
document.getElementById('game').appendChild(canvas);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 300);
const VIEW_WIDE = new THREE.Vector3(0.36, 1.0, 1.05).normalize(), VIEW_TALL = new THREE.Vector3(0.22, 1.5, 1.0).normalize();
let VIEW_DIR = VIEW_WIDE;
const TARGET0 = new THREE.Vector3(0, 0.6, -1.2);
let camTarget = TARGET0.clone(), camDist = 30, W = 1, H = 1, margins = { top: 70, bottom: 120, side: 8 };

scene.add(new THREE.HemisphereLight(0xfff4fa, 0xffd6c0, 0.42));
const sun = new THREE.DirectionalLight(0xffffff, 0.62);
sun.position.set(6, 14, 8); sun.target.position.set(0, 0, -1);
scene.add(sun, sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 10, bottom: -10, near: 1, far: 45 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;

// ------------------------------------------------------------------ toon materials + outlines
const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
const mats = new Map();
function toon(c, side) {
  const key = c + (side ? 'd' : '');
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: grad, side: side || THREE.FrontSide }); mats.set(key, m); }
  return m;
}
const OUT = new THREE.MeshBasicMaterial({ color: 0x4a2338, side: THREE.BackSide });
const _s = new THREE.Vector3(), _c = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
// add a mesh with an "inverted hull" cartoon outline of constant thickness
function add(parent, geo, color, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, o.mat || toon(color, o.side));
  m.position.set(x, y, z);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale) m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
  const t = o.outline === undefined ? 0.035 : o.outline;
  if (t > 0) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    geo.boundingBox.getSize(_s); geo.boundingBox.getCenter(_c);
    const sc = (i, ms) => (_s.getComponent(i) + 2 * t / ms) / Math.max(_s.getComponent(i), 1e-4);
    const ol = new THREE.Mesh(geo, OUT);
    const sx = sc(0, m.scale.x), sy = sc(1, m.scale.y), sz = sc(2, m.scale.z);
    ol.scale.set(sx, sy, sz);
    ol.position.set(_c.x * (1 - sx), _c.y * (1 - sy), _c.z * (1 - sz));
    ol.castShadow = false; ol.receiveShadow = false;
    m.add(ol);
  }
  parent.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
const bowlGeo = (r) => new THREE.SphereGeometry(r, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2);
function grp(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  t.anisotropy = 4;
  return t;
}

// googly eyes: they follow the chef around and blink
const eyes = [];
function googly(parent, x, y, z, r, rotY = 0) {
  const g = grp(parent, x, y, z); g.rotation.y = rotY;
  add(g, sph(r, 16, 12), '#ffffff', 0, 0, 0, { scale: [1, 1, 0.5], outline: 0.022, cast: false });
  const pupil = add(g, sph(r * 0.48, 12, 10), '#2a1420', 0, 0, r * 0.42, { scale: [1, 1, 0.5], outline: 0, cast: false });
  eyes.push({ g, pupil, r, blink: rand(1, 5), bt: 0 });
  return g;
}

// ------------------------------------------------------------------ the cake-slice base, floor and walls
{
  const base = grp(scene, 0, 0, -1);
  add(base, box(16.6, 0.18, 10.6), '#ffffff', 0, -2.0, 0);
  add(base, box(15.8, 0.3, 9.8), '#ff8fc4', 0, -0.15, 0);
  add(base, box(15.4, 0.6, 9.4), '#f6c27e', 0, -0.6, 0);
  add(base, box(15.5, 0.22, 9.5), '#fff4e6', 0, -1.0, 0);
  add(base, box(15.4, 0.75, 9.4), '#e8a35c', 0, -1.48, 0);
  for (let x = -7.5; x <= 7.5; x += rand(0.5, 0.9)) {
    const len = rand(0.25, 0.75);
    add(base, new THREE.CapsuleGeometry(0.14, len, 4, 8), '#ff8fc4', x, -0.25 - len / 2, 4.88, { outline: 0.025 });
  }
  for (let z = -4.6; z <= 4.6; z += rand(0.5, 0.9)) {
    const len = rand(0.25, 0.75);
    add(base, new THREE.CapsuleGeometry(0.14, len, 4, 8), '#ff8fc4', 7.88, -0.25 - len / 2, z, { outline: 0.025 });
  }
}
const floorTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#fff3ea'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffc6dc'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = 'rgba(180,90,130,0.25)'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128);
}, [7.5, 4.5]);
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 9), new THREE.MeshToonMaterial({ map: floorTex, gradientMap: grad }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.002, -1); floor.receiveShadow = true;
  scene.add(floor);
}
const wallTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#aef0dc'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(x * 64 + (y % 2) * 32 + 16, y * 64 + 32, 9, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,120,170,0.5)';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(x * 64 + ((y + 1) % 2) * 32 + 16, y * 64 + 32, 4, 0, TAU); g.fill(); }
}, [5, 1.4]);
{
  const wm = new THREE.MeshToonMaterial({ map: wallTex, gradientMap: grad });
  add(scene, box(15.35, 4.2, 0.35), null, -0.175, 2.1, -5.675, { mat: wm });
  add(scene, box(0.35, 4.2, 9.0), null, -7.675, 2.1, -1.0, { mat: wm });
  add(scene, box(15.6, 0.22, 0.55), '#ff8fc4', -0.2, 4.3, -5.68);
  add(scene, box(0.55, 0.22, 9.3), '#ff8fc4', -7.68, 4.3, -1.05);
  add(scene, box(15, 0.28, 0.06), '#ff8fc4', 0, 0.14, -5.47, { outline: 0.02 });
  add(scene, box(0.06, 0.28, 9), '#ff8fc4', -7.47, 0.14, -1, { outline: 0.02 });
  // bunting
  const cols = ['#ff5fa2', '#ffd23f', '#5fe0c0', '#8fd8ff', '#b58cff'];
  for (let i = 0, x = -6.9; x < 7.2; x += 0.7, i++) {
    const sag = Math.sin(((x + 7) / 2.8) * Math.PI) * 0.18;
    add(scene, new THREE.ConeGeometry(0.22, 0.42, 3), cols[i % cols.length], x, 3.75 - Math.abs(sag), -5.45, { rot: [Math.PI, 0, 0], scale: [1, 1, 0.25], outline: 0.02, cast: false });
  }
  // window on the left wall
  const win = grp(scene, -7.46, 2.35, -1.2);
  add(win, box(0.1, 1.75, 2.4), '#ffffff', 0, 0, 0);
  const pane = new THREE.Mesh(box(0.06, 1.45, 2.1), new THREE.MeshBasicMaterial({ color: 0xbfeeff }));
  pane.position.x = 0.04; win.add(pane);
  add(win, box(0.08, 1.45, 0.08), '#ffffff', 0.07, 0, 0, { outline: 0.015 });
  add(win, box(0.08, 0.08, 2.1), '#ffffff', 0.07, 0, 0, { outline: 0.015 });
  add(win, box(0.45, 0.1, 2.6), '#ffffff', 0.18, -0.92, 0);
  add(win, cyl(0.17, 0.12, 0.26), '#ff8a5a', 0.22, -0.74, 0.65);
  for (const [fy, fz, fc] of [[-0.42, 0.6, '#ff5fa2'], [-0.5, 0.78, '#ffd23f'], [-0.36, 0.76, '#b58cff']]) add(win, sph(0.1), fc, 0.24, fy, fz);
  // menu board + door on the back wall
  const menuTex = canvasTex(512, 320, (g) => {
    g.fillStyle = '#4a2338'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#ffd23f'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★ MENU ★', 256, 62);
    g.font = '62px sans-serif';
    ['🎂', '🍪', '🧁', '🍞'].forEach((e, i) => g.fillText(e, 80 + i * 118, 160));
    ['🥨', '🥧', '🥞', '🍩'].forEach((e, i) => g.fillText(e, 80 + i * 118, 255));
  });
  add(scene, box(2.75, 1.8, 0.08), '#d99a62', 4.3, 2.6, -5.47);
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.56), new THREE.MeshBasicMaterial({ map: menuTex }));
  menu.position.set(4.3, 2.6, -5.42); scene.add(menu);
  add(scene, box(1.3, 2.6, 0.1), '#c98b5a', 6.6, 1.3, -5.45);
  add(scene, sph(0.08), '#ffd23f', 6.15, 1.25, -5.36);
  add(scene, cyl(0.28, 0.28, 0.05, 20), '#bfeeff', 6.6, 2.0, -5.39, { rot: [Math.PI / 2, 0, 0] });
  // shelf with jars above the stove + oven
  add(scene, box(4.4, 0.1, 0.5), '#d99a62', -0.35, 3.15, -5.25);
  [['#ff8fc4', -2.2], ['#ffd23f', -1.6], ['#5fe0c0', -0.9], ['#b58cff', 0.3], ['#ff8a5a', 1.0], ['#8fd8ff', 1.6]].forEach(([c, x]) => {
    add(scene, cyl(0.17, 0.17, 0.42, 14), '#e8f7ff', x, 3.41, -5.22);
    add(scene, cyl(0.13, 0.13, 0.3, 14), c, x, 3.38, -5.22, { outline: 0 });
    add(scene, cyl(0.19, 0.19, 0.08, 14), c, x, 3.66, -5.22, { outline: 0.02 });
  });
  const cj = grp(scene, -0.3, 3.2, -5.22);
  add(cj, sph(0.32), '#ffe3a3', 0, 0.3, 0, { scale: [1, 0.9, 1] });
  googly(cj, -0.11, 0.36, 0.27, 0.08); googly(cj, 0.11, 0.36, 0.27, 0.08);
  add(cj, sph(0.12), '#ff5fa2', 0, 0.6, 0);
}

// ------------------------------------------------------------------ stations
const stations = {};
const hits = [];
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
function hitBox(w, h, d, x, y, z, data) {
  const m = new THREE.Mesh(box(w, h, d), HIT_MAT); m.position.set(x, y, z); m.userData = data;
  scene.add(m); hits.push(m); return m;
}
function station(id, group, spot, anchor, ring, hb) {
  const r = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(ring[3] * 0.72, ring[3], 40), mat);
  ringMesh.rotation.x = -Math.PI / 2; r.add(ringMesh);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(ring[3] * 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; r.add(disc);
  r.position.set(ring[0], ring[1], ring[2]); r.visible = false; r.renderOrder = 2;
  scene.add(r);
  hitBox(hb[0], hb[1], hb[2], hb[3], hb[4], hb[5], { type: 'station', id });
  stations[id] = { id, group, spot: Object.assign({ lane: 'lane' }, spot), anchor: new THREE.Vector3(anchor[0], anchor[1], anchor[2]), ring: r, ringMat: mat, discMat: disc.material, colors: [], pop: 0 };
}

// FRIDGE
{
  const s = grp(scene, -6.4, 0, -4.75);
  add(s, box(1.6, 3.0, 1.3), '#9fe6ff', 0, 1.5, 0);
  add(s, box(1.62, 0.06, 1.32), '#5fb9e0', 0, 2.15, 0, { outline: 0 });
  add(s, box(0.1, 0.5, 0.1), '#ffffff', 0.6, 2.5, 0.68);
  add(s, box(0.1, 0.9, 0.1), '#ffffff', 0.6, 1.45, 0.68);
  googly(s, -0.32, 2.6, 0.66, 0.2); googly(s, 0.14, 2.6, 0.66, 0.2);
  add(s, new THREE.TorusGeometry(0.16, 0.035, 8, 16, Math.PI), '#4a2338', -0.09, 2.4, 0.66, { rot: [0, 0, Math.PI], outline: 0, cast: false });
  add(s, cyl(0.1, 0.1, 0.05, 14), '#ff5fa2', -0.45, 1.6, 0.67, { rot: [Math.PI / 2, 0, 0], outline: 0.015 });
  add(s, cyl(0.08, 0.08, 0.05, 14), '#ffd23f', -0.1, 1.2, 0.67, { rot: [Math.PI / 2, 0, 0], outline: 0.015 });
  add(s, cyl(0.09, 0.09, 0.05, 14), '#b58cff', 0.2, 1.75, 0.67, { rot: [Math.PI / 2, 0, 0], outline: 0.015 });
  station('FRIDGE', s, { x: -6.0, z: -2.95, face: Math.PI }, [-6.3, 2.3, -3.9], [-6.2, 0.02, -3.55, 0.75], [1.8, 3.2, 1.6, -6.4, 1.6, -4.75]);
}
// PANTRY
{
  const s = grp(scene, -4.1, 0, -5.05), wood = '#d99a62';
  for (const sx of [-1.05, 1.05]) add(s, box(0.12, 2.9, 0.8), wood, sx, 1.45, 0);
  for (const y of [0.08, 1.0, 1.92, 2.84]) add(s, box(2.22, 0.1, 0.8), wood, 0, y, 0);
  add(s, box(2.1, 2.8, 0.05), '#b9784a', 0, 1.45, -0.38, { outline: 0 });
  [['#f6e3c0', -0.55], ['#ffb8da', 0.0], ['#c08a5a', 0.55]].forEach(([c, x], i) => {
    const sack = grp(s, x, 0.13, 0.05);
    add(sack, sph(0.3), c, 0, 0.36, 0, { scale: [1, 1.2, 0.8] });
    add(sack, cyl(0.1, 0.16, 0.12, 12), c, 0, 0.74, 0);
    if (i === 1) { googly(sack, -0.1, 0.42, 0.22, 0.08); googly(sack, 0.1, 0.42, 0.22, 0.08); }
  });
  [['#ffffff', -0.7], ['#ffd23f', -0.25], ['#5fe0c0', 0.2], ['#ff8fc4', 0.65]].forEach(([c, x]) => {
    add(s, cyl(0.17, 0.17, 0.45, 14), '#e8f7ff', x, 1.28, 0.05);
    add(s, cyl(0.13, 0.13, 0.32, 14), c, x, 1.24, 0.05, { outline: 0 });
    add(s, cyl(0.19, 0.19, 0.08, 14), '#ff5fa2', x, 1.54, 0.05, { outline: 0.02 });
  });
  for (const x of [-0.6, -0.3]) { add(s, cyl(0.12, 0.14, 0.5, 12), '#ffffff', x, 2.22, 0.05); add(s, cyl(0.07, 0.07, 0.1, 10), '#3fc8ff', x, 2.52, 0.05); }
  add(s, sph(0.28), '#f6e3c0', 0.45, 2.27, 0.05, { scale: [1.2, 0.9, 0.8] });
  station('PANTRY', s, { x: -4.1, z: -2.95, face: Math.PI }, [-4.1, 2.1, -4.3], [-4.1, 0.02, -3.7, 0.75], [2.4, 3.0, 1.2, -4.1, 1.5, -4.95]);
}
// STOVE
{
  const s = grp(scene, -1.6, 0, -4.85);
  add(s, box(2.0, 1.0, 1.2), '#ffd23f', 0, 0.5, 0);
  add(s, box(2.06, 0.1, 1.26), '#5a4a5e', 0, 1.05, 0);
  for (const bx of [-0.5, 0.5]) add(s, cyl(0.3, 0.3, 0.05, 20), '#2a1f2c', bx, 1.12, 0.05, { outline: 0 });
  add(s, cyl(0.36, 0.32, 0.5, 20), '#c8d4e4', -0.5, 1.4, 0.05);
  add(s, cyl(0.34, 0.34, 0.04, 20), '#7a4528', -0.5, 1.63, 0.05, { outline: 0 });
  for (const hx of [-0.92, -0.08]) add(s, box(0.14, 0.06, 0.1), '#8a96a8', hx, 1.52, 0.05);
  add(s, cyl(0.34, 0.3, 0.08, 20), '#3b3340', 0.5, 1.18, 0.05);
  add(s, box(0.1, 0.06, 0.6), '#3b3340', 0.5, 1.2, 0.6);
  add(s, cyl(0.24, 0.24, 0.05, 18), '#e8a84c', 0.5, 1.24, 0.05, { outline: 0.02 });
  for (let i = 0; i < 4; i++) add(s, cyl(0.08, 0.08, 0.08, 12), '#ffffff', -0.7 + i * 0.47, 0.84, 0.62, { rot: [Math.PI / 2, 0, 0], outline: 0.02 });
  googly(s, -0.28, 0.45, 0.61, 0.17); googly(s, 0.28, 0.45, 0.61, 0.17);
  station('STOVE', s, { x: -1.6, z: -2.95, face: Math.PI }, [-1.6, 1.95, -4.7], [-1.6, 0.02, -3.6, 0.75], [2.1, 1.8, 1.4, -1.6, 0.9, -4.85]);
}
// OVEN
let ovenGlow;
{
  const s = grp(scene, 0.9, 0, -4.85);
  add(s, box(2.0, 1.9, 1.2), '#ff6b5a', 0, 0.95, 0);
  add(s, box(2.04, 0.36, 1.24), '#ff9a85', 0, 1.72, 0);
  add(s, box(1.45, 0.92, 0.06), '#4a2338', 0, 0.78, 0.6, { outline: 0 });
  ovenGlow = new THREE.Mesh(box(1.25, 0.72, 0.04), new THREE.MeshBasicMaterial({ color: 0xffa640 }));
  ovenGlow.position.set(0, 0.78, 0.63); s.add(ovenGlow);
  add(s, cyl(0.05, 0.05, 1.3, 10), '#ffffff', 0, 1.33, 0.72, { rot: [0, 0, Math.PI / 2] });
  googly(s, -0.35, 1.72, 0.62, 0.17); googly(s, 0.35, 1.72, 0.62, 0.17);
  add(s, cyl(0.15, 0.15, 0.45, 12), '#c8d4e4', 0.6, 2.12, -0.3);
  station('OVEN', s, { x: 0.9, z: -2.95, face: Math.PI }, [0.9, 2.45, -4.7], [0.9, 0.02, -3.6, 0.75], [2.1, 2.2, 1.4, 0.9, 1.1, -4.85]);
}
// island with the mixer, prep board and decorating stand on top
{
  const isl = grp(scene, -1.6, 0, -0.9);
  add(isl, box(6.6, 0.88, 1.5), '#b9a2ff', 0, 0.44, 0);
  add(isl, box(6.8, 0.1, 1.7), '#fff4e6', 0, 0.93, 0);
  add(isl, box(6.62, 0.14, 1.52), '#ff8fc4', 0, 0.12, 0, { outline: 0 });
  for (let i = 0; i < 6; i++) add(isl, sph(0.09), '#ffffff', -2.75 + i * 1.1, 0.5, 0.76, { scale: [1, 1, 0.4], outline: 0.015, cast: false });
}
{
  const s = grp(scene, -3.7, 0.98, -0.9);
  add(s, bowlGeo(0.58), '#7fd6ff', 0, 0.58, 0, { side: THREE.DoubleSide });
  add(s, cyl(0.53, 0.53, 0.04, 24), '#fff0c8', 0, 0.5, 0, { outline: 0 });
  add(s, new THREE.TorusGeometry(0.58, 0.05, 8, 32), '#5ab8e6', 0, 0.58, 0, { rot: [Math.PI / 2, 0, 0], outline: 0 });
  add(s, cyl(0.05, 0.05, 0.7, 10), '#ff5fa2', 0.22, 0.95, -0.05, { rot: [0, 0, -0.5] });
  add(s, sph(0.17), '#dfe8f2', 0.06, 0.66, 0, { scale: [0.8, 1.3, 0.8], rot: [0, 0, -0.5], outline: 0.02 });
  googly(s, -0.18, 0.3, 0.5, 0.13); googly(s, 0.18, 0.3, 0.5, 0.13);
  station('MIXER', s, { x: -3.7, z: -2.4, face: 0 }, [-3.7, 2.2, -0.9], [-3.7, 0.99, -0.9, 0.68], [1.9, 1.6, 1.8, -3.7, 1.4, -0.9]);
}
{
  const s = grp(scene, -1.5, 0.98, -0.9);
  add(s, box(1.6, 0.08, 1.05), '#e3a86a', 0, 0.04, 0);
  add(s, sph(0.42), '#fff0d4', -0.15, 0.16, 0.05, { scale: [1.2, 0.35, 0.9] });
  googly(s, -0.27, 0.2, 0.38, 0.08); googly(s, -0.05, 0.2, 0.38, 0.08);
  add(s, cyl(0.1, 0.1, 1.0, 14), '#f2b27a', 0.3, 0.2, -0.25, { rot: [0, 0.5, Math.PI / 2] });
  for (const [x, z] of [[0.45, 0.25], [0.65, 0.05]]) add(s, cyl(0.13, 0.13, 0.05, 14), '#e8a84c', x, 0.11, z, { outline: 0.02 });
  station('BOARD', s, { x: -1.5, z: -2.4, face: 0 }, [-1.5, 1.85, -0.9], [-1.5, 0.99, -0.9, 0.68], [1.9, 1.2, 1.8, -1.5, 1.3, -0.9]);
}
{
  const s = grp(scene, 0.7, 0.98, -0.9);
  add(s, cyl(0.1, 0.16, 0.3, 12), '#ffffff', 0, 0.15, 0);
  add(s, cyl(0.52, 0.52, 0.06, 24), '#ffffff', 0, 0.33, 0);
  add(s, cyl(0.42, 0.42, 0.42, 24), '#ff9ccc', 0, 0.57, 0);
  add(s, cyl(0.425, 0.425, 0.08, 24), '#fff4e6', 0, 0.55, 0, { outline: 0 });
  add(s, cyl(0.44, 0.44, 0.08, 24), '#fffaf5', 0, 0.8, 0);
  add(s, sph(0.1), '#e8243c', 0, 0.94, 0);
  googly(s, -0.13, 0.62, 0.4, 0.1); googly(s, 0.13, 0.62, 0.4, 0.1);
  add(s, new THREE.ConeGeometry(0.16, 0.5, 12), '#7fd6ff', 0.62, 0.32, 0.18, { rot: [0, 0, 2.3] });
  add(s, cyl(0.12, 0.12, 0.3, 12), '#ffe3a3', -0.6, 0.15, 0.2);
  station('DECOR', s, { x: 0.7, z: -2.4, face: 0 }, [0.7, 2.25, -0.9], [0.7, 0.99, -0.9, 0.68], [1.8, 1.8, 1.8, 0.7, 1.5, -0.9]);
}
// service counter
const SLOT_Z = [-2.4, -0.15, 2.1];
{
  const c = grp(scene, 4.3, 0, -0.2);
  add(c, box(1.0, 0.85, 6.6), '#ff8fc4', 0, 0.425, 0);
  add(c, box(1.2, 0.1, 6.8), '#fff4e6', 0, 0.9, 0);
  for (let k = 0; k < 7; k++) add(c, box(1.03, 0.85, 0.28), '#ffffff', 0, 0.425, -2.9 + k * 0.95, { outline: 0 });
  add(c, box(0.6, 0.45, 0.5), '#5fe0c0', 0, 1.18, -2.95);
  add(c, box(0.5, 0.25, 0.06), '#4a2338', -0.05, 1.5, -2.95, { rot: [0, Math.PI / 2, 0.3], outline: 0 });
  add(c, cyl(0.38, 0.38, 0.05, 20), '#ffffff', 0, 0.98, 1.05);
  for (const [x, z, col] of [[-0.12, 0.95, '#ff9ccc'], [0.13, 1.15, '#ffe3a3'], [0.05, 0.85, '#b58cff']]) {
    add(c, cyl(0.1, 0.08, 0.14, 12), '#ff5fa2', x, 1.08, z, { outline: 0.015 });
    add(c, sph(0.11), col, x, 1.2, z, { outline: 0.015 });
  }
  add(c, cyl(0.17, 0.17, 0.36, 14), '#e8f7ff', 0, 1.13, 3.05);
  add(c, cyl(0.12, 0.12, 0.12, 14), '#ffd23f', 0, 1.0, 3.05, { outline: 0 });
}
for (let i = 0; i < 3; i++) hitBox(1.5, 2.6, 1.9, 5.75, 1.2, SLOT_Z[i], { type: 'cust', slot: i });

// ------------------------------------------------------------------ chef
const chef = (() => {
  const g = grp(scene, -1.5, 0, -2.7);
  const body = grp(g, 0, 0, 0);
  add(body, sph(0.5), '#fffaf5', 0, 0.62, 0, { scale: [1, 1.05, 0.92] });
  add(body, sph(0.42), '#ff8fc4', 0, 0.55, 0.16, { scale: [0.95, 0.95, 0.75], outline: 0.02 });
  for (const y of [0.72, 0.52]) add(body, sph(0.05), '#ffd23f', 0, y, 0.48, { outline: 0.012 });
  add(body, new THREE.TorusGeometry(0.28, 0.07, 8, 20), '#ff4f6a', 0, 1.02, 0, { rot: [Math.PI / 2, 0, 0] });
  add(body, sph(0.4), '#ffd9be', 0, 1.36, 0);
  for (const sx of [-0.14, 0.14]) {
    add(body, sph(0.065, 12, 10), '#2a1420', sx, 1.43, 0.34, { outline: 0 });
    add(body, sph(0.022, 8, 6), '#ffffff', sx + 0.02, 1.46, 0.395, { outline: 0, cast: false });
    add(body, sph(0.07, 10, 8), '#ff9cb8', sx * 1.9, 1.3, 0.3, { scale: [1, 0.6, 0.5], outline: 0, cast: false });
    add(body, sph(0.1, 12, 8), '#5a3020', sx * 0.7, 1.26, 0.37, { scale: [1.4, 0.55, 0.6], rot: [0, 0, sx > 0 ? 0.35 : -0.35], outline: 0.012 });
  }
  add(body, sph(0.08, 12, 8), '#ffb59a', 0, 1.33, 0.41, { outline: 0.012 });
  add(body, cyl(0.27, 0.3, 0.32, 16), '#ffffff', 0, 1.82, 0);
  for (const [x, y, z] of [[0, 2.1, 0], [0.18, 2.03, 0], [-0.18, 2.03, 0], [0, 2.03, 0.15], [0, 2.03, -0.15]]) add(body, sph(0.2), '#ffffff', x, y, z, { outline: 0.025 });
  const hl = add(body, sph(0.13), '#ffd9be', -0.52, 0.62, 0.08);
  const hr = add(body, sph(0.13), '#ffd9be', 0.52, 0.62, 0.08);
  const fl = add(g, sph(0.15), '#4a2338', -0.2, 0.08, 0.05, { scale: [1, 0.6, 1.3], outline: 0 });
  const fr = add(g, sph(0.15), '#4a2338', 0.2, 0.08, 0.05, { scale: [1, 0.6, 1.3], outline: 0 });
  const bowl = grp(body, 0, 0.82, 0.52);
  const bowlMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, side: THREE.DoubleSide });
  add(bowl, bowlGeo(0.26), null, 0, 0.26, 0, { mat: bowlMat });
  add(bowl, cyl(0.23, 0.23, 0.03, 18), '#fff0c8', 0, 0.22, 0, { outline: 0 });
  bowl.visible = false;
  const head = new THREE.Vector3();
  const C = {
    g, x: -1.5, z: -2.7, rot: 0, faceT: 0, path: [], cb: null, delay: 0, ph: 0, speed: 6.5, hop: 0, shake: 0, faint: 0, stepT: 0,
    get walking() { return this.path.length > 0; },
    carry(color) { bowl.visible = !!color; if (color) bowlMat.color.set(color); },
    goTo(spot, cb) {
      const LX = 3.15, LZ = -2.7, fromCounter = this.x > 2.9, toCounter = spot.lane === 'counter';
      this.path = fromCounter === toCounter ? [spot] : [{ x: LX, z: LZ }, spot];
      this.final = spot; this.cb = cb; this.delay = 0.12;
    },
    cheer(grade) { if (grade === 'BAD') this.shake = 0.6; else this.hop = 1; },
    shrug() { this.shake = 0.5; },
    reset() { this.x = -1.5; this.z = -2.7; this.rot = 0; this.faceT = 0; this.path = []; this.cb = null; this.faint = 0; this.carry(null); },
    head() { return head.set(this.x, 1.5, this.z); },
    update(dt, t) {
      if (this.path.length) {
        const p = this.path[0], dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz), st = this.speed * dt;
        this.ph += dt * 15;
        if (d <= st) { this.x = p.x; this.z = p.z; this.path.shift(); if (!this.path.length) this.faceT = this.final.face; }
        else { this.x += dx / d * st; this.z += dz / d * st; this.faceT = Math.atan2(dx, dz); }
        this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.16; Sfx.step(); }
      } else if (this.cb) {
        this.delay -= dt;
        if (this.delay <= 0) { const f = this.cb; this.cb = null; f(); }
      }
      let da = this.faceT - this.rot; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      this.rot += da * Math.min(1, dt * 12);
      const walk = this.path.length ? 1 : 0;
      this.hop = Math.max(0, this.hop - dt * 2.2); this.shake = Math.max(0, this.shake - dt);
      g.position.set(this.x, 0, this.z);
      g.rotation.y = this.rot + Math.sin(this.shake * 30) * this.shake * 0.6;
      body.position.y = walk * Math.abs(Math.sin(this.ph)) * 0.14 + Math.sin(this.hop * Math.PI) * 0.6 + (1 - walk) * Math.sin(t * 2.5) * 0.02;
      body.rotation.z = walk * Math.sin(this.ph) * 0.1;
      const carrying = bowl.visible;
      hl.position.set(carrying ? -0.3 : -0.52, carrying ? 0.86 : 0.62 + (this.hop > 0 ? 0.7 : 0), carrying ? 0.45 : 0.08 + walk * Math.sin(this.ph) * 0.15);
      hr.position.set(carrying ? 0.3 : 0.52, carrying ? 0.86 : 0.62 + (this.hop > 0 ? 0.7 : 0), carrying ? 0.45 : 0.08 - walk * Math.sin(this.ph) * 0.15);
      fl.position.z = 0.05 + walk * Math.sin(this.ph) * 0.18; fr.position.z = 0.05 - walk * Math.sin(this.ph) * 0.18;
      this.faint = this.faint > 0 ? Math.min(1, this.faint + dt * 3) : 0;
      g.rotation.x = -this.faint * 1.45; g.position.y = this.faint * 0.4;
    },
  };
  return C;
})();

// ------------------------------------------------------------------ customers
const CUST_COLORS = ['#ffb3d1', '#a8dcff', '#c4f5a8', '#ffe39a', '#dcc2ff', '#ffc29e', '#9ff0e0'];
const KINDS = ['cat', 'bunny', 'bear', 'alien', 'chick'];
const customers = [null, null, null], CUST_SCALE = 1.4;
function makeCustomer() {
  const col = pick(CUST_COLORS), kind = pick(KINDS);
  const g = new THREE.Group(), body = grp(g, 0, 0, 0);
  add(body, sph(0.6), col, 0, 0.66, 0, { scale: [1, 1.05, 0.95] });
  add(body, sph(0.42), '#fff6f0', 0, 0.55, 0.3, { scale: [1, 1, 0.5], outline: 0, cast: false });
  for (const sx of [-0.2, 0.2]) {
    add(body, sph(0.09, 12, 10), '#2a1420', sx, 0.88, 0.52, { outline: 0, cast: false });
    add(body, sph(0.03, 8, 6), '#ffffff', sx + 0.03, 0.92, 0.6, { outline: 0, cast: false });
    add(body, sph(0.08, 10, 8), '#ff7aa8', sx * 1.8, 0.72, 0.44, { scale: [1, 0.6, 0.5], outline: 0, cast: false });
    add(body, sph(0.12), col, sx * 3.1, 0.25, 0.1, { scale: [1, 0.7, 1.2] });
  }
  if (kind === 'chick') {
    add(body, new THREE.ConeGeometry(0.09, 0.2, 8), '#ff9a3d', 0, 0.74, 0.62, { rot: [Math.PI / 2, 0, 0], outline: 0.015 });
    for (const [x, r] of [[-0.08, 0.3], [0.08, -0.3], [0, 0]]) add(body, sph(0.08), col, x, 1.33, 0, { scale: [0.7, 1.6, 0.7], rot: [0, 0, r] });
  } else {
    add(body, new THREE.TorusGeometry(0.07, 0.022, 6, 12, Math.PI), '#2a1420', 0, 0.74, 0.56, { rot: [0, 0, Math.PI], outline: 0, cast: false });
  }
  if (kind === 'cat') for (const s of [-1, 1]) add(body, new THREE.ConeGeometry(0.17, 0.32, 4), col, s * 0.32, 1.22, 0, { rot: [0, 0, -s * 0.35] });
  if (kind === 'bunny') for (const s of [-1, 1]) add(body, new THREE.CapsuleGeometry(0.1, 0.45, 4, 8), col, s * 0.2, 1.45, 0, { rot: [0, 0, -s * 0.15] });
  if (kind === 'bear') for (const s of [-1, 1]) add(body, sph(0.17), col, s * 0.4, 1.12, 0);
  if (kind === 'alien') { add(body, cyl(0.025, 0.025, 0.4, 6), '#4a2338', 0, 1.45, 0, { outline: 0 }); add(body, sph(0.1), '#ffd23f', 0, 1.68, 0); }
  g.scale.setScalar(0.001);
  return { g, body, t: 0, state: 'in', happy: false, wobble: 0, waiting: true };
}
function addCustomer(slot, waiting = true) {
  removeCustomerNow(slot);
  const c = makeCustomer(); c.waiting = waiting;
  c.g.position.set(5.75, 0, SLOT_Z[slot]);
  c.g.rotation.y = -Math.PI / 2 + 0.9;
  scene.add(c.g); customers[slot] = c;
}
function removeCustomerNow(slot) { const c = customers[slot]; if (c) { scene.remove(c.g); customers[slot] = null; } }
function removeCustomer(slot, happy) { const c = customers[slot]; if (!c) return; c.state = 'out'; c.t = 0; c.happy = happy; }
function updateCustomers(dt, t) {
  for (let i = 0; i < 3; i++) {
    const c = customers[i]; if (!c) continue;
    c.t += dt; c.wobble = Math.max(0, c.wobble - dt * 2);
    if (c.state === 'in') {
      const k = Math.min(1, c.t / 0.55), e = 1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.4;
      c.g.scale.setScalar(Math.max(0.001, k * e * CUST_SCALE));
      c.body.position.y = Math.sin(k * Math.PI) * 0.8;
      if (k >= 1) { c.state = 'idle'; c.t = 0; }
    } else if (c.state === 'idle') {
      const hopEvery = c.waiting ? 1.6 : 99, ph = c.t % hopEvery;
      c.body.position.y = Math.abs(Math.sin(t * 3 + i)) * 0.05 + (ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) * 0.35 : 0) + Math.sin(c.wobble * Math.PI) * 0.4;
      c.body.rotation.z = Math.sin(t * 2 + i) * 0.05 + Math.sin(c.wobble * 20) * c.wobble * 0.3;
    } else if (c.state === 'out') {
      const k = c.t / 0.7;
      if (c.happy) { c.body.position.y = Math.sin(Math.min(1, k) * Math.PI) * 1.4; c.body.rotation.y = k * TAU; }
      else { c.body.rotation.z = Math.sin(c.t * 40) * 0.2; }
      c.g.scale.setScalar(Math.max(0.001, (1 - Math.max(0, k - 0.4) / 0.6) * CUST_SCALE));
      if (k >= 1) removeCustomerNow(i);
    }
  }
}

// ------------------------------------------------------------------ steam puffs
const puffs = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(sph(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  m.visible = false; scene.add(m); puffs.push({ m, t: 0, life: 1 });
}
let puffT = 0;
function emitPuff(x, y, z) {
  const p = puffs.find((q) => !q.m.visible); if (!p) return;
  p.m.visible = true; p.t = 0; p.life = rand(1.4, 2.2); p.m.position.set(x + rand(-0.08, 0.08), y, z + rand(-0.08, 0.08));
}

// ------------------------------------------------------------------ camera fit
// points that must stay on screen: the cake base, the wall tops and the customers' heads
const BOX = [];
for (const x of [-8.3, 8.3]) for (const z of [-6.3, 4.3]) BOX.push(new THREE.Vector3(x, -2.1, z), new THREE.Vector3(x, 0, z));
BOX.push(new THREE.Vector3(-7.9, 4.4, -5.9), new THREE.Vector3(7.5, 4.4, -5.9), new THREE.Vector3(-7.9, 4.4, 3.5), new THREE.Vector3(6, 2.6, 2.1));
// portrait: frame the floor and walls only and let the cake base run off the sides
const BOX_TALL = [];
for (const x of [-7.6, 7.6]) for (const z of [-5.6, 3.6]) BOX_TALL.push(new THREE.Vector3(x, 0, z));
BOX_TALL.push(new THREE.Vector3(-7.7, 4.4, -5.7), new THREE.Vector3(7.5, 4.4, -5.7), new THREE.Vector3(0, -0.8, 3.9));
let fitBox = BOX;
function place(t, d) { camera.position.copy(t).addScaledVector(VIEW_DIR, d); camera.lookAt(t); camera.updateMatrixWorld(); }
function bounds() {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const c of fitBox) { _v.copy(c).project(camera); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
  return { x0, x1, y0, y1 };
}
function fit() {
  camera.aspect = W / H; camera.updateProjectionMatrix();
  const tall = W / H < 0.8;
  VIEW_DIR = tall ? VIEW_TALL : VIEW_WIDE; fitBox = tall ? BOX_TALL : BOX;
  const yMax = 1 - 2 * margins.top / H, yMin = -1 + 2 * margins.bottom / H, xMax = 1 - 2 * margins.side / W;
  const tgt = TARGET0.clone();
  let dist = 30;
  for (let it = 0; it < 3; it++) {
    let lo = 5, hi = 200;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2; place(tgt, mid); const b = bounds();
      if (b.x1 - b.x0 <= 2 * xMax && b.y1 - b.y0 <= yMax - yMin) hi = mid; else lo = mid;
    }
    dist = hi; place(tgt, dist);
    const b = bounds(), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
    const right = _v.setFromMatrixColumn(camera.matrixWorld, 0).clone(), up = _w.setFromMatrixColumn(camera.matrixWorld, 1).clone();
    tgt.addScaledVector(right, cx * halfW).addScaledVector(up, (cy - (yMax + yMin) / 2) * halfH);
  }
  // zoom in past the "everything fits" distance: the cake base and plate may crop at the edges
  camTarget = tgt; camDist = dist * (tall ? 0.93 : 0.82); place(camTarget, camDist);
}
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H);
  fit();
}

// ------------------------------------------------------------------ per-frame
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function update(dt, t) {
  chef.update(dt, t);
  updateCustomers(dt, t);
  const look = chef.head();
  for (const e of eyes) {
    e.g.updateMatrixWorld();
    const l = e.g.worldToLocal(_v.copy(look));
    const len = Math.hypot(l.x, l.y, l.z) || 1;
    e.pupil.position.x = l.x / len * e.r * 0.45; e.pupil.position.y = l.y / len * e.r * 0.45;
    e.blink -= dt;
    if (e.blink < 0) { e.bt = 0.14; e.blink = rand(2, 6); }
    e.bt = Math.max(0, e.bt - dt);
    e.g.scale.y = e.bt > 0 ? 0.12 : 1;
  }
  for (const id in stations) {
    const s = stations[id];
    s.ring.visible = s.colors.length > 0;
    if (s.ring.visible) {
      const ci = Math.floor(t / 0.6) % s.colors.length;
      s.ringMat.color.set(s.colors[ci]); s.discMat.color.set(s.colors[ci]);
      const k = 1 + Math.sin(t * 6) * 0.08; s.ring.scale.set(k, 1, k);
    }
    if (s.pop > 0) { s.pop = Math.max(0, s.pop - dt * 2.5); const q = Math.sin(s.pop * Math.PI * 3) * s.pop * 0.12; s.group.scale.set(1 - q, 1 + q, 1 - q); }
  }
  ovenGlow.material.color.setHSL(0.08 + Math.sin(t * 3) * 0.015, 1, 0.6 + Math.sin(t * 7) * 0.05);
  puffT -= dt;
  if (puffT <= 0) { puffT = 0.45; emitPuff(1.5, 2.4, -5.15); if (Math.random() < 0.6) emitPuff(-2.1, 1.75, -4.8); }
  for (const p of puffs) {
    if (!p.m.visible) continue;
    p.t += dt; const f = p.t / p.life;
    p.m.position.y += dt * 0.55; p.m.scale.setScalar(0.6 + f * 1.4);
    p.m.material.opacity = 0.7 * (1 - f) * Math.min(1, p.t * 4);
    if (f >= 1) p.m.visible = false;
  }
  // gentle diorama sway
  const sway = Math.sin(t * 0.25) * 0.35;
  camera.position.copy(camTarget).addScaledVector(VIEW_DIR, camDist);
  camera.position.x += sway; camera.lookAt(camTarget);
}

window.addEventListener('resize', resize);
resize();

return {
  canvas, chef, stations, isTouch: IS_TOUCH,
  update,
  render() { renderer.render(scene, camera); },
  setMargins(m) { margins = Object.assign(margins, m); fit(); },
  pick(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(hits, false);
    return h.length ? h[0].object.userData : null;
  },
  toScreen(v) { _v.copy(v).project(camera); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, behind: _v.z > 1 }; },
  stationSpot(id) { return stations[id].spot; },
  counterSpot(slot) { return { x: 3.15, z: SLOT_Z[slot], face: Math.PI / 2, lane: 'counter' }; },
  custAnchor(slot) { return new THREE.Vector3(5.75, 3.3, SLOT_Z[slot]); },
  chefAnchor() { return new THREE.Vector3(chef.x, 2.55, chef.z); },
  setRing(id, colors) { stations[id].colors = colors; },
  poke(id) { if (stations[id]) stations[id].pop = 1; },
  addCustomer, removeCustomer,
  custWaiting(slot, w) { if (customers[slot]) customers[slot].waiting = w; },
  custWobble(slot) { if (customers[slot]) customers[slot].wobble = 1; },
  reset() { for (let i = 0; i < 3; i++) removeCustomerNow(i); chef.reset(); for (const id in stations) stations[id].colors = []; },
  faint() { chef.faint = 0.01; chef.path = []; chef.cb = null; },
};
})();
