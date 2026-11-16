// Stress suite (TEST.md §8). Starts its own server on a throwaway DB, so it never touches real data.
// Run: npm run stress        S-3 and S-4 need fake timers / an injected clock and live in the Vitest suite.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import autocannon from 'autocannon';

const PORT = 4542;
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-stress-'));
const DB_FILE = path.join(DIR, 'app.db');
const results = [];
let server;

function start() {
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DB_FILE, SESSION_SECRET: 'stress', NODE_ENV: 'development' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return waitUp();
}
async function waitUp(timeoutMs = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if ((await fetch(`${BASE}/api/users`)).ok) return Date.now() - t0; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('server did not start');
}
const rssMb = () => Number(fs.readFileSync(`/proc/${server.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024;

async function login(username) {
  const res = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return (p, { method = 'GET', body, form } = {}) => fetch(`${BASE}/api${p}`, {
    method,
    headers: { Cookie: cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
}
const record = (id, ok, detail) => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`); };

async function main() {
  await start();
  const alice = await login('alice');
  const bob = await login('bob');
  const doc = await (await alice('/documents', { method: 'POST', body: { title: 'Stress doc' } })).json();
  await alice(`/documents/${doc.id}/shares`, { method: 'POST', body: { username: 'bob', role: 'editor' } });
  const cookie = (await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":"alice"}' })).headers.get('set-cookie').split(';')[0];

  // S-1 load: 50 connections, 20 s, half reads half writes
  const run = (opts) => new Promise((resolve, reject) => autocannon(opts, (err, r) => (err ? reject(err) : resolve(r))));
  const common = { duration: 20, connections: 25, headers: { Cookie: cookie, 'Content-Type': 'application/json' } };
  const [reads, writes] = await Promise.all([
    run({ ...common, url: `${BASE}/api/documents` }),
    run({ ...common, url: `${BASE}/api/documents/${doc.id}`, method: 'PATCH', body: JSON.stringify({ content_html: '<p>load test <strong>write</strong></p>' }) }),
  ]);
  const bad = reads.non2xx + writes.non2xx + reads.errors + writes.errors;
  const p99 = Math.max(reads.latency.p99, writes.latency.p99);
  record('S-1 load (50 conns, 20 s)', bad === 0 && p99 < 200,
    `${reads.requests.total + writes.requests.total} requests, ${bad} errors/non-2xx, p99 ${p99} ms (reads ${reads.latency.p99} / writes ${writes.latency.p99})`);

  // S-2 same-doc race: 2 users × 100 interleaved writes
  const payloads = new Set();
  const writesRace = [];
  for (let i = 0; i < 100; i++) {
    for (const [who, api] of [['alice', alice], ['bob', bob]]) {
      const html = `<p>${who} write ${i}</p>`;
      payloads.add(html);
      writesRace.push(api(`/documents/${doc.id}`, { method: 'PATCH', body: { content_html: html } }));
    }
  }
  const statuses = (await Promise.all(writesRace)).map((r) => r.status);
  const final = (await (await alice(`/documents/${doc.id}`)).json()).content_html;
  record('S-2 same-doc race (2 × 100)', statuses.every((s) => s === 200) && payloads.has(final),
    `${statuses.filter((s) => s >= 500).length} 5xx; final content is one whole submitted payload: ${payloads.has(final)} ("${final}")`);

  // S-5 large doc (~900 KB of formatted content)
  const block = '<h2>Section</h2><p><strong>Bold</strong> <em>italic</em> <u>under</u> text text text text text</p><ul><li><p>item</p></li></ul>';
  const big = block.repeat(Math.floor(900 * 1024 / block.length));
  let t0 = Date.now();
  const save = await alice(`/documents/${doc.id}`, { method: 'PATCH', body: { content_html: big } });
  const saveMs = Date.now() - t0;
  t0 = Date.now();
  const loaded = (await (await alice(`/documents/${doc.id}`)).json()).content_html;
  const loadMs = Date.now() - t0;
  record('S-5 large doc (~900 KB)', save.status === 200 && loaded === big,
    `${(big.length / 1024).toFixed(0)} KB; save ${saveMs} ms, load ${loadMs} ms, round-trip exact: ${loaded === big}`);

  // S-6 upload abuse: 20 parallel 1 MB uploads + 20 oversize, three rounds. A leak shows as memory that keeps
  // climbing round after round; a healthy server plateaus after the first round (V8 keeps its heap reserved).
  const file = (bytes, name) => { const f = new FormData(); f.append('file', new Blob([Buffer.alloc(bytes, 'a')]), name); return f; };
  const rss = [rssMb()];
  let okCount = 0; let tooBig = 0; let fiveXX = 0;
  for (let round = 0; round < 3; round++) {
    const ups = await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => alice('/documents/import', { method: 'POST', form: file(1024 * 1024, `ok-${i}.txt`) })),
      ...Array.from({ length: 20 }, (_, i) => alice('/documents/import', { method: 'POST', form: file(3 * 1024 * 1024, `big-${i}.txt`) })),
    ]);
    okCount += ups.slice(0, 20).filter((r) => r.status === 201).length;
    tooBig += ups.slice(20).filter((r) => r.status === 413).length;
    fiveXX += ups.filter((r) => r.status >= 500).length;
    await new Promise((r) => setTimeout(r, 1000));
    rss.push(rssMb());
  }
  const plateau = rss[3] - rss[1] < 0.25 * (rss[1] - rss[0]) + 20; // rounds 2–3 add little compared to round 1
  record('S-6 upload abuse (3 × (20 ok + 20 oversize))', okCount === 60 && tooBig === 60 && fiveXX === 0 && plateau,
    `${okCount}/60 accepted, ${tooBig}/60 rejected 413, ${fiveXX} 5xx; server memory per round ${rss.map((m) => m.toFixed(0)).join(' → ')} MB (plateaus: ${plateau})`);

  // S-7 share churn: 200 random share / role-change / revoke ops, then verify Bob's real access matches the last op
  let expected = 'editor';
  for (let i = 0; i < 200; i++) {
    const op = ['editor', 'viewer', 'revoke'][Math.floor(Math.random() * 3)];
    if (op === 'revoke') { await alice(`/documents/${doc.id}/shares/2`, { method: 'DELETE' }); expected = null; }
    else { await alice(`/documents/${doc.id}/shares`, { method: 'POST', body: { username: 'bob', role: op } }); expected = op; }
  }
  const read = (await bob(`/documents/${doc.id}`)).status;
  const write = (await bob(`/documents/${doc.id}`, { method: 'PATCH', body: { title: 'churn' } })).status;
  const actual = read === 403 ? null : write === 200 ? 'editor' : 'viewer';
  record('S-7 share churn (200 ops)', actual === expected, `last op: ${expected ?? 'revoke'}; Bob actually has: ${actual ?? 'no access'} (read ${read}, write ${write})`);
  await alice(`/documents/${doc.id}/shares`, { method: 'POST', body: { username: 'bob', role: 'editor' } });

  // S-8 restart under use: hard-kill the server mid-writes; every acknowledged save must survive
  let lastAcked = null;
  let stop = false;
  const writer = (async () => {
    for (let i = 0; !stop; i++) {
      try {
        const r = await alice(`/documents/${doc.id}`, { method: 'PATCH', body: { content_html: `<p>seq ${i}</p>` } });
        if (r.status === 200) lastAcked = i;
      } catch { /* server down */ }
    }
  })();
  await new Promise((r) => setTimeout(r, 1500));
  server.kill('SIGKILL');
  stop = true;
  await writer; // stop writing at the kill, so the check below is about what survived, not what came after
  const ackedAtKill = lastAcked;
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DB_FILE, SESSION_SECRET: 'stress', NODE_ENV: 'development' }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  const upMs = await waitUp();
  const after = (await (await alice(`/documents/${doc.id}`)).json()).content_html;
  const seq = Number(after.match(/seq (\d+)/)?.[1]);
  // Stored must be the last acknowledged save, or one later (committed, but the reply was lost in the kill).
  record('S-8 hard kill during writes', upMs < 5000 && (seq === ackedAtKill || seq === ackedAtKill + 1),
    `back in ${upMs} ms; last acknowledged before kill: seq ${ackedAtKill}; stored after restart: seq ${seq}`);

  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log('\nS-3 (autosave burst) and S-4 (version cap) run in `npm test`; S-9 (offline/slow network) was verified in the browser.');
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} stress checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
