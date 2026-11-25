import * as THREE from 'three';
import { CAR, type Track } from '@raceleague/shared';

/** Palette canyon. Tout est généré en code : aucun fichier de modèle. */
export const COLORS = {
  sky: 0xf2b27a,
  fog: 0xe9a571,
  asphalt: 0x3b3433,
  line: 0xf4ede4,
  kerbRed: 0xd6402e,
  kerbWhite: 0xf4ede4,
  rockA: 0xb4562f,
  rockB: 0x8f3f22,
  rockC: 0xcf7a45,
  carBody: 0x1f6fd1,
  carDark: 0x16181d,
  finish: 0xffffff,
};

/** Générateur pseudo-aléatoire à graine : le décor est identique à chaque chargement. */
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((seed >>> 0) % 100000) / 100000;
  };
}

const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

export function buildTrack(scene: THREE.Scene, track: Track) {
  for (const b of track.blocks) {
    const geo = new THREE.BoxGeometry(b.half[0] * 2, b.half[1] * 2, b.half[2] * 2);
    let mat: THREE.Material;
    if (b.kind === 'road') mat = flat(COLORS.asphalt);
    else mat = kerbMaterial(b.half[0] > b.half[2] ? b.half[0] * 2 : b.half[2] * 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...b.center);
    m.receiveShadow = true;
    m.castShadow = b.kind === 'wall';
    scene.add(m);
    if (b.kind === 'road') {
      // Bloc de roche sous la piste : la piste est posée sur un plateau au-dessus du vide
      const base = new THREE.Mesh(new THREE.BoxGeometry(b.half[0] * 2 + 2, 14, b.half[2] * 2 + 2), flat(COLORS.rockB));
      base.position.set(b.center[0], b.center[1] - b.half[1] - 7, b.center[2]);
      scene.add(base);
    }
  }
  // Ligne d'arrivée en damier
  const f = track.finish;
  const tex = checkerTexture();
  tex.repeat.set(f.half[0], 1);
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(f.half[0] * 2, 2), new THREE.MeshBasicMaterial({ map: tex }));
  finish.rotation.x = -Math.PI / 2;
  finish.position.set(f.center[0], 0.01, f.center[2]);
  scene.add(finish);
  // Ligne de départ
  const start = new THREE.Mesh(new THREE.PlaneGeometry(1, 20), new THREE.MeshBasicMaterial({ color: COLORS.line }));
  start.rotation.x = -Math.PI / 2;
  start.position.set(track.start[0] - 2, 0.01, track.start[2]);
  scene.add(start);
}

function kerbMaterial(length: number) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d6402e'; g.fillRect(0, 0, 32, 8);
  g.fillStyle = '#f4ede4'; g.fillRect(32, 0, 32, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(length / 4, 1);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: tex });
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
    g.fillRect(x * 4, y * 4, 4, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Pitons rocheux low-poly autour du circuit. */
export function buildCanyon(scene: THREE.Scene) {
  const rand = rng(1234);
  const mats = [flat(COLORS.rockA), flat(COLORS.rockB), flat(COLORS.rockC)];
  for (let i = 0; i < 90; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 140 + rand() * 260;
    const x = 70 + Math.cos(angle) * dist;
    const z = 60 + Math.sin(angle) * dist;
    const r = 8 + rand() * 22;
    const h = 20 + rand() * 90;
    const geo = new THREE.CylinderGeometry(r * (0.4 + rand() * 0.4), r, h, 5 + Math.floor(rand() * 3), 2);
    const pos = geo.attributes.position!;
    for (let v = 0; v < pos.count; v++) {
      pos.setX(v, pos.getX(v) * (0.85 + rand() * 0.3));
      pos.setZ(v, pos.getZ(v) * (0.85 + rand() * 0.3));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mats[i % 3]);
    m.position.set(x, h / 2 - 60 + rand() * 30, z);
    m.rotation.y = rand() * Math.PI;
    scene.add(m);
  }
}

export function buildCar() {
  const car = new THREE.Group();
  const [hx, hy, hz] = CAR.halfExtents;
  const body = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 1.4, hz * 2), flat(COLORS.carBody));
  body.position.y = -0.05;
  body.castShadow = true;
  car.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.7, hy * 0.8, hz * 1.2), flat(COLORS.carBody));
  nose.position.set(hx + 0.3, -0.12, 0);
  car.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(hx * 0.8, hy * 1.2, hz * 1.4), flat(COLORS.carDark));
  cabin.position.set(-0.15, hy * 0.9, 0);
  cabin.castShadow = true;
  car.add(cabin);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, hz * 2.2), flat(COLORS.carDark));
  wing.position.set(-hx + 0.1, hy + 0.25, 0);
  car.add(wing);

  const wheels: THREE.Group[] = [];
  const wheelGeo = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.32, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = flat(COLORS.carDark);
  for (const [x, z] of [[CAR.wheelX, -CAR.wheelZ], [CAR.wheelX, CAR.wheelZ], [-CAR.wheelX, -CAR.wheelZ], [-CAR.wheelX, CAR.wheelZ]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, CAR.wheelY, z);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.castShadow = true;
    pivot.add(w);
    car.add(pivot);
    wheels.push(pivot);
  }
  return { car, wheels };
}
