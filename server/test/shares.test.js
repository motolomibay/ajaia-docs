import { describe, it, expect } from 'vitest';
import { setup } from './helpers.js';

// Alice owns a doc with content and one version; Bob = editor, Carol = viewer (when shared).
async function world({ share = true } = {}) {
  const ctx = setup();
  const alice = await ctx.as('alice');
  const bob = await ctx.as('bob');
  const carol = await ctx.as('carol');
  const doc = (await alice.post('/api/documents').send({ title: 'Q3 Plan' }).expect(201)).body;
  await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v1</p>' }).expect(200);
  await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v2</p>' }).expect(200);
  const [version] = (await alice.get(`/api/documents/${doc.id}/versions`)).body;
  if (share) {
    await alice.post(`/api/documents/${doc.id}/shares`).send({ username: 'bob', role: 'editor' }).expect(201);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ username: 'carol', role: 'viewer' }).expect(201);
  }
  return { ...ctx, alice, bob, carol, doc, version, url: `/api/documents/${doc.id}` };
}

describe('Lap 3: sharing with roles', () => {
  it('L3-A1 shared docs appear under "shared" with owner name and role', async () => {
    const { bob, carol, doc } = await world();
    const b = (await bob.get('/api/documents').expect(200)).body;
    expect(b.owned).toEqual([]);
    expect(b.shared).toMatchObject([{ id: doc.id, title: 'Q3 Plan', owner_name: 'Alice', role: 'editor' }]);
    expect((await carol.get('/api/documents')).body.shared[0].role).toBe('viewer');
  });

  it('L3-A2 editor: read, edit, history, restore yes; share, change roles no', async () => {
    const { bob, url, version } = await world();
    expect((await bob.get(url).expect(200)).body).toMatchObject({ role: 'editor', owner_name: 'Alice' });
    await bob.patch(url).send({ title: 'Bob renamed', content_html: '<p>by bob</p>' }).expect(200);
    await bob.get(`${url}/versions`).expect(200);
    await bob.post(`${url}/versions/${version.id}/restore`).expect(200);
    await bob.get(`${url}/shares`).expect(403);
    await bob.post(`${url}/shares`).send({ username: 'carol', role: 'editor' }).expect(403);
    await bob.delete(`${url}/shares/3`).expect(403);
  });

  it('L3-A3 viewer: read only, every write and history route is 403', async () => {
    const { carol, url, version } = await world();
    expect((await carol.get(url).expect(200)).body.role).toBe('viewer');
    await carol.patch(url).send({ title: 'x' }).expect(403);
    await carol.patch(url).send({ content_html: '<p>x</p>' }).expect(403);
    await carol.get(`${url}/versions`).expect(403);
    await carol.post(`${url}/versions/${version.id}/restore`).expect(403);
    await carol.get(`${url}/shares`).expect(403);
    await carol.post(`${url}/shares`).send({ username: 'bob', role: 'viewer' }).expect(403);
  });

  it('L3-A4/A10 no access: every :id route is 403 (IDOR sweep)', async () => {
    const { carol, url, version } = await world({ share: false });
    const calls = [
      carol.get(url), carol.patch(url).send({ title: 'x' }),
      carol.get(`${url}/versions`), carol.post(`${url}/versions/${version.id}/restore`),
      carol.get(`${url}/shares`), carol.post(`${url}/shares`).send({ username: 'carol', role: 'editor' }),
      carol.patch(`${url}/shares/3`).send({ role: 'editor' }), carol.delete(`${url}/shares/2`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    expect((await carol.get('/api/documents')).body.shared).toEqual([]);
  });

  it('L3-A5 sharing again updates the role instead of duplicating', async () => {
    const { alice, db, doc, url } = await world();
    const list = (await alice.post(`${url}/shares`).send({ username: 'bob', role: 'viewer' }).expect(201)).body;
    expect(list.filter((s) => s.username === 'bob')).toEqual([{ user_id: 2, username: 'bob', name: 'Bob', role: 'viewer' }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM shares WHERE document_id = ?').get(doc.id).n).toBe(2);
  });

  it('L3-A6 downgrade to viewer takes effect immediately', async () => {
    const { alice, bob, url } = await world();
    await bob.patch(url).send({ content_html: '<p>ok</p>' }).expect(200);
    await alice.patch(`${url}/shares/2`).send({ role: 'viewer' }).expect(200);
    await bob.patch(url).send({ content_html: '<p>no</p>' }).expect(403);
    await alice.patch(`${url}/shares/2`).send({ role: 'editor' }).expect(200);
    await bob.patch(url).send({ content_html: '<p>ok again</p>' }).expect(200);
  });

  it('L3-A7 revoke removes access and the dashboard entry', async () => {
    const { alice, bob, url } = await world();
    await alice.delete(`${url}/shares/2`).expect(200);
    await bob.get(url).expect(403);
    expect((await bob.get('/api/documents')).body.shared).toEqual([]);
    await alice.delete(`${url}/shares/2`).expect(404); // already revoked
  });

  it('L3-A8 share validation', async () => {
    const { alice, url } = await world({ share: false });
    for (const body of [
      { username: 'alice', role: 'editor' }, { username: 'mallory', role: 'editor' },
      { username: 'bob', role: 'admin' }, { username: 'bob' }, { role: 'viewer' }, { username: 42, role: 'viewer' },
    ]) await alice.post(`${url}/shares`).send(body).expect(400);
    await alice.patch(`${url}/shares/2`).send({ role: 'editor' }).expect(404); // not shared yet
    await alice.patch(`${url}/shares/abc`).send({ role: 'editor' }).expect(400);
  });

  it('L3-A9 owner never appears in shared; shared user never in owned', async () => {
    const { alice, bob, doc } = await world();
    expect((await alice.get('/api/documents')).body.shared).toEqual([]);
    expect((await alice.get('/api/documents')).body.owned.map((d) => d.id)).toEqual([doc.id]);
    expect((await bob.get('/api/documents')).body.owned).toEqual([]);
  });

  it('editor edits are visible to the owner (end-to-end)', async () => {
    const { alice, bob, url } = await world();
    await bob.patch(url).send({ content_html: '<p>Bob was here</p>' }).expect(200);
    expect((await alice.get(url)).body.content_html).toBe('<p>Bob was here</p>');
  });
});
