import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, SIM_VERSION } from '../src/sim.ts';
import { runReplay, type Replay } from '../src/replay.ts';
import { trackHash } from '../src/track.ts';
import { TEST_TRACK, TRACKS, trackById } from '../src/tracks.ts';
import type { FixtureFile } from '../src/fixtures.ts';
import fixtureFile from '../fixtures/replays.json' with { type: 'json' };
import { BOT_STYLES, driveBot } from './bot.ts';

const { fixtures } = fixtureFile as FixtureFile;
const trackOf = (r: Replay) => trackById(r.trackId)!;

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
      expect(runReplay(f.replay, trackOf(f.replay))).toEqual(f.expected);
    });

    it(`« ${f.name} » donne le même résultat sur 5 rejeux d'affilée`, () => {
      const hashes = new Set(Array.from({ length: 5 }, () => runReplay(f.replay, trackOf(f.replay)).stateHash));
      expect(hashes.size).toBe(1);
    });
  }

  it('les 3 replays franchissent l’arrivée, et l’un d’eux passe par une chute', () => {
    expect(fixtures.every((f) => f.expected.finishTick !== null)).toBe(true);
    expect(fixtures.some((f) => f.expected.respawns > 0)).toBe(true);
  });

  it('un replay rejoué reproduit exactement la run en direct', () => {
    for (const track of [TEST_TRACK, ...TRACKS]) {
      const { replay, live } = driveBot(track, BOT_STYLES.rapide!);
      const r = runReplay(replay, track);
      expect(r.finishTick).toBe(live.finishTick);
      expect(r.stateHash).toBe(live.stateHash);
    }
  });

  it('un seul changement de touches modifié donne un résultat différent', () => {
    const base = fixtures[0]!;
    const events = base.replay.events.map(([t, k]) => [t, k] as [number, number]);
    events[3]![1] ^= 1; // inverse l'accélérateur sur un seul changement de touches
    const tampered: Replay = { ...base.replay, events };
    expect(runReplay(tampered, trackOf(base.replay)).stateHash).not.toBe(base.expected.stateHash);
  });

  it('refuse un replay fait pour un autre circuit', () => {
    const bad: Replay = { ...fixtures[0]!.replay, trackHash: '00000000' };
    expect(() => runReplay(bad, trackOf(bad))).toThrow();
    expect(() => runReplay(fixtures[0]!.replay, TEST_TRACK)).toThrow();
    expect(trackHash(trackOf(fixtures[0]!.replay))).toBe(fixtures[0]!.replay.trackHash);
  });
});
