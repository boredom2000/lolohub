/* Lolo Castle - a small 3D castle-building tower defense.
 * Plain script (no modules) so it runs from file:// fully offline. */
(() => {
'use strict';

// ============================================================
// CONFIG
// ============================================================
const GRID = 41;                 // map is GRID x GRID tiles
const HALF = (GRID - 1) / 2;     // tile index of the map center
const START_GOLD = 120;
const GRACE_TIME = 12;           // seconds before the first enemy
const RESTART_DELAY = 5;

const DEFS = {
  castle: { name: 'Castle', hp: 1500, size: 3, range: 5.5, dmg: 10, reload: 0.8 },
  wall:   { name: 'Wall', cost: 10, hp: 300, size: 1, color: 0x9d9890,
            desc: 'Cheap and sturdy. Enemies walk around walls, and smash through them when there is no other way.' },
  arrow:  { name: 'Arrow Tower', cost: 50, hp: 160, size: 1, range: 6.5, dmg: 20, reload: 0.5, color: 0xc8b996,
            desc: 'Fast, accurate arrows. Strong against single tough enemies.' },
  bomb:   { name: 'Bomb Tower', cost: 100, hp: 220, size: 1, range: 5.5, dmg: 40, splash: 2.0, reload: 2.2, color: 0x6f6760,
            desc: 'Slow lobbed bombs that deal splash damage. Strong against groups.' },
  flame:  { name: 'Flame Tower', cost: 80, hp: 200, size: 1, range: 3.2, dps: 34, cone: 0.5, color: 0x7a4a3a,
            desc: 'Short range. Sprays a cone of fire that constantly burns every enemy in front of it.' },
  laser:  { name: 'Laser Tower', cost: 150, hp: 170, size: 1, range: 9, dmg: 320, reload: 5, color: 0xb070e0,
            desc: 'Huge damage at long range, but needs a long time to recharge. Aims at the toughest enemy.' },
  guardhouse: { name: 'Guardhouse', cost: 90, hp: 260, size: 1, spawn: 'guard', cd: 8, max: 3, color: 0xb8ae9c,
            desc: 'Trains sword guards that charge nearby enemies and hold them back.' },
  archery: { name: 'Archery Range', short: 'Archery', cost: 110, hp: 180, size: 1, spawn: 'archer', cd: 9, max: 3, color: 0x9a7040,
            desc: 'Trains archers that shoot nearby enemies from a distance.' },
  farm:   { name: 'Farm', cost: 25, hp: 90, size: 1, income: 5, cd: 5, color: 0xe0c050,
            desc: 'Makes 5 gold every 5s. Click it when the coin appears to collect.' },
  wharf:  { name: 'Fishing Wharf', short: 'Wharf', cost: 45, hp: 100, size: 1, income: 10, cd: 5, needs: 'water', color: 0x8a6a40,
            desc: 'Must be built next to water. Makes 10 gold every 5s. Click it when the coin appears to collect.' },
  mine:   { name: 'Mine', cost: 70, hp: 150, size: 1, income: 16, cd: 5, needs: 'ore', color: 0x8a8580,
            desc: 'Must be built next to gold ore. Makes 16 gold every 5s. Click it when the coin appears to collect.' },
};
const BUILD_ORDER = ['wall', 'arrow', 'bomb', 'flame', 'laser', 'guardhouse', 'archery', 'farm', 'wharf', 'mine'];

const ENEMIES = {
  grunt:   { name: 'Grunt',   hp: 40,  speed: 0.85, dmg: 8,  atkRate: 0.8, reward: 2,  scale: 0.8, body: 0x4f8f34, skin: 0x8fcf5f },
  soldier: { name: 'Soldier', hp: 100, speed: 0.7,  dmg: 14, atkRate: 0.9, reward: 5,  scale: 1.0, body: 0x8a3a2a, skin: 0xd09a6a },
  brute:   { name: 'Brute',   hp: 300, speed: 0.5,  dmg: 28, atkRate: 1.4, reward: 12, scale: 1.5, body: 0x4b2f7a, skin: 0x9a7ac9 },
  boss:    { name: 'Boss',    hp: 6000, speed: 0.32, dmg: 220, atkRate: 1.8, reward: 200, scale: 3.2, body: 0x5a1a1a, skin: 0x7a9a6a },
};
const BOSS_INTERVAL = 120;       // a boss every 2 minutes

// units trained by guardhouses / archery ranges
const ALLIES = {
  guard:  { name: 'Guard',  ally: true, hp: 150, speed: 1.4, dmg: 16, atkRate: 0.7, range: 0.15, leash: 4.5, scale: 0.85, body: 0x2f5fb0, skin: 0xe0b48a },
  archer: { name: 'Archer', ally: true, hp: 60,  speed: 1.2, dmg: 12, atkRate: 0.9, range: 4.2,  leash: 3.5, scale: 0.8,  body: 0x3a7a3a, skin: 0xe0b48a },
};

// terrain
const T_GRASS = 0, T_WATER = 1, T_BRIDGE = 2, T_ORE = 3;
const WATER_SPEED = 0.45;        // walking speed multiplier in water
const WATER_COST = 2.4;          // pathfinding cost of a water tile (bridges cost 1)

// ============================================================
// HELPERS
// ============================================================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const idx = (x, z) => z * GRID + x;
const inBounds = (x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID;
const toTile = (w) => Math.round(w + HALF);
const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ============================================================
// RENDERER / SCENE
// ============================================================
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
// phones have very high DPR; cap it lower there to keep the frame rate up
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f0);
scene.fog = new THREE.Fog(0x9fd3f0, 70, 140);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 0.7));
const sun = new THREE.DirectionalLight(0xfff2dd, 0.85);
sun.position.set(-18, 35, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 });
sun.shadow.bias = -0.0008;
scene.add(sun);

// ---- materials & geometry caches ----
const matCache = new Map();
function M(color, emissive = 0) {
  const key = color + '_' + emissive;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, emissive }); matCache.set(key, m); }
  return m;
}
const geoCache = new Map();
function G(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
const BOX = () => G('box', () => new THREE.BoxGeometry(1, 1, 1));
function part(geo, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? M(color) : color);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, c, x, y, z) => part(BOX(), c, x, y, z, w, h, d);
// cylinder of radius r (bottom), top radius r*taper; taper 0 = cone
function cyl(r, h, c, x, y, z, seg = 12, taper = 1) {
  return part(G(`cyl${seg}_${taper}`, () => new THREE.CylinderGeometry(taper, 1, 1, seg)), c, x, y, z, r, h, r);
}
function sphere(r, c, x, y, z, seg = 10) {
  return part(G(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.75)))), c, x, y, z, r, r, r);
}
function rock(sx, sy, sz, c, x, y, z) {
  return part(G('dodeca', () => new THREE.DodecahedronGeometry(1, 0)), c, x, y, z, sx, sy, sz);
}

// ---- static environment ----
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), M(0x5e9a3c));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M(0x4c8030));
outer.rotation.x = -Math.PI / 2;
outer.position.y = -0.03;
outer.receiveShadow = true;
scene.add(outer);

// dirt border = enemy spawn zone (not buildable)
{
  const dirt = M(0x9b7e55);
  const strips = [[GRID, 1, 0, -HALF], [GRID, 1, 0, HALF], [1, GRID - 2, -HALF, 0], [1, GRID - 2, HALF, 0]];
  for (const [w, d, x, z] of strips) {
    const s = new THREE.Mesh(BOX(), dirt);
    s.scale.set(w, 0.02, d);
    s.position.set(x, 0.0, z);
    s.receiveShadow = true;
    scene.add(s);
  }
}

const gridHelper = new THREE.GridHelper(GRID, GRID, 0xffffff, 0xffffff);
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.18;
gridHelper.position.y = 0.02;
gridHelper.visible = false;
scene.add(gridHelper);

// decorative forest outside the map
{
  const trunk = M(0x6b4a2a), leaves = [M(0x2f6e2a), M(0x3d8a34), M(0x29602a)];
  const coneGeo = G('cyl7_0', () => new THREE.CylinderGeometry(0, 1, 1, 7));
  const trunkGeo = G('cyl6_1', () => new THREE.CylinderGeometry(1, 1, 1, 6));
  let placed = 0;
  while (placed < 260) {
    const x = rand(-70, 70), z = rand(-70, 70);
    if (Math.abs(x) < HALF + 2 && Math.abs(z) < HALF + 2) continue;
    const s = rand(0.8, 1.6);
    const t = new THREE.Mesh(trunkGeo, trunk);
    t.scale.set(0.15 * s, 0.6 * s, 0.15 * s); t.position.set(x, 0.3 * s, z);
    const l = new THREE.Mesh(coneGeo, leaves[placed % 3]);
    l.scale.set(0.7 * s, 1.8 * s, 0.7 * s); l.position.set(x, 1.4 * s, z);
    t.castShadow = l.castShadow = true;
    scene.add(t, l);
    placed++;
  }
  for (let i = 0; i < 60; i++) {
    const x = rand(-60, 60), z = rand(-60, 60);
    if (Math.abs(x) < HALF + 2 && Math.abs(z) < HALF + 2) continue;
    const r = rock(rand(0.3, 0.8), rand(0.2, 0.5), rand(0.3, 0.8), 0x8f8a84, x, 0.1, z);
    scene.add(r);
  }
}

// dynamic objects live here so a reset can wipe them
const world = new THREE.Group();
scene.add(world);

