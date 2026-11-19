import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer as createViteServer } from 'vite';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  R2Bucket,
  R2ListOptions,
  R2Object,
  R2ObjectBody,
  R2PutOptions,
} from './worker/cloudflareTypes';
import { createWorkerApp } from './worker/index';
import type { Env } from './worker/types';

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function createSqliteD1(dbPath: string, migrationsDir: string): D1Database {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  if (fs.existsSync(migrationsDir)) {
    const appliedRows = sqlite
      .prepare('SELECT name FROM _applied_migrations')
      .all() as Array<{ name: string }>;
    const applied = new Set(appliedRows.map((r) => r.name));
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      sqlite.exec('BEGIN');
      try {
        sqlite.exec(sql);
        sqlite
          .prepare(
            'INSERT INTO _applied_migrations (name, applied_at) VALUES (?, ?)'
          )
          .run(file, new Date().toISOString());
        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    }
  }

  type InternalStatement = D1PreparedStatement & {
    _exec: () => D1Result<Record<string, unknown>>;
  };

  const makeStatement = (sql: string, args: unknown[] = []): InternalStatement => {
    const exec = (): D1Result<Record<string, unknown>> => {
      const prepared = sqlite.prepare(sql);
      const params = args.map((v) => (v === undefined ? null : v)) as Array<
        string | number | null | Uint8Array
      >;
      if (prepared.columns().length > 0) {
        const results = prepared.all(...params) as Record<string, unknown>[];
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
      bind: (...values: unknown[]) => makeStatement(sql, values),
      all: async <T = Record<string, unknown>>() =>
        exec() as unknown as D1Result<T>,
      run: async <T = Record<string, unknown>>() =>
        exec() as unknown as D1Result<T>,
      first: async <T = Record<string, unknown>>(column?: string) => {
        const row = exec().results[0];
        if (!row) return null;
        if (column) {
          return (row[column] ?? null) as T | null;
        }
        return row as unknown as T;
      },
      _exec: exec,
    };
  };

  return {
    prepare: (query: string) => makeStatement(query),
    batch: async <T = unknown>(statements: D1PreparedStatement[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((stmt) =>
          (stmt as InternalStatement)._exec()
        );
        sqlite.exec('COMMIT');
        return results as unknown as D1Result<T>[];
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

interface StoredMeta {
  contentType?: string;
  cacheControl?: string;
  etag: string;
  uploaded: string;
  size: number;
}

function createDiskR2Bucket(rootDir: string): R2Bucket {
  fs.mkdirSync(rootDir, { recursive: true });

  const sanitizeKey = (key: string): string => {
    const clean = key.replace(/^\/+/, '');
    if (!clean || clean.includes('..')) {
      throw new Error(`Invalid object key: ${key}`);
    }
    return clean;
  };

  const dataPathFor = (key: string) => path.join(rootDir, sanitizeKey(key));
  const metaPathFor = (key: string) => `${dataPathFor(key)}.meta.json`;

  const walkKeys = (dir: string, base = ''): string[] => {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const keys: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        keys.push(...walkKeys(full, rel));
      } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
        keys.push(rel);
      }
    }
    return keys.sort();
  };

  return {
    async get(key: string): Promise<R2ObjectBody | null> {
      const filePath = dataPathFor(key);
      if (!fs.existsSync(filePath)) return null;
      const bytes = new Uint8Array(fs.readFileSync(filePath));
      let meta: StoredMeta = {
        etag: `"${bytes.byteLength}"`,
        uploaded: new Date().toISOString(),
        size: bytes.byteLength,
      };
      const metaPath = metaPathFor(key);
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as StoredMeta;
        } catch {
          // ignore malformed metadata
        }
      }
      return {
        key,
        size: bytes.byteLength,
        httpEtag: meta.etag,
        httpMetadata: {
          contentType: meta.contentType,
          cacheControl: meta.cacheControl,
        },
        uploaded: new Date(meta.uploaded),
        body: bytes,
        writeHttpMetadata(headers: Headers) {
          if (meta.contentType) {
            headers.set('Content-Type', meta.contentType);
          }
          if (meta.cacheControl) {
            headers.set('Cache-Control', meta.cacheControl);
          }
        },
      };
    },

    async put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null,
      options?: R2PutOptions
    ): Promise<R2Object> {
      const filePath = dataPathFor(key);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      let bytes: Uint8Array;
      if (value === null) {
        bytes = new Uint8Array(0);
      } else if (typeof value === 'string') {
        bytes = new TextEncoder().encode(value);
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else if (ArrayBuffer.isView(value)) {
        bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
        bytes = new Uint8Array(await value.arrayBuffer());
      } else {
        bytes = new Uint8Array(await new Response(value).arrayBuffer());
      }

      fs.writeFileSync(filePath, bytes);
      const httpMeta =
        options?.httpMetadata instanceof Headers
          ? {
              contentType: options.httpMetadata.get('Content-Type') ?? undefined,
              cacheControl: options.httpMetadata.get('Cache-Control') ?? undefined,
            }
          : options?.httpMetadata;

      const meta: StoredMeta = {
        contentType: httpMeta?.contentType,
        cacheControl: httpMeta?.cacheControl,
        etag: `"${Date.now().toString(36)}-${bytes.byteLength}"`,
        uploaded: new Date().toISOString(),
        size: bytes.byteLength,
      };
      fs.writeFileSync(metaPathFor(key), JSON.stringify(meta), 'utf8');

      return {
        key,
        size: bytes.byteLength,
        httpEtag: meta.etag,
        httpMetadata: httpMeta,
        uploaded: new Date(meta.uploaded),
      };
    },

    async delete(keys: string | string[]): Promise<void> {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        try {
          const filePath = dataPathFor(key);
          const metaPath = metaPathFor(key);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        } catch {
          // ignore missing/invalid keys
        }
      }
    },

    async list(options?: R2ListOptions) {
      const allKeys = walkKeys(rootDir);
      const filtered = options?.prefix
        ? allKeys.filter((k) => k.startsWith(options.prefix!))
        : allKeys;
      const limit = options?.limit ?? 1000;
      const startIdx = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
      const slice = filtered.slice(startIdx, startIdx + limit);
      const objects: R2Object[] = slice.map((key) => {
        const filePath = dataPathFor(key);
        const stat = fs.statSync(filePath);
        let meta: Partial<StoredMeta> = {};
        const metaPath = metaPathFor(key);
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as StoredMeta;
          } catch {
            // ignore
          }
        }
        return {
          key,
          size: stat.size,
          httpEtag: meta.etag ?? `"${stat.size}"`,
          httpMetadata: {
            contentType: meta.contentType,
            cacheControl: meta.cacheControl,
          },
          uploaded: meta.uploaded ? new Date(meta.uploaded) : stat.mtime,
        };
      });
      const nextIdx = startIdx + slice.length;
      return {
        objects,
        truncated: nextIdx < filtered.length,
        cursor: nextIdx < filtered.length ? String(nextIdx) : undefined,
      };
    },
  };
}

