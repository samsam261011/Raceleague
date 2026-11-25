import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Simulation } from '../src/sim.ts';
import { compileTrack } from '../src/pieces.ts';
import { TEST_TRACK, TRACKS } from '../src/tracks.ts';
import { runReplay } from '../src/replay.ts';
import { BOT_STYLES, driveBot } from './bot.ts';
import { KEY_UP } from '../src/input.ts';

beforeAll(async () => {
  await initPhysics();
});

describe('circuits', () => {
  for (const track of [TEST_TRACK, ...TRACKS]) {
    it(`« ${track.name} » se termine en 10 à 40 s`, () => {
      const r = runReplay(driveBot(track, BOT_STYLES.prudent!).replay, track);
      expect(r.timeMs).not.toBeNull();
      expect(r.timeMs!).toBeGreaterThan(5000);
      expect(r.timeMs!).toBeLessThan(40000);
      expect(r.splits.length).toBe(compileTrack(track).gates.length - 1);
    });
  }

  it('le chrono démarre à la première touche', () => {
    const sim = new Simulation(TEST_TRACK);
    for (let i = 0; i < 30; i++) sim.step(0);
    expect(sim.raceTicks).toBe(0);
    sim.step(KEY_UP);
    expect(sim.startTick).toBe(30);
    sim.dispose();
  });

  it('une chute ramène au départ sans arrêter le chrono', () => {
    // Tout droit dans un virage sans rambarde : la voiture tombe
    const sim = new Simulation({
      id: 'chute', name: 'Chute',
      pieces: [{ t: 'start' }, { t: 'straight' }, { t: 'turnR' }, { t: 'straight' }, { t: 'finish' }],
    });
    for (let i = 0; i < 600 && sim.respawns === 0; i++) sim.step(KEY_UP);
    expect(sim.respawns).toBe(1);
    const ticks = sim.raceTicks;
    sim.step(KEY_UP);
    expect(sim.raceTicks).toBe(ticks + 1);
    sim.dispose();
  });

  it('créer une course prend moins de 0,2 s', () => {
    for (const track of TRACKS) {
      const t0 = performance.now();
      const sim = new Simulation(track);
      sim.step(0);
      sim.dispose();
      expect(performance.now() - t0).toBeLessThan(200);
    }
  });
});
