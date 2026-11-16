import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import request from 'supertest';
import { setup } from './helpers.js';

// Stored form of every allowed format (the sanitizer writes <br> as <br />, which is equivalent HTML).
const RICH = '<h1>Title</h1><h2>Sub</h2><h3>Small</h3><p><strong>b</strong> <em>i</em> <u>u</u><br /></p>'
  + '<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol>';

async function newDoc(agent, body = {}) {
  return (await agent.post('/api/documents').send(body).expect(201)).body;
}

describe('Lap 2: documents', () => {
  it('L2-A1 create: 201, caller is owner, default title', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const doc = await newDoc(alice);
    expect(doc.title).toBe('Untitled document');
    expect(doc.role).toBe('owner');
    expect(doc.content_html).toBe('');
  });

  it('L2-A2 list: in owned for the owner, invisible to others', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const bob = await as('bob');
    const doc = await newDoc(alice, { title: 'Q3 Plan' });
    const a = (await alice.get('/api/documents').expect(200)).body;
    expect(a.owned.map((d) => d.id)).toEqual([doc.id]);
    expect(a.shared).toEqual([]);
    expect((await bob.get('/api/documents')).body.owned).toEqual([]);
  });

  it('L2-A3 PATCH round-trips title + rich content; updated_at advances', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const doc = await newDoc(alice);
    const saved = (await alice.patch(`/api/documents/${doc.id}`).send({ title: '  Q3 Plan  ', content_html: RICH }).expect(200)).body;
    expect(saved.title).toBe('Q3 Plan');
    expect(saved.updated_at > doc.updated_at).toBe(true);
    const got = (await alice.get(`/api/documents/${doc.id}`).expect(200)).body;
    expect(got.content_html).toBe(RICH); // L2-A6: allowed formatting survives exactly
  });

  it('L2-A4 title validation', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const doc = await newDoc(alice);
    for (const title of ['', '   ', 'x'.repeat(201), 42, null]) {
      const res = await alice.patch(`/api/documents/${doc.id}`).send({ title }).expect(400);
      expect(res.body.error).toBeTruthy();
    }
    await alice.post('/api/documents').send({ title: '' }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: 'x'.repeat(200) }).expect(200);
  });

  it('L2-A5 content: > 1 MB is 413, non-string is 400, empty body is 400', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const doc = await newDoc(alice);
    const big = '<p>' + 'a'.repeat(1024 * 1024) + '</p>';
    expect((await alice.patch(`/api/documents/${doc.id}`).send({ content_html: big }).expect(413)).body.error).toMatch(/1 MB/);
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: { x: 1 } }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({}).expect(400);
  });

  it('L2-A7 sanitizer strips scripts, handlers, styles, links, iframes, svg', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const doc = await newDoc(alice);
    const evil = '<p style="color:red" onclick="x()">hi<script>alert(1)</script></p><img src=x onerror=alert(1)>'
      + '<a href="javascript:alert(1)">link</a><iframe src="https://evil"></iframe><svg onload=alert(1)></svg>';
    const saved = (await alice.patch(`/api/documents/${doc.id}`).send({ content_html: evil }).expect(200)).body;
    expect(saved.content_html).toBe('<p>hi</p>link');
  });

  it('L2-A8 bad ids are 400 / 404, never 500', async () => {
    const { as } = setup();
    const alice = await as('alice');
    for (const id of ['abc', '-1', '0', '1.5']) await alice.get(`/api/documents/${id}`).expect(400);
    await alice.get('/api/documents/99999').expect(404);
    await alice.patch('/api/documents/99999').send({ title: 'x' }).expect(404);
  });

  it('L2-A9 cannot change owner or id through PATCH', async () => {
    const { as, db } = setup();
    const alice = await as('alice');
    const doc = await newDoc(alice);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: 'T', owner_id: 2, id: 500 }).expect(200);
    expect(db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(doc.id).owner_id).toBe(1);
  });

  it('access: another user gets 403 on a private doc, logged-out gets 401', async () => {
    const { as, anon } = setup();
    const alice = await as('alice');
    const carol = await as('carol');
    const doc = await newDoc(alice);
    await carol.get(`/api/documents/${doc.id}`).expect(403);
    await carol.patch(`/api/documents/${doc.id}`).send({ title: 'pwn' }).expect(403);
    await carol.get(`/api/documents/${doc.id}/versions`).expect(403);
    await anon().get(`/api/documents/${doc.id}`).expect(401);
    await anon().get('/api/documents').expect(401);
    await anon().post('/api/documents').send({}).expect(401);
  });

  it('X-4/X-5 SQL-ish and unicode titles round-trip safely', async () => {
    const { as, db } = setup();
    const alice = await as('alice');
    for (const title of ["'; DROP TABLE documents;--", 'Plan 🚀 计划 خطة']) {
      const doc = await newDoc(alice, { title });
      expect((await alice.get(`/api/documents/${doc.id}`)).body.title).toBe(title);
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM documents').get().n).toBe(2);
  });

  it('X-6 data survives a restart (close + reopen the DB file)', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-')), 'app.db');
    let db = openDb(file);
    let agent = request.agent(createApp({ db, secret: 's' }));
    await agent.post('/api/login').send({ username: 'alice' });
    const doc = (await agent.post('/api/documents').send({ title: 'Keep me' })).body;
    await agent.patch(`/api/documents/${doc.id}`).send({ content_html: RICH }).expect(200);
    db.close();
    db = openDb(file);
    agent = request.agent(createApp({ db, secret: 's' }));
    await agent.post('/api/login').send({ username: 'alice' });
    const got = (await agent.get(`/api/documents/${doc.id}`).expect(200)).body;
    expect(got.title).toBe('Keep me');
    expect(got.content_html).toBe(RICH);
    db.close();
  });
});

