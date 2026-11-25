/**
 * Pilote automatique utilisé UNIQUEMENT pour fabriquer les replays de test.
 * Il peut utiliser n'importe quelle math : ce qui compte, c'est que le replay
 * enregistré (la liste des touches) soit rejoué à l'identique partout.
 */
import { KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_UP, type Keys } from '../src/input.ts';
import { MAX_TICKS, Simulation } from '../src/sim.ts';
import { ReplayRecorder, type Replay } from '../src/replay.ts';
import type { Track } from '../src/track.ts';

export interface BotStyle {
  waypoints: [number, number][];
  /** Vitesse max visée dans les virages (m/s). */
  cornerSpeed: number;
  /** Tolérance d'angle avant de tourner (produit vectoriel). */
  deadzone: number;
  /** Vitesse max en ligne droite (m/s). */
  topSpeed: number;
  /** Nombre max de pas, pour un replay volontairement coupé. */
  maxTicks?: number;
}

export interface BotRun {
  replay: Replay;
  /** Résultat de la run en direct, pour vérifier que le replay la reproduit. */
  live: { finishTick: number | null; stateHash: string };
}

export function driveBot(track: Track, style: BotStyle): BotRun {
  const sim = new Simulation(track);
  const rec = new ReplayRecorder(track);
  let wp = 0;
  let stuckFor = 0, slowFor = 0;
  const limit = style.maxTicks ?? MAX_TICKS;
  while (!sim.done && sim.tick < limit) {
    const { p, q } = sim.chassisPose();
    const [qx, qy, qz, qw] = q;
    // Vecteur avant (+X local) tourné par le quaternion
    const fx = 1 - 2 * (qy * qy + qz * qz);
    const fz = 2 * (qx * qz - qw * qy);
    let target = style.waypoints[Math.min(wp, style.waypoints.length - 1)]!;
    let dx = target[0] - p[0], dz = target[1] - p[2];
    if (dx * dx + dz * dz < 64 && wp < style.waypoints.length - 1) {
      wp++;
      target = style.waypoints[wp]!;
      dx = target[0] - p[0]; dz = target[1] - p[2];
    }
    const len = Math.hypot(dx, dz) || 1;
    const cross = (fz * dx - fx * dz) / len; // > 0 : la cible est à gauche (−Z)
    const dot = (fx * dx + fz * dz) / len;
    let keys: Keys = 0;
    if (cross > style.deadzone) keys |= KEY_LEFT;
    else if (cross < -style.deadzone) keys |= KEY_RIGHT;
    // Freine à l'approche d'un point où la trajectoire tourne
    let turn = 1;
    const next = style.waypoints[wp + 1];
    if (next) {
      const nx = next[0] - target[0], nz = next[1] - target[1];
      turn = (dx * nx + dz * nz) / (len * (Math.hypot(nx, nz) || 1));
    }
    const brakeZone = len < 10 + sim.speed * 0.8 && turn < 0.85;
    const wantSlow = ((dot < 0.9 || brakeZone) && sim.speed > style.cornerSpeed) || sim.speed > style.topSpeed;
    keys |= wantSlow ? KEY_DOWN : sim.speed > style.topSpeed - 1 ? 0 : KEY_UP;
    // Coincé contre un mur : marche arrière en braquant de l'autre côté
    if (stuckFor > 0) {
      stuckFor--;
      keys = KEY_DOWN | (cross > 0 ? KEY_RIGHT : KEY_LEFT);
    } else if (sim.tick > 60 && sim.speed < 0.5 && sim.speed > -0.5) {
      if (++slowFor > 30) { stuckFor = 50; slowFor = 0; }
    } else slowFor = 0;
    rec.record(sim.tick, keys);
    sim.step(keys);
  }
  const live = { finishTick: sim.finishTick, stateHash: sim.stateHash() };
  sim.dispose();
  return { replay: rec.finish(), live };
}

const LINE: [number, number][] = [
  [35, -5], [60, -5], [78, 0], [95, 5], [112, 0], [126, -2], [136, 4], [140, 20], [140, 90], [140, 140],
];

export const BOT_STYLES: Record<string, BotStyle> = {
  rapide: { waypoints: LINE, topSpeed: 40, cornerSpeed: 22, deadzone: 0.02 },
  prudent: { waypoints: LINE, topSpeed: 28, cornerSpeed: 14, deadzone: 0.06 },
  // Zigzag qui finit dans le mur : vérifie aussi les collisions et l'abandon.
  zigzag: { waypoints: [[30, 8], [50, -8], [70, 8], [90, -8]], topSpeed: 45, cornerSpeed: 40, deadzone: 0.0, maxTicks: 900 },
};
