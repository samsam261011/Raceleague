import * as THREE from 'three';
import { CAR, KERB, ROAD_HALF, type CompiledTrack, type Gate, type Mat } from '@raceleague/shared';

/** Palette canyon. Tout est généré en code : aucun fichier de modèle. */
export const COLORS = {
  sky: 0xf2b27a,
  fog: 0xe9a571,
  asphalt: 0x8a8682,
  line: 0xf4ede4,
  kerbRed: 0xd6402e,
  kerbWhite: 0xf4ede4,
  ride: 0xc98d5e,
  rideStripe: 0xe6c39a,
  rockA: 0xb4562f,
  rockB: 0x8f3f22,
  rockC: 0xcf7a45,
  carBody: 0x1f6fd1,
  carAccent: 0xff7a2f,
  carDark: 0x16181d,
  gate: 0x2a2220,
};

/** Générateur pseudo-aléatoire à graine : le décor est identique à chaque chargement. */
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((seed >>> 0) % 100000) / 100000;
  };
}

const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Couleur d'un quadrilatère : les vibreurs et rambardes alternent rouge et blanc. */
function quadColor(mat: Mat, stripe: number, out: THREE.Color): THREE.Color {
  switch (mat) {
    case 'road': return out.setHex(COLORS.asphalt);
    case 'line': return out.setHex(COLORS.line);
    case 'kerb': case 'barrier': return out.setHex(stripe % 2 ? COLORS.kerbWhite : COLORS.kerbRed);
    case 'ride': return out.setHex(stripe % 4 === 0 ? COLORS.rideStripe : COLORS.ride);
    case 'rock': return out.setHex(COLORS.rockB);
  }
}

export interface TrackView {
  group: THREE.Group;
  /** Arches des checkpoints et de l'arrivée, dans l'ordre (pour les allumer au passage). */
  arches: THREE.Group[];
}

export function buildTrack(c: CompiledTrack): TrackView {
  const group = new THREE.Group();
  const pos: number[] = [];
  const col: number[] = [];
  const color = new THREE.Color();
  for (const strip of c.render) {
    for (let q = 0, s = 0; q < strip.quads.length; q += 12, s++) {
      const v = strip.quads;
      // Deux triangles par quadrilatère : 0-1-2 et 0-2-3
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(v[q + k * 3]!, v[q + k * 3 + 1]!, v[q + k * 3 + 2]!);
      quadColor(strip.mat, strip.stripe[s]!, color); // setHex convertit déjà en couleurs linéaires
      for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
  mesh.receiveShadow = true;
  group.add(mesh);

  // Ligne de départ
  const s = c.start;
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(1.2, (ROAD_HALF + KERB) * 2), new THREE.MeshBasicMaterial({ color: COLORS.line }));
  startLine.rotation.set(-Math.PI / 2, 0, (s.r * Math.PI) / 2);
  startLine.position.set(s.p[0], s.p[1] - 0.79, s.p[2]);
  group.add(startLine);

  const arches = c.gates.map((g, i) => {
    const a = buildArch(g, i === c.gates.length - 1);
    group.add(a);
    return a;
  });
  return { group, arches };
}

/** Arche au-dessus d'une porte : poteaux et bandeau (damier pour l'arrivée). */
function buildArch(g: Gate, finish: boolean): THREE.Group {
  const arch = new THREE.Group();
  const across = ROAD_HALF + KERB + 1.2, height = 7;
  const post = new THREE.BoxGeometry(0.8, height, 0.8);
  const mat = flat(COLORS.gate);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(post, mat);
    p.position.set(0, height / 2, side * across);
    p.castShadow = true;
    arch.add(p);
  }
  const bannerMat = finish
    ? new THREE.MeshLambertMaterial({ map: checkerTexture() })
    : new THREE.MeshLambertMaterial({ color: COLORS.carAccent });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, across * 2 + 0.8), bannerMat);
  banner.position.y = height;
  banner.name = 'banner';
  arch.add(banner);
  arch.position.set(g.center[0], g.center[1] - 2, g.center[2]);
  arch.rotation.y = (g.r * Math.PI) / 2;
  if (finish) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2.5, (ROAD_HALF + KERB) * 2), new THREE.MeshBasicMaterial({ map: checkerTexture(10) }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = Math.PI / 2;
    line.position.y = 0.02;
    arch.add(line);
  }
  return arch;
}

