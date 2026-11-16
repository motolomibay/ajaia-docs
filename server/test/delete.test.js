import { describe, it, expect } from 'vitest';
import { setup } from './helpers.js';

describe('delete document (owner only)', () => {
  async function world() {
    const ctx = setup();
    const alice = await ctx.as('alice');
    const bob = await ctx.as('bob');
    const carol = await ctx.as('carol');
    const doc = (await alice.post('/api/documents').send({ title: 'Doomed' })).body;
    const url = `/api/documents/${doc.id}`;
    await alice.patch(url).send({ content_html: '<p>v1</p>' });
    await alice.patch(url).send({ content_html: '<p>v2</p>' }); // creates a version
    await alice.post(`${url}/shares`).send({ username: 'bob', role: 'editor' }).expect(201);
    await alice.post(`${url}/shares`).send({ username: 'carol', role: 'viewer' }).expect(201);
    return { ...ctx, alice, bob, carol, doc, url };
  }

  it('editor, viewer and strangers cannot delete', async () => {
    const { bob, carol, as, url, db, doc } = await world();
    await bob.delete(url).expect(403);
    await carol.delete(url).expect(403);
    const stranger = await as('carol');
    await stranger.delete('/api/documents/99999').expect(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM documents WHERE id = ?').get(doc.id).n).toBe(1);
  });

  it('L5-A8 owner deletes: doc, shares and versions are gone; everyone gets 404', async () => {
    const { alice, bob, url, db, doc } = await world();
    expect(db.prepare('SELECT COUNT(*) AS n FROM document_versions WHERE document_id = ?').get(doc.id).n).toBe(1);
    await alice.delete(url).expect(200);
    for (const table of ['documents WHERE id', 'shares WHERE document_id', 'document_versions WHERE document_id']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} = ?`).get(doc.id).n).toBe(0);
    }
    await alice.get(url).expect(404);
    await bob.get(url).expect(404);
    await bob.patch(url).send({ content_html: '<p>late save</p>' }).expect(404);
    expect((await alice.get('/api/documents')).body.owned).toEqual([]);
    expect((await bob.get('/api/documents')).body.shared).toEqual([]);
    await alice.delete(url).expect(404); // already deleted
  });

  it('requires login and a valid id', async () => {
    const { anon, alice, url } = await world();
    await anon().delete(url).expect(401);
    await alice.delete('/api/documents/abc').expect(400);
  });
});
