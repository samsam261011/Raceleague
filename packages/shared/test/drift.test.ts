import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Simulation } from '../src/sim.ts';
import { KEY_LEFT, KEY_UP, type Keys } from '../src/input.ts';
import type { Track } from '../src/track.ts';

/** Grande dalle sans murs, pour mesurer la glisse sans collision. */
const OPEN: Track = {
  id: 'open',
  name: 'Dalle',
  start: [0, 1, 0],
  blocks: [{ kind: 'road', center: [0, -0.5, 0], half: [800, 0.5, 800] }],
  finish: { center: [5000, 0, 0], half: [1, 1, 1] },
};

beforeAll(async () => {
  await initPhysics();
});

/** Accélère tout droit pendant `accel` pas, puis applique `turn(t)` pendant 60 pas. */
function run(accel: number, turn: (t: number) => Keys) {
  const sim = new Simulation(OPEN);
  for (let t = 0; t < accel; t++) sim.step(KEY_UP);
  const kmh = sim.speed * 3.6;
  let drift = 0;
  let maxLat = 0;
  for (let t = 0; t < 60; t++) {
    sim.step(turn(t));
    drift = Math.max(drift, sim.drift);
    maxLat = Math.max(maxLat, Math.abs(sim.lateralSpeed));
  }
  sim.dispose();
  return { kmh, drift, maxLat };
}

describe('drift à la limite d’adhérence', () => {
  it('braquer à fond à pleine vitesse fait décrocher l’arrière', () => {
    const r = run(200, () => KEY_UP | KEY_LEFT);
    expect(r.kmh).toBeGreaterThan(150);
    expect(r.drift).toBe(1);
    expect(r.maxLat).toBeGreaterThan(5);
  });

  it('braquer à fond à vitesse modérée reste en adhérence', () => {
    const r = run(60, () => KEY_LEFT);
    expect(r.kmh).toBeLessThan(70);
    expect(r.drift).toBe(0);
    expect(r.maxLat).toBeLessThan(3);
  });

  it('de petites touches à pleine vitesse passent sans décrocher', () => {
    const r = run(200, (t) => KEY_UP | (t % 8 < 3 ? KEY_LEFT : 0));
    expect(r.drift).toBe(0);
  });
});
