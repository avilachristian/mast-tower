import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { D1Database } from '../../worker/cloudflareTypes';

/** Real SQLite transactions and JSON functions, exposed through D1's async API. */
export function createTestD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const name of readdirSync(resolve('migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(resolve('migrations', name), 'utf8'));
  let queryCount = 0;
  const statement = (sql: string, args: unknown[] = []) => {
    const exec = () => {
      queryCount++;
      const prepared = sqlite.prepare(sql);
      const params = args.map((v) => (v === undefined ? null : v)) as (
        string | number | null | Uint8Array
      )[];
      if (prepared.columns().length) {
        const results = prepared.all(...params);
        return { results, success: true, meta: { changes: 0 } };
      }
      const result = prepared.run(...params);
      return {
        results: [],
        success: true,
        meta: {
          changes: Number(result.changes),
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    };
    return {
      bind: (...values: unknown[]) => statement(sql, values),
      all: async () => exec(),
      run: async () => exec(),
      first: async (column?: string) => {
        const row = exec().results[0] as Record<string, unknown> | undefined;
        return column ? (row?.[column] ?? null) : (row ?? null);
      },
      _exec: exec,
    };
  };
  function insert(table: string, row: Record<string, unknown>) {
    const keys = Object.keys(row);
    sqlite
      .prepare(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
      )
      .run(...(Object.values(row) as (string | number | null)[]));
  }
  return {
    prepare: statement,
    batch: async (stmts: ReturnType<typeof statement>[]) => {
      sqlite.exec('BEGIN');
      try {
        const result = stmts.map((s) => s._exec());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    getQueryCount: () => queryCount,
    seedRawMedia: (row: Record<string, unknown>) =>
      insert('media_objects', row),
    seedLegacyProjectWithoutDto: (row: Record<string, unknown>) =>
      insert('projects', row),
    sqlite,
  } as unknown as D1Database & {
    getQueryCount: () => number;
    seedRawMedia: (row: Record<string, unknown>) => void;
    seedLegacyProjectWithoutDto: (row: Record<string, unknown>) => void;
    sqlite: DatabaseSync;
  };
}
