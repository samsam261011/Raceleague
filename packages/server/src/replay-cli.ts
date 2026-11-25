/**
 * Rejoue un replay dans Node et affiche le temps, comme le fera le serveur
 * pour valider les runs du classement.
 *
 *   npm run replay -- chemin/vers/replay.json
 *   npm run replay                (rejoue les 3 replays de référence)
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { formatTime, initPhysics, runReplay, trackById, type FixtureFile, type Replay } from '@raceleague/shared';

await initPhysics();
const files = process.argv.slice(2);
const list: { name: string; replay: Replay }[] = files.length
  ? files.map((f) => ({ name: f, replay: JSON.parse(readFileSync(f, 'utf8')) as Replay }))
  : (createRequire(import.meta.url)('@raceleague/shared/fixtures/replays.json') as FixtureFile).fixtures;

for (const { name, replay } of list) {
  const track = trackById(replay.trackId);
  if (!track) throw new Error(`Circuit inconnu : ${replay.trackId}`);
  const r = runReplay(replay, track);
  const time = r.timeMs === null ? 'pas fini' : formatTime(r.timeMs);
  console.log(`${name}\n  circuit : ${track.name}\n  temps : ${time}\n  chutes : ${r.respawns}\n  empreinte : ${r.stateHash}`);
}
