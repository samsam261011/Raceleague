import { SIM_VERSION, Simulation, TICK_RATE } from './sim.ts';
import { trackHash } from './track.ts';
import type { Track } from './pieces.ts';
import type { Keys } from './input.ts';

/**
 * Un replay = l'en-tête + la liste des changements de touches.
 * Le même fichier sert de replay, de fantôme et de preuve pour le classement.
 */
export interface Replay {
  simVersion: number;
  trackId: string;
  trackHash: string;
  /** [numéro du pas, touches] à chaque changement. */
  events: [number, Keys][];
  /** Nombre de pas joués. */
  ticks: number;
}

export class ReplayRecorder {
  private events: [number, Keys][] = [];
  private last: Keys = -1;
  private ticks = 0;
  constructor(private track: Track) {}

  /** À appeler avant chaque pas avec les touches utilisées pour ce pas. */
  record(tick: number, keys: Keys): void {
    if (keys !== this.last) {
      this.events.push([tick, keys]);
      this.last = keys;
    }
    this.ticks = tick + 1;
  }

  finish(): Replay {
    return {
      simVersion: SIM_VERSION,
      trackId: this.track.id,
      trackHash: trackHash(this.track),
      events: this.events.slice(),
      ticks: this.ticks,
    };
  }
}

export interface ReplayResult {
  /** Temps final en pas (depuis la première touche), null si pas fini. */
  finishTick: number | null;
  /** Temps en millisecondes, arrondi au millième de seconde. */
  timeMs: number | null;
  respawns: number;
  splits: number[];
  ticks: number;
  stateHash: string;
}

export function ticksToMs(ticks: number): number {
  return Math.round((ticks * 1000) / TICK_RATE);
}

/** Rejoue un replay du début à la fin, sans affichage. */
export function runReplay(replay: Replay, track: Track): ReplayResult {
  if (replay.simVersion !== SIM_VERSION) throw new Error(`Version de simulation ${replay.simVersion} ≠ ${SIM_VERSION}`);
  if (replay.trackId !== track.id || replay.trackHash !== trackHash(track)) {
    throw new Error('Le replay ne correspond pas à ce circuit');
  }
  const sim = new Simulation(track);
  let keys: Keys = 0;
  let e = 0;
  for (let tick = 0; tick < replay.ticks && !sim.done; tick++) {
    while (e < replay.events.length && replay.events[e]![0] <= tick) keys = replay.events[e++]![1];
    sim.step(keys);
  }
  const result: ReplayResult = {
    finishTick: sim.finalTicks,
    timeMs: sim.finalTicks === null ? null : ticksToMs(sim.finalTicks),
    respawns: sim.respawns,
    splits: sim.splits.slice(),
    ticks: sim.tick,
    stateHash: sim.stateHash(),
  };
  sim.dispose();
  return result;
}

export function formatTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
}