// ============================================================
// MESH BUILDERS
// ============================================================
function makeBuildingMesh(type) {
  const g = new THREE.Group();
  const STONE = 0xa7a29a, DARK = 0x2a2420, WOOD = 0x8a5a2b;
  switch (type) {
    case 'wall': {
      g.add(box(1, 1.1, 1, 0x9d9890, 0, 0.55, 0));
      g.add(box(1.02, 0.12, 1.02, 0x87827a, 0, 0.06, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.26, 0.26, 0.26, 0x8d8880, sx * 0.37, 1.23, sz * 0.37));
      g.userData.top = 1.3;
      break;
    }
    case 'arrow': {
      g.add(box(0.9, 0.3, 0.9, STONE, 0, 0.15, 0));
      g.add(cyl(0.36, 1.7, 0xc8b996, 0, 1.0, 0, 10, 0.85));
      g.add(cyl(0.46, 0.14, 0x8a6a4a, 0, 1.9, 0, 10));
      g.add(cyl(0.56, 0.8, 0x2f62c4, 0, 2.37, 0, 10, 0));
      g.add(box(0.1, 0.25, 0.06, DARK, 0, 1.3, 0.32));
      g.add(box(0.06, 0.25, 0.1, DARK, 0.32, 1.5, 0));
      g.userData.top = 2.0;
      break;
    }
    case 'bomb': {
      g.add(box(0.96, 0.5, 0.96, 0x8d857a, 0, 0.25, 0));
      g.add(box(0.82, 0.8, 0.82, 0x6f6760, 0, 0.9, 0));
      g.add(box(0.86, 0.1, 0.86, 0xb03a2e, 0, 1.1, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.2, 0.2, 0.2, 0x7c746c, sx * 0.31, 1.4, sz * 0.31));
      const turret = new THREE.Group();
      turret.position.y = 1.45;
      turret.add(sphere(0.24, 0x2a2a2a, 0, 0, 0));
      const barrel = cyl(0.11, 0.5, 0x3a3a3a, 0, 0.12, 0.2, 10);
      barrel.rotation.x = Math.PI / 3;
      turret.add(barrel);
      g.add(turret);
      g.userData.turret = turret;
      g.userData.top = 1.7;
      break;
    }
    case 'farm': {
      g.add(box(0.98, 0.08, 0.98, 0x7a5a30, 0, 0.04, 0));
      for (let i = -1; i <= 1; i++) g.add(box(0.55, 0.14, 0.15, 0xe0c050, -0.17, 0.13, i * 0.28));
      g.add(box(0.3, 0.32, 0.38, 0xb53a2a, 0.3, 0.24, 0.02));
      g.add(box(0.12, 0.18, 0.02, 0xf3ead6, 0.3, 0.17, 0.22));
      const roof = cyl(0.3, 0.24, 0x5a2a1a, 0.3, 0.52, 0.02, 4, 0);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      g.userData.top = 0.7;
      break;
    }
    case 'mine': {
      g.add(box(0.98, 0.06, 0.98, 0x6b5a48, 0, 0.03, 0));
      g.add(rock(0.42, 0.42, 0.4, 0x8a8580, -0.1, 0.28, -0.15));
      g.add(rock(0.28, 0.26, 0.28, 0x7a756f, 0.28, 0.2, -0.22));
      g.add(rock(0.2, 0.16, 0.2, 0x938e88, -0.32, 0.12, 0.25));
      g.add(box(0.28, 0.3, 0.12, 0x140e0a, -0.05, 0.18, 0.24));
      g.add(box(0.05, 0.36, 0.05, WOOD, -0.21, 0.2, 0.31));
      g.add(box(0.05, 0.36, 0.05, WOOD, 0.11, 0.2, 0.31));
      g.add(box(0.38, 0.05, 0.06, WOOD, -0.05, 0.38, 0.31));
      g.add(box(0.22, 0.12, 0.16, 0x5a4a3a, 0.3, 0.12, 0.25));
      for (const [x, z] of [[0.24, 0.22], [0.33, 0.27], [0.29, 0.3]]) g.add(sphere(0.055, M(0xffd23a, 0x553a00), x, 0.21, z, 6));
      g.userData.top = 0.85;
      break;
    }
    case 'flame': {
      g.add(box(0.92, 0.35, 0.92, 0x7a6a5a, 0, 0.175, 0));
      g.add(cyl(0.34, 0.9, 0x5a4038, 0, 0.8, 0, 10, 0.85));
      g.add(cyl(0.37, 0.1, 0xd05a20, 0, 0.95, 0, 10));
      g.add(cyl(0.38, 0.08, 0x3a3a3a, 0, 1.22, 0, 10));
      const turret = new THREE.Group();
      turret.position.y = 1.4;
      turret.add(sphere(0.25, 0x3a3a3a, 0, 0, 0, 10));
      turret.add(cyl(0.1, 0.32, 0xc03a20, -0.18, 0.1, -0.12, 8));
      turret.add(cyl(0.1, 0.32, 0xc03a20, 0.18, 0.1, -0.12, 8));
      const noz = cyl(0.07, 0.45, 0x2a2a2a, 0, 0.0, 0.3, 8);
      noz.rotation.x = Math.PI / 2;
      turret.add(noz);
      const tip = cyl(0.1, 0.08, M(0xff7a20, 0x803000), 0, 0.0, 0.52, 8);
      tip.rotation.x = Math.PI / 2;
      turret.add(tip);
      g.add(turret);
      g.userData.turret = turret;
      g.userData.top = 1.5;
      break;
    }
    case 'laser': {
      g.add(box(0.9, 0.3, 0.9, 0xd8d4e0, 0, 0.15, 0));
      g.add(cyl(0.3, 1.6, 0xe8e6f0, 0, 1.0, 0, 8, 0.6));
      g.add(cyl(0.34, 0.08, 0x6a4a9a, 0, 0.5, 0, 8));
      g.add(cyl(0.24, 0.08, 0x6a4a9a, 0, 1.3, 0, 8));
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3;
        g.add(box(0.06, 0.45, 0.06, 0x8a8aa0, Math.cos(a) * 0.22, 1.95, Math.sin(a) * 0.22));
      }
      // own material so each tower can glow while it charges
      const crystalMat = new THREE.MeshLambertMaterial({ color: 0xe0a0ff, emissive: 0x9030ff, emissiveIntensity: 0.3 });
      const crystal = part(G('octa', () => new THREE.OctahedronGeometry(1, 0)), crystalMat, 0, 2.25, 0, 0.2, 0.3, 0.2);
      g.add(crystal);
      g.userData.crystal = crystal;
      g.userData.top = 2.0;
      break;
    }
    case 'guardhouse': {
      g.add(box(0.96, 0.08, 0.96, 0x8a8478, 0, 0.04, 0));
      g.add(box(0.8, 0.7, 0.7, 0xb8ae9c, 0, 0.43, 0));
      const roof = cyl(0.62, 0.45, 0x2f5fb0, 0, 1.0, 0, 4, 0);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      g.add(box(0.24, 0.38, 0.03, 0x4a2e1a, 0, 0.27, 0.36));
      g.add(box(0.2, 0.24, 0.03, 0x2f5fb0, 0.27, 0.52, 0.36));
      g.add(box(0.04, 0.16, 0.035, 0xffd23a, 0.27, 0.52, 0.37));
      g.add(box(0.12, 0.04, 0.035, 0xffd23a, 0.27, 0.55, 0.37));
      g.add(box(0.04, 0.42, 0.04, 0xcfd2da, -0.3, 0.3, 0.44));
      g.add(box(0.14, 0.03, 0.04, 0x8a6a2a, -0.3, 0.42, 0.44));
      g.userData.top = 1.2;
      break;
    }
    case 'archery': {
      g.add(box(0.98, 0.06, 0.98, 0x7a6a40, 0, 0.03, 0));
      g.add(box(0.5, 0.5, 0.5, 0x9a7040, -0.2, 0.31, -0.2));
      const roof = cyl(0.42, 0.3, 0x3a7a3a, -0.2, 0.71, -0.2, 4, 0);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      g.add(box(0.04, 0.45, 0.04, WOOD, 0.18, 0.25, 0.25));
      g.add(box(0.04, 0.45, 0.04, WOOD, 0.36, 0.25, 0.25));
      for (const [r, c, dz] of [[0.2, 0xf3ead6, 0], [0.14, 0xc0392b, 0.01], [0.07, 0xffd23a, 0.02]]) {
        const ring = cyl(r, 0.04, c, 0.27, 0.48, 0.29 + dz, 14);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      }
      g.add(box(0.03, 0.03, 0.22, 0x5a3a1a, 0.3, 0.5, 0.36));
      g.userData.top = 0.95;
      break;
    }
    case 'wharf': {
      // the dock points toward +z; placeBuilding turns it to face the water
      g.add(box(0.96, 0.08, 0.6, 0x9a7048, 0, 0.1, -0.15));
      g.add(box(0.46, 0.06, 0.8, 0xa87c50, 0.12, 0.12, 0.5));
      for (const [x, z] of [[-0.08, 0.86], [0.32, 0.86], [-0.08, 0.45], [0.32, 0.45]]) g.add(box(0.06, 0.3, 0.06, 0x5a3a1a, x, 0.02, z));
      g.add(box(0.48, 0.4, 0.4, 0x8a6a40, -0.2, 0.34, -0.22));
      const roof = cyl(0.4, 0.26, 0x2f7fa0, -0.2, 0.67, -0.22, 4, 0);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      g.add(cyl(0.1, 0.2, 0x6b4a2a, 0.3, 0.24, -0.25, 8));
      g.add(box(0.16, 0.05, 0.06, 0x9ab8c8, 0.3, 0.36, -0.25));
      const rod = box(0.025, 0.7, 0.025, 0x5a3a1a, 0.25, 0.4, 0.8);
      rod.rotation.x = 0.7;
      g.add(rod);
      g.userData.top = 0.75;
      break;
    }
    case 'castle': {
      const WALL = 0xcfc6b2, ROOF = 0xc0392b;
      g.add(box(2.6, 1.3, 2.6, WALL, 0, 0.65, 0));
      for (let i = -1.0; i <= 1.01; i += 0.4) {
        g.add(box(0.2, 0.22, 0.2, 0xbab19d, i, 1.41, 1.22));
        g.add(box(0.2, 0.22, 0.2, 0xbab19d, i, 1.41, -1.22));
        g.add(box(0.2, 0.22, 0.2, 0xbab19d, 1.22, 1.41, i));
        g.add(box(0.2, 0.22, 0.2, 0xbab19d, -1.22, 1.41, i));
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.add(cyl(0.45, 2.1, 0xd8cfbb, sx * 1.2, 1.05, sz * 1.2, 12));
        g.add(cyl(0.56, 0.9, ROOF, sx * 1.2, 2.55, sz * 1.2, 12, 0));
      }
      g.add(box(1.2, 2.4, 1.2, 0xe0d8c6, 0, 1.2, 0));
      const keepRoof = cyl(0.95, 1.0, ROOF, 0, 2.9, 0, 4, 0);
      keepRoof.rotation.y = Math.PI / 4;
      g.add(keepRoof);
      g.add(box(0.6, 0.75, 0.08, 0x4a2e1a, 0, 0.375, 1.31));
      g.add(box(0.14, 0.26, 0.04, DARK, 0, 1.75, 0.61));
      g.add(cyl(0.03, 1.0, 0x555555, 0, 3.75, 0, 6));
      const flag = box(0.5, 0.3, 0.02, 0xffd23a, 0.26, 4.05, 0);
      g.add(flag);
      g.userData.flag = flag;
      g.userData.top = 2.6;
      break;
    }
  }
  return g;
}

function makeEnemyMesh(def, type) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  inner.add(cyl(0.2, 0.42, def.body, 0, 0.43, 0, 8, 0.8));
  inner.add(sphere(0.16, def.skin, 0, 0.8, 0, 8));
  const eye = def.ally ? M(0x1a1a1a) : M(0xff2a2a, 0xaa0000);
  inner.add(box(0.05, 0.05, 0.03, eye, -0.06, 0.82, 0.145));
  inner.add(box(0.05, 0.05, 0.03, eye, 0.06, 0.82, 0.145));
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.09, 0.24, 0);
    leg.add(box(0.1, 0.24, 0.1, 0x3a2a1a, 0, -0.12, 0));
    inner.add(leg); legs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(s * 0.24, 0.6, 0);
    arm.add(box(0.08, 0.28, 0.08, def.skin, 0, -0.13, 0));
    if (s === 1 && !def.ally) arm.add(box(0.07, 0.34, 0.07, 0x6b4a2a, 0, -0.3, 0.1));
    inner.add(arm); arms.push(arm);
  }
  if (type === 'guard') {
    inner.add(cyl(0.17, 0.12, 0xb8bcc6, 0, 0.93, 0, 8, 0.6));
    arms[1].add(box(0.04, 0.42, 0.04, 0xdadde6, 0, -0.42, 0.1));
    arms[1].add(box(0.16, 0.03, 0.05, 0x8a6a2a, 0, -0.22, 0.1));
    arms[0].add(box(0.04, 0.28, 0.22, 0x2f5fb0, -0.06, -0.2, 0.06));
    arms[0].add(box(0.045, 0.08, 0.08, 0xffd23a, -0.07, -0.2, 0.06));
  }
  if (type === 'archer') {
    inner.add(cyl(0.18, 0.2, 0x2f6a2f, 0, 0.92, 0, 8, 0));
    arms[0].add(box(0.03, 0.46, 0.03, 0x6b4a2a, 0, -0.25, 0.12));
    arms[0].add(box(0.01, 0.42, 0.01, 0xf3ead6, 0, -0.25, 0.06));
    inner.add(box(0.1, 0.26, 0.1, 0x6b4a2a, 0.08, 0.5, -0.2));
  }
  if (type === 'boss') {
    const gold = M(0xffd23a, 0x664400);
    inner.add(cyl(0.15, 0.07, gold, 0, 0.95, 0, 10));
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5;
      inner.add(cyl(0.03, 0.09, gold, Math.cos(a) * 0.13, 1.02, Math.sin(a) * 0.13, 5, 0));
    }
    for (const s of [-1, 1]) {
      inner.add(sphere(0.11, 0x3a3a3a, s * 0.25, 0.68, 0, 6));
      const spike = cyl(0.04, 0.12, 0xeee2c0, s * 0.3, 0.78, 0, 5, 0);
      spike.rotation.z = -s * 0.6;
      inner.add(spike);
    }
    arms[1].add(sphere(0.11, 0x4a4a4a, 0, -0.5, 0.1, 7));
    inner.add(box(0.36, 0.06, 0.24, 0x2a1a10, 0, 0.3, 0));
  }
  if (type === 'soldier') {
    inner.add(cyl(0.17, 0.12, 0x9a9a9a, 0, 0.93, 0, 8, 0.6));
    inner.add(box(0.05, 0.3, 0.26, 0x7a7a7a, -0.3, 0.5, 0.05));
  }
  if (type === 'brute') {
    for (const s of [-1, 1]) {
      const horn = cyl(0.05, 0.18, 0xeee2c0, s * 0.12, 0.98, 0, 6, 0);
      horn.rotation.z = -s * 0.5;
      inner.add(horn);
      inner.add(sphere(0.1, 0x6b4a8a, s * 0.24, 0.66, 0, 6));
    }
  }
  inner.scale.setScalar(def.scale);
  return { g, inner, legs, arms };
}

