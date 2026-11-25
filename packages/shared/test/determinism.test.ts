import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, SIM_VERSION } from '../src/sim.ts';
import { runReplay, type Replay } from '../src/replay.ts';
import { TEST_TRACK, trackHash } from '../src/track.ts';
import type { FixtureFile } from '../src/fixtures.ts';
import fixtureFile from '../fixtures/replays.json' with { type: 'json' };
import { BOT_STYLES, driveBot } from './bot.ts';

const { fixtures } = fixtureFile as FixtureFile;

beforeAll(async () => {
  await initPhysics();
});

describe('replays déterministes', () => {
  it('les fixtures sont à jour avec la version de la simulation', () => {
    expect((fixtureFile as FixtureFile).simVersion).toBe(SIM_VERSION);
    expect(fixtures).toHaveLength(3);
  });

  for (const f of fixtures) {
    it(`« ${f.name} » donne le résultat attendu, au pas près`, () => {
      expect(runReplay(f.replay, TEST_TRACK)).toEqual(f.expected);
    });

    it(`« ${f.name} » donne le même résultat sur 5 rejeux d'affilée`, () => {
      const hashes = new Set(Array.from({ length: 5 }, () => runReplay(f.replay, TEST_TRACK).stateHash));
      expect(hashes.size).toBe(1);
    });
  }

  it('au moins deux replays franchissent l’arrivée', () => {
    expect(fixtures.filter((f) => f.expected.finishTick !== null).length).toBeGreaterThanOrEqual(2);
  });

  it('un replay rejoué reproduit exactement la run en direct', () => {
    for (const style of Object.values(BOT_STYLES)) {
      const { replay, live } = driveBot(TEST_TRACK, style);
      const r = runReplay(replay, TEST_TRACK);
      expect(r.finishTick).toBe(live.finishTick);
      expect(r.stateHash).toBe(live.stateHash);
    }
  });

  it('une seule touche changée donne un résultat différent', () => {
    const base = fixtures[0]!;
    const events = base.replay.events.map(([t, k]) => [t, k] as [number, number]);
    events[3]![0] += 1; // décale un changement de touche d'un seul pas
    const tampered: Replay = { ...base.replay, events };
    expect(runReplay(tampered, TEST_TRACK).stateHash).not.toBe(base.expected.stateHash);
  });

  it('refuse un replay fait pour un autre circuit', () => {
    const bad: Replay = { ...fixtures[0]!.replay, trackHash: '00000000' };
    expect(() => runReplay(bad, TEST_TRACK)).toThrow();
    expect(trackHash(TEST_TRACK)).toBe(fixtures[0]!.replay.trackHash);
  });
});