function checkerTexture(repeat = 8) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
    g.fillRect(x * 4, y * 4, 4, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, 1);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Pitons rocheux low-poly autour du circuit. */
export function buildCanyon(c: CompiledTrack): THREE.Group {
  const group = new THREE.Group();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of c.centerline) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const radius = Math.max(maxX - minX, maxZ - minZ) / 2 + 90;
  const rand = rng(1234);
  const mats = [flat(COLORS.rockA), flat(COLORS.rockB), flat(COLORS.rockC)];
  for (let i = 0; i < 120; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = radius + rand() * 400;
    const r = 12 + rand() * 34;
    const h = 30 + rand() * 130;
    const geo = new THREE.CylinderGeometry(r * (0.4 + rand() * 0.4), r, h, 5 + Math.floor(rand() * 3), 2);
    const pos = geo.attributes.position!;
    for (let v = 0; v < pos.count; v++) {
      pos.setX(v, pos.getX(v) * (0.85 + rand() * 0.3));
      pos.setZ(v, pos.getZ(v) * (0.85 + rand() * 0.3));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mats[i % 3]);
    m.position.set(cx + Math.cos(angle) * dist, h / 2 - 60 + rand() * 30, cz + Math.sin(angle) * dist);
    m.rotation.y = rand() * Math.PI;
    group.add(m);
  }
  // Fond du canyon, loin en dessous
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius + 600, 24), flat(COLORS.rockB));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, -70, cz);
  group.add(floor);
  return group;
}

/** Voiture monoplace low-poly, originale : nez en pointe, pontons, ailerons. */
export function buildCar() {
  const car = new THREE.Group();
  const body = flat(COLORS.carBody);
  const accent = flat(COLORS.carAccent);
  const dark = flat(COLORS.carDark);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    car.add(m);
    return m;
  };

  // Coque centrale et nez en coin
  add(new THREE.BoxGeometry(1.6, 0.34, 0.62), body, -0.05, -0.06, 0);
  const noseGeo = new THREE.CylinderGeometry(0.06, 0.3, 1.0, 4, 1);
  noseGeo.rotateZ(-Math.PI / 2);
  noseGeo.rotateX(Math.PI / 4);
  noseGeo.scale(1, 0.6, 1);
  add(noseGeo, body, 1.2, -0.1, 0);
  // Pontons latéraux
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.95, 0.26, 0.26), body, -0.2, -0.1, side * 0.42);
  // Cockpit et arceau
  add(new THREE.BoxGeometry(0.55, 0.2, 0.42), dark, 0.1, 0.18, 0);
  add(new THREE.BoxGeometry(0.18, 0.32, 0.18), accent, -0.3, 0.26, 0);
  // Aileron avant et arrière
  add(new THREE.BoxGeometry(0.32, 0.05, 1.5), accent, 1.55, -0.28, 0);
  add(new THREE.BoxGeometry(0.34, 0.06, 1.3), accent, -1.05, 0.42, 0);
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.34, 0.4, 0.04), dark, -1.05, 0.24, side * 0.63);
  // Bande de couleur sur la coque
  add(new THREE.BoxGeometry(1.0, 0.02, 0.2), accent, 0.4, 0.12, 0);

  const wheels: THREE.Group[] = [];
  const wheelGeo = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.34, 10);
  wheelGeo.rotateX(Math.PI / 2);
  for (const [x, z] of [[CAR.wheelX, -CAR.wheelZ], [CAR.wheelX, CAR.wheelZ], [-CAR.wheelX, -CAR.wheelZ], [-CAR.wheelX, CAR.wheelZ]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, CAR.wheelY, z);
    const w = new THREE.Mesh(wheelGeo, dark);
    w.castShadow = true;
    pivot.add(w);
    car.add(pivot);
    wheels.push(pivot);
  }
  return { car, wheels };
}