// ---- billboard bars ----
const PLANE = G('plane', () => new THREE.PlaneGeometry(1, 1));
const PLANE_L = G('planeL', () => new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0));
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthTest: false });
const barMats = {
  hp: new THREE.MeshBasicMaterial({ color: 0x4cd64c, depthTest: false, transparent: true }),
  enemy: new THREE.MeshBasicMaterial({ color: 0xe33b3b, depthTest: false, transparent: true }),
  cd: new THREE.MeshBasicMaterial({ color: 0x5ab8ff, depthTest: false, transparent: true }),
};
const noRaycast = () => {};
function makeBar(width, mat) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(PLANE, barBgMat);
  bg.scale.set(width + 0.06, 0.13, 1);
  bg.renderOrder = 20;
  const fill = new THREE.Mesh(PLANE_L, mat);
  fill.position.set(-width / 2, 0, 0.001);
  fill.scale.set(width, 0.08, 1);
  fill.renderOrder = 21;
  bg.raycast = fill.raycast = noRaycast;
  g.add(bg, fill);
  g.userData.fill = fill;
  g.userData.w = width;
  return g;
}
function setBar(bar, r) { bar.userData.fill.scale.x = Math.max(0.0001, bar.userData.w * clamp(r, 0, 1)); }

const coinMat = M(0xffd23a, 0x7a5200);
const readyRingMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.5, depthWrite: false });
const ringGeo = G('readyRing', () => new THREE.RingGeometry(0.45, 0.62, 32).rotateX(-Math.PI / 2));

// ============================================================
// STATE
// ============================================================
let S = null;
function newState() {
  return {
    gold: START_GOLD, time: 0, kills: 0,
    buildings: [], enemies: [], projectiles: [], allies: [],
    grid: new Array(GRID * GRID).fill(null),
    terrain: new Uint8Array(GRID * GRID),
    flowDirty: true, spawnAcc: 0,
    nextBoss: BOSS_INTERVAL, bossCount: 0,
    over: false, overT: 0, castle: null,
    seen: {},
  };
}

// ============================================================
// FLOW FIELD (Dijkstra from the castle)
// Buildings are passable but very expensive, so enemies walk around
// walls when there is room and break through when there is none.
// ============================================================
const N = GRID * GRID;
const dist = new Float64Array(N); // must match the heap's float64 keys exactly
const nextTile = new Int32Array(N);
const NBS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
let flowVersion = 0;

function enterCost(i) {
  const b = S.grid[i];
  if (b && b.type !== 'castle') return 101 + b.def.hp * 0.25;
  return S.terrain[i] === T_WATER ? WATER_COST : 1;
}
// diagonal steps only through fully open corners
function canStep(fx, fz, tx, tz) {
  if (fx !== tx && fz !== tz) {
    const g = S.grid;
    if (g[idx(tx, tz)] || g[idx(fx, tz)] || g[idx(tx, fz)] || g[idx(fx, fz)]) return false;
  }
  return true;
}

function computeFlow() {
  dist.fill(Infinity);
  nextTile.fill(-1);
  const heap = [];
  const push = (d, i) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (let i = 0; i < N; i++) {
    const b = S.grid[i];
    if (b && b.type === 'castle') { dist[i] = 0; push(0, i); }
  }
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    const ux = u % GRID, uz = (u / GRID) | 0;
    const cu = enterCost(u);
    for (const [dx, dz] of NBS) {
      const vx = ux + dx, vz = uz + dz;
      if (!inBounds(vx, vz)) continue;
      const v = idx(vx, vz);
      const vb = S.grid[v];
      if (vb && vb.type === 'castle') continue;
      if (!canStep(vx, vz, ux, uz)) continue;
      const nd = d + (dx && dz ? Math.SQRT2 : 1) * cu;
      if (nd < dist[v]) { dist[v] = nd; nextTile[v] = u; push(nd, v); }
    }
  }
  flowVersion++;
  S.flowDirty = false;
  for (const e of S.enemies) e.attack = null; // re-evaluate targets
}

// ============================================================
// TERRAIN (rivers, bridges, gold ore) - new layout every game
// ============================================================
const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a8fd6, emissive: 0x0a2a50 });
const terrainAt = (x, z) => S.terrain[idx(clamp(toTile(x), 0, GRID - 1), clamp(toTile(z), 0, GRID - 1))];
const terrainSpeed = (p) => terrainAt(p.x, p.z) === T_WATER ? WATER_SPEED : 1;
function nearTerrain(x, z, type) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dz) && inBounds(x + dx, z + dz) && S.terrain[idx(x + dx, z + dz)] === type) return true;
  }
  return false;
}

function genTerrain() {
  const t = S.terrain;
  const outside = []; // river tiles past the map edge, drawn for looks only
  const vertFirst = Math.random() < 0.5;
  const count = Math.random() < 0.65 ? 2 : 1;
  for (let r = 0; r < count; r++) {
    const vert = r === 0 ? vertFirst : !vertFirst;
    // stay well away from the castle (closest bank is ~5 tiles from the center)
    const off = (Math.random() < 0.5 ? -1 : 1) * rand(9, 14);
    const amp = rand(1, 2.5), freq = rand(0.12, 0.25), ph = rand(0, Math.PI * 2);
    const bands = [];
    for (let a = -12; a < GRID + 12; a++) {
      const c = HALF + off + amp * Math.sin(a * freq + ph);
      const band = [];
      for (let b = Math.floor(c - 1.1); b <= Math.ceil(c + 1.1); b++) {
        if (Math.abs(b - c) >= 1.1) continue;
        const [x, z] = vert ? [b, a] : [a, b];
        if (!inBounds(x, z)) { outside.push([x, z]); continue; }
        const i = idx(x, z);
        if (t[i] !== T_BRIDGE) t[i] = T_WATER;
        band.push(i);
      }
      bands[a] = band;
    }
    // three 2-wide bridges spread along the river
    for (const [lo, hi] of [[3, 10], [16, 23], [29, 36]]) {
      const a0 = lo + ((Math.random() * (hi - lo)) | 0);
      for (const a of [a0, a0 + 1]) for (const i of bands[a]) t[i] = T_BRIDGE;
    }
  }
  // gold ore: two next to the starter mines, the rest scattered
  const ore = [[HALF - 4, HALF + 3], [HALF + 4, HALF + 3]];
  for (let tries = 0; ore.length < 11 && tries < 800; tries++) {
    const x = 2 + ((Math.random() * (GRID - 4)) | 0), z = 2 + ((Math.random() * (GRID - 4)) | 0);
    const d = Math.hypot(x - HALF, z - HALF);
    if (d < 6 || d > 18 || t[idx(x, z)] !== T_GRASS || nearTerrain(x, z, T_WATER)) continue;
    if (ore.some(([ox, oz]) => Math.max(Math.abs(ox - x), Math.abs(oz - z)) < 4)) continue;
    ore.push([x, z]);
  }
  for (const [x, z] of ore) t[idx(x, z)] = T_ORE;
  buildTerrainMeshes(outside);
}

function buildTerrainMeshes(outside) {
  const t = S.terrain;
  const addWater = (x, z) => {
    const m = box(1, 0.02, 1, waterMat, x - HALF, 0.006, z - HALF);
    m.castShadow = false;
    world.add(m);
  };
  for (const [x, z] of outside) addWater(x, z);
  const WOOD = 0x9a7048, RAIL = 0x6b4a2a;
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const k = t[idx(x, z)];
    const wx = x - HALF, wz = z - HALF;
    if (k === T_WATER || k === T_BRIDGE) addWater(x, z);
    if (k === T_BRIDGE) {
      world.add(box(1, 0.1, 0.96, WOOD, wx, 0.05, wz));
      // railing on every side that faces open water
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!inBounds(x + dx, z + dz) || t[idx(x + dx, z + dz)] !== T_WATER) continue;
        const rx = wx + dx * 0.45, rz = wz + dz * 0.45;
        world.add(box(dx ? 0.06 : 1, 0.06, dz ? 0.06 : 1, RAIL, rx, 0.32, rz));
        world.add(box(0.08, 0.3, 0.08, RAIL, rx + (dz ? 0.4 : 0), 0.18, rz + (dx ? 0.4 : 0)));
        world.add(box(0.08, 0.3, 0.08, RAIL, rx - (dz ? 0.4 : 0), 0.18, rz - (dx ? 0.4 : 0)));
      }
    }
    if (k === T_ORE) {
      world.add(rock(0.4, 0.2, 0.38, 0x6f6a64, wx - 0.05, 0.08, wz));
      world.add(rock(0.22, 0.14, 0.2, 0x7d7871, wx + 0.28, 0.06, wz + 0.22));
      const nug = M(0xffd23a, 0x664400);
      for (const [nx, ny, nz] of [[-0.1, 0.22, 0.1], [0.12, 0.18, -0.12], [-0.25, 0.12, -0.15], [0.3, 0.14, 0.2], [0.05, 0.25, -0.02]]) {
        world.add(sphere(0.07, nug, wx + nx, ny, wz + nz, 6));
      }
    }
  }
}

// ============================================================
// BUILDINGS
// ============================================================
function placeBuilding(type, x0, z0) {
  const def = DEFS[type];
  const size = def.size;
  const mesh = makeBuildingMesh(type);
  const cx = x0 - HALF + (size - 1) / 2, cz = z0 - HALF + (size - 1) / 2;
  mesh.position.set(cx, 0, cz);
  mesh.scale.setScalar(0.001);
  if (type === 'wharf') { // point the dock at the water
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (inBounds(x0 + dx, z0 + dz) && S.terrain[idx(x0 + dx, z0 + dz)] === T_WATER) { mesh.rotation.y = Math.atan2(dx, dz); break; }
    }
  }
  world.add(mesh);
  const top = mesh.userData.top;
  const b = {
    type, def, x0, z0, size, cx, cz, top, mesh,
    hp: def.hp, maxHp: def.hp, dead: false,
    spawnT: 0, landed: false, shakeT: 0, popT: 0,
    reload: 0.3, cdT: def.spawn ? def.cd * 0.75 : 0, ready: false,
    retarget: 0, flameT: 0, units: [],
    bar: makeBar(size === 3 ? 2.4 : 0.9, barMats.hp),
  };
  mesh.userData.building = b;
  b.bar.visible = false;
  b.bar.position.set(cx, top + (size === 3 ? 2.0 : 0.55), cz);
  world.add(b.bar);
  if (def.income || def.spawn) {
    b.cdBar = makeBar(0.8, barMats.cd);
    b.cdBar.position.set(cx, top + 0.35, cz);
    b.cdBar.visible = false;
    world.add(b.cdBar);
  }
  if (def.income) {
    const coin = new THREE.Group();
    const disc = new THREE.Mesh(G('coin', () => new THREE.CylinderGeometry(1, 1, 1, 18)), coinMat);
    disc.scale.set(0.24, 0.06, 0.24);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    coin.add(disc);
    const hit = new THREE.Mesh(G('hitSph', () => new THREE.SphereGeometry(0.55, 8, 6)), coinMat);
    hit.visible = false; // invisible, enlarges the click target
    coin.add(hit);
    coin.position.set(cx, top + 0.55, cz);
    coin.visible = false;
    coin.userData.building = b;
    world.add(coin);
    b.coin = coin;
    const ring = new THREE.Mesh(ringGeo, readyRingMat);
    ring.position.set(cx, 0.03, cz);
    ring.visible = false;
    world.add(ring);
    b.ring = ring;
  }
  for (let dx = 0; dx < size; dx++) for (let dz = 0; dz < size; dz++) S.grid[idx(x0 + dx, z0 + dz)] = b;
  S.buildings.push(b);
  S.flowDirty = true;
  return b;
}

