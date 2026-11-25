/**
 * Régénère fixtures/replays.json : 3 replays du pilote automatique et le
 * résultat attendu (calculé ici, dans Node). Le navigateur et le téléphone
 * doivent retrouver exactement les mêmes valeurs.
 *
 * À relancer (npm run fixtures) seulement quand SIM_VERSION change.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initPhysics, SIM_VERSION } from '../src/sim.ts';
import { runReplay } from '../src/replay.ts';
import { TEST_TRACK } from '../src/track.ts';
import { BOT_STYLES, driveBot } from './bot.ts';

await initPhysics();
const fixtures = Object.entries(BOT_STYLES).map(([name, style]) => {
  const { replay } = driveBot(TEST_TRACK, style);
  return { name, replay, expected: runReplay(replay, TEST_TRACK) };
});
const out = fileURLToPath(new URL('../fixtures/replays.json', import.meta.url));
writeFileSync(out, JSON.stringify({ simVersion: SIM_VERSION, fixtures }) + '\n');
for (const f of fixtures) console.log(f.name.padEnd(8), f.expected.timeMs ?? 'pas fini', f.expected.stateHash);
