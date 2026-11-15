import { describe, expect, it } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { createSampleMast2Project } from '../src/entities/project/mast2Baseline';
import { createWorkerApp } from '../worker/index';
import type { Env } from '../worker/types';

interface StoredR2Obj {
  bytes: Uint8Array;
  httpMetadata?: Record<string, string>;
  etag: string;
  uploaded: Date;
}

function createMockR2Bucket() {
  const objects = new Map<string, StoredR2Obj>();

  const bucket = {
    async put(
      key: string,
      value: ArrayBuffer | Uint8Array | string,
      options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
    ) {
      const bytes =
        value instanceof Uint8Array
          ? new Uint8Array(value)
          : typeof value === 'string'
            ? new TextEncoder().encode(value)
            : new Uint8Array(value);
      objects.set(key, {
        bytes,
        httpMetadata: options?.httpMetadata as Record<string, string> | undefined,
        etag: `etag-${objects.size + 1}`,
        uploaded: new Date(),
      });
      return {
        key,
        size: bytes.byteLength,
        httpEtag: `etag-${objects.size}`,
      };
    },
    async get(key: string) {
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        key,
        size: entry.bytes.byteLength,
        httpEtag: entry.etag,
        body: entry.bytes,
        writeHttpMetadata(headers: Headers) {
          if (entry.httpMetadata?.contentType) {
            headers.set('Content-Type', entry.httpMetadata.contentType);
          }
        },
      };
    },
    async delete(key: string) {
      objects.delete(key);
    },
    async list() {
      return {
        objects: Array.from(objects.entries()).map(([key, val]) => ({
          key,
          size: val.bytes.byteLength,
          httpMetadata: val.httpMetadata,
          uploaded: val.uploaded,
        })),
        truncated: false,
      };
    },
  };

  return {
    bucket: bucket as unknown as R2Bucket,
    keys: () => Array.from(objects.keys()),
  };
}

