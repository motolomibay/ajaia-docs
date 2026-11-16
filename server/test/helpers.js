import request from 'supertest';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

export function setup() {
  const db = openDb(':memory:');
  // Controllable clock so version-history tests don't wait 60 s.
  const clock = { t: Date.parse('2026-01-01T00:00:00Z'), advance(ms) { this.t += ms; } };
  const app = createApp({ db, secret: 'test-secret', now: () => clock.t });
  // Returns a supertest agent already logged in as `username` (cookie kept between calls).
  async function as(username) {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username }).expect(200);
    return agent;
  }
  return { db, app, as, clock, anon: () => request(app) };
}