async function readRawBody(req: express.Request): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function startServer(): Promise<void> {
  const rootDir = import.meta.dirname;
  loadEnvFile(path.join(rootDir, '.env'));
  loadEnvFile(path.join(rootDir, '.dev.vars'));

  const dataDir = path.join(rootDir, '.data');
  fs.mkdirSync(dataDir, { recursive: true });

  const db = createSqliteD1(
    path.join(dataDir, 'mast-tower.db'),
    path.join(rootDir, 'migrations')
  );
  const bucket = createDiskR2Bucket(path.join(dataDir, 'r2'));

  const env: Env = {
    DB: db,
    IMAGES_BUCKET: bucket,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin',
    ADMIN_DISPLAY_NAME: process.env.ADMIN_DISPLAY_NAME || 'Project Admin',
    R2_QUOTA_BYTES: process.env.R2_QUOTA_BYTES || '10000000000',
    R2_WARN_REMAINING_BYTES: process.env.R2_WARN_REMAINING_BYTES || '1000000000',
    R2_BLOCK_REMAINING_BYTES: process.env.R2_BLOCK_REMAINING_BYTES || '100000000',
  };

  const workerApp = createWorkerApp({ edgeCache: null });
  const app = express();
  app.set('trust proxy', true);

  app.use('/api', async (req, res, next) => {
    try {
      const proto =
        (req.headers['x-forwarded-proto'] as string | undefined)
          ?.split(',')[0]
          ?.trim() ||
        req.protocol ||
        'http';
      const host =
        (req.headers['x-forwarded-host'] as string | undefined) ||
        req.headers.host ||
        'localhost:3000';
      const url = `${proto}://${host}${req.originalUrl}`;

      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val === undefined) continue;
        if (Array.isArray(val)) {
          for (const item of val) headers.append(key, item);
        } else {
          headers.set(key, val);
        }
      }

      const rawBody = await readRawBody(req);
      const webReq = new Request(url, {
        method: req.method,
        headers,
        body: rawBody ? new Uint8Array(rawBody) : undefined,
      });

      const webRes = await workerApp.fetch(webReq, env);

      res.status(webRes.status);
      const setCookies = webRes.headers.getSetCookie?.() ?? [];
      webRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return;
        res.setHeader(key, value);
      });
      if (setCookies.length > 0) {
        res.setHeader('Set-Cookie', setCookies);
      }

      if (webRes.body) {
        const buf = Buffer.from(await webRes.arrayBuffer());
        res.send(buf);
      } else {
        res.end();
      }
    } catch (err) {
      next(err);
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = isProd ? Number(process.env.PORT) || 3000 : 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Mast Tower server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
