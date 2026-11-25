import type { Replay, ReplayResult } from './replay.ts';

export interface ReplayFixture {
  name: string;
  replay: Replay;
  expected: ReplayResult;
}
export interface FixtureFile {
  simVersion: number;
  fixtures: ReplayFixture[];
}