describe('Lap 5: version history', () => {
  async function docWithContent(ctx) {
    const alice = await ctx.as('alice');
    const doc = await newDoc(alice, { title: 'Doc' });
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v1</p>' }).expect(200);
    return { alice, doc };
  }
  const versions = async (agent, id) => (await agent.get(`/api/documents/${id}/versions`).expect(200)).body;

  it('L5-A1 the first edit of a doc with content snapshots the previous state', async () => {
    const ctx = setup();
    const { alice, doc } = await docWithContent(ctx);
    expect(await versions(alice, doc.id)).toEqual([]); // empty new doc is not a version
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v2</p>' }).expect(200);
    const list = await versions(alice, doc.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Doc', author: 'Alice' });
  });

  it('L5-A2 at most one snapshot per 60 s', async () => {
    const ctx = setup();
    const { alice, doc } = await docWithContent(ctx);
    for (let i = 0; i < 5; i++) {
      ctx.clock.advance(5_000);
      await alice.patch(`/api/documents/${doc.id}`).send({ content_html: `<p>edit ${i}</p>` });
    }
    expect(await versions(alice, doc.id)).toHaveLength(1);
    ctx.clock.advance(60_000);
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>later</p>' });
    expect(await versions(alice, doc.id)).toHaveLength(2);
  });

  it('L5-A3 keeps only the newest 10 versions', async () => {
    const ctx = setup();
    const { alice, doc } = await docWithContent(ctx);
    for (let i = 0; i < 25; i++) {
      ctx.clock.advance(61_000);
      await alice.patch(`/api/documents/${doc.id}`).send({ content_html: `<p>state ${i}</p>` });
    }
    const list = await versions(alice, doc.id);
    expect(list).toHaveLength(10);
    const ids = ctx.db.prepare('SELECT content_html FROM document_versions ORDER BY id').all().map((v) => v.content_html);
    expect(ids.at(-1)).toBe('<p>state 23</p>'); // newest snapshot = state before the last edit
    expect(ids[0]).toBe('<p>state 14</p>');
  });

  it('L5-A4/A5 restore brings back the version, and the restore itself can be undone', async () => {
    const ctx = setup();
    const { alice, doc } = await docWithContent(ctx);
    ctx.clock.advance(61_000);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: 'Renamed', content_html: '<p>v2</p>' });
    const [v1] = await versions(alice, doc.id);
    const restored = (await alice.post(`/api/documents/${doc.id}/versions/${v1.id}/restore`).expect(200)).body;
    expect(restored).toMatchObject({ title: 'Doc', content_html: '<p>v1</p>' });
    const after = await versions(alice, doc.id);
    expect(after).toHaveLength(2);
    const undo = (await alice.post(`/api/documents/${doc.id}/versions/${after[0].id}/restore`).expect(200)).body;
    expect(undo).toMatchObject({ title: 'Renamed', content_html: '<p>v2</p>' });
  });

  it('L5-A6 cannot restore a version that belongs to another document', async () => {
    const ctx = setup();
    const { alice, doc } = await docWithContent(ctx);
    const other = await newDoc(alice, { title: 'Other' });
    await alice.patch(`/api/documents/${other.id}`).send({ content_html: '<p>o1</p>' });
    await alice.patch(`/api/documents/${other.id}`).send({ content_html: '<p>o2</p>' });
    const [ov] = await versions(alice, other.id);
    await alice.post(`/api/documents/${doc.id}/versions/${ov.id}/restore`).expect(404);
    await alice.post(`/api/documents/${doc.id}/versions/abc/restore`).expect(400);
  });

  it('L5-A7 other users cannot list or restore', async () => {
    const ctx = setup();
    const { alice, doc } = await docWithContent(ctx);
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v2</p>' });
    const [v] = await versions(alice, doc.id);
    const carol = await ctx.as('carol');
    await carol.get(`/api/documents/${doc.id}/versions`).expect(403);
    await carol.post(`/api/documents/${doc.id}/versions/${v.id}/restore`).expect(403);
  });

  it('L5-A9 snapshot + update are one transaction', async () => {
    const ctx = setup();
    const { alice, doc } = await docWithContent(ctx);
    // Force the UPDATE to fail after the snapshot INSERT has run.
    ctx.db.exec(`CREATE TRIGGER boom BEFORE UPDATE ON documents BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v2</p>' }).expect(500);
    ctx.db.exec('DROP TRIGGER boom');
    expect(await versions(alice, doc.id)).toEqual([]);
    expect((await alice.get(`/api/documents/${doc.id}`)).body.content_html).toBe('<p>v1</p>');
  });
});

describe('stress', () => {
  it('S-4 1,000 snapshot-worthy saves keep exactly 10 versions (bounded storage)', async () => {
    const ctx = setup();
    const alice = await ctx.as('alice');
    const doc = (await alice.post('/api/documents').send({ title: 'Cap' })).body;
    for (let i = 0; i < 1000; i++) {
      ctx.clock.advance(61_000);
      await alice.patch(`/api/documents/${doc.id}`).send({ content_html: `<p>state ${i}</p>` }).expect(200);
    }
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM document_versions').get().n).toBe(10);
    expect((await alice.get(`/api/documents/${doc.id}/versions`)).body).toHaveLength(10);
  }, 30_000);
});