function createMockD1(): D1Database {
  const projects = new Map<string, Record<string, unknown>>();
  const mediaObjects = new Map<string, Record<string, unknown>>();
  const adminUsers = new Map<string, Record<string, unknown>>();
  const adminSessions = new Map<string, Record<string, unknown>>();
  const loginAttempts = new Map<string, Record<string, unknown>>();

  const execSql = (rawSql: string, params: unknown[]) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('SELECT COUNT(*) AS cnt FROM admin_users')) {
      return { rows: [{ cnt: adminUsers.size }] };
    }
    if (sql.startsWith('INSERT OR IGNORE INTO admin_users')) {
      const [id, username, display_name, password_hash, created_at, updated_at] = params;
      if (!adminUsers.has(String(id))) {
        adminUsers.set(String(id), {
          id,
          username,
          display_name,
          password_hash,
          created_at,
          updated_at,
        });
      }
      return { rows: [] };
    }
    if (sql.includes('FROM admin_users WHERE LOWER(username) = ?')) {
      const uname = String(params[0]).toLowerCase();
      const found = Array.from(adminUsers.values()).find(
        (u) => String(u.username).toLowerCase() === uname
      );
      return { rows: found ? [found] : [] };
    }
    if (sql.startsWith('SELECT attempts, locked_until FROM login_attempts')) {
      const row = loginAttempts.get(String(params[0]));
      return { rows: row ? [row] : [] };
    }
    if (sql.startsWith('SELECT attempts FROM login_attempts')) {
      const row = loginAttempts.get(String(params[0]));
      return { rows: row ? [{ attempts: row.attempts }] : [] };
    }
    if (sql.startsWith('DELETE FROM login_attempts WHERE ip_key = ?')) {
      loginAttempts.delete(String(params[0]));
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO login_attempts')) {
      const [ip_key, attempts, locked_until] = params;
      loginAttempts.set(String(ip_key), { ip_key, attempts, locked_until });
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM admin_sessions WHERE expires_at <= ?')) {
      const cutoff = String(params[0]);
      for (const [k, s] of adminSessions.entries()) {
        if (String(s.expires_at) <= cutoff) adminSessions.delete(k);
      }
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO admin_sessions')) {
      const [token_hash, user_id, expires_at, created_at] = params;
      adminSessions.set(String(token_hash), {
        token_hash,
        user_id,
        expires_at,
        created_at,
      });
      return { rows: [] };
    }
    if (sql.includes('FROM admin_sessions s JOIN admin_users u')) {
      const session = adminSessions.get(String(params[0]));
      if (!session) return { rows: [] };
      const user = adminUsers.get(String(session.user_id));
      if (!user) return { rows: [] };
      return {
        rows: [
          {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            expires_at: session.expires_at,
          },
        ],
      };
    }
    if (sql.startsWith('DELETE FROM admin_sessions WHERE token_hash = ?')) {
      adminSessions.delete(String(params[0]));
      return { rows: [] };
    }
    if (sql.includes('FROM projects WHERE client_visible = 1 ORDER BY')) {
      const list = Array.from(projects.values())
        .filter((p) => Number(p.client_visible) === 1)
        .sort((a, b) => Number(b.client_featured) - Number(a.client_featured));
      return { rows: list };
    }
    if (sql.includes('FROM projects WHERE client_visible = 1 AND (id = ? OR slug = ?)')) {
      const [idOrSlug] = params;
      const found = Array.from(projects.values()).find(
        (p) =>
          Number(p.client_visible) === 1 &&
          (p.id === idOrSlug || p.slug === idOrSlug)
      );
      return { rows: found ? [found] : [] };
    }
    if (sql.startsWith('SELECT id FROM projects WHERE slug = ? AND id != ?')) {
      const [slug, excludeId] = params;
      const found = Array.from(projects.values()).find(
        (p) => p.slug === slug && p.id !== excludeId
      );
      return { rows: found ? [{ id: found.id }] : [] };
    }
    if (sql.startsWith('SELECT id, client_settings_json FROM projects WHERE client_featured = 1 AND id != ?')) {
      const [activeId] = params;
      const rows = Array.from(projects.values())
        .filter((p) => Number(p.client_featured) === 1 && p.id !== activeId)
        .map((p) => ({
          id: p.id,
          client_settings_json: p.client_settings_json,
        }));
      return { rows };
    }
    if (sql.startsWith('UPDATE projects SET client_featured = 0, client_settings_json = ? WHERE id = ?')) {
      const [json, id] = params;
      const row = projects.get(String(id));
      if (row) {
        row.client_featured = 0;
        row.client_settings_json = json;
      }
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM projects ORDER BY updated_at DESC')) {
      return { rows: Array.from(projects.values()) };
    }
    if (sql.startsWith('SELECT * FROM projects WHERE id = ?')) {
      const row = projects.get(String(params[0]));
      return { rows: row ? [row] : [] };
    }
    if (sql.startsWith('SELECT id FROM projects WHERE id = ?')) {
      const row = projects.get(String(params[0]));
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (sql.startsWith('SELECT 1 AS ok FROM projects WHERE id = ?')) {
      return { rows: projects.has(String(params[0])) ? [{ ok: 1 }] : [] };
    }
    if (sql.startsWith('INSERT INTO projects')) {
      const [
        id,
        slug,
        name,
        project_type,
        client_visible,
        client_featured,
        client_settings_json,
        state_json,
        created_at,
        updated_at,
      ] = params;
      projects.set(String(id), {
        id,
        slug,
        name,
        project_type,
        client_visible,
        client_featured,
        client_settings_json,
        state_json,
        version: 1,
        created_at,
        updated_at,
      });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE projects SET slug = ?, name = ?')) {
      const [
        slug,
        name,
        project_type,
        client_visible,
        client_featured,
        client_settings_json,
        state_json,
        version,
        updated_at,
        id,
      ] = params;
      const row = projects.get(String(id));
      if (row) {
        Object.assign(row, {
          slug,
          name,
          project_type,
          client_visible,
          client_featured,
          client_settings_json,
          state_json,
          version,
          updated_at,
        });
      }
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE projects SET slug = ?, client_visible = ?')) {
      const [slug, client_visible, client_featured, client_settings_json, updated_at, id] =
        params;
      const row = projects.get(String(id));
      if (row) {
        Object.assign(row, {
          slug,
          client_visible,
          client_featured,
          client_settings_json,
          version: Number(row.version) + 1,
          updated_at,
        });
      }
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM projects WHERE id = ?')) {
      projects.delete(String(params[0]));
      return { rows: [] };
    }
    if (sql.includes('SUM(size_bytes)')) {
      let usedBytes = 0;
      for (const m of mediaObjects.values()) {
        usedBytes += Number(m.size_bytes ?? 0);
      }
      return { rows: [{ usedBytes, objectCount: mediaObjects.size }] };
    }
    if (sql.startsWith('SELECT object_key, size_bytes FROM media_objects')) {
      return {
        rows: Array.from(mediaObjects.values()).map((m) => ({
          object_key: m.object_key,
          size_bytes: m.size_bytes,
        })),
      };
    }
    if (sql.startsWith('INSERT INTO media_objects') || sql.startsWith('INSERT OR IGNORE INTO media_objects')) {
      const [object_key, project_id, category, content_type, size_bytes, original_name, created_at] =
        params;
      mediaObjects.set(String(object_key), {
        object_key,
        project_id,
        category,
        content_type,
        size_bytes,
        original_name,
        created_at,
      });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE media_objects SET project_id = ? WHERE object_key = ?')) {
      const [project_id, object_key] = params;
      const m = mediaObjects.get(String(object_key));
      if (m) m.project_id = project_id;
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE media_objects SET size_bytes = ? WHERE object_key = ?')) {
      const [size_bytes, object_key] = params;
      const m = mediaObjects.get(String(object_key));
      if (m) m.size_bytes = size_bytes;
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM media_objects WHERE object_key = ?')) {
      mediaObjects.delete(String(params[0]));
      return { rows: [] };
    }
    if (sql.startsWith('SELECT COUNT(*) AS cnt FROM projects WHERE state_json LIKE ?')) {
      const needle = String(params[0]).replace(/^%|%$/g, '');
      const cnt = Array.from(projects.values()).filter((p) =>
        String(p.state_json).includes(needle)
      ).length;
      return { rows: [{ cnt }] };
    }

    throw new Error(`Unhandled SQL in mock D1: ${sql}`);
  };

  const makeStmt = (sql: string, bound: unknown[] = []) => ({
    bind: (...args: unknown[]) => makeStmt(sql, args),
    async first<T = Record<string, unknown>>() {
      const { rows } = execSql(sql, bound);
      return (rows[0] as T | undefined) ?? null;
    },
    async all<T = Record<string, unknown>>() {
      const { rows } = execSql(sql, bound);
      return { results: rows as T[], success: true, meta: {} };
    },
    async run() {
      execSql(sql, bound);
      return { results: [], success: true, meta: {} };
    },
  });

  return {
    prepare: (sql: string) => makeStmt(sql),
  } as unknown as D1Database;
}

