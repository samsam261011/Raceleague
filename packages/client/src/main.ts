import * as THREE from 'three';
import {
  CAR, compileTrack, DT, formatTime, initPhysics, ReplayRecorder, Simulation, ticksToMs, trackHash, TRACKS,
  type Keys, type Pose, type Replay, type Track,
} from '@raceleague/shared';
import { Input } from './input.ts';
import { Menu, type TrackEntry } from './menu.ts';
import { loadSettings, readBest, saveSettings, writeBest, type Best, type Settings } from './settings.ts';
import { buildCanyon, buildCar, buildTrack, COLORS, type TrackView } from './world.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const bestKey = (t: Track) => `raceleague.best.${t.id}.${trackHash(t)}`;

const fmtDelta = (ms: number) => `${ms < 0 ? '−' : '+'}${formatTime(Math.abs(ms)).replace(/^0:0?/, '')}`;

const settings = loadSettings();

// --- Rendu -----------------------------------------------------------------
const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.fog, 120, 480);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
scene.add(new THREE.HemisphereLight(0xfff1e0, 0x7a3a20, 1.6));
const sun = new THREE.DirectionalLight(0xffe2c0, 2.2);
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun, sun.target);

const { car, wheels } = buildCar();
scene.add(car);
let trackView: TrackView | null = null;
let canyon: THREE.Group | null = null;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 85 : 70;
  camera.updateProjectionMatrix();
}

function applySettings(s: Settings) {
  const high = s.quality === 'high';
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 2) : 1);
  sun.castShadow = high;
  document.body.classList.toggle('touch-show', s.touch === 'show');
  document.body.classList.toggle('touch-hide', s.touch === 'hide');
  resize();
}
addEventListener('resize', resize);
applySettings(settings);

// --- État de la partie -------------------------------------------------------
let track: Track = TRACKS[0]!;
let sim: Simulation;
let recorder: ReplayRecorder | null = null;
/** Replay en cours de visionnage, sinon null (on conduit). */
let watching: { replay: Replay; event: number; keys: Keys } | null = null;
let lastReplay: Replay | null = null;
let prev: Pose, curr: Pose;
let accumulator = 0;
let lastTime = performance.now();
let finished = false;
let snapCamera = true;
let best: Best | null = null;
let shownSplits = 0;
let splitTimer = 0;

function loadTrack(t: Track) {
  track = t;
  const compiled = compileTrack(t);
  if (trackView) scene.remove(trackView.group);
  if (canyon) scene.remove(canyon);
  trackView = buildTrack(compiled);
  canyon = buildCanyon(compiled);
  scene.add(trackView.group, canyon);
  lastReplay = null;
  best = readBest(bestKey(t));
}

function reset(watch: Replay | null = null) {
  sim?.dispose();
  sim = new Simulation(track);
  recorder = watch ? null : new ReplayRecorder(track);
  watching = watch ? { replay: watch, event: 0, keys: 0 } : null;
  prev = curr = sim.chassisPose();
  accumulator = 0;
  lastTime = performance.now();
  finished = false;
  $('finish').hidden = true;
  $('mode').hidden = !watch;
  $('split').hidden = true;
  shownSplits = 0;
  snapCamera = true;
}

function onFinish() {
  finished = true;
  if (recorder) lastReplay = recorder.finish();
  const t = sim.finalTicks;
  const ms = t !== null ? ticksToMs(t) : null;
  $('finish-time').textContent = ms === null ? 'Temps écoulé' : formatTime(ms);
  const bestEl = $('finish-best');
  bestEl.className = '';
  bestEl.textContent = sim.respawns ? `${sim.respawns} chute${sim.respawns > 1 ? 's' : ''}` : '';
  if (ms !== null && !watching) {
    if (best === null || ms < best.time) {
      bestEl.textContent = best === null ? 'Premier temps !' : `Nouveau record (${fmtDelta(ms - best.time)})`;
      bestEl.className = 'record';
      best = { time: ms, splits: sim.splits.map(ticksToMs) };
      writeBest(bestKey(track), best);
    } else {
      bestEl.textContent = `Record : ${formatTime(best.time)} (${fmtDelta(ms - best.time)})`;
    }
  }
  $('btn-watch').hidden = !lastReplay;
  $('btn-download').hidden = !lastReplay;
  $('finish').hidden = false;
}

