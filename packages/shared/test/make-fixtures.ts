/**
 * Régénère fixtures/replays.json : 3 replays du pilote automatique, un par
 * circuit, et le résultat attendu (calculé ici, dans Node). Le navigateur et
 * le téléphone doivent retrouver exactement les mêmes valeurs.
 *
 * À relancer (npm run fixtures) quand SIM_VERSION ou un circuit change.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initPhysics, SIM_VERSION } from '../src/sim.ts';
import { runReplay } from '../src/replay.ts';
import { EPINGLE, FALAISE, MESA } from '../src/tracks.ts';
import { BOT_STYLES, driveBot } from './bot.ts';

await initPhysics();
const plan = [
  { name: 'Mesa', track: MESA, style: BOT_STYLES.rapide! },
  { name: 'Épingle (saut raté puis réussi)', track: EPINGLE, style: BOT_STYLES.tombeur! },
  { name: 'Falaise (virages relevés)', track: FALAISE, style: BOT_STYLES.prudent! },
];
const fixtures = plan.map(({ name, track, style }) => {
  const { replay } = driveBot(track, style);
  return { name, replay, expected: runReplay(replay, track) };
});
const out = fileURLToPath(new URL('../fixtures/replays.json', import.meta.url));
writeFileSync(out, JSON.stringify({ simVersion: SIM_VERSION, fixtures }) + '\n');
for (const f of fixtures) console.log(f.name.padEnd(34), f.expected.timeMs ?? 'pas fini', 'chutes', f.expected.respawns, f.expected.stateHash);
