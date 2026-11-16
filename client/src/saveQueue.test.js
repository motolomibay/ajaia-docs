import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSaveQueue } from './saveQueue.js';

// A fake server: records calls and lets the test decide when each save resolves.
function fakeSave() {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const save = vi.fn((value) => new Promise((resolve, reject) => {
    active++; maxActive = Math.max(maxActive, active);
    calls.push({ value, resolve: () => { active--; resolve(); }, reject: (e) => { active--; reject(e); } });
  }));
  return { save, calls, get maxActive() { return maxActive; } };
}
const tick = () => vi.advanceTimersByTimeAsync(0);

describe('autosave queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('L2-U1 debounces 10 rapid edits into one save of the last value', async () => {
    const f = fakeSave();
    const q = createSaveQueue(f.save, { delay: 800 });
    for (let i = 0; i < 10; i++) { q.schedule(`v${i}`); await vi.advanceTimersByTimeAsync(100); }
    await vi.advanceTimersByTimeAsync(800);
    expect(f.calls.map((c) => c.value)).toEqual(['v9']);
  });

  it('L2-U2/U3 never two saves in flight; the last edit is what ends up saved', async () => {
    const f = fakeSave();
    const statuses = [];
    const q = createSaveQueue(f.save, { delay: 800, onStatus: (s) => statuses.push(s) });
    q.schedule('a');
    await vi.advanceTimersByTimeAsync(800);
    expect(f.calls).toHaveLength(1);
    q.schedule('b'); await vi.advanceTimersByTimeAsync(800);
    q.schedule('c'); await vi.advanceTimersByTimeAsync(800);
    expect(f.calls).toHaveLength(1); // still waiting on 'a'
    f.calls[0].resolve(); await tick();
    expect(f.calls.map((c) => c.value)).toEqual(['a', 'c']); // 'b' skipped, newest sent
    f.calls[1].resolve(); await tick();
    expect(f.maxActive).toBe(1);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('L2-U4 a failed save keeps the content and retries until it succeeds', async () => {
    const f = fakeSave();
    const statuses = [];
    const q = createSaveQueue(f.save, { delay: 800, retryMs: 2000, onStatus: (s) => statuses.push(s) });
    q.schedule('keep me');
    await vi.advanceTimersByTimeAsync(800);
    f.calls[0].reject(Object.assign(new Error('offline'), { status: undefined })); await tick();
    expect(statuses.at(-1)).toBe('retrying');
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.calls[1].value).toBe('keep me');
    f.calls[1].resolve(); await tick();
    expect(statuses.at(-1)).toBe('saved');
  });

  it('a newer edit made during a failing save is the one retried', async () => {
    const f = fakeSave();
    const q = createSaveQueue(f.save, { delay: 800, retryMs: 2000 });
    q.schedule('old'); await vi.advanceTimersByTimeAsync(800);
    q.schedule('new');
    f.calls[0].reject(new Error('500')); await tick();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.calls.at(-1).value).toBe('new');
  });

  it('a permanent error (403) stops retrying and reports it', async () => {
    const f = fakeSave();
    const statuses = [];
    const q = createSaveQueue(f.save, { delay: 800, onStatus: (s) => statuses.push(s) });
    q.schedule('x'); await vi.advanceTimersByTimeAsync(800);
    f.calls[0].reject(Object.assign(new Error('no access'), { status: 403 })); await tick();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.calls).toHaveLength(1);
    expect(statuses.at(-1)).toBe('error');
  });

  it('flush sends pending content immediately and resolves when idle', async () => {
    const f = fakeSave();
    const q = createSaveQueue(f.save, { delay: 800 });
    q.schedule('now');
    const done = q.flush();
    await tick();
    expect(f.calls.map((c) => c.value)).toEqual(['now']);
    let resolved = false; done.then(() => { resolved = true; });
    await tick(); expect(resolved).toBe(false);
    f.calls[0].resolve(); await tick();
    expect(resolved).toBe(true);
    expect(q.busy).toBe(false);
  });
});
