import {
  type Change,
  type State,
  initial,
  validPreferences,
  validRecord,
  validSession,
} from './domain';

export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  withExclusiveTransactionAsync(
    task: (db: Database) => Promise<void>,
  ): Promise<void>;
}
export class HydrationError extends Error {
  constructor(
    message: string,
    public repairable: boolean,
  ) {
    super(message);
  }
}
const parse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
export class SQLiteStore {
  skipped = 0;
  constructor(private db: Database) {}
  async init() {
    await this.db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transitions (seq INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT, kind TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS quarantine (key TEXT, value TEXT);
      INSERT OR IGNORE INTO meta VALUES ('version','1');`);
  }
  async load(): Promise<State> {
    const entries = await this.db.getAllAsync<{ key: string; value: string }>(
      'SELECT * FROM meta',
    );
    const values = new Map(entries.map((r) => [r.key, r.value]));
    if (values.get('version') !== '1')
      throw new HydrationError(
        'This database version is not supported. Keep your data and install a compatible app version.',
        false,
      );
    const state = initial();
    if (values.has('preferences')) {
      const p = parse(values.get('preferences')!);
      if (!validPreferences(p))
        throw new HydrationError(
          'Saved preferences cannot be read. Repair resets preferences and removes the unreadable timer. History is preserved.',
          true,
        );
      state.preferences = p;
    }
    if (values.has('active')) {
      const a = parse(values.get('active')!);
      if (a !== null && !validSession(a))
        throw new HydrationError(
          'The saved timer cannot be read. Repair removes it without creating a result. Preferences and history are preserved.',
          true,
        );
      state.active = a;
    }
    const rows = await this.db.getAllAsync<{ id: string; doc: string }>(
      'SELECT * FROM history',
    );
    this.skipped = 0;
    for (const row of rows) {
      const r = parse(row.doc);
      if (validRecord(r) && r.id === row.id) state.history.push(r);
      else this.skipped++;
    }
    state.history.sort((a, b) => b.finishedAt - a.finishedAt);
    state.history = state.history.slice(0, 500);
    if (state.active && state.history.some((r) => r.id === state.active?.id))
      throw new HydrationError(
        'The timer conflicts with an existing result. Repair removes only the timer; the result is preserved.',
        true,
      );
    return state;
  }
  async repair(): Promise<void> {
    // Quarantine before deleting; no valid history is touched, and no session is fabricated.
    await this.db.withExclusiveTransactionAsync(async (db) => {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        'SELECT * FROM meta',
      );
      if (rows.find((r) => r.key === 'version')?.value !== '1')
        throw new HydrationError('Unsupported database version.', false);
      for (const row of rows) {
        if (
          row.key === 'active' ||
          (row.key === 'preferences' && !validPreferences(parse(row.value)))
        ) {
          await db.runAsync(
            'INSERT INTO quarantine VALUES (?,?)',
            row.key,
            row.value,
          );
          await db.runAsync('DELETE FROM meta WHERE key=?', row.key);
        }
      }
    });
  }
  async save(change: Change): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (db) => {
      await db.runAsync(
        "INSERT OR REPLACE INTO meta VALUES ('active',?)",
        JSON.stringify(change.state.active),
      );
      await db.runAsync(
        "INSERT OR REPLACE INTO meta VALUES ('preferences',?)",
        JSON.stringify(change.state.preferences),
      );
      if (change.clear) await db.runAsync('DELETE FROM history');
      for (const record of change.state.history)
        await db.runAsync(
          'INSERT OR IGNORE INTO history VALUES (?,?)',
          record.id,
          JSON.stringify(record),
        );
      for (const e of change.events)
        await db.runAsync(
          'INSERT INTO transitions(sessionId,kind,at) VALUES (?,?,?)',
          e.sessionId,
          e.kind,
          e.at,
        );
      const rows = await db.getAllAsync<{ id: string; doc: string }>(
        'SELECT * FROM history',
      );
      const valid = rows
        .map((row) => ({ row, value: parse(row.doc) }))
        .filter((entry) => validRecord(entry.value));
      valid.sort(
        (a, b) =>
          (b.value as { finishedAt: number }).finishedAt -
          (a.value as { finishedAt: number }).finishedAt,
      );
      for (const entry of valid.slice(500))
        await db.runAsync('DELETE FROM history WHERE id=?', entry.row.id);
      await db.execAsync(
        'DELETE FROM transitions WHERE seq NOT IN (SELECT seq FROM transitions ORDER BY seq DESC LIMIT 2000);',
      );
    });
  }
}