function destroyBuilding(b) {
  if (b.dead) return;
  b.dead = true;
  for (let dx = 0; dx < b.size; dx++) for (let dz = 0; dz < b.size; dz++) S.grid[idx(b.x0 + dx, b.z0 + dz)] = null;
  world.remove(b.mesh, b.bar);
  if (b.cdBar) world.remove(b.cdBar);
  if (b.coin) world.remove(b.coin, b.ring);
  const n = b.size === 3 ? 70 : 22;
  burst(b.cx, b.top * 0.5, b.cz, b.def.color || 0xcfc6b2, n, 4, 0.18, 1.2, -14, b.size * 0.5);
  burst(b.cx, 0.3, b.cz, 0x8a7a66, n / 2, 2, 0.3, 0.9, -2, b.size * 0.5);
  shake(b.size === 3 ? 0.6 : 0.15);
  S.buildings.splice(S.buildings.indexOf(b), 1);
  S.flowDirty = true;
  if (b.type === 'castle') gameOver();
}

function damageBuilding(b, dmg) {
  if (b.dead) return;
  b.hp -= dmg;
  b.shakeT = 0.18;
  b.bar.visible = true;
  setBar(b.bar, b.hp / b.maxHp);
  burst(b.cx + rand(-0.3, 0.3), b.top * 0.4, b.cz + rand(-0.3, 0.3), 0xbfb6a2, 3, 2, 0.08, 0.5);
  if (b.hp <= 0) destroyBuilding(b);
}

function collect(b) {
  if (!b.ready || b.dead) return false;
  b.ready = false;
  b.cdT = 0;
  b.coin.visible = false;
  b.ring.visible = false;
  b.popT = 0.3;
  addGold(b.def.income);
  const p = new THREE.Vector3(b.cx, b.top + 0.6, b.cz);
  floatText('+' + b.def.income, p, '');
  flyCoins(p, Math.min(6, 2 + Math.round(b.def.income / 4)));
  burst(b.cx, b.top + 0.5, b.cz, 0xffd23a, 10, 3, 0.08, 0.6, -10);
  return true;
}

function updateBuildings(dt) {
  for (const b of S.buildings) {
    // build animation
    if (b.spawnT < 1) {
      b.spawnT = Math.min(1, b.spawnT + dt / 0.55);
      const s = easeOutBack(b.spawnT);
      b.mesh.scale.set(s, s, s);
      b.mesh.position.y = (1 - easeOutCubic(b.spawnT)) * 2;
      if (b.spawnT >= 1 && !b.landed) {
        b.landed = true;
        b.mesh.scale.setScalar(1);
        dustRing(b.cx, b.cz, b.size * 0.6);
      }
    }
    // hit shake / collect pop
    let ox = 0;
    if (b.shakeT > 0) { b.shakeT -= dt; ox = Math.sin(S.time * 90) * 0.05 * (b.shakeT / 0.18); }
    b.mesh.position.x = b.cx + ox;
    if (b.popT > 0) {
      b.popT -= dt;
      const k = 1 + Math.sin((1 - b.popT / 0.3) * Math.PI) * 0.15;
      b.mesh.scale.set(k, 1 / k, k);
    } else if (b.landed) b.mesh.scale.set(1, 1, 1);

    if (b.type === 'castle') b.mesh.userData.flag.rotation.y = Math.sin(S.time * 3) * 0.3;
    if (!b.landed) continue;

    // producers
    if (b.def.income) {
      if (!b.ready) {
        b.cdT += dt;
        b.cdBar.visible = true;
        setBar(b.cdBar, b.cdT / b.def.cd);
        if (b.cdT >= b.def.cd) {
          b.ready = true;
          b.coin.visible = true;
          b.ring.visible = true;
          b.cdBar.visible = false;
        }
      } else {
        b.coin.rotation.y += dt * 4;
        b.coin.position.y = b.top + 0.55 + Math.sin(S.time * 5 + b.cx) * 0.1;
      }
    }

    // unit trainers
    if (b.def.spawn) {
      b.units = b.units.filter((u) => !u.dead);
      if (b.units.length < b.def.max) {
        b.cdT += dt;
        b.cdBar.visible = true;
        setBar(b.cdBar, b.cdT / b.def.cd);
        if (b.cdT >= b.def.cd) b.cdT = spawnAlly(b) ? 0 : b.def.cd;
      } else b.cdBar.visible = false;
    }

    const keepTarget = () => {
      const cur = b.target;
      return cur && !cur.dead && Math.hypot(cur.pos.x - b.cx, cur.pos.z - b.cz) <= b.def.range + cur.radius;
    };

    // flamethrower: constant damage in a cone
    if (b.def.dps) {
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.retarget = 0.2;
        b.target = keepTarget() ? b.target : findTarget(b.cx, b.cz, b.def.range);
      }
      const t = b.target;
      if (t && !t.dead) {
        const yaw = Math.atan2(t.pos.x - b.cx, t.pos.z - b.cz);
        b.mesh.userData.turret.rotation.y = yaw;
        for (const e of S.enemies) {
          if (e.dead || e.spawnT < 0.5) continue;
          const dx = e.pos.x - b.cx, dz = e.pos.z - b.cz;
          const d = Math.hypot(dx, dz);
          if (d > b.def.range + e.radius) continue;
          let da = Math.atan2(dx, dz) - yaw;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) > b.def.cone && d > 0.8) continue;
          damageEnemy(e, b.def.dps * dt, true);
        }
        b.flameT -= dt;
        while (b.flameT <= 0) { b.flameT += 0.03; flameParticle(b, yaw); }
      }
    } else if (b.def.range) { // shooters
      b.reload -= dt;
      if (b.reload <= 0) {
        // stick with the current target while it stays in range, so damage isn't spread thin;
        // the laser always picks the toughest enemy for its big shot
        const t = b.target = b.type === 'laser' ? findTarget(b.cx, b.cz, b.def.range, true)
          : keepTarget() ? b.target : findTarget(b.cx, b.cz, b.def.range);
        if (t) {
          b.reload = b.def.reload;
          if (b.type === 'bomb') fireBomb(b, t);
          else if (b.type === 'laser') fireLaser(b, t);
          else fireArrow(b, t);
        } else b.reload = 0.1;
      }
      if (b.type === 'laser') { // crystal glows brighter as it charges
        const c = 1 - clamp(b.reload / b.def.reload, 0, 1);
        const crystal = b.mesh.userData.crystal;
        crystal.material.emissiveIntensity = 0.1 + c * c * 1.6;
        crystal.rotation.y += dt * (0.4 + c * 4);
      }
    }
  }
}

function findTarget(x, z, range, strongest) {
  let best = null, bestD = Infinity;
  for (const e of S.enemies) {
    if (e.dead || e.spawnT < 0.5) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    const r = range + e.radius;
    if (dx * dx + dz * dz > r * r) continue;
    const score = strongest ? -e.hp : e.pathDist; // toughest, or the one closest to the castle
    if (score < bestD) { bestD = score; best = e; }
  }
  return best;
}

// ============================================================
// PROJECTILES
// ============================================================
const arrowGeo = G('arrow', () => new THREE.BoxGeometry(0.04, 0.04, 0.5));
function fireArrow(b, target) {
  let sx = b.cx, sz = b.cz;
  if (b.type === 'castle') { // shoot from a random corner tower
    sx += (Math.random() < 0.5 ? -1.2 : 1.2);
    sz += (Math.random() < 0.5 ? -1.2 : 1.2);
  }
  fireArrowFrom(sx, b.top + 0.2, sz, target, b.def.dmg);
}
function fireArrowFrom(x, y, z, target, dmg) {
  const m = new THREE.Mesh(arrowGeo, M(0x5a3a1a));
  m.position.set(x, y, z);
  world.add(m);
  S.projectiles.push({ kind: 'arrow', mesh: m, target, dmg, speed: 16, last: target.pos.clone() });
}

const beams = [];
const beamGeo = G('beam', () => new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2));
function fireLaser(b, target) {
  const from = new THREE.Vector3(b.cx, b.top + 0.25, b.cz);
  const to = new THREE.Vector3(target.pos.x, 0.45 * target.def.scale, target.pos.z);
  damageEnemy(target, b.def.dmg);
  for (const [color, w] of [[0xc060ff, 0.13], [0xffffff, 0.05]]) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    const m = new THREE.Mesh(beamGeo, mat);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    m.scale.set(w, w, from.distanceTo(to));
    m.raycast = noRaycast;
    world.add(m);
    beams.push({ mesh: m, t: 0, T: 0.35, w });
  }
  burst(to.x, to.y, to.z, 0xe0a0ff, 12, 3.5, 0.08, 0.5, -4);
  burst(from.x, from.y, from.z, 0xffffff, 5, 1.5, 0.06, 0.3, 0);
  shake(0.05);
}

const flameMats = [M(0xffd040, 0xff9000), M(0xff7a20, 0xd04000), M(0xd03a10, 0x801000)];
function flameParticle(b, yaw) {
  if (particles.length > 900) return;
  const m = new THREE.Mesh(BOX(), flameMats[(Math.random() * 3) | 0]);
  const s = rand(0.12, 0.24);
  m.scale.setScalar(s);
  m.position.set(b.cx + Math.sin(yaw) * 0.55, b.top - 0.1, b.cz + Math.cos(yaw) * 0.55);
  world.add(m);
  const a = yaw + rand(-0.4, 0.4), sp = rand(6, 9);
  particles.push({ m, s, vx: Math.sin(a) * sp, vy: rand(-3, -1.2), vz: Math.cos(a) * sp, life: rand(0.3, 0.42), max: 0.4, grav: 3 });
}

function fireBomb(b, target) {
  const turret = b.mesh.userData.turret;
  turret.rotation.y = Math.atan2(target.pos.x - b.cx, target.pos.z - b.cz);
  const from = new THREE.Vector3(b.cx, b.top, b.cz);
  const d = Math.hypot(target.pos.x - b.cx, target.pos.z - b.cz);
  const T = 0.55 + d * 0.07;
  const to = new THREE.Vector3(target.pos.x + target.vel.x * T, 0.1, target.pos.z + target.vel.z * T);
  const m = sphere(0.15, 0x1a1a1a, from.x, from.y, from.z, 8);
  world.add(m);
  S.projectiles.push({ kind: 'bomb', mesh: m, from, to, t: 0, T, dmg: b.def.dmg, splash: b.def.splash, arc: 1.5 + d * 0.25 });
  burst(from.x, from.y + 0.2, from.z, 0x777777, 4, 1, 0.12, 0.5, 1);
}

