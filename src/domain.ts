export type Mode = 'focus' | 'break';
export type Preferences = { focus: number; break: number };
export type Session = {
  id: string;
  mode: Mode;
  plannedMs: number;
  startedAt: number;
  elapsedMs: number;
  anchor: number;
  status: 'running' | 'paused';
};
export type Record = Omit<Session, 'anchor' | 'status' | 'elapsedMs'> & {
  actualMs: number;
  finishedAt: number;
  status: 'completed' | 'cancelled';
};
export type State = {
  preferences: Preferences;
  active: Session | null;
  history: Record[];
};
export type Event = { sessionId: string; kind: string; at: number };
export type Change = { state: State; events: Event[]; clear?: boolean };
export type Command =
  | { type: 'start'; mode: Mode; id: string }
  | { type: 'pause' | 'resume' | 'cancel' | 'reconcile' | 'clear' }
  | { type: 'preferences'; preferences: Preferences };
export const defaults: Preferences = { focus: 25, break: 5 };
export const initial = (): State => ({
  preferences: { ...defaults },
  active: null,
  history: [],
});
const integer = (
  v: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const object = (v: unknown): v is { [key: string]: unknown } =>
  typeof v === 'object' && v !== null;
export function validPreferences(v: unknown): v is Preferences {
  return object(v) && integer(v.focus, 1, 180) && integer(v.break, 1, 60);
}
function base(v: unknown): v is Session {
  return (
    object(v) &&
    typeof v.id === 'string' &&
    /^[a-zA-Z0-9-]{1,90}$/.test(v.id) &&
    (v.mode === 'focus' || v.mode === 'break') &&
    integer(v.plannedMs, 60_000, (v.mode === 'focus' ? 180 : 60) * 60_000) &&
    v.plannedMs % 60_000 === 0 &&
    integer(v.startedAt, 0, 8_000_000_000_000_000)
  );
}
export function validSession(v: unknown): v is Session {
  return (
    base(v) &&
    integer(v.elapsedMs, 0, v.plannedMs) &&
    integer(v.anchor, 0, 8_000_000_000_000_000) &&
    (v.status === 'running' || v.status === 'paused')
  );
}
export function validRecord(v: unknown): v is Record {
  if (!base(v)) return false;
  const r = v as unknown as Record;
  return (
    integer(r.actualMs, 0, r.plannedMs) &&
    integer(r.finishedAt, r.startedAt, 8_000_000_000_000_000) &&
    (r.status === 'completed'
      ? r.actualMs === r.plannedMs
      : r.status === 'cancelled')
  );
}
export function elapsed(s: Session, now: number): number {
  return Math.min(
    s.plannedMs,
    s.elapsedMs + (s.status === 'running' ? Math.max(0, now - s.anchor) : 0),
  );
}
export function remaining(s: Session, now: number): number {
  return s.plannedMs - elapsed(s, now);
}
export function transition(
  input: State,
  command: Command,
  now: number,
): Change {
  let state = { ...input };
  const events: Event[] = [];
  const add = (s: Session, kind: string, at = now) =>
    events.push({ sessionId: s.id, kind, at });
  const finish = (s: Session, status: Record['status']) => {
    const actualMs = elapsed(s, now);
    const finishedAt = Math.max(
      s.startedAt,
      status === 'completed' ? s.anchor + s.plannedMs - s.elapsedMs : now,
    );
    const record: Record = {
      id: s.id,
      mode: s.mode,
      plannedMs: s.plannedMs,
      startedAt: s.startedAt,
      actualMs,
      finishedAt,
      status,
    };
    state = {
      ...state,
      active: null,
      history: [record, ...state.history.filter((r) => r.id !== s.id)]
        .sort((a, b) => b.finishedAt - a.finishedAt)
        .slice(0, 500),
    };
    add(s, status, finishedAt);
  };
  let s = state.active;
  if (s?.status === 'running' && elapsed(s, now) >= s.plannedMs)
    finish(s, 'completed');
  s = state.active;
  if (s && now < s.anchor && s.status === 'running') {
    s = { ...s, anchor: now };
    state.active = s;
    add(s, 'clock-reanchored');
  }
  switch (command.type) {
    case 'start':
      if (state.active)
        throw new Error('Cancel the current session before replacing it.');
      if (
        !/^[a-zA-Z0-9-]{1,90}$/.test(command.id) ||
        state.history.some((r) => r.id === command.id)
      )
        throw new Error('Session ID must be unique.');
      state.active = {
        id: command.id,
        mode: command.mode,
        plannedMs: state.preferences[command.mode] * 60_000,
        startedAt: now,
        elapsedMs: 0,
        anchor: now,
        status: 'running',
      };
      add(state.active, 'started');
      break;
    case 'pause':
      if (s?.status === 'running') {
        state.active = {
          ...s,
          elapsedMs: elapsed(s, now),
          anchor: now,
          status: 'paused',
        };
        add(s, 'paused');
      }
      break;
    case 'resume':
      if (s?.status === 'paused') {
        state.active = { ...s, anchor: now, status: 'running' };
        add(s, 'resumed');
      }
      break;
    case 'cancel':
      if (s) finish(s, 'cancelled');
      break;
    case 'preferences':
      if (!validPreferences(command.preferences))
        throw new Error('Enter whole minutes within the supported ranges.');
      state.preferences = { ...command.preferences };
      break;
    case 'clear':
      state.history = [];
      return { state, events, clear: true };
  }
  return { state, events };
}

// Ignore wall-clock adjustments while this process lives. Persisted anchors are wall timestamps.
export function createClock(
  wall: () => number,
  monotonic: () => number,
): () => number {
  const origin = wall();
  const start = monotonic();
  let last = origin;
  return () =>
    (last = Math.max(last, Math.round(origin + monotonic() - start)));
}
