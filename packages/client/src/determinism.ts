import { formatTime, initPhysics, runReplay, TEST_TRACK, type FixtureFile, type Replay } from '@raceleague/shared';
import fixtureFile from '@raceleague/shared/fixtures/replays.json';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main() {
  await initPhysics();
  const { fixtures } = fixtureFile as FixtureFile;
  const rows = $('rows');
  let allOk = true;
  for (const f of fixtures) {
    const r = runReplay(f.replay, TEST_TRACK);
    const ok = r.stateHash === f.expected.stateHash && r.finishTick === f.expected.finishTick && r.ticks === f.expected.ticks;
    allOk &&= ok;
    const tr = document.createElement('tr');
    const cells = [f.name, r.timeMs === null ? 'pas fini' : formatTime(r.timeMs), String(r.ticks), r.stateHash, f.expected.stateHash];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    }
    const td = document.createElement('td');
    td.textContent = ok ? 'identique' : 'DIFFÉRENT';
    td.className = ok ? 'ok' : 'ko';
    tr.append(td);
    rows.append(tr);
  }
  const verdict = $('verdict');
  verdict.textContent = allOk ? '✓ Les 3 replays sont identiques à Node' : '✗ Au moins un replay diffère';
  verdict.className = allOk ? 'ok' : 'ko';
  document.body.dataset.result = allOk ? 'ok' : 'ko';
  $('env').textContent = navigator.userAgent;

  $<HTMLInputElement>('file').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const out = $('file-result');
    try {
      const replay = JSON.parse(await file.text()) as Replay;
      const r = runReplay(replay, TEST_TRACK);
      out.textContent = `Temps : ${r.timeMs === null ? 'pas fini' : formatTime(r.timeMs)}\nPas : ${r.ticks}\nEmpreinte : ${r.stateHash}`;
    } catch (err) {
      out.textContent = `Erreur : ${(err as Error).message}`;
    }
  });
}

main().catch((err) => {
  const v = $('verdict');
  v.textContent = `Erreur : ${(err as Error).message}`;
  v.className = 'ko';
  document.body.dataset.result = 'error';
});
