import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteStore, HydrationError, type Database } from '../src/storage';
import { Controller, type Store } from '../src/controller';
import { initial, transition, type State, type Change } from '../src/domain';
function database() {
  const db = new DatabaseSync(':memory:');
  let fail = false;
  const adapter: Database = {
    async execAsync(sql) {
      if (fail && sql.includes('DELETE FROM transitions'))
        throw new Error('disk full');
      db.exec(sql);
    },
    async runAsync(sql, ...params) {
      return db.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string) {
      return db.prepare(sql).all() as T[];
    },
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN IMMEDIATE');
      try {
        await task(adapter);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return {
    db,
    store: new SQLiteStore(adapter),
    fail: () => {
      fail = true;
    },
  };
}
async function fixture() {
  const f = database();
  await f.store.init();
  return f;
}
test('SQLite saves complete transition atomically and unique result survives repeated recovery', async () => {
  const { store, db } = await fixture();
  let now = 100_000;
  const c = new Controller(
    store,
    () => now,
    () => {},
  );
  await c.load();
  await c.dispatch({ type: 'start', mode: 'focus', id: 'real-1' });
  now += 1_500_000;
  await c.dispatch({ type: 'reconcile' });
  for (let i = 0; i < 4; i++)
    await new Controller(
      store,
      () => now,
      () => {},
    ).load();
  assert.equal((await store.load()).history.length, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM transitions').get()?.n, 2);
});
test('transaction failure rolls back timer, history and transition writes', async () => {
  const { store, db, fail } = await fixture();
  const c = new Controller(
    store,
    () => 100_000,
    () => {},
  );
  await c.load();
  fail();
  await assert.rejects(
    c.dispatch({ type: 'start', mode: 'focus', id: 'failure' }),
  );
  assert.equal(c.state?.active, null);
  assert.equal((await store.load()).active, null);
  assert.equal(db.prepare('SELECT count(*) AS n FROM transitions').get()?.n, 0);
});
test('corrupt active blocks writes and repair preserves valid history and preferences', async () => {
  const { store, db } = await fixture();
  let s = transition(
    initial(),
    { type: 'start', mode: 'focus', id: 'valid' },
    100_000,
  ).state;
  const done = transition(s, { type: 'cancel' }, 110_000);
  await store.save(done);
  db.prepare("UPDATE meta SET value='bad-json' WHERE key='active'").run();
  await assert.rejects(
    store.load(),
    (e) => e instanceof HydrationError && e.repairable,
  );
  await store.repair();
  s = await store.load();
  assert.equal(s.history.length, 1);
  assert.equal(s.active, null);
  assert.equal(s.preferences.focus, 25);
  assert.equal(db.prepare('SELECT count(*) AS n FROM quarantine').get()?.n, 1);
});
test('unknown schema is blocked, including repair, without changing valid history', async () => {
  const { store, db } = await fixture();
  db.prepare("UPDATE meta SET value='99' WHERE key='version'").run();
  await assert.rejects(
    store.load(),
    (e) => e instanceof HydrationError && !e.repairable,
  );
  await assert.rejects(store.repair());
  assert.equal(
    db.prepare("SELECT value FROM meta WHERE key='version'").get()?.value,
    '99',
  );
});
test('corrupt preferences recover defaults without manufacturing a result', async () => {
  const { store, db } = await fixture();
  db.prepare("INSERT INTO meta VALUES ('preferences','{\"focus\":0}')").run();
  await assert.rejects(store.load());
  await store.repair();
  assert.deepEqual(await store.load(), initial());
});
test('unreadable history is hidden, preserved through valid writes and explicitly clearable', async () => {
  const { store, db } = await fixture();
  db.prepare("INSERT INTO history VALUES ('bad','{broken')").run();
  const s = await store.load();
  assert.equal(store.skipped, 1);
  await store.save(
    transition(s, { type: 'start', mode: 'focus', id: 'new' }, 100_000),
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM history').get()?.n, 1);
  await store.save(transition(await store.load(), { type: 'clear' }, 110_000));
  assert.equal((await store.load()).active?.id, 'new');
  assert.equal(store.skipped, 0);
});
test('conflicting active and terminal ID requires safe repair', async () => {
  const { store, db } = await fixture();
  const start = transition(
    initial(),
    { type: 'start', mode: 'focus', id: 'same' },
    100_000,
  );
  await store.save(transition(start.state, { type: 'cancel' }, 110_000));
  db.prepare("UPDATE meta SET value=? WHERE key='active'").run(
    JSON.stringify(start.state.active),
  );
  await assert.rejects(store.load());
  await store.repair();
  assert.equal((await store.load()).history.length, 1);
});
test('command queue serializes writes and publishes only acknowledged snapshots', async () => {
  let saved = initial();
  const published: State[] = [];
  const order: string[] = [];
  let gate: () => void = () => {};
  const blocker = new Promise<void>((r) => (gate = r));
  const store: Store = {
    async load() {
      return saved;
    },
    async save(c) {
      order.push(c.events[0]?.kind);
      await blocker;
      saved = c.state;
    },
  };
  let now = 100_000;
  const c = new Controller(
    store,
    () => now,
    (s) => published.push(s),
  );
  await c.load();
  const a = c.dispatch({ type: 'start', mode: 'focus', id: 'ordered' });
  const b = c.dispatch({ type: 'pause' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(published.length, 1);
  assert.deepEqual(order, ['started']);
  now += 1_000;
  gate();
  await Promise.all([a, b]);
  assert.deepEqual(order, ['started', 'paused']);
  assert.equal(saved.active?.status, 'paused');
  assert.equal(saved.active?.elapsedMs, 1_000);
});
test('failed or ambiguous save blocks queued commands until explicit reload', async () => {
  let saved = initial(),
    fail = true;
  const store: Store = {
    async load() {
      return saved;
    },
    async save(change: Change) {
      saved = change.state;
      if (fail) throw new Error('ack lost');
    },
  };
  const c = new Controller(
    store,
    () => 100_000,
    () => {},
  );
  await c.load();
  await assert.rejects(
    c.dispatch({ type: 'start', mode: 'focus', id: 'ambiguous' }),
  );
  await assert.rejects(c.dispatch({ type: 'cancel' }));
  assert.equal(c.state?.active, null);
  fail = false;
  await c.load();
  assert.equal((c.state as State | null)?.active?.id, 'ambiguous');
  await c.dispatch({ type: 'cancel' });
  assert.equal(c.state?.history.length, 1);
});
