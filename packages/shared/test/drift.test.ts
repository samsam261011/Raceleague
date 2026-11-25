import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Simulation } from '../src/sim.ts';
import { KEY_DOWN, KEY_LEFT, KEY_UP } from '../src/input.ts';
import type { Track } from '../src/track.ts';

/** Grande dalle sans murs, pour mesurer la glisse sans collision. */
const OPEN: Track = {
  id: 'open',
  name: 'Dalle',
  start: [0, 1, 0],
  blocks: [{ kind: 'road', center: [0, -0.5, 0], half: [500, 0.5, 500] }],
  finish: { center: [1000, 0, 0], half: [1, 1, 1] },
};

beforeAll(async () => {
  await initPhysics();
});

/** Accélère tout droit, puis applique `turnKeys` pendant 15 pas, puis gaz + gauche. */
function run(turnKeys: number) {
  const sim = new Simulation(OPEN);
  for (let t = 0; t < 150; t++) sim.step(KEY_UP);
  let maxLat = 0;
  for (let t = 0; t < 45; t++) {
    sim.step(t < 15 ? turnKeys : KEY_UP | KEY_LEFT);
    maxLat = Math.max(maxLat, Math.abs(sim.lateralSpeed));
  }
  const drift = sim.drift;
  sim.dispose();
  return { drift, maxLat };
}

describe('drift', () => {
  it('frein + virage à haute vitesse fait décrocher l’arrière', () => {
    const r = run(KEY_DOWN | KEY_LEFT);
    expect(r.drift).toBe(1);
    expect(r.maxLat).toBeGreaterThan(5);
  });

  it('le drift continue en réaccélérant tant qu’on tourne', () => {
    expect(run(KEY_DOWN | KEY_LEFT).drift).toBeGreaterThan(0.9);
  });

  it('un virage sans frein reste en adhérence', () => {
    const r = run(KEY_UP | KEY_LEFT);
    expect(r.drift).toBe(0);
    expect(r.maxLat).toBeLessThan(3);
  });
});
