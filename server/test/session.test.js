import { describe, it, expect } from 'vitest';
import { setup } from './helpers.js';

// All tabs share one cookie. Each tab sends X-Expect-User with the user it believes it is.
describe('session changed in another tab', () => {
  it('a matching header works normally', async () => {
    const { as } = setup();
    const alice = await as('alice'); // id 1
    await alice.get('/api/documents').set('X-Expect-User', '1').expect(200);
  });

  it('after logout in another tab, a save is refused with SESSION_CHANGED (not run anonymously)', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const doc = (await alice.post('/api/documents').send({}).expect(201)).body;
    await alice.post('/api/logout').expect(200); // "the other tab" clears the shared cookie
    const res = await alice.patch(`/api/documents/${doc.id}`).set('X-Expect-User', '1')
      .send({ content_html: '<p>x</p>' }).expect(401);
    expect(res.body.code).toBe('SESSION_CHANGED');
  });

  it('after switching to Bob in another tab, Alice\'s tab can never write as Bob', async () => {
    const { as, db } = setup();
    const alice = await as('alice');
    const doc = (await alice.post('/api/documents').send({ title: 'Mine' }).expect(201)).body;
    await alice.post('/api/login').send({ username: 'bob' }).expect(200); // same browser, cookie is now Bob
    const res = await alice.patch(`/api/documents/${doc.id}`).set('X-Expect-User', '1')
      .send({ title: 'Written by the wrong user' }).expect(401);
    expect(res.body.code).toBe('SESSION_CHANGED');
    expect(db.prepare('SELECT title FROM documents WHERE id = ?').get(doc.id).title).toBe('Mine');
    await alice.post('/api/documents').set('X-Expect-User', '1').send({}).expect(401);
  });

  it('a plain logged-out request gets LOGGED_OUT', async () => {
    const { anon } = setup();
    expect((await anon().get('/api/documents').expect(401)).body.code).toBe('LOGGED_OUT');
  });
});
