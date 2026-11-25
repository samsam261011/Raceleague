import * as THREE from 'three';
import {
  CAR, DT, formatTime, initPhysics, ReplayRecorder, Simulation, TEST_TRACK, ticksToMs, trackHash,
  type Keys, type Pose, type Replay,
} from '@raceleague/shared';
import { Input } from './input.ts';
import { buildCanyon, buildCar, buildTrack, COLORS } from './world.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const BEST_KEY = `raceleague.best.${TEST_TRACK.id}.${trackHash(TEST_TRACK)}`;

// --- Rendu -----------------------------------------------------------------
const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.fog, 120, 480);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
scene.add(new THREE.HemisphereLight(0xfff1e0, 0x7a3a20, 1.6));
const sun = new THREE.DirectionalLight(0xffe2c0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun, sun.target);

buildTrack(scene, TEST_TRACK);
buildCanyon(scene);
const { car, wheels } = buildCar();
scene.add(car);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 85 : 70;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// --- État de la partie -------------------------------------------------------
let sim: Simulation;
let recorder: ReplayRecorder | null = null;
/** Replay en cours de visionnage, sinon null (on conduit). */
let watching: { replay: Replay; event: number; keys: Keys } | null = null;
let lastReplay: Replay | null = null;
let prev: Pose, curr: Pose;
let accumulator = 0;
let lastTime = performance.now();
let finished = false;

function reset(watch: Replay | null = null) {
  sim?.dispose();
  sim = new Simulation(TEST_TRACK);
  recorder = watch ? null : new ReplayRecorder(TEST_TRACK);
  watching = watch ? { replay: watch, event: 0, keys: 0 } : null;
  prev = curr = sim.chassisPose();
  accumulator = 0;
  lastTime = performance.now();
  finished = false;
  $('finish').hidden = true;
  $('mode').hidden = !watch;
  snapCamera = true;
}

function onFinish() {
  finished = true;
  if (recorder) lastReplay = recorder.finish();
  const ms = sim.finishTick !== null ? ticksToMs(sim.finishTick) : null;
  $('finish-time').textContent = ms === null ? (sim.fell ? 'Chute' : 'Temps écoulé') : formatTime(ms);
  const bestEl = $('finish-best');
  bestEl.className = '';
  bestEl.textContent = '';
  if (ms !== null && !watching) {
    let best: number | null = null;
    try { best = Number(localStorage.getItem(BEST_KEY)) || null; } catch { /* stockage indisponible */ }
    if (best === null || ms < best) {
      bestEl.textContent = best === null ? 'Premier temps !' : `Nouveau record (−${formatTime(best - ms)})`;
      bestEl.className = 'record';
      try { localStorage.setItem(BEST_KEY, String(ms)); } catch { /* ignore */ }
    } else {
      bestEl.textContent = `Record : ${formatTime(best)} (+${formatTime(ms - best)})`;
    }
  }
  $('btn-watch').hidden = !lastReplay;
  $('btn-download').hidden = !lastReplay;
  $('finish').hidden = false;
}

function stepOnce() {
  let keys: Keys;
  if (watching) {
    const ev = watching.replay.events;
    while (watching.event < ev.length && ev[watching.event]![0] <= sim.tick) watching.keys = ev[watching.event++]![1];
    keys = watching.keys;
  } else {
    keys = input.read();
    recorder!.record(sim.tick, keys);
  }
  prev = curr;
  sim.step(keys);
  curr = sim.chassisPose();
  if (sim.done || (watching && sim.tick >= watching.replay.ticks)) onFinish();
}

const input = new Input(() => reset(), () => { if (finished) reset(); });
$('restart').addEventListener('click', () => reset());
$('btn-again').addEventListener('click', () => reset());
$('btn-watch').addEventListener('click', () => lastReplay && reset(lastReplay));
$('btn-download').addEventListener('click', () => {
  if (!lastReplay) return;
  const blob = new Blob([JSON.stringify(lastReplay)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `raceleague-${TEST_TRACK.id}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- Boucle ----------------------------------------------------------------
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const forward = new THREE.Vector3();
let snapCamera = true;

function frame(now: number) {
  requestAnimationFrame(frame);
  let elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (elapsed > 0.25) elapsed = 0.25; // onglet en arrière-plan : on ne rattrape pas
  if (!finished) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= DT && steps < 8 && !finished) {
      stepOnce();
      accumulator -= DT;
      steps++;
    }
  }
  // Interpolation entre les deux derniers pas pour un affichage fluide à 120 Hz comme à 30 Hz
  const alpha = finished ? 1 : accumulator / DT;
  pos.fromArray(prev.p).lerp(new THREE.Vector3().fromArray(curr.p), alpha);
  qa.fromArray(prev.q); qb.fromArray(curr.q);
  quat.slerpQuaternions(qa, qb, alpha);
  car.position.copy(pos);
  car.quaternion.copy(quat);
  for (let i = 0; i < 4; i++) {
    const w = sim.wheelState(i);
    const pivot = wheels[i]!;
    pivot.position.y = CAR.wheelY - w.suspension;
    pivot.rotation.set(0, w.steering, 0);
    pivot.children[0]!.rotation.z = -w.rotation;
  }

  // Caméra de poursuite
  forward.set(1, 0, 0).applyQuaternion(quat);
  forward.y = 0;
  forward.normalize();
  const target = camPos.copy(pos).addScaledVector(forward, -7.5).add(new THREE.Vector3(0, 3.2, 0));
  if (snapCamera) { camera.position.copy(target); snapCamera = false; }
  else camera.position.lerp(target, 1 - Math.pow(0.0005, elapsed));
  camLook.copy(pos).addScaledVector(forward, 4).add(new THREE.Vector3(0, 0.8, 0));
  camera.lookAt(camLook);

  sun.position.copy(pos).add(new THREE.Vector3(30, 60, 20));
  sun.target.position.copy(pos);

  const ms = ticksToMs(sim.finishTick ?? sim.tick);
  $('timer').textContent = formatTime(ms);
  $('speed').textContent = `${Math.round(Math.abs(sim.speed) * 3.6)} km/h`;
  renderer.render(scene, camera);
}

try {
  await initPhysics();
  reset();
  requestAnimationFrame(frame);
} catch (err) {
  $('timer').textContent = 'Erreur';
  $('speed').textContent = `Le moteur physique n'a pas pu démarrer : ${(err as Error).message}`;
}