const tmpV = new THREE.Vector3();
function updateProjectiles(dt) {
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i];
    let done = false;
    if (p.kind === 'arrow') {
      if (!p.target.dead) p.last.set(p.target.pos.x, 0.45 * p.target.def.scale, p.target.pos.z);
      tmpV.subVectors(p.last, p.mesh.position);
      const d = tmpV.length();
      const step = p.speed * dt;
      p.mesh.lookAt(p.last);
      if (d <= step) {
        if (!p.target.dead) damageEnemy(p.target, p.dmg);
        done = true;
      } else p.mesh.position.addScaledVector(tmpV, step / d);
    } else {
      p.t += dt / p.T;
      const u = Math.min(1, p.t);
      p.mesh.position.lerpVectors(p.from, p.to, u);
      p.mesh.position.y += p.arc * 4 * u * (1 - u);
      if (u >= 1) { explode(p.to, p.splash, p.dmg); done = true; }
    }
    if (done) { world.remove(p.mesh); S.projectiles.splice(i, 1); }
  }
}

function explode(pos, radius, dmg) {
  for (const e of S.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
    if (d <= radius + e.radius) damageEnemy(e, dmg * (1 - 0.5 * clamp(d / radius, 0, 1)));
  }
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85, depthWrite: false });
  const flash = new THREE.Mesh(G('sph12', () => new THREE.SphereGeometry(1, 12, 9)), flashMat);
  flash.position.set(pos.x, 0.3, pos.z);
  flash.scale.setScalar(0.1);
  world.add(flash);
  fx.push({ mesh: flash, t: 0, T: 0.35, max: radius });
  burst(pos.x, 0.3, pos.z, 0xff7a20, 14, 5, 0.12, 0.6, -6);
  burst(pos.x, 0.3, pos.z, 0x555555, 10, 2.5, 0.22, 1.0, 1);
  shake(0.12);
}

// ============================================================
// ENEMIES
// ============================================================
function hpMult() { return 1 + Math.max(0, S.time - GRACE_TIME) / 300; }
function dmgMult() { return 1 + Math.max(0, S.time - GRACE_TIME) / 400; }

function spawnEnemy(type) {
  const def = ENEMIES[type];
  const side = (Math.random() * 4) | 0;
  const t = (Math.random() * GRID) | 0;
  const [x, z] = [[t, 0], [t, GRID - 1], [0, t], [GRID - 1, t]][side];
  const m = makeEnemyMesh(def, type);
  m.g.position.set(x - HALF + rand(-0.3, 0.3), 0, z - HALF + rand(-0.3, 0.3));
  m.g.scale.setScalar(0.001);
  world.add(m.g);
  let hp = def.hp * hpMult();
  if (type === 'boss') hp *= 1 + 0.6 * S.bossCount; // every boss is tougher than the last
  const e = {
    type, def, hp, maxHp: hp, mesh: m, pos: m.g.position,
    radius: 0.22 * def.scale, speed: def.speed * (type === 'boss' ? 1 : rand(0.9, 1.1)),
    vel: new THREE.Vector3(), attack: null, fight: null, atkCd: rand(0.2, 0.8), aggroT: 0,
    spawnT: 0, walkT: rand(0, 10), hitT: 0, lungeT: 0, stuckT: 0, dead: false, pathDist: Infinity,
    bar: makeBar(type === 'boss' ? 2.2 : 0.6 * Math.max(1, def.scale * 0.8), barMats.enemy),
  };
  e.bar.visible = type === 'boss';
  world.add(e.bar);
  S.enemies.push(e);
  if (type === 'boss') {
    toast(S.bossCount ? `BOSS #${S.bossCount + 1} approaches!` : 'A BOSS approaches!');
    shake(0.5);
  } else if (type !== 'grunt' && !S.seen[type]) {
    S.seen[type] = true;
    toast(type === 'brute' ? 'A BRUTE approaches!' : 'Soldiers are coming!');
  }
}

// quiet: no hit-flash (for damage applied every frame, like fire)
function damageEnemy(e, dmg, quiet) {
  if (e.dead) return;
  e.hp -= dmg;
  if (!quiet) e.hitT = 0.1;
  e.bar.visible = true;
  setBar(e.bar, e.hp / e.maxHp);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  world.remove(e.mesh.g, e.bar);
  S.kills++;
  addGold(e.def.reward);
  floatText('+' + e.def.reward, new THREE.Vector3(e.pos.x, 1.1 * e.def.scale, e.pos.z), e.type === 'boss' ? '' : 'small');
  burst(e.pos.x, 0.4 * e.def.scale, e.pos.z, e.def.body, 8 + e.def.scale * 6, 3, 0.1 * e.def.scale, 0.8);
  if (e.type === 'boss') {
    burst(e.pos.x, 1, e.pos.z, 0xffd23a, 30, 5, 0.12, 1.2, -10);
    shake(0.6);
    toast('BOSS DEFEATED!');
  }
}

function aabbDist(x, z, b) {
  const hs = b.size / 2;
  const dx = Math.max(Math.abs(x - b.cx) - hs, 0);
  const dz = Math.max(Math.abs(z - b.cz) - hs, 0);
  return Math.hypot(dx, dz);
}

function blockedAt(x, z) {
  const tx = toTile(x), tz = toTile(z);
  if (!inBounds(tx, tz)) return false;
  return !!S.grid[idx(tx, tz)];
}

function tryMove(e, vx, vz) {
  const r = Math.min(e.radius, 0.3);
  const lim = HALF + 0.45;
  let moved = 0;
  if (vx) {
    const nx = clamp(e.pos.x + vx, -lim, lim);
    if (!blockedAt(nx + Math.sign(vx) * r, e.pos.z)) { moved += Math.abs(nx - e.pos.x); e.pos.x = nx; }
  }
  if (vz) {
    const nz = clamp(e.pos.z + vz, -lim, lim);
    if (!blockedAt(e.pos.x, nz + Math.sign(vz) * r)) { moved += Math.abs(nz - e.pos.z); e.pos.z = nz; }
  }
  return moved;
}

// any building next to the enemy (walls only when includeWalls)
function adjacentBuilding(e, tx, tz, includeWalls, reach) {
  let best = null, bestD = Infinity;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = tx + dx, z = tz + dz;
    if (!inBounds(x, z)) continue;
    const b = S.grid[idx(x, z)];
    if (!b || b.dead || (!includeWalls && b.type === 'wall')) continue;
    const d = aabbDist(e.pos.x, e.pos.z, b);
    if (d <= e.radius + reach && d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function updateEnemy(e, dt) {
  const def = e.def;
  if (e.spawnT < 1) {
    e.spawnT = Math.min(1, e.spawnT + dt * 2);
    e.mesh.g.scale.setScalar(easeOutBack(e.spawnT));
  }
  const tx = clamp(toTile(e.pos.x), 0, GRID - 1), tz = clamp(toTile(e.pos.z), 0, GRID - 1);
  const ti = idx(tx, tz);
  e.pathDist = dist[ti];
  if (e.attack && (e.attack.dead || aabbDist(e.pos.x, e.pos.z, e.attack) > e.radius + 0.5)) e.attack = null;
  const f = e.fight;
  if (f && (f.dead || Math.hypot(f.pos.x - e.pos.x, f.pos.z - e.pos.z) > e.radius + f.radius + 0.6)) e.fight = null;

  // allies next to them get fought; buildings they bump into get attacked
  // (except walls, which they prefer to walk around)
  if (!e.attack && !e.fight) {
    e.aggroT -= dt;
    if (e.aggroT <= 0) {
      e.aggroT = 0.25;
      e.fight = nearbyAlly(e);
      if (!e.fight) e.attack = adjacentBuilding(e, tx, tz, false, 0.15);
    }
  }

  let moving = false;
  const px = e.pos.x, pz = e.pos.z;
  if (!e.attack && !e.fight) {
    const ni = nextTile[ti];
    if (ni >= 0) {
      const nx = ni % GRID, nz = (ni / GRID) | 0;
      const nb = S.grid[ni];
      if (nb && aabbDist(e.pos.x, e.pos.z, nb) <= e.radius + 0.1) e.attack = nb;
      if (!e.attack) {
        const dx = nx - HALF - e.pos.x, dz = nz - HALF - e.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = e.speed * terrainSpeed(e.pos) * dt * e.spawnT;
        const moved = tryMove(e, dx / d * step, dz / d * step);
        moving = true;
        faceTo(e, Math.atan2(dx, dz), dt);
        // stuck against something? attack whatever is next to us
        if (moved < step * 0.2) {
          e.stuckT += dt;
          if (e.stuckT > 1.2) { e.attack = adjacentBuilding(e, tx, tz, true, 0.3); e.stuckT = 0; }
        } else e.stuckT = Math.max(0, e.stuckT - dt);
      }
    }
  }

  if (e.fight) {
    const a = e.fight;
    faceTo(e, Math.atan2(a.pos.x - e.pos.x, a.pos.z - e.pos.z), dt);
    e.atkCd -= dt;
    if (e.atkCd <= 0) {
      e.atkCd = def.atkRate;
      e.lungeT = 0.3;
      damageAlly(a, def.dmg * dmgMult());
    }
  } else if (e.attack) {
    const b = e.attack;
    faceTo(e, Math.atan2(clamp(e.pos.x, b.cx - b.size / 2, b.cx + b.size / 2) - e.pos.x,
                         clamp(e.pos.z, b.cz - b.size / 2, b.cz + b.size / 2) - e.pos.z) || 0, dt);
    e.atkCd -= dt;
    if (e.atkCd <= 0) {
      e.atkCd = def.atkRate;
      e.lungeT = 0.3;
      damageBuilding(b, def.dmg * dmgMult());
      if (e.type === 'boss') shake(0.15);
    }
  }

  if (dt > 0) e.vel.set((e.pos.x - px) / dt, 0, (e.pos.z - pz) / dt);
  animateUnit(e, moving, dt);
}

// walk / attack animation shared by enemies and allies
function animateUnit(u, moving, dt) {
  const m = u.mesh, def = u.def;
  if (moving) u.walkT += dt * u.speed * 9;
  const swing = moving ? Math.sin(u.walkT) * 0.7 : 0;
  m.legs[0].rotation.x = swing;
  m.legs[1].rotation.x = -swing;
  m.arms[0].rotation.x = -swing * 0.6;
  let armR = swing * 0.6;
  if (u.lungeT > 0) { u.lungeT -= dt; armR = -Math.sin((u.lungeT / 0.3) * Math.PI) * 2.2; }
  m.arms[1].rotation.x = armR;
  m.inner.position.y = moving ? Math.abs(Math.sin(u.walkT)) * 0.05 * def.scale : 0;
  if (u.hitT > 0) u.hitT -= dt;
  const hs = u.hitT > 0 ? 1.15 : 1;
  if (u.spawnT >= 1) m.g.scale.set(hs, hs, hs);
  // wade into water, step up onto bridges
  const k = terrainAt(u.pos.x, u.pos.z);
  const ty = k === T_WATER ? -0.16 : k === T_BRIDGE ? 0.1 : 0;
  u.pos.y += (ty - u.pos.y) * Math.min(1, dt * 10);
  u.bar.position.set(u.pos.x, 1.15 * def.scale + 0.15 + u.pos.y, u.pos.z);
}

// ============================================================
// ALLIES (guards & archers)
// ============================================================
function nearbyAlly(e) {
  let best = null, bestD = 0.3;
  for (const a of S.allies) {
    if (a.dead || a.spawnT < 0.5) continue;
    const d = Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) - e.radius - a.radius;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

function spawnAlly(b) {
  const type = b.def.spawn, def = ALLIES[type];
  const spots = [];
  for (let dz = -1; dz <= b.size; dz++) for (let dx = -1; dx <= b.size; dx++) {
    const x = b.x0 + dx, z = b.z0 + dz;
    if (inBounds(x, z) && !S.grid[idx(x, z)]) spots.push([x, z]);
  }
  if (!spots.length) return false;
  const [x, z] = spots[(Math.random() * spots.length) | 0];
  const m = makeEnemyMesh(def, type);
  m.g.position.set(x - HALF + rand(-0.2, 0.2), 0, z - HALF + rand(-0.2, 0.2));
  m.g.scale.setScalar(0.001);
  world.add(m.g);
  const a = {
    type, def, hp: def.hp, maxHp: def.hp, mesh: m, pos: m.g.position,
    post: m.g.position.clone(), home: b, target: null, retarget: 0,
    radius: 0.22 * def.scale, speed: def.speed, atkCd: 0.3,
    spawnT: 0, walkT: rand(0, 10), hitT: 0, lungeT: 0, dead: false,
    bar: makeBar(0.5, barMats.hp),
  };
  a.bar.visible = false;
  world.add(a.bar);
  S.allies.push(a);
  b.units.push(a);
  dustRing(a.pos.x, a.pos.z, 0.3);
  return true;
}

function damageAlly(a, dmg) {
  if (a.dead) return;
  a.hp -= dmg;
  a.hitT = 0.1;
  a.bar.visible = true;
  setBar(a.bar, a.hp / a.maxHp);
  if (a.hp <= 0) {
    a.dead = true;
    world.remove(a.mesh.g, a.bar);
    burst(a.pos.x, 0.4, a.pos.z, a.def.body, 10, 3, 0.08, 0.8);
  }
}

function updateAlly(a, dt) {
  const def = a.def;
  if (a.spawnT < 1) {
    a.spawnT = Math.min(1, a.spawnT + dt * 2);
    a.mesh.g.scale.setScalar(easeOutBack(a.spawnT));
  }
  const reach = def.leash + def.range; // how far from its post it will engage
  const t0 = a.target;
  if (t0 && (t0.dead || Math.hypot(t0.pos.x - a.post.x, t0.pos.z - a.post.z) > reach + 1.5)) a.target = null;
  a.retarget -= dt;
  if (a.retarget <= 0 && !a.target) {
    a.retarget = 0.3;
    let bestD = Infinity;
    for (const e of S.enemies) {
      if (e.dead || e.spawnT < 0.5) continue;
      if (Math.hypot(e.pos.x - a.post.x, e.pos.z - a.post.z) > reach) continue;
      const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
      if (d < bestD) { bestD = d; a.target = e; }
    }
  }

  let gx = null, gz = null;
  const t = a.target;
  if (t) {
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
    if (Math.hypot(dx, dz) > def.range + a.radius + t.radius) { gx = t.pos.x; gz = t.pos.z; }
    else {
      faceTo(a, Math.atan2(dx, dz), dt);
      a.atkCd -= dt;
      if (a.atkCd <= 0) {
        a.atkCd = def.atkRate;
        a.lungeT = 0.3;
        if (def.range > 1) fireArrowFrom(a.pos.x, 0.7 * def.scale, a.pos.z, t, def.dmg);
        else damageEnemy(t, def.dmg);
      }
    }
  } else {
    // rest at the post and slowly heal
    if (a.hp < a.maxHp) {
      a.hp = Math.min(a.maxHp, a.hp + 6 * dt);
      setBar(a.bar, a.hp / a.maxHp);
      if (a.hp >= a.maxHp) a.bar.visible = false;
    }
    if (Math.hypot(a.post.x - a.pos.x, a.post.z - a.pos.z) > 0.15) { gx = a.post.x; gz = a.post.z; }
  }
  let moving = false;
  if (gx !== null) {
    const dx = gx - a.pos.x, dz = gz - a.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, a.speed * terrainSpeed(a.pos) * dt * a.spawnT);
    tryMove(a, dx / d * step, dz / d * step);
    faceTo(a, Math.atan2(dx, dz), dt);
    moving = true;
  }
  animateUnit(a, moving, dt);
}

function faceTo(e, angle, dt) {
  const r = e.mesh.g.rotation;
  let d = angle - r.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  r.y += d * Math.min(1, dt * 10);
}

// keep enemies from stacking on one spot
function separate() {
  const buckets = new Map();
  for (const e of S.enemies) {
    const k = idx(clamp(toTile(e.pos.x), 0, GRID - 1), clamp(toTile(e.pos.z), 0, GRID - 1));
    let arr = buckets.get(k);
    if (!arr) buckets.set(k, arr = []);
    arr.push(e);
  }
  for (const e of S.enemies) {
    const tx = toTile(e.pos.x), tz = toTile(e.pos.z);
    let px = 0, pz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const arr = buckets.get(idx(tx + dx, tz + dz));
      if (!arr || !inBounds(tx + dx, tz + dz)) continue;
      for (const o of arr) {
        if (o === e) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
        const min = e.radius + o.radius;
        const d2 = ox * ox + oz * oz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) * 0.35 * (o.def.scale / (e.def.scale + o.def.scale)) * 2;
        px += (d2 ? ox / d : rand(-1, 1)) * push;
        pz += (d2 ? oz / d : rand(-1, 1)) * push;
      }
    }
    if (px || pz) tryMove(e, clamp(px, -0.1, 0.1), clamp(pz, -0.1, 0.1));
  }
}

