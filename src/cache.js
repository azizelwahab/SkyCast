// In-memory TTL cache with:
//  - a maximum size (oldest entries are evicted first, so memory stays bounded)
//  - in-flight de-duplication (simultaneous identical requests share one upstream call)
//  - stale-on-error fallback (an expired value is served if refreshing fails)
class TTLCache {
  constructor({ ttlMs, maxEntries, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.staleMs = ttlMs * 6; // entries older than this are dropped entirely
    this.now = now;
    this.map = new Map();
    this.inflight = new Map();
  }

  get size() {
    return this.map.size;
  }

  set(key, value) {
    this.map.delete(key); // re-insert so the newest entry sits at the end
    this.map.set(key, { value, time: this.now() });
    this.prune();
  }

  prune() {
    const t = this.now();
    for (const [key, entry] of this.map) {
      if (t - entry.time > this.staleMs) this.map.delete(key);
    }
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
  }

  async getOrLoad(key, loader) {
    const entry = this.map.get(key);
    if (entry && this.now() - entry.time < this.ttlMs) return entry.value;
    if (this.inflight.has(key)) return this.inflight.get(key);

    const promise = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value;
      } catch (err) {
        if (entry) return entry.value; // stale data beats an error page
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
}

module.exports = { TTLCache };
