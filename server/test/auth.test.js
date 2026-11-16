import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../db.js';
import { setup } from './helpers.js';

describe('Lap 1: users and login', () => {
  it('L1-A1 lists exactly the 3 seeded users, with no extra fields', async () => {
    const { anon } = setup();
    const res = await anon().get('/api/users').expect(200);
    expect(res.body.map((u) => u.username)).toEqual(['alice', 'bob', 'carol']);
    for (const u of res.body) expect(Object.keys(u).sort()).toEqual(['id', 'name', 'username']);
  });

  it('L1-A2 login sets an HttpOnly, SameSite=Lax cookie', async () => {
    const { anon } = setup();
    const res = await anon().post('/api/login').send({ username: 'alice' }).expect(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(res.body.name).toBe('Alice');
  });

  it('L1-A3 /me returns the user with a cookie, 401 without', async () => {
    const { as, anon } = setup();
    const alice = await as('alice');
    expect((await alice.get('/api/me').expect(200)).body.username).toBe('alice');
    const res = await anon().get('/api/me').expect(401);
    expect(res.body.error).toBeTruthy();
  });

  it('L1-A4 rejects bad login input with 400', async () => {
    const { anon } = setup();
    for (const body of [{ username: 'mallory' }, {}, { username: 123 }, { username: '   ' }]) {
      await anon().post('/api/login').send(body).expect(400);
    }
  });

  it('L1-A5 a tampered cookie is never accepted as another user', async () => {
    const { anon } = setup();
    const res = await anon().post('/api/login').send({ username: 'alice' });
    const value = res.headers['set-cookie'][0].split(';')[0]; // uid=s%3A1.<sig>
    const forged = value.replace('s%3A1.', 's%3A2.'); // claim to be Bob, keep Alice's signature
    await anon().get('/api/me').set('Cookie', forged).expect(401);
    await anon().get('/api/me').set('Cookie', 'uid=2').expect(401); // unsigned
  });

  it('L1-A6 seeding is idempotent across restarts', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-')), 'app.db');
    openDb(file).close();
    const db = openDb(file);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(3);
    db.close();
  });

  it('L1-A7 unknown API route is a 404 JSON error', async () => {
    const { anon } = setup();
    const res = await anon().get('/api/nope').expect(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('X-1/X-7 malformed JSON gives a 400 JSON error and nosniff header', async () => {
    const { anon } = setup();
    const res = await anon().post('/api/login').set('Content-Type', 'application/json').send('{bad').expect(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
