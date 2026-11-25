/**
 * Rejoue un replay dans Node et affiche le temps, comme le fera le serveur
 * pour valider les runs du classement.
 *
 *   npm run replay -- chemin/vers/replay.json
 *   npm run replay                (rejoue les 3 replays de référence)
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { formatTime, initPhysics, runReplay, TEST_TRACK, type FixtureFile, type Replay } from '@raceleague/shared';

await initPhysics();
const files = process.argv.slice(2);
const list: { name: string; replay: Replay }[] = files.length
  ? files.map((f) => ({ name: f, replay: JSON.parse(readFileSync(f, 'utf8')) as Replay }))
  : (createRequire(import.meta.url)('@raceleague/shared/fixtures/replays.json') as FixtureFile).fixtures;

for (const { name, replay } of list) {
  const r = runReplay(replay, TEST_TRACK);
  const time = r.timeMs === null ? (r.fell ? 'chute' : 'pas fini') : formatTime(r.timeMs);
  console.log(`${name}\n  temps : ${time}\n  pas : ${r.ticks}\n  empreinte : ${r.stateHash}`);
}
