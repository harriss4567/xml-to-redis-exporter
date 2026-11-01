/**
 * Minimal in-memory stand-in for a node-redis client, covering only the commands
 * the exporter uses (connect, scanIterator, multi/del/set/exec, close).
 */
export class FakeRedis {
  constructor(initial = {}) {
    this.store = new Map(Object.entries(initial));
    this.connected = false;
    this.closed = false;
    this.execCount = 0;
  }

  on() { return this; }

  async connect() { this.connected = true; }

  async close() { this.closed = true; this.connected = false; }

  async *scanIterator({ MATCH }) {
    const regex = new RegExp(
      '^' + MATCH.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    );
    // Yield in batches, like node-redis v5.
    yield [...this.store.keys()].filter((k) => regex.test(k));
  }

  get(key) { return this.store.get(key) ?? null; }

  multi() {
    const ops = [];
    const tx = {
      del: (keys) => { ops.push(() => [].concat(keys).forEach((k) => this.store.delete(k))); return tx; },
      set: (k, v) => { ops.push(() => this.store.set(k, v)); return tx; },
      exec: async () => {
        if (!this.connected) throw new Error('client not connected');
        this.execCount += 1;
        ops.forEach((op) => op());
        return ops.map(() => 'OK');
      },
    };
    return tx;
  }
}