function makeTestEnv(overrides: Partial<Env> = {}) {
  const mockR2 = createMockR2Bucket();
  const env: Env = {
    DB: createMockD1(),
    IMAGES_BUCKET: mockR2.bucket,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'StrongPassword123!',
    ADMIN_DISPLAY_NAME: 'Field Admin',
    R2_QUOTA_BYTES: '10000',
    R2_WARN_REMAINING_BYTES: '2000',
    R2_BLOCK_REMAINING_BYTES: '1000',
    ...overrides,
  };
  return { env, mockR2 };
}

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/mast_admin_session=[^;]+/);
  return match ? match[0] : '';
}

describe('Cloudflare Worker API Integration', () => {
  const app = createWorkerApp();

  it('enforces admin authentication on protected routes and supports login/logout', async () => {
    const { env } = makeTestEnv();

    const unauth = await app.request('/api/admin/projects', undefined, env);
    expect(unauth.status).toBe(401);

    const badLogin = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      },
      env
    );
    expect(badLogin.status).toBe(401);

    const okLogin = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'StrongPassword123!' }),
      },
      env
    );
    expect(okLogin.status).toBe(200);
    const cookie = extractSessionCookie(okLogin);
    expect(cookie).toContain('mast_admin_session=');

    const meRes = await app.request(
      '/api/auth/me',
      { headers: { Cookie: cookie } },
      env
    );
    const meJson = (await meRes.json()) as { authenticated: boolean; user: { username: string } };
    expect(meJson.authenticated).toBe(true);
    expect(meJson.user.username).toBe('admin');

    const logoutRes = await app.request(
      '/api/auth/logout',
      { method: 'POST', headers: { Cookie: cookie } },
      env
    );
    expect(logoutRes.status).toBe(200);

    const afterLogout = await app.request(
      '/api/admin/projects',
      { headers: { Cookie: cookie } },
      env
    );
    expect(afterLogout.status).toBe(401);
  });

  it('publishes only client-visible sanitized DTOs and toggles visibility via admin API', async () => {
    const { env } = makeTestEnv();

    const loginRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'StrongPassword123!' }),
      },
      env
    );
    const cookie = extractSessionCookie(loginRes);

    const privateState = createSampleMast2Project();
    privateState.projectName = 'Private Relay Tower';
    privateState.haulerPayouts = [
      { id: 'hp1', date: '2026-01-01', haulerName: 'INTERNAL_SECRET', amountPhp: 5000 },
    ];

    const createRes = await app.request(
      '/api/admin/projects',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          id: 'proj-1',
          state: privateState,
          clientSettings: { enabled: false, featured: false, slug: 'private-relay' },
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);

    // Client endpoint should return empty array while disabled
    const hiddenClientRes = await app.request('/api/client/projects', undefined, env);
    const hiddenClientJson = (await hiddenClientRes.json()) as { projects: unknown[] };
    expect(hiddenClientJson.projects).toHaveLength(0);

    // Enable client showcase via PATCH
    const patchRes = await app.request(
      '/api/admin/projects/proj-1/visibility',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled: true, featured: true }),
      },
      env
    );
    expect(patchRes.status).toBe(200);

    const visibleRes = await app.request('/api/client/projects', undefined, env);
    const visibleBodyText = await visibleRes.text();
    const visibleJson = JSON.parse(visibleBodyText) as {
      projects: Array<{ slug: string; projectName: string }>;
    };
    expect(visibleJson.projects).toHaveLength(1);
    expect(visibleJson.projects[0].slug).toBe('private-relay');
    expect(visibleBodyText).not.toContain('INTERNAL_SECRET');
  });

  it('enforces R2 warning at <= 1 GB equiv, blocks uploads at < 100 MB equiv, serves images, and cleans orphaned media', async () => {
    const { env, mockR2 } = makeTestEnv();

    const loginRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'StrongPassword123!' }),
      },
      env
    );
    const cookie = extractSessionCookie(loginRes);

    const uploadFile = async (byteLen: number) => {
      const form = new FormData();
      form.append('projectId', 'proj-img');
      form.append('category', 'daily_log');
      form.append(
        'file',
        new File([new Uint8Array(byteLen)], 'photo.jpg', { type: 'image/jpeg' })
      );
      return app.request(
        '/api/admin/images/upload',
        {
          method: 'POST',
          headers: { Cookie: cookie },
          body: form,
        },
        env
      );
    };

    // Upload #1: 8,200 / 10,000 bytes -> 1,800 remaining (<= 2,000 warning, >= 1,000 min reserve)
    const warnUpload = await uploadFile(8200);
    expect(warnUpload.status).toBe(201);
    const warnJson = (await warnUpload.json()) as {
      url: string;
      storage: { level: string; remainingBytes: number; message: string | null };
    };
    expect(warnJson.storage.level).toBe('warning');
    expect(warnJson.storage.remainingBytes).toBe(1800);
    expect(warnJson.storage.message).toContain('Low Cloudflare R2 storage space');

    // Same-origin image retrieval succeeds
    const imgRes = await app.request(warnJson.url, undefined, env);
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get('Content-Type')).toBe('image/jpeg');

    // Upload #2: 900 bytes would leave 900 bytes (< 1,000 min reserve) -> 507 R2_STORAGE_BLOCKED
    const blockedUpload = await uploadFile(900);
    expect(blockedUpload.status).toBe(507);
    const blockedJson = (await blockedUpload.json()) as { code: string; error: string };
    expect(blockedJson.code).toBe('R2_STORAGE_BLOCKED');
    expect(blockedJson.error).toContain('blocked');

    // Save project referencing the uploaded image URL, then delete project -> R2 object gets cleaned up
    const state = createSampleMast2Project();
    state.dailyLogs = [
      {
        id: 'dl-1',
        date: '2026-01-10',
        dayNumber: 1,
        weather: 'Sunny',
        activitiesSummary: 'Site photo test',
        foundationsWorked: [],
        workers: [],
        totalWorkers: 0,
        totalManHours: 0,
        cementUsedBags: 0,
        sandUsedBags: 0,
        gravelUsedBags: 0,
        documentationItems: [{ id: 'doc-1', photoDataUrl: warnJson.url, description: 'test' }],
        issuesOrDelays: '',
      },
    ];
    await app.request(
      '/api/admin/projects',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ id: 'proj-img', state }),
      },
      env
    );
    expect(mockR2.keys()).toHaveLength(1);

    const delRes = await app.request(
      '/api/admin/projects/proj-img',
      { method: 'DELETE', headers: { Cookie: cookie } },
      env
    );
    const delJson = (await delRes.json()) as {
      ok: boolean;
      deletedMediaCount: number;
      storage: { usedBytes: number; objectCount: number };
    };
    expect(delJson.ok).toBe(true);
    expect(delJson.deletedMediaCount).toBe(1);
    expect(delJson.storage.usedBytes).toBe(0);
    expect(mockR2.keys()).toHaveLength(0);
  });
});