function updateSpawning(dt) {
  if (S.time >= S.nextBoss) {
    spawnEnemy('boss');
    S.bossCount++;
    S.nextBoss += BOSS_INTERVAL;
  }
  const t = S.time - GRACE_TIME;
  if (t < 0 || S.enemies.length > 450) return;
  const rate = Math.min(4, 0.22 + t * 0.0065); // enemies per second
  S.spawnAcc += rate * dt;
  while (S.spawnAcc >= 1) {
    S.spawnAcc -= 1;
    const r = Math.random();
    const bruteP = clamp((t - 100) / 900, 0, 0.06);
    const soldierP = clamp((t - 30) / 200, 0, 0.4);
    spawnEnemy(r < bruteP ? 'brute' : r < bruteP + soldierP ? 'soldier' : 'grunt');
  }
}

// ============================================================
// EFFECTS
// ============================================================
const particles = [];
const fx = [];
function burst(x, y, z, color, count, speed, size, life, grav = -12, spread = 0.2) {
  count = Math.round(count);
  if (particles.length > 700) count = Math.min(count, 3);
  const mat = M(color);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(BOX(), mat);
    const s = size * rand(0.6, 1.3);
    m.scale.setScalar(s);
    m.position.set(x + rand(-spread, spread), y + rand(-spread, spread) * 0.5, z + rand(-spread, spread));
    m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    world.add(m);
    const a = rand(0, Math.PI * 2), sp = rand(0.3, 1) * speed;
    particles.push({ m, s, vx: Math.cos(a) * sp, vy: rand(0.5, 1.4) * speed * 0.8, vz: Math.sin(a) * sp, life: life * rand(0.7, 1.2), max: life, grav });
  }
}
function dustRing(x, z, r) {
  const mat = M(0xc9b48a);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const m = new THREE.Mesh(BOX(), mat);
    const s = rand(0.12, 0.22);
    m.scale.setScalar(s);
    m.position.set(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r);
    world.add(m);
    particles.push({ m, s, vx: Math.cos(a) * 2.2, vy: rand(0.5, 1.5), vz: Math.sin(a) * 2.2, life: 0.5, max: 0.5, grav: -3 });
  }
}
function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { world.remove(p.m); particles.splice(i, 1); continue; }
    p.vy += p.grav * dt;
    const pos = p.m.position;
    pos.x += p.vx * dt; pos.y += p.vy * dt; pos.z += p.vz * dt;
    if (pos.y < p.s / 2) { pos.y = p.s / 2; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    p.m.rotation.x += dt * 5;
    p.m.scale.setScalar(p.s * Math.min(1, (p.life / p.max) * 2));
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    const u = f.t / f.T;
    if (u >= 1) { world.remove(f.mesh); f.mesh.material.dispose(); fx.splice(i, 1); continue; }
    f.mesh.scale.setScalar(0.2 + easeOutCubic(u) * f.max);
    f.mesh.material.opacity = 0.85 * (1 - u);
  }
  for (let i = beams.length - 1; i >= 0; i--) {
    const bm = beams[i];
    bm.t += dt;
    const u = bm.t / bm.T;
    if (u >= 1) { world.remove(bm.mesh); bm.mesh.material.dispose(); beams.splice(i, 1); continue; }
    const w = bm.w * (1 - u * 0.8);
    bm.mesh.scale.x = bm.mesh.scale.y = w;
    bm.mesh.material.opacity = 0.95 * (1 - u);
  }
}

let shakeAmt = 0;
function shake(a) { shakeAmt = Math.min(1, shakeAmt + a); }

// ============================================================
// HUD
// ============================================================
const $ = (id) => document.getElementById(id);
const goldEl = $('gold'), goldValueEl = $('goldValue');
const floaterLayer = $('floaters');
const floaters = [];
const projV = new THREE.Vector3();

function toScreen(p) {
  projV.copy(p).project(camera);
  return { x: (projV.x * 0.5 + 0.5) * window.innerWidth, y: (-projV.y * 0.5 + 0.5) * window.innerHeight, behind: projV.z > 1 };
}
function floatText(text, pos3, cls) {
  if (floaters.length > 60) return;
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  floaterLayer.appendChild(el);
  floaters.push({ el, pos: pos3.clone(), life: 1.1, max: 1.1, screen: null });
}
function floatScreen(text, x, y, cls) {
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  floaterLayer.appendChild(el);
  floaters.push({ el, pos: null, life: 1.0, max: 1.0, screen: { x, y } });
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    if (f.life <= 0) { f.el.remove(); floaters.splice(i, 1); continue; }
    let x, y;
    if (f.pos) {
      f.pos.y += dt * 0.9;
      const s = toScreen(f.pos);
      x = s.x; y = s.y;
      if (s.behind) { f.el.style.display = 'none'; continue; }
    } else {
      f.screen.y -= dt * 40;
      x = f.screen.x; y = f.screen.y;
    }
    f.el.style.left = x + 'px';
    f.el.style.top = y + 'px';
    f.el.style.opacity = Math.min(1, (f.life / f.max) * 2.5);
  }
}

function flyCoins(pos3, count) {
  const s = toScreen(pos3);
  const r = goldEl.getBoundingClientRect();
  const tx = r.left + 24, ty = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'coin flycoin';
    c.style.left = s.x + rand(-20, 20) + 'px';
    c.style.top = s.y + rand(-20, 20) + 'px';
    document.body.appendChild(c);
    setTimeout(() => {
      c.style.left = tx + 'px';
      c.style.top = ty + 'px';
      c.style.transform = 'scale(0.6)';
    }, 20 + i * 50);
    setTimeout(() => { c.remove(); pulseGold('pulseUp'); }, 650 + i * 50);
  }
}

function pulseGold(cls) {
  goldEl.classList.remove('pulseUp', 'pulseDown', 'shake');
  void goldEl.offsetWidth; // restart the animation
  goldEl.classList.add(cls);
}
function addGold(n) { S.gold += n; }
function spendGold(n) {
  S.gold -= n;
  pulseGold('pulseDown');
  const r = goldEl.getBoundingClientRect();
  floatScreen('-' + n, r.left + r.width / 2, r.bottom + 14, 'spend');
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---- build bar ----
const buttonsEl = $('buttons'), buildBarEl = $('buildBar'), tooltipEl = $('tooltip');
const buttons = {};
let tooltipTimer = 0;
function makeThumbnails() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(128, 128);
  r.setPixelRatio(1);
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffffff, 0x445533, 0.8));
  const l = new THREE.DirectionalLight(0xffffff, 0.7);
  l.position.set(-3, 6, 4);
  s.add(l);
  const c = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  const out = {};
  for (const type of BUILD_ORDER) {
    const m = makeBuildingMesh(type);
    s.add(m);
    const bb = new THREE.Box3().setFromObject(m);
    const center = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3()).length();
    c.position.set(center.x + size * 1.15, center.y + size * 1.0, center.z + size * 1.5);
    c.lookAt(center);
    r.render(s, c);
    out[type] = r.domElement.toDataURL();
    s.remove(m);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