/** Écart au checkpoint, en vert si on est en avance sur son record. */
function showSplit() {
  const i = sim.splits.length - 1;
  const ms = ticksToMs(sim.splits[i]!);
  const el = $('split');
  const ref = best?.splits[i];
  el.textContent = ref === undefined ? formatTime(ms) : fmtDelta(ms - ref);
  el.className = ref === undefined ? '' : ms <= ref ? 'ahead' : 'behind';
  el.hidden = false;
  splitTimer = 2;
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
  const respawns = sim.respawns;
  sim.step(keys);
  curr = sim.chassisPose();
  if (sim.respawns !== respawns) { prev = curr; snapCamera = true; }
  if (sim.splits.length > shownSplits) { shownSplits = sim.splits.length; showSplit(); }
  if (sim.done || (watching && sim.tick >= watching.replay.ticks)) onFinish();
}

// --- Menu --------------------------------------------------------------------
const menu = new Menu(
  {
    onPlay: () => { menu.setOpen(false); if (finished) reset(); lastTime = performance.now(); },
    onPickTrack: (t) => { menu.setOpen(false); loadTrack(t); reset(); },
    onSettings: (s) => { saveSettings(s); applySettings(s); },
  },
  settings,
  (): TrackEntry[] => TRACKS.map((t) => ({ track: t, name: t.name, best: readBest(bestKey(t))?.time ?? null })),
);

function openMenu() { menu.setOpen(true); }

const input = new Input(
  () => { if (!menu.open) reset(); },
  () => { if (!menu.open && finished) reset(); },
);
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (menu.back()) return;
  if (menu.open) { menu.setOpen(false); lastTime = performance.now(); } else openMenu();
});
$('open-menu').addEventListener('click', openMenu);
$('btn-finish-menu').addEventListener('click', openMenu);
$('restart').addEventListener('click', () => reset());
$('btn-again').addEventListener('click', () => reset());
$('btn-watch').addEventListener('click', () => lastReplay && reset(lastReplay));
$('btn-download').addEventListener('click', () => {
  if (!lastReplay) return;
  const blob = new Blob([JSON.stringify(lastReplay)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `raceleague-${track.id}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- Boucle ----------------------------------------------------------------
const pos = new THREE.Vector3();
const nextPos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();
const forward = new THREE.Vector3();
const UP_OFFSET = new THREE.Vector3(0, 3.2, 0);
let orbit = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  let elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (elapsed > 0.25) elapsed = 0.25; // onglet en arrière-plan : on ne rattrape pas
  if (!finished && !menu.open) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= DT && steps < 8 && !finished) {
      stepOnce();
      accumulator -= DT;
      steps++;
    }
  }
  // Interpolation entre les deux derniers pas pour un affichage fluide à 120 Hz comme à 30 Hz
  const alpha = finished || menu.open ? 1 : accumulator / DT;
  pos.fromArray(prev.p).lerp(nextPos.fromArray(curr.p), alpha);
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

  if (menu.open) {
    // Caméra qui tourne lentement autour de la voiture, voiture décalée vers le bas de l'écran
    orbit += elapsed * 0.25;
    camera.position.set(pos.x + Math.cos(orbit) * 6, pos.y + 1.4, pos.z + Math.sin(orbit) * 6);
    camLook.copy(pos).add(new THREE.Vector3(0, 0.2, 0));
    camera.lookAt(camLook);
    snapCamera = true;
  } else {
    // Caméra de poursuite
    forward.set(1, 0, 0).applyQuaternion(quat);
    forward.y = 0;
    forward.normalize();
    camTarget.copy(pos).addScaledVector(forward, -7.5).add(UP_OFFSET);
    if (snapCamera) { camera.position.copy(camTarget); snapCamera = false; }
    else camera.position.lerp(camTarget, 1 - Math.pow(0.0005, elapsed));
    camLook.copy(pos).addScaledVector(forward, 4).add(new THREE.Vector3(0, 0.8, 0));
    camera.lookAt(camLook);
  }

  sun.position.copy(pos).add(new THREE.Vector3(30, 60, 20));
  sun.target.position.copy(pos);

  $('timer').textContent = formatTime(ticksToMs(sim.raceTicks));
  const gates = sim.compiled.gates.length - 1;
  $('cp').textContent = gates > 0 ? `Checkpoint ${Math.min(sim.checkpoint, gates)}/${gates}` : '';
  $('start-hint').hidden = sim.startTick !== null || menu.open || !!watching;
  if (splitTimer > 0 && (splitTimer -= elapsed) <= 0) $('split').hidden = true;
  $('speed').textContent = `${Math.round(Math.abs(sim.speed) * 3.6)} km/h`;
  renderer.render(scene, camera);
}

try {
  await initPhysics();
  loadTrack(track);
  reset();
  requestAnimationFrame(frame);
} catch (err) {
  $('timer').textContent = 'Erreur';
  $('speed').textContent = `Le moteur physique n'a pas pu démarrer : ${(err as Error).message}`;
}
