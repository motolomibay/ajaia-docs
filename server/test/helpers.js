import request from 'supertest';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

export function setup() {
  const db = openDb(':memory:');
  const app = createApp({ db, secret: 'test-secret' });
  // Returns a supertest agent already logged in as `username` (cookie kept between calls).
  async function as(username) {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username }).expect(200);
    return agent;
  }
  return { db, app, as, anon: () => request(app) };
}
