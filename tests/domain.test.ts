import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createClock,
  elapsed,
  initial,
  remaining,
  transition,
  validPreferences,
  validSession,
  validRecord,
  type State,
  type Command,
} from '../src/domain';
const start = (now = 100_000) =>
  transition(
    { ...initial(), preferences: { focus: 1, break: 1 } },
    { type: 'start', mode: 'focus', id: 'test-1' },
    now,
  ).state;
const step = (state: State, type: Command['type'], now: number) =>
  transition(state, { type } as Command, now).state;
test('elapsed time uses timestamps and clamps at deadline without refresh callbacks', () => {
  const s = start();
  assert.equal(remaining(s.active!, 130_000), 30_000);
  assert.equal(remaining(s.active!, 999_999), 0);
  const done = step(s, 'reconcile', 999_999);
  assert.equal(done.history[0].finishedAt, 160_000);
  assert.equal(done.history[0].actualMs, 60_000);
  assert.equal(done.active, null);
});
test('pause excludes all paused time through restart, repeated resume and completion', () => {
  let s = start();
  s = step(s, 'pause', 110_000);
  assert.equal(elapsed(s.active!, 1_000_000), 10_000);
  s = JSON.parse(JSON.stringify(s));
  s = step(s, 'reconcile', 1_000_000);
  assert.equal(s.active?.status, 'paused');
  s = step(s, 'resume', 1_000_000);
  s = step(s, 'resume', 1_001_000);
  s = step(s, 'reconcile', 1_100_000);
  assert.equal(s.history[0].actualMs, 60_000);
  assert.equal(s.history[0].finishedAt, 1_050_000);
});
test('completion is idempotent over repeated reconciliation and serialization', () => {
  let s = start();
  for (let i = 0; i < 10; i++)
    s = step(JSON.parse(JSON.stringify(s)), 'reconcile', 200_000 + i);
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].id, 'test-1');
});
test('pause or cancel on the exact deadline completes instead of losing a session', () => {
  for (const action of ['pause', 'cancel'] as const) {
    const s = step(start(), action, 160_000);
    assert.equal(s.history[0].status, 'completed');
  }
});
test('cancelled duration excludes pauses, remains bounded and retains mode', () => {
  let s = start();
  s = step(s, 'pause', 110_000);
  s = step(s, 'cancel', 999_999);
  assert.equal(s.history[0].actualMs, 10_000);
  assert.equal(s.history[0].status, 'cancelled');
  assert.equal(s.history[0].mode, 'focus');
});
test('settings do not change the active duration, replacement must be explicit', () => {
  const s = transition(
    start(),
    { type: 'preferences', preferences: { focus: 180, break: 60 } },
    111_000,
  ).state;
  assert.equal(s.active?.plannedMs, 60_000);
  assert.throws(() =>
    transition(s, { type: 'start', mode: 'break', id: 'next' }, 112_000),
  );
  const cancelled = step(s, 'cancel', 112_000);
  const next = transition(
    cancelled,
    { type: 'start', mode: 'break', id: 'next' },
    113_000,
  ).state;
  assert.equal(next.active?.plannedMs, 3_600_000);
  assert.equal(next.history.length, 1);
});
test('clearing history leaves active timer and preferences intact', () => {
  let s = step(start(), 'cancel', 111_000);
  s = transition(
    s,
    { type: 'start', mode: 'break', id: 'next' },
    112_000,
  ).state;
  const cleared = transition(s, { type: 'clear' }, 113_000);
  assert.deepEqual(cleared.state.active, s.active);
  assert.deepEqual(cleared.state.preferences, s.preferences);
  assert.equal(cleared.state.history.length, 0);
  assert.equal(cleared.clear, true);
});
test('restart with wall clock rollback freezes lost interval then reanchors once', () => {
  const change = transition(start(), { type: 'reconcile' }, 90_000);
  assert.equal(change.events[0].kind, 'clock-reanchored');
  assert.equal(remaining(change.state.active!, 100_000), 50_000);
  assert.equal(
    transition(change.state, { type: 'reconcile' }, 100_000).events.length,
    0,
  );
});
test('monotonic process clock ignores forward and backward wall changes', () => {
  let wall = 100_000,
    mono = 10;
  const clock = createClock(
    () => wall,
    () => mono,
  );
  assert.equal(clock(), 100_000);
  wall += 50_000;
  mono += 1_000;
  assert.equal(clock(), 101_000);
  wall = 0;
  mono += 1_000;
  assert.equal(clock(), 102_000);
  mono = 0;
  assert.equal(clock(), 102_000);
});
test('hydration validators reject malformed and incompatible values', () => {
  for (const p of [
    { focus: 0, break: 1 },
    { focus: 1.2, break: 5 },
    { focus: 1, break: 61 },
    null,
  ])
    assert.equal(validPreferences(p), false);
  for (const s of [
    { ...start().active, elapsedMs: -1 },
    { ...start().active, plannedMs: 1 },
    { ...start().active, status: 'complete' },
    { ...start().active, anchor: NaN },
    {},
  ])
    assert.equal(validSession(s), false);
  const r = step(start(), 'reconcile', 200_000).history[0];
  assert.ok(validRecord(r));
  assert.equal(validRecord({ ...r, actualMs: 59_000 }), false);
});
test('history retains newest 500 and duplicate IDs cannot replace a result', () => {
  let s = start();
  s = step(s, 'cancel', 110_000);
  assert.throws(() =>
    transition(s, { type: 'start', mode: 'focus', id: 'test-1' }, 111_000),
  );
  for (let i = 0; i < 510; i++) {
    s = transition(
      s,
      { type: 'start', mode: 'focus', id: `s-${i}` },
      200_000 + i * 100,
    ).state;
    s = step(s, 'cancel', 200_001 + i * 100);
  }
  assert.equal(s.history.length, 500);
  assert.equal(s.history[0].id, 's-509');
});
