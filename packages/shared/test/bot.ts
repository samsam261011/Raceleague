/**
 * Pilote automatique utilisé UNIQUEMENT pour fabriquer les replays de test.
 * Il peut utiliser n'importe quelle math : ce qui compte, c'est que le replay
 * enregistré (la liste des touches) soit rejoué à l'identique partout.
 */
import { KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_UP, type Keys } from '../src/input.ts';
import { MAX_TICKS, Simulation } from '../src/sim.ts';
import { ReplayRecorder, type Replay } from '../src/replay.ts';
import type { Track } from '../src/pieces.ts';

export interface BotStyle {
  /** Distance de visée sur la ligne centrale (m). */
  lookahead: number;
  /** Vitesse max visée en ligne droite (m/s). */
  topSpeed: number;
  /** Plus c'est grand, plus le pilote freine avant les virages. */
  caution: number;
  /** Tolérance d'angle avant de tourner. */
  deadzone: number;
  /** Nombre max de pas, pour un replay volontairement coupé. */
  maxTicks?: number;
}

export interface BotRun {
  replay: Replay;
  /** Résultat de la run en direct, pour vérifier que le replay la reproduit. */
  live: { finishTick: number | null; stateHash: string };
}

/** Pilote qui suit la ligne centrale du circuit (poursuite d'un point devant lui). */
export function driveBot(track: Track, style: BotStyle): BotRun {
  const sim = new Simulation(track);
  const rec = new ReplayRecorder(track);
  const line = sim.compiled.centerline;
  let idx = 0;
  let stuckFor = 0, slowFor = 0, respawns = 0;
  const limit = style.maxTicks ?? MAX_TICKS;
  while (!sim.done && sim.tick < limit) {
    const { p, q } = sim.chassisPose();
    const [qx, qy, qz, qw] = q;
    const fx = 1 - 2 * (qy * qy + qz * qz);
    const fz = 2 * (qx * qz - qw * qy);
    // Point de la ligne le plus proche, en avançant seulement (tout le circuit après une chute)
    let best = Infinity;
    const from = sim.respawns !== respawns ? 0 : idx;
    respawns = sim.respawns;
    for (let j = from; j < Math.min(line.length, from === 0 && idx > 0 ? line.length : idx + 30); j++) {
      const d = Math.hypot(line[j]![0] - p[0], line[j]![2] - p[2]);
      if (d < best) { best = d; idx = j; }
    }
    const look = (dist: number) => {
      let j = idx, acc = 0;
      while (j < line.length - 1 && acc < dist) {
        acc += Math.hypot(line[j + 1]![0] - line[j]![0], line[j + 1]![2] - line[j]![2]);
        j++;
      }
      return line[j]!;
    };
    const t = look(style.lookahead + sim.speed * 0.25);
    const dx = t[0] - p[0], dz = t[2] - p[2];
    const len = Math.hypot(dx, dz) || 1;
    const cross = (fz * dx - fx * dz) / len; // > 0 : la cible est à gauche
    // Courbure à venir : angle entre la direction actuelle et un point lointain
    const far = look(15 + sim.speed * style.caution);
    const ax = far[0] - p[0], az = far[2] - p[2];
    const alen = Math.hypot(ax, az) || 1;
    const ahead = (fx * ax + fz * az) / alen;
    const target = style.topSpeed * (0.35 + 0.65 * Math.max(0, ahead) ** 3);
    let keys: Keys = 0;
    if (cross > style.deadzone) keys |= KEY_LEFT;
    else if (cross < -style.deadzone) keys |= KEY_RIGHT;
    if (sim.speed > target + 2) keys |= KEY_DOWN;
    else if (sim.speed < target) keys |= KEY_UP;
    // Coincé contre un mur : marche arrière en braquant de l'autre côté
    if (stuckFor > 0) {
      stuckFor--;
      keys = KEY_DOWN | (cross > 0 ? KEY_RIGHT : KEY_LEFT);
    } else if (sim.tick > 60 && Math.abs(sim.speed) < 0.5) {
      if (++slowFor > 30) { stuckFor = 50; slowFor = 0; }
    } else slowFor = 0;
    rec.record(sim.tick, keys);
    sim.step(keys);
  }
  const live = { finishTick: sim.finalTicks, stateHash: sim.stateHash() };
  sim.dispose();
  return { replay: rec.finish(), live };
}

export const BOT_STYLES: Record<string, BotStyle> = {
  rapide: { lookahead: 8, topSpeed: 42, caution: 0.6, deadzone: 0.02 },
  prudent: { lookahead: 8, topSpeed: 30, caution: 0.9, deadzone: 0.04 },
  // Zigzag coupé avant la fin : vérifie aussi les collisions et les chutes.
  zigzag: { lookahead: 2, topSpeed: 45, caution: 0, deadzone: 0, maxTicks: 900 },
};
