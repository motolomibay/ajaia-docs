// Autosave queue: debounces edits and guarantees at most ONE save in flight, so saves from a tab can never arrive
// out of order. The newest value always wins; values typed while a save is in flight are sent right after it.
//
// status: 'saved' | 'saving' | 'retrying' | 'error'
export function createSaveQueue(save, { delay = 800, retryMs = 2000, onStatus = () => {} } = {}) {
  let latest;
  let hasPending = false;
  let inFlight = false;
  let timer = null;
  let retryTimer = null;
  let waiters = [];
  let stopped = false;

  const settle = () => { const w = waiters; waiters = []; w.forEach((fn) => fn()); };

  function kick() {
    timer = null;
    if (inFlight || !hasPending) return;
    const value = latest;
    hasPending = false;
    inFlight = true;
    save(value).then(
      () => {
        inFlight = false;
        if (hasPending) { if (!timer) kick(); return; }
        onStatus('saved');
        settle();
      },
      (err) => {
        inFlight = false;
        if (!hasPending) { latest = value; hasPending = true; } // never lose the unsaved content
        const permanent = err?.status >= 400 && err.status < 500 && ![408, 429].includes(err.status);
        if (permanent) {
          onStatus('error', err); // e.g. 403 after access was revoked, 413 too large: retrying won't help
          settle();
          return;
        }
        onStatus('retrying', err);
        retryTimer = setTimeout(kick, retryMs);
      },
    );
  }

  return {
    schedule(value) {
      if (stopped) return;
      latest = value;
      hasPending = true;
      onStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(kick, delay);
    },
    // Send anything pending now and resolve once nothing is pending or in flight (or a permanent error occurred).
    flush() {
      if (!hasPending && !inFlight) return Promise.resolve();
      clearTimeout(timer);
      clearTimeout(retryTimer);
      const done = new Promise((resolve) => waiters.push(resolve));
      if (!inFlight) kick();
      return done;
    },
    get busy() { return !stopped && (hasPending || inFlight); },
    // Clear timers (page cleanup). The queue keeps working if it is used again.
    destroy() { clearTimeout(timer); clearTimeout(retryTimer); settle(); },
    // Permanently stop: nothing more will be sent (used when access to the document is lost).
    stop() { stopped = true; clearTimeout(timer); clearTimeout(retryTimer); settle(); },
  };
}