function buildButtons() {
  const thumbs = makeThumbnails();
  BUILD_ORDER.forEach((type, i) => {
    const def = DEFS[type];
    const btn = document.createElement('button');
    btn.className = 'bbtn';
    btn.innerHTML = `<img src="${thumbs[type]}" alt=""><span class="key">${(i + 1) % 10}</span>` +
      `<span class="name">${def.short || def.name}</span><span class="cost">${def.cost}</span>`;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const t = mode.type === type ? null : type;
      selectBuild(t);
      // no hover on touch screens: flash the description instead
      if (touchMode && t) {
        showTooltip(t);
        clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(() => tooltipEl.classList.remove('show'), 2200);
      }
    });
    btn.addEventListener('mouseenter', () => { if (!touchMode) showTooltip(type); });
    btn.addEventListener('mouseleave', () => tooltipEl.classList.remove('show'));
    buttonsEl.appendChild(btn);
    buttons[type] = btn;
  });
}
function showTooltip(type) {
  const d = DEFS[type];
  let st = `HP ${d.hp}`;
  if (d.dps) st += ` · ${d.dps} damage/s · Range ${d.range}`;
  else if (d.range) st += ` · Damage ${d.dmg}${d.splash ? ' (splash)' : ''} · Range ${d.range} · every ${d.reload}s`;
  if (d.income) st += ` · +${d.income} gold / ${d.cd}s`;
  if (d.spawn) st += ` · 1 ${ALLIES[d.spawn].name.toLowerCase()} / ${d.cd}s (max ${d.max})`;
  tooltipEl.innerHTML = `<b>${d.name}</b> &nbsp;<span style="color:#ffd84a">${d.cost} gold</span><br>${d.desc}<br><span class="st">${st}</span>`;
  tooltipEl.classList.add('show');
}

let lastUiGold = -1;
function updateUI() {
  if (S.gold !== lastUiGold) {
    lastUiGold = S.gold;
    goldValueEl.textContent = Math.floor(S.gold);
    for (const type of BUILD_ORDER) buttons[type].classList.toggle('poor', S.gold < DEFS[type].cost);
  }
  const c = S.castle;
  const r = c.dead ? 0 : c.hp / c.maxHp;
  $('castleHpFill').style.width = (r * 100) + '%';
  $('castleHp').classList.toggle('low', r < 0.35);
  $('castleHpText').textContent = `Castle ${Math.max(0, Math.ceil(c.hp))} / ${c.maxHp}`;
  const left = GRACE_TIME - S.time;
  $('stats').textContent = left > 0
    ? `Enemies arrive in ${Math.ceil(left)}s - build farms!`
    : `Time ${fmtTime(S.time)} · Enemies ${S.enemies.length} · Kills ${S.kills} · Next boss ${fmtTime(Math.max(0, S.nextBoss - S.time))}`;
  const boss = S.enemies.find((e) => e.type === 'boss' && !e.dead);
  $('bossHp').classList.toggle('hidden', !boss);
  if (boss) {
    $('bossHpFill').style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100) + '%';
    $('bossHpText').textContent = `BOSS ${Math.max(0, Math.ceil(boss.hp))}`;
  }
}

// ============================================================
// BUILD MODE / GHOST
// ============================================================
const mode = { type: null };
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.5, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.5, depthWrite: false });
const tileOk = new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.35, depthWrite: false });
const tileBad = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.35, depthWrite: false });
const rangeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
let ghost = null, ghostMeshes = [], ghostTile = null, ghostRange = null, ghostValid = false, ghostIsOk = null;
const hover = { x: -1, z: -1, valid: false };

function selectBuild(type) {
  if (S.over) type = null;
  if (ghost) { scene.remove(ghost); ghost = null; }
  mode.type = type;
  for (const t of BUILD_ORDER) buttons[t].classList.toggle('active', t === type);
  buildBarEl.classList.toggle('building', !!type);
  gridHelper.visible = !!type;
  if (!type) { refreshHints(); return; }
  ghost = new THREE.Group();
  const m = makeBuildingMesh(type);
  ghostMeshes = [];
  m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.raycast = noRaycast; ghostMeshes.push(o); } });
  ghost.add(m);
  ghostTile = new THREE.Mesh(PLANE, tileOk);
  ghostTile.rotation.x = -Math.PI / 2;
  ghostTile.position.y = 0.03;
  ghostMeshes.push(ghostTile);
  ghost.add(ghostTile);
  const def = DEFS[type];
  if (def.range) {
    ghostRange = new THREE.Mesh(new THREE.RingGeometry(def.range - 0.07, def.range, 64).rotateX(-Math.PI / 2), rangeMat);
    ghostRange.position.y = 0.04;
    ghost.add(ghostRange);
  }
  ghostIsOk = null;
  ghost.visible = false;
  scene.add(ghost);
  refreshHints();
  if (def.needs) toast(def.needs === 'ore' ? 'Build mines next to gold ore' : 'Build wharfs next to water');
  // touch: start the ghost in the middle of the view if it has no spot yet
  if (touchGhost.x < 0) {
    touchGhost.x = clamp(toTile(cam.target.x), 1, GRID - 2);
    touchGhost.z = clamp(toTile(cam.target.z), 1, GRID - 2);
  }
}

// why a building can't go here: null if it can, a short code for silent failures,
// or a sentence (contains a space) to show the player
function placeError(type, x, z) {
  if (!inBounds(x, z) || x === 0 || z === 0 || x === GRID - 1 || z === GRID - 1) return 'edge';
  if (S.grid[idx(x, z)]) return 'taken';
  const k = S.terrain[idx(x, z)];
  if (k === T_WATER || k === T_BRIDGE) return 'Cannot build on water';
  if (k === T_ORE) return 'Build next to the ore, not on it';
  const def = DEFS[type];
  if (def.needs === 'water' && !nearTerrain(x, z, T_WATER)) return 'Must be next to water';
  if (def.needs === 'ore' && !nearTerrain(x, z, T_ORE)) return 'Must be next to gold ore';
  const wx = x - HALF, wz = z - HALF;
  for (const e of S.enemies) {
    if (Math.abs(e.pos.x - wx) < 0.5 + e.radius && Math.abs(e.pos.z - wz) < 0.5 + e.radius) return 'blocked';
  }
  return S.gold >= def.cost ? null : 'gold';
}
const canPlace = (type, x, z) => !placeError(type, x, z);

// highlight every tile a mine / wharf could go on
const hintGroup = new THREE.Group();
scene.add(hintGroup);
const hintMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.3, depthWrite: false });
function refreshHints() {
  while (hintGroup.children.length) hintGroup.remove(hintGroup.children[0]);
  const def = mode.type && DEFS[mode.type];
  if (!def || !def.needs) return;
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const err = placeError(mode.type, x, z);
    if (err && err !== 'gold' && err !== 'blocked') continue;
    const m = new THREE.Mesh(PLANE, hintMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(0.86, 0.86, 1);
    m.position.set(x - HALF, 0.025, z - HALF);
    m.raycast = noRaycast;
    hintGroup.add(m);
  }
}

// on touch screens the ghost stays on a chosen tile (tap / drag it) and a check mark confirms the build
const touchGhost = { x: -1, z: -1 };
const confirmBtn = $('confirmBtn');
function ghostSpot() {
  if (touchMode) return touchGhost.x >= 0 ? touchGhost : null;
  return hover.x >= 0 && mouse.inside ? hover : null;
}

function updateGhost() {
  const spot = ghost && ghostSpot();
  if (!spot) {
    if (ghost) ghost.visible = false;
    confirmBtn.style.display = 'none';
    return;
  }
  ghost.visible = true;
  ghost.position.set(spot.x - HALF, 0, spot.z - HALF);
  ghostValid = canPlace(mode.type, spot.x, spot.z);
  if (mode.type === 'wharf') {
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (inBounds(spot.x + dx, spot.z + dz) && S.terrain[idx(spot.x + dx, spot.z + dz)] === T_WATER) {
        ghost.children[0].rotation.y = Math.atan2(dx, dz);
        break;
      }
    }
  }
  if (touchMode) {
    const s = toScreen(tmpV.set(spot.x - HALF, (ghost.children[0].userData.top || 1) + 0.4, spot.z - HALF));
    confirmBtn.style.display = 'block';
    confirmBtn.style.left = clamp(s.x, 34, window.innerWidth - 34) + 'px';
    confirmBtn.style.top = clamp(s.y, 70, window.innerHeight - 150) + 'px';
    confirmBtn.classList.toggle('bad', !ghostValid);
  } else confirmBtn.style.display = 'none';
  if (ghostIsOk !== ghostValid) {
    ghostIsOk = ghostValid;
    for (const m of ghostMeshes) m.material = m === ghostTile ? (ghostValid ? tileOk : tileBad) : (ghostValid ? ghostOk : ghostBad);
  }
  const a = 0.4 + Math.sin(performance.now() / 160) * 0.1;
  ghostOk.opacity = ghostBad.opacity = a;
  ghost.children[0].position.y = 0.05 + Math.sin(performance.now() / 250) * 0.04;
}

function tryBuild(type, x, z) {
  const def = DEFS[type];
  const err = placeError(type, x, z);
  if (err) {
    const msg = err === 'gold' ? 'Not enough gold' : err.includes(' ') ? err : null;
    if (msg) {
      if (err === 'gold') pulseGold('shake');
      const r = touchMode ? confirmBtn.getBoundingClientRect() : null;
      floatScreen(msg, r ? r.left + r.width / 2 : mouse.cx, r ? r.top - 20 : mouse.cy - 20, 'bad');
    }
    return;
  }
  spendGold(def.cost);
  placeBuilding(type, x, z);
  refreshHints();
}

// ============================================================
// CAMERA & INPUT
// ============================================================
const cam = { target: new THREE.Vector3(0, 0, 1), yaw: 0, pitch: 0.95, dist: 26 };
function resetCamera() { cam.target.set(0, 0, 1); cam.yaw = 0; cam.pitch = 0.95; cam.dist = 26; }
function updateCamera(dt) {
  const k = cam.dist * 0.9 * dt;
  const fx_ = -Math.sin(cam.yaw), fz_ = -Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  if (keys.KeyW || keys.ArrowUp) { cam.target.x += fx_ * k; cam.target.z += fz_ * k; }
  if (keys.KeyS || keys.ArrowDown) { cam.target.x -= fx_ * k; cam.target.z -= fz_ * k; }
  if (keys.KeyD || keys.ArrowRight) { cam.target.x += rx * k; cam.target.z += rz * k; }
  if (keys.KeyA || keys.ArrowLeft) { cam.target.x -= rx * k; cam.target.z -= rz * k; }
  if (keys.KeyQ) cam.yaw -= dt * 1.6;
  if (keys.KeyE) cam.yaw += dt * 1.6;
  cam.target.x = clamp(cam.target.x, -HALF, HALF);
  cam.target.z = clamp(cam.target.z, -HALF, HALF);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(
    cam.target.x + cam.dist * cp * Math.sin(cam.yaw),
    cam.dist * sp,
    cam.target.z + cam.dist * cp * Math.cos(cam.yaw));
  camera.lookAt(cam.target);
  if (shakeAmt > 0.001) {
    camera.position.x += rand(-1, 1) * shakeAmt * 0.4;
    camera.position.y += rand(-1, 1) * shakeAmt * 0.4;
    shakeAmt *= Math.pow(0.02, dt);
  }
}

const keys = {};
const mouse = { ndc: new THREE.Vector2(), cx: 0, cy: 0, down: -1, sx: 0, sy: 0, lx: 0, ly: 0, dragging: false, inside: false };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
const canvas = renderer.domElement;

function updateHover() {
  raycaster.setFromCamera(mouse.ndc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
    const x = toTile(hitPoint.x), z = toTile(hitPoint.z);
    if (inBounds(x, z)) { hover.x = x; hover.z = z; return; }
  }
  hover.x = hover.z = -1;
}

