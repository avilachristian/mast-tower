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
    async delete(keyOrKeys: string | string[]) {
      if (Array.isArray(keyOrKeys)) {
        for (const k of keyOrKeys) objects.delete(k);
      } else {
        objects.delete(keyOrKeys);
      }
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

function createMockEdgeCache() {
  const store = new Map<string, Response>();
  const cache = {
    async match(req: RequestInfo | URL) {
      const url = typeof req === 'string' ? req : req instanceof URL ? req.toString() : req.url;
      const hit = store.get(url);
      return hit ? hit.clone() : undefined;
    },
    async put(req: RequestInfo | URL, res: Response) {
      const url = typeof req === 'string' ? req : req instanceof URL ? req.toString() : req.url;
      store.set(url, res.clone());
    },
    async delete(req: RequestInfo | URL) {
      const url = typeof req === 'string' ? req : req instanceof URL ? req.toString() : req.url;
      return store.delete(url);
    },
  };
  return {
    cache: cache as unknown as Cache,
    size: () => store.size,
  };
}

function createMockD1() {
  const projects = new Map<string, Record<string, unknown>>();
  const mediaObjects = new Map<string, Record<string, unknown>>();
  const projectMedia = new Set<string>(); // `${project_id}::${object_key}`
  const storageCounters = { id: 1, total_bytes: 0, object_count: 0, updated_at: '' };
  let hasStorageCounter = true;
  const adminUsers = new Map<string, Record<string, unknown>>();
  const adminSessions = new Map<string, Record<string, unknown>>();
  const loginAttempts = new Map<string, Record<string, unknown>>();
  let queryCount = 0;

  const execSql = (rawSql: string, params: unknown[]) => {
    queryCount += 1;
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
    if (sql.includes("json_extract(client_dto_json, '$.projectName')") && sql.includes('FROM projects WHERE client_visible = 1 ORDER BY')) {
      const list = Array.from(projects.values())
        .filter((p) => Number(p.client_visible) === 1)
        .sort((a, b) => Number(b.client_featured) - Number(a.client_featured))
        .map((p) => {
          const dto = p.client_dto_json ? JSON.parse(String(p.client_dto_json)) : null;
          return {
            id: p.id,
            slug: p.slug,
            name: p.name,
            client_featured: p.client_featured,
            version: p.version,
            updated_at: p.updated_at,
            dto_project_name: dto?.projectName ?? null,
            dto_location: dto?.location ?? null,
          };
        });
      return { rows: list };
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
    if (sql.startsWith('SELECT id, slug, client_settings_json, client_dto_json FROM projects WHERE client_featured = 1 AND id != ?')) {
      const [activeId] = params;
      const rows = Array.from(projects.values())
        .filter((p) => Number(p.client_featured) === 1 && p.id !== activeId)
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          client_settings_json: p.client_settings_json,
          client_dto_json: p.client_dto_json,
        }));
      return { rows };
    }
    if (sql.startsWith('UPDATE projects SET client_featured = 0, client_settings_json = ?, client_dto_json = ? WHERE id = ?')) {
      const [json, dtoJson, id] = params;
      const row = projects.get(String(id));
      if (row) {
        row.client_featured = 0;
        row.client_settings_json = json;
        row.client_dto_json = dtoJson;
      }
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE projects SET client_dto_json = ? WHERE id = ?')) {
      const [dtoJson, id] = params;
      const row = projects.get(String(id));
      if (row) row.client_dto_json = dtoJson;
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
        client_dto_json,
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
        client_dto_json,
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
        client_dto_json,
        version,
        updated_at,
        id,
        expected_version,
      ] = params;
      const row = projects.get(String(id));
      if (!row) return { rows: [], changes: 0 };
      if (expected_version !== undefined && row.version !== expected_version) {
        return { rows: [], changes: 0 };
      }
      Object.assign(row, {
        slug,
        name,
        project_type,
        client_visible,
        client_featured,
        client_settings_json,
        state_json,
        client_dto_json,
        version,
        updated_at,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE projects SET slug = ?, client_visible = ?')) {
      const [
        slug,
        client_visible,
        client_featured,
        client_settings_json,
        client_dto_json,
        version,
        updated_at,
        id,
        expected_version,
      ] = params;
      const row = projects.get(String(id));
      if (!row) return { rows: [], changes: 0 };
      if (expected_version !== undefined && row.version !== expected_version) {
        return { rows: [], changes: 0 };
      }
      Object.assign(row, {
        slug,
        client_visible,
        client_featured,
        client_settings_json,
        client_dto_json,
        version,
        updated_at,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('DELETE FROM projects WHERE id = ?')) {
      const pid = String(params[0]);
      projects.delete(pid);
      for (const entry of Array.from(projectMedia)) {
        if (entry.startsWith(`${pid}::`)) projectMedia.delete(entry);
      }
      return { rows: [] };
    }
    if (sql.startsWith('SELECT total_bytes AS usedBytes, object_count AS objectCount FROM storage_counters WHERE id = 1')) {
      return { rows: hasStorageCounter ? [{ usedBytes: storageCounters.total_bytes, objectCount: storageCounters.object_count }] : [] };
    }
    if (sql.startsWith('INSERT INTO storage_counters') && sql.includes('total_bytes = total_bytes + excluded.total_bytes')) {
      const [bytes, updatedAt] = params;
      hasStorageCounter = true;
      storageCounters.total_bytes += Number(bytes);
      storageCounters.object_count += 1;
      storageCounters.updated_at = String(updatedAt);
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO storage_counters')) {
      const [bytes, count, updatedAt] = params;
      hasStorageCounter = true;
      storageCounters.total_bytes = Number(bytes);
      storageCounters.object_count = Number(count);
      storageCounters.updated_at = String(updatedAt);
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE storage_counters SET total_bytes = MAX(0, total_bytes - ?)')) {
      const [freed, cnt, updatedAt] = params;
      storageCounters.total_bytes = Math.max(0, storageCounters.total_bytes - Number(freed));
      storageCounters.object_count = Math.max(0, storageCounters.object_count - Number(cnt));
      storageCounters.updated_at = String(updatedAt);
      return { rows: [] };
    }
    if (sql.includes('SUM(size_bytes)')) {
      let usedBytes = 0;
      for (const m of mediaObjects.values()) {
        usedBytes += Number(m.size_bytes ?? 0);
      }
      return { rows: [{ usedBytes, objectCount: mediaObjects.size }] };
    }
    if (sql.startsWith('SELECT object_key, size_bytes FROM media_objects WHERE object_key IN')) {
      const keySet = new Set(params.map(String));
      return {
        rows: Array.from(mediaObjects.values())
          .filter((m) => keySet.has(String(m.object_key)))
          .map((m) => ({ object_key: m.object_key, size_bytes: m.size_bytes })),
      };
    }
    if (sql.startsWith('SELECT object_key, size_bytes FROM media_objects')) {
      return {
        rows: Array.from(mediaObjects.values()).map((m) => ({
          object_key: m.object_key,
          size_bytes: m.size_bytes,
        })),
      };
    }
    if (sql.startsWith('SELECT m.object_key FROM media_objects m WHERE m.created_at < ?')) {
      const cutoff = String(params[0]);
      const linked = new Set<string>();
      for (const entry of projectMedia) {
        linked.add(entry.split('::').slice(1).join('::'));
      }
      return {
        rows: Array.from(mediaObjects.values())
          .filter((m) => String(m.created_at) < cutoff && !linked.has(String(m.object_key)))
          .map((m) => ({ object_key: m.object_key })),
      };
    }
    if (sql.startsWith('INSERT INTO media_objects') || sql.startsWith('INSERT OR IGNORE INTO media_objects')) {
      const [object_key, project_id, category, content_type, size_bytes, original_name, created_at] =
        params;
      if (!mediaObjects.has(String(object_key))) {
        mediaObjects.set(String(object_key), {
          object_key,
          project_id,
          category,
          content_type,
          size_bytes,
          original_name,
          created_at,
        });
      }
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE media_objects SET project_id = NULL WHERE project_id = ?')) {
      const pid = String(params[0]);
      for (const m of mediaObjects.values()) {
        if (m.project_id === pid) m.project_id = null;
      }
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE media_objects SET project_id = ? WHERE object_key IN')) {
      const project_id = params[0];
      const keys = new Set(params.slice(1, -1).map(String));
      for (const k of keys) {
        const m = mediaObjects.get(k);
        if (m && (m.project_id === null || m.project_id !== project_id)) {
          m.project_id = project_id;
        }
      }
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
    if (sql.startsWith('DELETE FROM media_objects WHERE object_key IN')) {
      for (const k of params) mediaObjects.delete(String(k));
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM media_objects WHERE object_key = ?')) {
      mediaObjects.delete(String(params[0]));
      return { rows: [] };
    }
    if (sql.startsWith('SELECT object_key FROM project_media WHERE project_id = ?')) {
      const pid = String(params[0]);
      const prefix = `${pid}::`;
      return {
        rows: Array.from(projectMedia)
          .filter((e) => e.startsWith(prefix))
          .map((e) => ({ object_key: e.slice(prefix.length) })),
      };
    }
    if (sql.startsWith('SELECT DISTINCT object_key FROM project_media WHERE object_key IN')) {
      const keySet = new Set(params.map(String));
      const matched = new Set<string>();
      for (const entry of projectMedia) {
        const key = entry.split('::').slice(1).join('::');
        if (keySet.has(key)) matched.add(key);
      }
      return { rows: Array.from(matched).map((object_key) => ({ object_key })) };
    }
    if (sql.startsWith('INSERT OR IGNORE INTO project_media')) {
      const pid = String(params[0]);
      for (const k of params.slice(1)) {
        if (mediaObjects.has(String(k))) {
          projectMedia.add(`${pid}::${String(k)}`);
        }
      }
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM project_media WHERE project_id = ? AND object_key IN')) {
      const pid = String(params[0]);
      for (const k of params.slice(1)) {
        projectMedia.delete(`${pid}::${String(k)}`);
      }
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM project_media WHERE project_id = ?')) {
      const prefix = `${String(params[0])}::`;
      for (const e of Array.from(projectMedia)) {
        if (e.startsWith(prefix)) projectMedia.delete(e);
      }
      return { rows: [] };
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
      const res = execSql(sql, bound);
      return { results: [], success: true, meta: { changes: (res as { changes?: number }).changes ?? 1 } };
    },
    _execSync: () => {
      const { rows } = execSql(sql, bound);
      return { results: rows, success: true, meta: {} };
    },
  });

  return {
    prepare: (sql: string) => makeStmt(sql),
    async batch(statements: Array<ReturnType<typeof makeStmt>>) {
      return statements.map((s) => s._execSync());
    },
    getQueryCount: () => queryCount,
    seedRawMedia: (row: Record<string, unknown>) => {
      mediaObjects.set(String(row.object_key), row);
    },
    seedLegacyProjectWithoutDto: (row: Record<string, unknown>) => {
      projects.set(String(row.id), row);
    },
  } as unknown as D1Database & {
    getQueryCount: () => number;
    seedRawMedia: (row: Record<string, unknown>) => void;
    seedLegacyProjectWithoutDto: (row: Record<string, unknown>) => void;
  };
}

function makeTestEnv(overrides: Partial<Env> = {}) {
  const mockR2 = createMockR2Bucket();
  const mockD1 = createMockD1();
  const env: Env = {
    DB: mockD1,
    IMAGES_BUCKET: mockR2.bucket,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'StrongPassword123!',
    ADMIN_DISPLAY_NAME: 'Field Admin',
    R2_QUOTA_BYTES: '10000',
    R2_WARN_REMAINING_BYTES: '2000',
    R2_BLOCK_REMAINING_BYTES: '1000',
    ...overrides,
  };
  return { env, mockR2, mockD1 };
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
      projects: Array<{
        slug: string;
        projectName: string;
        settings: { show3DModel?: boolean };
      }>;
    };
    expect(visibleJson.projects).toHaveLength(1);
    expect(visibleJson.projects[0].slug).toBe('private-relay');
    expect(visibleJson.projects[0].settings.show3DModel).toBe(true);
    expect(visibleBodyText).not.toContain('INTERNAL_SECRET');

    // Disable 3D model for client via PATCH and verify both client DTO and admin record persist it
    const hide3DRes = await app.request(
      '/api/admin/projects/proj-1/visibility',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ show3DModel: false }),
      },
      env
    );
    expect(hide3DRes.status).toBe(200);

    const hidden3DClientRes = await app.request('/api/client/projects', undefined, env);
    const hidden3DClientJson = (await hidden3DClientRes.json()) as {
      projects: Array<{ settings: { show3DModel?: boolean } }>;
    };
    expect(hidden3DClientJson.projects[0].settings.show3DModel).toBe(false);

    const adminListRes = await app.request(
      '/api/admin/projects',
      { headers: { Cookie: cookie } },
      env
    );
    const adminListJson = (await adminListRes.json()) as {
      projects: Array<{ id: string; clientSettings?: { show3DModel?: boolean } }>;
    };
    expect(
      adminListJson.projects.find((p) => p.id === 'proj-1')?.clientSettings?.show3DModel
    ).toBe(false);
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

  it('serves precomputed client_dto_json with Edge Cache hits, 304 ETag, and cache invalidation on writes', async () => {
    const mockCache = createMockEdgeCache();
    const cachedApp = createWorkerApp({ edgeCache: mockCache.cache });
    const { env, mockD1 } = makeTestEnv();

    const loginRes = await cachedApp.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'StrongPassword123!' }),
      },
      env
    );
    const cookie = extractSessionCookie(loginRes);

    const state = createSampleMast2Project();
    state.projectName = 'Edge Cached Site';
    await cachedApp.request(
      '/api/admin/projects',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          id: 'proj-edge',
          state,
          clientSettings: { enabled: true, featured: true, slug: 'edge-site' },
        }),
      },
      env
    );

    const qBeforeList = mockD1.getQueryCount();
    const res1 = await cachedApp.request('/api/client/projects/edge-site', undefined, env);
    expect(res1.status).toBe(200);
    expect(res1.headers.get('Cache-Control')).toContain('s-maxage=300');
    const etag1 = res1.headers.get('ETag')!;
    expect(etag1).toBeTruthy();
    const body1 = (await res1.json()) as {
      project: { projectName: string };
      availableProjects: Array<{ id: string; slug: string; featured: boolean }>;
    };
    expect(body1.project.projectName).toBe('Edge Cached Site');
    expect(body1.availableProjects).toHaveLength(1);
    expect(mockD1.getQueryCount()).toBeGreaterThan(qBeforeList);

    // Second GET with Edge Cache hit skips D1 completely and honors If-None-Match 304
    const qBeforeHit = mockD1.getQueryCount();
    const res304 = await cachedApp.request(
      '/api/client/projects/edge-site',
      { headers: { 'If-None-Match': etag1 } },
      env
    );
    expect(res304.status).toBe(304);
    expect(mockD1.getQueryCount()).toBe(qBeforeHit);

    // Admin update invalidates edge cache and produces fresh ETag & payload
    state.projectName = 'Edge Cached Site Updated';
    const putRes = await cachedApp.request(
      '/api/admin/projects/proj-edge',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ state }),
      },
      env
    );
    expect(putRes.status).toBe(200);

    const resAfterUpdate = await cachedApp.request(
      '/api/client/projects/edge-site',
      { headers: { 'If-None-Match': etag1 } },
      env
    );
    expect(resAfterUpdate.status).toBe(200);
    expect(resAfterUpdate.headers.get('ETag')).not.toBe(etag1);
    const body2 = (await resAfterUpdate.json()) as { project: { projectName: string } };
    expect(body2.project.projectName).toBe('Edge Cached Site Updated');
  });

  it('preserves shared media across duplicated projects using project_media and prunes >24h unlinked uploads on reconcile', async () => {
    const mockCache = createMockEdgeCache();
    const cachedApp = createWorkerApp({ edgeCache: mockCache.cache });
    const { env, mockR2, mockD1 } = makeTestEnv();

    const loginRes = await cachedApp.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'StrongPassword123!' }),
      },
      env
    );
    const cookie = extractSessionCookie(loginRes);

    // Upload 1 active image (used by proj-a and duplicated proj-b)
    const form = new FormData();
    form.append('projectId', 'proj-a');
    form.append('category', 'daily_log');
    form.append('file', new File([new Uint8Array(500)], 'shared.jpg', { type: 'image/jpeg' }));
    const upRes = await cachedApp.request(
      '/api/admin/images/upload',
      { method: 'POST', headers: { Cookie: cookie }, body: form },
      env
    );
    const upJson = (await upRes.json()) as { url: string; objectKey: string };

    // Also test 304 on /api/images/*
    const imgHit1 = await cachedApp.request(upJson.url, undefined, env);
    expect(imgHit1.status).toBe(200);
    const imgEtag = imgHit1.headers.get('ETag')!;
    const qBeforeImg304 = mockD1.getQueryCount();
    const imgHit304 = await cachedApp.request(
      upJson.url,
      { headers: { 'If-None-Match': imgEtag } },
      env
    );
    expect(imgHit304.status).toBe(304);
    expect(mockD1.getQueryCount()).toBe(qBeforeImg304);

    const makeStateWithPhoto = (name: string) => {
      const s = createSampleMast2Project();
      s.projectName = name;
      s.dailyLogs = [
        {
          id: 'dl-1',
          date: '2026-01-10',
          dayNumber: 1,
          weather: 'Sunny',
          activitiesSummary: 'Photo',
          foundationsWorked: [],
          workers: [],
          totalWorkers: 0,
          totalManHours: 0,
          cementUsedBags: 0,
          sandUsedBags: 0,
          gravelUsedBags: 0,
          documentationItems: [{ id: 'doc-1', photoDataUrl: upJson.url, description: 'test' }],
          issuesOrDelays: '',
        },
      ];
      return s;
    };

    await cachedApp.request(
      '/api/admin/projects',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ id: 'proj-a', state: makeStateWithPhoto('Proj A') }),
      },
      env
    );
    await cachedApp.request(
      '/api/admin/projects',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ id: 'proj-b', state: makeStateWithPhoto('Proj B') }),
      },
      env
    );

    // Deleting proj-a keeps shared R2 image intact because proj-b still references it in project_media
    const delA = await cachedApp.request(
      '/api/admin/projects/proj-a',
      { method: 'DELETE', headers: { Cookie: cookie } },
      env
    );
    const delAJson = (await delA.json()) as { deletedMediaCount: number };
    expect(delAJson.deletedMediaCount).toBe(0);
    expect(mockR2.keys()).toEqual([upJson.objectKey]);

    // Seed a recent (3-day) unlinked object and verify it SURVIVES reconcile due to 7-day TTL
    const recentOrphanKey = 'projects/tmp/daily_log/recent-orphan.jpg';
    await mockR2.bucket.put(recentOrphanKey, new Uint8Array(200), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    mockD1.seedRawMedia({
      object_key: recentOrphanKey,
      project_id: null,
      category: 'daily_log',
      content_type: 'image/jpeg',
      size_bytes: 200,
      original_name: 'recent.jpg',
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Seed a stale (>7d) unlinked orphan object in R2 & media_objects, verify reconcile sweeps only the stale orphan
    const staleKey = 'projects/tmp/daily_log/stale-orphan.jpg';
    await mockR2.bucket.put(staleKey, new Uint8Array(400), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    mockD1.seedRawMedia({
      object_key: staleKey,
      project_id: null,
      category: 'daily_log',
      content_type: 'image/jpeg',
      size_bytes: 400,
      original_name: 'stale.jpg',
      created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const recRes = await cachedApp.request(
      '/api/admin/storage/reconcile',
      { method: 'POST', headers: { Cookie: cookie } },
      env
    );
    expect(recRes.status).toBe(200);
    const recJson = (await recRes.json()) as {
      storage: { usedBytes: number; objectCount: number };
    };
    // 500 (linked upJson) + 200 (recent 3d orphan) = 700 bytes, 2 objects
    expect(recJson.storage.usedBytes).toBe(700);
    expect(recJson.storage.objectCount).toBe(2);
    expect(mockR2.keys().sort()).toEqual([recentOrphanKey, upJson.objectKey].sort());
  });

  it('throttles username enumeration from a single IP using IP-wide login_attempts limit', async () => {
    const { env } = makeTestEnv();
    for (let i = 0; i < 24; i++) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.9',
          },
          body: JSON.stringify({ username: `spray-user-${i}`, password: 'bad-password' }),
        },
        env
      );
      expect(res.status).toBe(401);
    }

    const blockedRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.9',
        },
        body: JSON.stringify({ username: 'admin', password: 'StrongPassword123!' }),
      },
      env
    );
    expect(blockedRes.status).toBe(429);
  });

  it('enforces atomic version conflict check on concurrent project saves', async () => {
    const { env } = makeTestEnv();
    const app = createWorkerApp();

    const loginRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'StrongPassword123!' }),
      },
      env
    );
    const cookie = loginRes.headers.get('Set-Cookie')?.split(';')[0] ?? '';

    // Create a new project
    const p1 = createSampleMast2Project();
    const saveRes1 = await app.request(
      '/api/admin/projects/proj-concurrency',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ state: p1 }),
      },
      env
    );
    expect(saveRes1.status).toBe(200);
    const save1Json = (await saveRes1.json()) as { project: { version: number } };
    expect(save1Json.project.version).toBe(1);

    // Save with correct expectedVersion = 1 -> succeeds to version 2
    const saveRes2 = await app.request(
      '/api/admin/projects/proj-concurrency',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ state: { ...p1, projectName: 'Updated 1' }, expectedVersion: 1 }),
      },
      env
    );
    expect(saveRes2.status).toBe(200);
    const save2Json = (await saveRes2.json()) as { project: { version: number } };
    expect(save2Json.project.version).toBe(2);

    // Second device attempts to save with stale expectedVersion = 1 -> 409 conflict
    const staleSaveRes = await app.request(
      '/api/admin/projects/proj-concurrency',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ state: { ...p1, projectName: 'Stale Overwrite' }, expectedVersion: 1 }),
      },
      env
    );
    expect(staleSaveRes.status).toBe(409);
    const staleJson = (await staleSaveRes.json()) as { code: string; latestProject: { version: number } };
    expect(staleJson.code).toBe('VERSION_CONFLICT');
    expect(staleJson.latestProject.version).toBe(2);
  });
});