function pickBuilding() {
  raycaster.setFromCamera(mouse.ndc, camera);
  const targets = [];
  for (const b of S.buildings) { targets.push(b.mesh); if (b.coin) targets.push(b.coin); }
  const hits = raycaster.intersectObjects(targets, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.building) o = o.parent;
    if (o) return o.userData.building;
  }
  if (hover.x >= 0) return S.grid[idx(hover.x, hover.z)];
  return null;
}

// a ready producer under the cursor (forgiving: coin, mesh, or the tile)
function readyProducerUnderCursor() {
  const b = pickBuilding();
  if (b && b.ready) return b;
  if (hover.x >= 0) {
    const t = S.grid[idx(hover.x, hover.z)];
    if (t && t.ready) return t;
  }
  return null;
}

function handleClick() {
  if (S.over) return;
  updateHover();
  const p = readyProducerUnderCursor();
  if (p) { collect(p); return; }
  if (mode.type && hover.x >= 0) tryBuild(mode.type, hover.x, hover.z);
}

// touch tap: collect a ready farm/mine, otherwise move the build ghost there
function handleTap() {
  if (S.over) return;
  updateHover();
  const p = readyProducerUnderCursor();
  if (p) { collect(p); return; }
  if (mode.type && hover.x >= 0) { touchGhost.x = hover.x; touchGhost.z = hover.z; }
}

function setMousePos(ev) {
  mouse.cx = ev.clientX; mouse.cy = ev.clientY;
  mouse.ndc.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  mouse.inside = true;
}

function panBy(dx, dy) {
  const k = cam.dist * 0.0017 * (1000 / Math.max(500, Math.min(window.innerWidth, window.innerHeight * 1.4)));
  const fx_ = -Math.sin(cam.yaw), fz_ = -Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  cam.target.x += (-rx * dx + fx_ * dy) * k;
  cam.target.z += (-rz * dx + fz_ * dy) * k;
}

// true when the latest input came from a finger/pen; switches the build flow to "place, then confirm"
let touchMode = false;
window.addEventListener('pointerdown', (ev) => {
  const t = ev.pointerType !== 'mouse';
  if (t !== touchMode) { touchMode = t; document.body.classList.toggle('touch', t); }
}, true);

// ---- touch gestures: 1 finger pans (or drags the ghost), 2 fingers pinch-zoom + rotate ----
const touches = new Map();
let gesture = null;
function twoFingers() {
  const [a, b] = [...touches.values()];
  return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}
function touchDown(ev) {
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size === 1) {
    setMousePos(ev);
    updateHover();
    const onGhost = !!mode.type && touchGhost.x >= 0 && hover.x >= 0 &&
      Math.abs(hover.x - touchGhost.x) <= 1 && Math.abs(hover.z - touchGhost.z) <= 1;
    gesture = { type: 'pending', sx: ev.clientX, sy: ev.clientY, lx: ev.clientX, ly: ev.clientY, onGhost };
  } else if (touches.size === 2) {
    gesture = { type: 'pinch', ...twoFingers() };
  }
}
function touchMove(ev) {
  const t = touches.get(ev.pointerId);
  if (!t || !gesture) return;
  t.x = ev.clientX; t.y = ev.clientY;
  if (gesture.type === 'pinch' && touches.size >= 2) {
    const g = twoFingers();
    cam.dist = clamp(cam.dist * (gesture.d / Math.max(10, g.d)), 10, 60);
    let da = g.ang - gesture.ang;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    cam.yaw -= da;
    panBy(g.mx - gesture.mx, g.my - gesture.my);
    Object.assign(gesture, g);
    return;
  }
  if (touches.size !== 1) return;
  if (gesture.type === 'pending' && Math.hypot(ev.clientX - gesture.sx, ev.clientY - gesture.sy) > 10) {
    gesture.type = gesture.onGhost ? 'ghost' : 'pan';
  }
  if (gesture.type === 'pan') panBy(ev.clientX - gesture.lx, ev.clientY - gesture.ly);
  else if (gesture.type === 'ghost') {
    setMousePos(ev);
    updateHover();
    if (hover.x >= 0) { touchGhost.x = hover.x; touchGhost.z = hover.z; }
  }
  gesture.lx = ev.clientX; gesture.ly = ev.clientY;
}
function touchUp(ev) {
  if (!touches.has(ev.pointerId)) return;
  touches.delete(ev.pointerId);
  if (gesture && gesture.type === 'pending' && ev.type === 'pointerup') { setMousePos(ev); handleTap(); }
  // after a pinch, ignore the remaining finger until everything is lifted
  gesture = touches.size ? { type: 'none' } : null;
  mouse.inside = false;
}

canvas.addEventListener('pointerdown', (ev) => {
  try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* pointer already gone */ }
  if (ev.pointerType !== 'mouse') { touchDown(ev); return; }
  setMousePos(ev);
  mouse.down = ev.button;
  mouse.sx = mouse.lx = ev.clientX;
  mouse.sy = mouse.ly = ev.clientY;
  mouse.dragging = false;
});
canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse') { touchMove(ev); return; }
  setMousePos(ev);
  const dx = ev.clientX - mouse.lx, dy = ev.clientY - mouse.ly;
  mouse.lx = ev.clientX; mouse.ly = ev.clientY;
  if (mouse.down === 0) {
    if (!mouse.dragging && Math.hypot(ev.clientX - mouse.sx, ev.clientY - mouse.sy) > 6) mouse.dragging = true;
    if (mouse.dragging) panBy(dx, dy);
  } else if (mouse.down === 2 || mouse.down === 1) {
    cam.yaw -= dx * 0.006;
    cam.pitch = clamp(cam.pitch + dy * 0.004, 0.35, 1.45);
  }
});
canvas.addEventListener('pointerup', (ev) => {
  if (ev.pointerType !== 'mouse') { touchUp(ev); return; }
  setMousePos(ev);
  if (ev.button === 0 && mouse.down === 0 && !mouse.dragging) handleClick();
  mouse.down = -1;
  mouse.dragging = false;
});
canvas.addEventListener('pointercancel', (ev) => {
  if (ev.pointerType !== 'mouse') touchUp(ev);
  mouse.down = -1;
  mouse.dragging = false;
});
canvas.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') mouse.inside = false; });
// stop iOS Safari's page pinch-zoom from fighting the game
document.addEventListener('gesturestart', (ev) => ev.preventDefault());
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  cam.dist = clamp(cam.dist * (ev.deltaY > 0 ? 1.1 : 0.9), 10, 60);
}, { passive: false });

window.addEventListener('keydown', (ev) => {
  if (quitOpen) {
    if (ev.code === 'Escape') setQuitOpen(false);
    return;
  }
  keys[ev.code] = true;
  if (ev.code === 'Escape') selectBuild(null);
  let n = parseInt(ev.key, 10);
  if (n === 0) n = 10;
  if (n >= 1 && n <= BUILD_ORDER.length) {
    const t = BUILD_ORDER[n - 1];
    selectBuild(mode.type === t ? null : t);
  }
});
window.addEventListener('keyup', (ev) => { keys[ev.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

$('cancelBtn').addEventListener('click', () => selectBuild(null));
confirmBtn.addEventListener('click', () => {
  if (mode.type && touchGhost.x >= 0 && !S.over) tryBuild(mode.type, touchGhost.x, touchGhost.z);
});
// "Hub" button: confirm, then leave for the hub page one folder up. The game is paused while asking.
let quitOpen = false;
function setQuitOpen(open) {
  quitOpen = open;
  $('quitModal').classList.toggle('hidden', !open);
  if (open) { selectBuild(null); for (const k in keys) keys[k] = false; }
}
$('hubBtn').addEventListener('click', () => setQuitOpen(true));
$('quitNo').addEventListener('click', () => setQuitOpen(false));
$('quitYes').addEventListener('click', () => { location.href = '../'; });
$('quitModal').addEventListener('click', (ev) => { if (ev.target.id === 'quitModal') setQuitOpen(false); });

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

// ============================================================
// GAME FLOW
// ============================================================
function gameOver() {
  if (S.over) return;
  S.over = true;
  S.overT = RESTART_DELAY;
  selectBuild(null);
  explode(new THREE.Vector3(0, 0, 0), 3, 0);
  burst(0, 1.5, 0, 0xc0392b, 30, 6, 0.2, 1.5);
  shake(1);
  $('goStats').textContent = `You survived ${fmtTime(S.time)} and defeated ${S.kills} enemies.`;
  $('gameOver').classList.remove('hidden');
}

function resetGame() {
  for (const f of fx) f.mesh.material.dispose();
  fx.length = 0;
  for (const bm of beams) bm.mesh.material.dispose();
  beams.length = 0;
  particles.length = 0;
  for (const f of floaters) f.el.remove();
  floaters.length = 0;
  while (world.children.length) world.remove(world.children[0]);
  S = newState();
  touchGhost.x = touchGhost.z = -1;
  genTerrain();
  S.castle = placeBuilding('castle', HALF - 1, HALF - 1);
  // starter economy so you never get stuck without gold
  placeBuilding('farm', HALF - 3, HALF - 2);
  placeBuilding('farm', HALF + 3, HALF - 2);
  placeBuilding('mine', HALF - 3, HALF + 2);
  placeBuilding('mine', HALF + 3, HALF + 2);
  computeFlow();
  selectBuild(null);
  lastUiGold = -1;
  shakeAmt = 0;
  resetCamera();
  $('gameOver').classList.add('hidden');
  toast('Defend the castle!');
}

// Interstitial ad between games (the hub's ../ads.js). loloAd calls back right away when ads
// are off, blocked or offline, so the game also works without that file.
function showAdThenReset() {
  if (typeof window.loloAd !== 'function') return resetGame();
  S.adPending = true;
  $('goCountdown').textContent = '';
  window.loloAd('game-over', resetGame);
}

function update(dt) {
  if (S.flowDirty) computeFlow();
  updateSpawning(dt);
  updateBuildings(dt);
  if (S.flowDirty) computeFlow();
  for (const e of S.enemies) if (!e.dead) updateEnemy(e, dt);
  for (const a of S.allies) if (!a.dead) updateAlly(a, dt);
  separate();
  updateProjectiles(dt);
  S.enemies = S.enemies.filter((e) => !e.dead);
  S.allies = S.allies.filter((a) => !a.dead);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (quitOpen) {
    // paused while the quit-to-hub modal is open
  } else if (!S.over) {
    S.time += dt;
    update(dt);
  } else if (!S.adPending) {
    S.overT -= dt;
    $('goCountdown').textContent = `Restarting in ${Math.max(0, Math.ceil(S.overT))}...`;
    if (S.overT <= 0) showAdThenReset();
  }
  readyRingMat.opacity = 0.35 + Math.sin(now / 150) * 0.25;
  waterMat.emissive.setRGB(0.04, 0.15 + Math.sin(now / 700) * 0.03, 0.3 + Math.sin(now / 700) * 0.05);
  hintMat.opacity = 0.25 + Math.sin(now / 200) * 0.1;
  updateFx(dt);
  updateCamera(dt);
  updateHover();
  updateGhost();
  // hand cursor over a ready farm/mine
  if (!touchMode) canvas.style.cursor = mouse.dragging ? 'grabbing' : (!S.over && mouse.inside && readyProducerUnderCursor()) ? 'pointer' : 'default';
  for (const o of world.children) if (o.visible && o.userData.fill) o.quaternion.copy(camera.quaternion);
  updateFloaters(dt);
  updateUI();
  renderer.render(scene, camera);
}

buildButtons();
resetGame();
requestAnimationFrame(frame);

// small debug handle for the console
window.lolo = { get state() { return S; }, spawnEnemy, addGold: (n) => addGold(n), dist, nextTile, computeFlow, placeBuilding, touchGhost, hover,
  // advance the simulation without rAF (handy in hidden tabs)
  step(seconds) { for (let t = 0; t < seconds && !S.over; t += 1 / 30) { S.time += 1 / 30; update(1 / 30); updateFx(1 / 30); } renderer.render(scene, camera); } };
})();
