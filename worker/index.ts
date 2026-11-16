import { Hono } from 'hono';
import {
  buildClientShowcaseDto,
  deriveClientMetaFromState,
  resolveClientShowcaseSettings,
  slugifyProjectSlug,
} from '../src/entities/project/clientProjection';
import type {
  ClientShowcaseSettings,
  MastProjectState,
  SavedProjectRecord,
} from '../src/entities/project/types';
import {
  authenticateAdminCredentials,
  checkLoginRateLimit,
  clearLoginAttempts,
  createAdminSession,
  destroySessionFromRequest,
  getSessionUserFromRequest,
  MAX_FAILED_IP_ATTEMPTS,
  recordFailedLoginAttempt,
  requireAdmin,
  setSessionCookie,
} from './auth';
import {
  chunkArray,
  cleanupOrphanedMediaKeys,
  extractMediaKeysFromProjectState,
  getR2StorageStatus,
  MEDIA_URL_PREFIX,
  R2UploadRejectedError,
  reconcileR2BucketUsage,
  uploadImageToR2,
  type MediaCategory,
} from './r2Service';
import type {
  AdminSessionUser,
  Env,
  ProjectRow,
  PublicProjectSummary,
} from './types';
import type { ClientProjectShowcaseDto } from '../src/entities/project/types';

export interface WorkerAppOptions {
  edgeCache?: Cache | null;
}

const PUBLIC_CLIENT_CACHE_CONTROL = 'public, max-age=30, s-maxage=300';

function getEdgeCache(options?: WorkerAppOptions): Cache | null {
  if (options && 'edgeCache' in options) {
    return options.edgeCache ?? null;
  }
  const cacheStorage = (globalThis as { caches?: { default?: Cache } }).caches;
  return cacheStorage?.default ?? null;
}

function runInBackground(
  c: { executionCtx: { waitUntil(promise: Promise<unknown>): void } },
  task: Promise<unknown>
): void {
  try {
    c.executionCtx.waitUntil(task.catch(() => undefined));
  } catch {
    void task.catch(() => undefined);
  }
}

function buildCanonicalCacheRequest(requestUrl: string, pathnameOverride?: string): Request {
  const url = new URL(requestUrl);
  if (pathnameOverride) {
    url.pathname = pathnameOverride;
  }
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

function normalizeEtagToken(tag: string): string {
  return tag.trim().replace(/^W\//i, '');
}

function matchesIfNoneMatch(headerValue: string | undefined, etag: string): boolean {
  if (!headerValue) return false;
  if (headerValue.trim() === '*') return true;
  const target = normalizeEtagToken(etag);
  return headerValue
    .split(',')
    .some((part) => normalizeEtagToken(part) === target);
}

async function computeWeakOrStrongEtag(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(seed)
  );
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
  return `"${hex}"`;
}

async function purgeCacheKeys(
  edgeCache: Cache | null,
  requestUrl: string,
  pathnames: Iterable<string>
): Promise<void> {
  if (!edgeCache) return;
  const uniquePaths = Array.from(new Set(Array.from(pathnames).filter(Boolean)));
  await Promise.all(
    uniquePaths.map((p) =>
      edgeCache.delete(buildCanonicalCacheRequest(requestUrl, p)).catch(() => false)
    )
  );
}

function projectPathsForInvalidation(identifiers: Iterable<string | null | undefined>): string[] {
  const paths = ['/api/client/projects'];
  for (const raw of identifiers) {
    const clean = raw?.trim();
    if (!clean) continue;
    paths.push(`/api/client/projects/${encodeURIComponent(clean)}`);
  }
  return paths;
}

type AppContext = {
  Bindings: Env;
  Variables: {
    adminUser?: AdminSessionUser;
  };
};

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToSavedProjectRecord(row: ProjectRow): SavedProjectRecord {
  const state = JSON.parse(row.state_json) as MastProjectState;
  const rawSettings = parseJsonSafe<Partial<ClientShowcaseSettings>>(
    row.client_settings_json,
    {}
  );
  const clientSettings = resolveClientShowcaseSettings({
    id: row.id,
    state,
    clientSettings: {
      enabled: Boolean(row.client_visible),
      featured: Boolean(row.client_featured),
      slug: row.slug ?? rawSettings.slug,
      welcomeNote: rawSettings.welcomeNote,
      phaseMode: rawSettings.phaseMode ?? 'both',
      showPhotos: rawSettings.showPhotos ?? true,
      showReports: rawSettings.showReports ?? true,
      show3DModel: rawSettings.show3DModel ?? true,
    },
  });

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    syncStatus: 'synced',
    clientSettings,
    state,
  };
}

async function ensureUniqueSlug(
  env: Env,
  desiredSlug: string,
  excludeId: string
): Promise<string> {
  const base = slugifyProjectSlug(desiredSlug, excludeId);
  let candidate = base;
  let suffix = 2;

  while (suffix < 100) {
    const existing = await env.DB.prepare(
      'SELECT id FROM projects WHERE slug = ? AND id != ?'
    )
      .bind(candidate, excludeId)
      .first<{ id: string }>();

    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return `${base}-${excludeId.slice(-6)}`;
}

async function clearOtherFeaturedProjects(
  env: Env,
  activeFeaturedId: string
): Promise<Array<{ id: string; slug: string | null }>> {
  const rows = await env.DB.prepare(
    'SELECT id, slug, client_settings_json, client_dto_json FROM projects WHERE client_featured = 1 AND id != ?'
  )
    .bind(activeFeaturedId)
    .all<{
      id: string;
      slug: string | null;
      client_settings_json: string;
      client_dto_json?: string | null;
    }>();

  const list = rows.results ?? [];
  if (list.length === 0) return [];

  const statements = list.map((row) => {
    const parsedSettings = parseJsonSafe<Partial<ClientShowcaseSettings>>(
      row.client_settings_json,
      {}
    );
    const updatedSettings = JSON.stringify({ ...parsedSettings, featured: false });

    let updatedDtoJson: string | null = null;
    if (row.client_dto_json) {
      const parsedDto = parseJsonSafe<ClientProjectShowcaseDto | null>(
        row.client_dto_json,
        null
      );
      if (parsedDto) {
        updatedDtoJson = JSON.stringify({
          ...parsedDto,
          featured: false,
          settings: {
            ...parsedDto.settings,
            featured: false,
          },
        });
      }
    }

    return env.DB.prepare(
      'UPDATE projects SET client_featured = 0, client_settings_json = ?, client_dto_json = ? WHERE id = ?'
    ).bind(updatedSettings, updatedDtoJson ?? row.client_dto_json ?? null, row.id);
  });

  for (const batch of chunkArray(statements, 50)) {
    await env.DB.batch(batch);
  }

  return list.map((r) => ({ id: r.id, slug: r.slug }));
}

async function linkProjectMediaKeys(
  env: Env,
  projectId: string,
  nextKeys: Set<string>
): Promise<void> {
  const existingRows = await env.DB.prepare(
    'SELECT object_key FROM project_media WHERE project_id = ?'
  )
    .bind(projectId)
    .all<{ object_key: string }>();

  const existingLinked = new Set(
    (existingRows.results ?? []).map((r) => r.object_key)
  );

  const keysToAdd: string[] = [];
  for (const key of nextKeys) {
    if (!existingLinked.has(key)) keysToAdd.push(key);
  }

  const keysToRemove: string[] = [];
  for (const key of existingLinked) {
    if (!nextKeys.has(key)) keysToRemove.push(key);
  }

  if (keysToAdd.length === 0 && keysToRemove.length === 0) {
    return;
  }

  const statements: ReturnType<Env['DB']['prepare']>[] = [];

  for (const chunk of chunkArray(keysToAdd, 70)) {
    const placeholders = chunk.map(() => '?').join(', ');
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO project_media (project_id, object_key)
         SELECT ?, object_key FROM media_objects WHERE object_key IN (${placeholders})`
      ).bind(projectId, ...chunk),
      env.DB.prepare(
        `UPDATE media_objects
         SET project_id = ?
         WHERE object_key IN (${placeholders}) AND (project_id IS NULL OR project_id != ?)`
      ).bind(projectId, ...chunk, projectId)
    );
  }

  for (const chunk of chunkArray(keysToRemove, 70)) {
    const placeholders = chunk.map(() => '?').join(', ');
    statements.push(
      env.DB.prepare(
        `DELETE FROM project_media WHERE project_id = ? AND object_key IN (${placeholders})`
      ).bind(projectId, ...chunk)
    );
  }

  for (const batch of chunkArray(statements, 50)) {
    await env.DB.batch(batch);
  }
}

function buildPrecomputedClientDtoJson(params: {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  clientSettings: ClientShowcaseSettings;
  state: MastProjectState;
}): string {
  return JSON.stringify(
    buildClientShowcaseDto({
      id: params.id,
      createdAt: params.createdAt,
      updatedAt: params.updatedAt,
      version: params.version,
      syncStatus: 'synced',
      clientSettings: params.clientSettings,
      state: params.state,
    })
  );
}

function extractClientDtoFromRow(row: ProjectRow): {
  dto: ClientProjectShowcaseDto;
  needsBackfill: boolean;
} {
  if (row.client_dto_json) {
    const parsed = parseJsonSafe<ClientProjectShowcaseDto | null>(
      row.client_dto_json,
      null
    );
    if (parsed && parsed.id && Array.isArray(parsed.foundations)) {
      return { dto: parsed, needsBackfill: false };
    }
  }
  const dto = buildClientShowcaseDto(rowToSavedProjectRecord(row));
  return { dto, needsBackfill: true };
}

function isValidProjectStatePayload(value: unknown): value is MastProjectState {
  const candidate = value as Partial<MastProjectState> | null | undefined;
  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      Array.isArray(candidate.foundations) &&
      candidate.foundations.length > 0
  );
}

export function createWorkerApp(options?: WorkerAppOptions) {
  const app = new Hono<AppContext>();
  const edgeCache = getEdgeCache(options);

  app.get('/api/health', (c) =>
    c.json({ ok: true, timestamp: new Date().toISOString() })
  );

  // ---------------------------------------------------------------------------
  // Public Client Showcase Endpoints (Precomputed Sanitized DTOs + Edge Cache)
  // ---------------------------------------------------------------------------
  app.get('/api/client/projects', async (c) => {
    const cacheReq = buildCanonicalCacheRequest(c.req.url, '/api/client/projects');
    const ifNoneMatch = c.req.header('If-None-Match');

    if (edgeCache) {
      const cached = await edgeCache.match(cacheReq);
      if (cached) {
        const cachedEtag = cached.headers.get('ETag');
        if (cachedEtag && matchesIfNoneMatch(ifNoneMatch, cachedEtag)) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: cachedEtag,
              'Cache-Control': PUBLIC_CLIENT_CACHE_CONTROL,
            },
          });
        }
        return new Response(cached.body, {
          status: cached.status,
          headers: cached.headers,
        });
      }
    }

    const result = await c.env.DB.prepare(
      `SELECT id, slug, name, project_type, client_visible, client_featured, version,
              created_at, updated_at, client_dto_json,
              CASE WHEN client_dto_json IS NULL THEN client_settings_json ELSE NULL END AS client_settings_json,
              CASE WHEN client_dto_json IS NULL THEN state_json ELSE NULL END AS state_json
       FROM projects
       WHERE client_visible = 1
       ORDER BY client_featured DESC, updated_at DESC`
    ).all<ProjectRow>();

    const rows = result.results ?? [];
    const backfillStmts: ReturnType<Env['DB']['prepare']>[] = [];
    const projects = rows.map((row) => {
      const { dto, needsBackfill } = extractClientDtoFromRow(row);
      if (needsBackfill) {
        backfillStmts.push(
          c.env.DB.prepare('UPDATE projects SET client_dto_json = ? WHERE id = ?').bind(
            JSON.stringify(dto),
            row.id
          )
        );
      }
      return dto;
    });

    if (backfillStmts.length > 0) {
      for (const batch of chunkArray(backfillStmts, 25)) {
        runInBackground(c, c.env.DB.batch(batch));
      }
    }

    const etagSeed = rows.map((r) => `${r.id}:${r.version}:${r.updated_at}`).join('|');
    const etag = await computeWeakOrStrongEtag(`list:${etagSeed}`);

    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': PUBLIC_CLIENT_CACHE_CONTROL,
        },
      });
    }

    const body = JSON.stringify({ projects });
    const res = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': PUBLIC_CLIENT_CACHE_CONTROL,
        ETag: etag,
      },
    });

    if (edgeCache) {
      runInBackground(c, edgeCache.put(cacheReq, res.clone()));
    }

    return res;
  });

  app.get('/api/client/projects/:idOrSlug', async (c) => {
    const idOrSlug = c.req.param('idOrSlug');
    const cacheReq = buildCanonicalCacheRequest(
      c.req.url,
      `/api/client/projects/${encodeURIComponent(idOrSlug)}`
    );
    const ifNoneMatch = c.req.header('If-None-Match');

    if (edgeCache) {
      const cached = await edgeCache.match(cacheReq);
      if (cached) {
        const cachedEtag = cached.headers.get('ETag');
        if (cachedEtag && matchesIfNoneMatch(ifNoneMatch, cachedEtag)) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: cachedEtag,
              'Cache-Control': PUBLIC_CLIENT_CACHE_CONTROL,
            },
          });
        }
        return new Response(cached.body, {
          status: cached.status,
          headers: cached.headers,
        });
      }
    }

    const [row, summaryResult] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, slug, name, project_type, client_visible, client_featured, version,
                created_at, updated_at, client_dto_json,
                CASE WHEN client_dto_json IS NULL THEN client_settings_json ELSE NULL END AS client_settings_json,
                CASE WHEN client_dto_json IS NULL THEN state_json ELSE NULL END AS state_json
         FROM projects
         WHERE client_visible = 1 AND (id = ? OR slug = ?)
         LIMIT 1`
      )
        .bind(idOrSlug, idOrSlug)
        .first<ProjectRow>(),
      c.env.DB.prepare(
        `SELECT id, slug, name, client_featured, version, updated_at,
                json_extract(client_dto_json, '$.projectName') AS dto_project_name,
                json_extract(client_dto_json, '$.location') AS dto_location
         FROM projects
         WHERE client_visible = 1
         ORDER BY client_featured DESC, updated_at DESC`
      ).all<{
        id: string;
        slug: string | null;
        name: string;
        client_featured: number;
        version: number;
        updated_at: string;
        dto_project_name?: string | null;
        dto_location?: string | null;
      }>(),
    ]);

    if (!row) {
      return c.json(
        { error: 'Published project not found.', code: 'NOT_FOUND' },
        404
      );
    }

    const { dto, needsBackfill } = extractClientDtoFromRow(row);
    if (needsBackfill) {
      runInBackground(
        c,
        c.env.DB.prepare('UPDATE projects SET client_dto_json = ? WHERE id = ?')
          .bind(JSON.stringify(dto), row.id)
          .run()
      );
    }

    const summaryRows = summaryResult.results ?? [];
    const availableProjects: PublicProjectSummary[] = summaryRows.map((s) => ({
      id: s.id,
      slug: s.slug || s.id,
      projectName: s.dto_project_name?.trim() || s.name || dto.projectName,
      location:
        (s.id === dto.id ? dto.location : s.dto_location?.trim()) || '',
      featured: Boolean(s.client_featured),
    }));

    const summarySeed = summaryRows
      .map((s) => `${s.id}:${s.slug ?? ''}:${s.version}:${s.updated_at}`)
      .join('|');
    const etag = await computeWeakOrStrongEtag(
      `one:${row.id}:${row.version}:${row.updated_at}:${summarySeed}`
    );

    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': PUBLIC_CLIENT_CACHE_CONTROL,
        },
      });
    }

    const res = new Response(
      JSON.stringify({ project: dto, availableProjects }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Cache-Control': PUBLIC_CLIENT_CACHE_CONTROL,
          ETag: etag,
        },
      }
    );

    if (edgeCache) {
      runInBackground(c, edgeCache.put(cacheReq, res.clone()));
    }

    return res;
  });

  // ---------------------------------------------------------------------------
  // Same-Origin Image Serving from R2 (Edge Cached + 304 Conditional)
  // ---------------------------------------------------------------------------
  app.get('/api/images/*', async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const objectKey = decodeURIComponent(
      pathname.startsWith(MEDIA_URL_PREFIX)
        ? pathname.slice(MEDIA_URL_PREFIX.length)
        : ''
    );
    if (!objectKey || objectKey.includes('..')) {
      return c.json({ error: 'Invalid image key' }, 400);
    }

    const ifNoneMatch = c.req.header('If-None-Match');
    const cacheReq = buildCanonicalCacheRequest(c.req.url);

    if (edgeCache) {
      const cached = await edgeCache.match(cacheReq);
      if (cached) {
        const cachedEtag = cached.headers.get('ETag');
        if (cachedEtag && matchesIfNoneMatch(ifNoneMatch, cachedEtag)) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: cachedEtag,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
        return new Response(cached.body, {
          status: cached.status,
          headers: cached.headers,
        });
      }
    }

    const object = await c.env.IMAGES_BUCKET.get(objectKey);
    if (!object) {
      return c.json({ error: 'Image not found' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(
      headers as unknown as Parameters<typeof object.writeHttpMetadata>[0]
    );
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/octet-stream');
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('ETag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    if (matchesIfNoneMatch(ifNoneMatch, object.httpEtag)) {
      const bodyStream = object.body as unknown as { cancel?: () => Promise<void> } | null;
      if (bodyStream && typeof bodyStream.cancel === 'function') {
        void bodyStream.cancel().catch(() => undefined);
      }
      return new Response(null, {
        status: 304,
        headers: {
          ETag: object.httpEtag,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    const res = new Response(object.body as BodyInit, {
      status: 200,
      headers,
    });

    if (edgeCache) {
      runInBackground(c, edgeCache.put(cacheReq, res.clone()));
    }

    return res;
  });

  // ---------------------------------------------------------------------------
  // Admin Authentication Routes
  // ---------------------------------------------------------------------------
  app.get('/api/auth/me', async (c) => {
    const user = await getSessionUserFromRequest(c);
    return c.json(
      { authenticated: Boolean(user), user: user ?? null },
      200,
      { 'Cache-Control': 'no-store' }
    );
  });

  app.post('/api/auth/login', async (c) => {
    const body = await c.req
      .json<{ username?: string; password?: string }>()
      .catch(() => null);
    const username = body?.username?.trim() ?? '';
    const password = body?.password ?? '';

    if (!username || !password) {
      return c.json(
        { error: 'Username and password are required.', code: 'BAD_REQUEST' },
        400
      );
    }

    const clientIp = c.req.header('CF-Connecting-IP')?.trim() || 'unknown';
    const userIpKey = `${clientIp}:${username.toLowerCase()}`;
    const ipOnlyKey = `ip:${clientIp}`;

    const [ipRate, userRate] = await Promise.all([
      checkLoginRateLimit(c.env, ipOnlyKey),
      checkLoginRateLimit(c.env, userIpKey),
    ]);
    if (!ipRate.allowed || !userRate.allowed) {
      const retryAfterSec = Math.max(
        !ipRate.allowed ? ipRate.retryAfterSec : 0,
        !userRate.allowed ? userRate.retryAfterSec : 0
      );
      return c.json(
        {
          error: `Too many failed sign-in attempts. Please wait ${retryAfterSec} seconds and try again.`,
          code: 'RATE_LIMITED',
          retryAfterSec,
        },
        429
      );
    }

    const user = await authenticateAdminCredentials(c.env, username, password);
    if (!user) {
      await Promise.all([
        recordFailedLoginAttempt(c.env, userIpKey),
        recordFailedLoginAttempt(c.env, ipOnlyKey, MAX_FAILED_IP_ATTEMPTS),
      ]);
      return c.json(
        { error: 'Invalid admin username or password.', code: 'INVALID_CREDENTIALS' },
        401
      );
    }

    await clearLoginAttempts(c.env, userIpKey);
    const { token } = await createAdminSession(c.env, user.id);
    setSessionCookie(c, token);

    return c.json({ authenticated: true, user });
  });

  app.post('/api/auth/logout', async (c) => {
    await destroySessionFromRequest(c);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Protected Admin Endpoints
  // ---------------------------------------------------------------------------
  app.use('/api/admin/*', requireAdmin);

  app.get('/api/admin/projects', async (c) => {
    const rows = await c.env.DB.prepare(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    ).all<ProjectRow>();

    const projects = (rows.results ?? []).map(rowToSavedProjectRecord);
    const storage = await getR2StorageStatus(c.env);

    return c.json(
      { projects, storage },
      200,
      { 'Cache-Control': 'no-store' }
    );
  });

  app.post('/api/admin/projects', async (c) => {
    const body = await c.req
      .json<{
        id?: string;
        state?: MastProjectState;
        clientSettings?: Partial<ClientShowcaseSettings>;
        createdAt?: string;
        updatedAt?: string;
      }>()
      .catch(() => null);

    if (!body || !isValidProjectStatePayload(body.state)) {
      return c.json(
        { error: 'Invalid project payload.', code: 'INVALID_PROJECT' },
        400
      );
    }

    const id =
      body.id?.trim() ||
      `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const createdAt = body.createdAt || now;
    const updatedAt = body.updatedAt || now;

    const existing = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ?'
    )
      .bind(id)
      .first<{ id: string }>();

    if (existing) {
      return c.json(
        { error: 'A project with this ID already exists.', code: 'DUPLICATE_ID' },
        409
      );
    }

    const meta = deriveClientMetaFromState(
      id,
      body.state,
      body.clientSettings as ClientShowcaseSettings | undefined
    );
    const uniqueSlug = await ensureUniqueSlug(
      c.env,
      meta.settings.slug || meta.name,
      id
    );
    const finalSettings: ClientShowcaseSettings = {
      ...meta.settings,
      slug: uniqueSlug,
    };

    const clearedFeatured = finalSettings.featured
      ? await clearOtherFeaturedProjects(c.env, id)
      : [];
    const clientDtoJson = buildPrecomputedClientDtoJson({
      id,
      createdAt,
      updatedAt,
      version: 1,
      clientSettings: finalSettings,
      state: body.state,
    });

    await c.env.DB.prepare(
      `INSERT INTO projects (
         id, slug, name, project_type, client_visible, client_featured,
         client_settings_json, state_json, client_dto_json, version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(
        id,
        uniqueSlug,
        meta.name,
        meta.projectType,
        finalSettings.enabled ? 1 : 0,
        finalSettings.featured ? 1 : 0,
        JSON.stringify(finalSettings),
        JSON.stringify(body.state),
        clientDtoJson,
        createdAt,
        updatedAt
      )
      .run();

    await linkProjectMediaKeys(
      c.env,
      id,
      extractMediaKeysFromProjectState(body.state)
    );

    runInBackground(
      c,
      purgeCacheKeys(
        edgeCache,
        c.req.url,
        projectPathsForInvalidation([
          id,
          uniqueSlug,
          ...clearedFeatured.flatMap((r) => [r.id, r.slug]),
        ])
      )
    );

    const createdProject: SavedProjectRecord = {
      id,
      createdAt,
      updatedAt,
      version: 1,
      syncStatus: 'synced',
      clientSettings: finalSettings,
      state: body.state,
    };

    const storage = await getR2StorageStatus(c.env);
    return c.json(
      {
        project: createdProject,
        storage,
      },
      201
    );
  });

  app.put('/api/admin/projects/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req
      .json<{
        state?: MastProjectState;
        clientSettings?: Partial<ClientShowcaseSettings>;
        expectedVersion?: number;
      }>()
      .catch(() => null);

    if (!body || !isValidProjectStatePayload(body.state)) {
      return c.json(
        { error: 'Invalid project payload.', code: 'INVALID_PROJECT' },
        400
      );
    }

    const existing = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    )
      .bind(id)
      .first<ProjectRow>();

    const now = new Date().toISOString();

    if (!existing) {
      // Allow clean upsert for offline-drafted projects syncing for the first time
      const meta = deriveClientMetaFromState(
        id,
        body.state,
        body.clientSettings as ClientShowcaseSettings | undefined
      );
      const uniqueSlug = await ensureUniqueSlug(
        c.env,
        meta.settings.slug || meta.name,
        id
      );
      const finalSettings: ClientShowcaseSettings = {
        ...meta.settings,
        slug: uniqueSlug,
      };
      const clearedFeatured = finalSettings.featured
        ? await clearOtherFeaturedProjects(c.env, id)
        : [];
      const clientDtoJson = buildPrecomputedClientDtoJson({
        id,
        createdAt: now,
        updatedAt: now,
        version: 1,
        clientSettings: finalSettings,
        state: body.state,
      });

      await c.env.DB.prepare(
        `INSERT INTO projects (
           id, slug, name, project_type, client_visible, client_featured,
           client_settings_json, state_json, client_dto_json, version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
        .bind(
          id,
          uniqueSlug,
          meta.name,
          meta.projectType,
          finalSettings.enabled ? 1 : 0,
          finalSettings.featured ? 1 : 0,
          JSON.stringify(finalSettings),
          JSON.stringify(body.state),
          clientDtoJson,
          now,
          now
        )
        .run();

      await linkProjectMediaKeys(
        c.env,
        id,
        extractMediaKeysFromProjectState(body.state)
      );

      runInBackground(
        c,
        purgeCacheKeys(
          edgeCache,
          c.req.url,
          projectPathsForInvalidation([
            id,
            uniqueSlug,
            ...clearedFeatured.flatMap((r) => [r.id, r.slug]),
          ])
        )
      );

      const savedProject: SavedProjectRecord = {
        id,
        createdAt: now,
        updatedAt: now,
        version: 1,
        syncStatus: 'synced',
        clientSettings: finalSettings,
        state: body.state,
      };
      const storage = await getR2StorageStatus(c.env);
      return c.json({
        project: savedProject,
        storage,
      });
    }

    if (
      typeof body.expectedVersion === 'number' &&
      existing.version !== body.expectedVersion
    ) {
      return c.json(
        {
          error:
            'This project was updated on another device. Reload the latest cloud copy before saving.',
          code: 'VERSION_CONFLICT',
          latestProject: rowToSavedProjectRecord(existing),
        },
        409
      );
    }

    const prevRecord = rowToSavedProjectRecord(existing);
    const mergedSettings = resolveClientShowcaseSettings({
      id,
      state: body.state,
      clientSettings: {
        ...(prevRecord.clientSettings ?? {
          enabled: false,
          featured: false,
          phaseMode: 'both',
          showPhotos: true,
          showReports: true,
          show3DModel: true,
        }),
        ...(body.clientSettings ?? {}),
      },
    });
    const uniqueSlug = await ensureUniqueSlug(
      c.env,
      mergedSettings.slug || body.state.projectName,
      id
    );
    const finalSettings: ClientShowcaseSettings = {
      ...mergedSettings,
      slug: uniqueSlug,
    };

    const clearedFeatured = finalSettings.featured
      ? await clearOtherFeaturedProjects(c.env, id)
      : [];

    const name =
      body.state.reportDetails?.projectName?.trim() ||
      body.state.projectName ||
      existing.name;
    const projectType = body.state.projectType ?? 'foundation';
    const nextVersion = existing.version + 1;
    const clientDtoJson = buildPrecomputedClientDtoJson({
      id,
      createdAt: existing.created_at,
      updatedAt: now,
      version: nextVersion,
      clientSettings: finalSettings,
      state: body.state,
    });

    const updateResult = await c.env.DB.prepare(
      `UPDATE projects
       SET slug = ?, name = ?, project_type = ?, client_visible = ?, client_featured = ?,
           client_settings_json = ?, state_json = ?, client_dto_json = ?, version = ?, updated_at = ?
       WHERE id = ? AND version = ?`
    )
      .bind(
        uniqueSlug,
        name,
        projectType,
        finalSettings.enabled ? 1 : 0,
        finalSettings.featured ? 1 : 0,
        JSON.stringify(finalSettings),
        JSON.stringify(body.state),
        clientDtoJson,
        nextVersion,
        now,
        id,
        existing.version
      )
      .run();

    if (updateResult?.meta && typeof updateResult.meta.changes === 'number' && updateResult.meta.changes === 0) {
      const latest = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ?'
      )
        .bind(id)
        .first<ProjectRow>();
      return c.json(
        {
          error:
            'This project was updated on another device. Reload the latest cloud copy before saving.',
          code: 'VERSION_CONFLICT',
          latestProject: latest ? rowToSavedProjectRecord(latest) : undefined,
        },
        409
      );
    }

    const prevKeys = extractMediaKeysFromProjectState(prevRecord.state);
    const nextKeys = extractMediaKeysFromProjectState(body.state);
    await linkProjectMediaKeys(c.env, id, nextKeys);

    const removedKeys: string[] = [];
    for (const k of prevKeys) {
      if (!nextKeys.has(k)) removedKeys.push(k);
    }
    if (removedKeys.length > 0) {
      await cleanupOrphanedMediaKeys(c.env, removedKeys);
    }

    runInBackground(
      c,
      purgeCacheKeys(
        edgeCache,
        c.req.url,
        projectPathsForInvalidation([
          id,
          existing.slug,
          uniqueSlug,
          ...clearedFeatured.flatMap((r) => [r.id, r.slug]),
        ])
      )
    );

    const updatedProject: SavedProjectRecord = {
      id,
      createdAt: existing.created_at,
      updatedAt: now,
      version: nextVersion,
      syncStatus: 'synced',
      clientSettings: finalSettings,
      state: body.state,
    };
    const storage = await getR2StorageStatus(c.env);

    return c.json({
      project: updatedProject,
      storage,
    });
  });

  app.patch('/api/admin/projects/:id/visibility', async (c) => {
    const id = c.req.param('id');
    const patch = await c.req
      .json<Partial<ClientShowcaseSettings>>()
      .catch(() => null);

    if (!patch) {
      return c.json({ error: 'Invalid settings payload.' }, 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    )
      .bind(id)
      .first<ProjectRow>();

    if (!existing) {
      return c.json({ error: 'Project not found.' }, 404);
    }

    const prevRecord = rowToSavedProjectRecord(existing);
    const merged = resolveClientShowcaseSettings({
      id,
      state: prevRecord.state,
      clientSettings: {
        ...(prevRecord.clientSettings ?? {
          enabled: false,
          featured: false,
          phaseMode: 'both',
          showPhotos: true,
          showReports: true,
          show3DModel: true,
        }),
        ...patch,
      },
    });
    const uniqueSlug = await ensureUniqueSlug(
      c.env,
      merged.slug || prevRecord.state.projectName,
      id
    );
    const finalSettings: ClientShowcaseSettings = { ...merged, slug: uniqueSlug };

    const clearedFeatured = finalSettings.featured
      ? await clearOtherFeaturedProjects(c.env, id)
      : [];

    const now = new Date().toISOString();
    const nextVersion = existing.version + 1;
    const clientDtoJson = buildPrecomputedClientDtoJson({
      id,
      createdAt: existing.created_at,
      updatedAt: now,
      version: nextVersion,
      clientSettings: finalSettings,
      state: prevRecord.state,
    });

    const updateResult = await c.env.DB.prepare(
      `UPDATE projects
       SET slug = ?, client_visible = ?, client_featured = ?, client_settings_json = ?,
           client_dto_json = ?, version = ?, updated_at = ?
       WHERE id = ? AND version = ?`
    )
      .bind(
        uniqueSlug,
        finalSettings.enabled ? 1 : 0,
        finalSettings.featured ? 1 : 0,
        JSON.stringify(finalSettings),
        clientDtoJson,
        nextVersion,
        now,
        id,
        existing.version
      )
      .run();

    if (updateResult?.meta && typeof updateResult.meta.changes === 'number' && updateResult.meta.changes === 0) {
      const latest = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ?'
      )
        .bind(id)
        .first<ProjectRow>();
      return c.json(
        {
          error:
            'This project was updated on another device. Reload the latest cloud copy before updating visibility.',
          code: 'VERSION_CONFLICT',
          latestProject: latest ? rowToSavedProjectRecord(latest) : undefined,
        },
        409
      );
    }

    runInBackground(
      c,
      purgeCacheKeys(
        edgeCache,
        c.req.url,
        projectPathsForInvalidation([
          id,
          existing.slug,
          uniqueSlug,
          ...clearedFeatured.flatMap((r) => [r.id, r.slug]),
        ])
      )
    );

    const updatedProject: SavedProjectRecord = {
      ...prevRecord,
      updatedAt: now,
      version: nextVersion,
      syncStatus: 'synced',
      clientSettings: finalSettings,
    };

    return c.json({
      project: updatedProject,
    });
  });

  app.delete('/api/admin/projects/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    )
      .bind(id)
      .first<ProjectRow>();

    if (!existing) {
      return c.json({ error: 'Project not found.' }, 404);
    }

    const record = rowToSavedProjectRecord(existing);
    const candidateKeys = extractMediaKeysFromProjectState(record.state);

    // Clear project_media and project_id references before deleting project row so shared media in duplicates isn't cascaded away
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM project_media WHERE project_id = ?').bind(id),
      c.env.DB.prepare('UPDATE media_objects SET project_id = NULL WHERE project_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
    ]);

    const deletedMediaCount = await cleanupOrphanedMediaKeys(c.env, candidateKeys);
    const storage = await getR2StorageStatus(c.env);

    runInBackground(
      c,
      purgeCacheKeys(
        edgeCache,
        c.req.url,
        [
          ...projectPathsForInvalidation([id, existing.slug]),
          ...Array.from(candidateKeys).map((k) => `${MEDIA_URL_PREFIX}${encodeURI(k)}`),
        ]
      )
    );

    return c.json({ ok: true, deletedMediaCount, storage });
  });

  // ---------------------------------------------------------------------------
  // R2 Storage Status, Quota Enforcement & Media Upload Routes
  // ---------------------------------------------------------------------------
  app.get('/api/admin/storage', async (c) => {
    const storage = await getR2StorageStatus(c.env);
    return c.json({ storage }, 200, { 'Cache-Control': 'no-store' });
  });

  app.post('/api/admin/storage/reconcile', async (c) => {
    const storage = await reconcileR2BucketUsage(c.env);
    return c.json({ storage });
  });

  app.post('/api/admin/images/upload', async (c) => {
    try {
      const formData = await c.req.formData();
      const file = formData.get('file');
      const projectId = String(formData.get('projectId') || 'unassigned');
      const categoryRaw = String(formData.get('category') || 'daily_log');
      const category: MediaCategory =
        categoryRaw === 'inspection' ||
        categoryRaw === 'daily_log' ||
        categoryRaw === 'logo' ||
        categoryRaw === 'signature'
          ? categoryRaw
          : 'daily_log';

      if (!file || typeof file === 'string') {
        return c.json(
          { error: 'Image file field is required.', code: 'MISSING_FILE' },
          400
        );
      }

      const uploadedFile = file as File;
      const bytes = await uploadedFile.arrayBuffer();
      const result = await uploadImageToR2(c.env, {
        projectId,
        category,
        contentType: uploadedFile.type || 'image/jpeg',
        originalName: uploadedFile.name,
        bytes,
      });

      return c.json(result, 201);
    } catch (err) {
      if (err instanceof R2UploadRejectedError) {
        return c.json(
          {
            error: err.message,
            code: err.code,
            storage: err.storage,
          },
          err.statusCode
        );
      }
      return c.json(
        {
          error: err instanceof Error ? err.message : 'Failed to upload image to R2.',
          code: 'UPLOAD_FAILED',
        },
        500
      );
    }
  });

  app.delete('/api/admin/images/*', async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const prefix = '/api/admin/images/';
    const objectKey = decodeURIComponent(
      pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''
    );
    if (!objectKey || objectKey.includes('..')) {
      return c.json({ error: 'Invalid object key' }, 400);
    }

    const deletedCount = await cleanupOrphanedMediaKeys(c.env, [objectKey]);
    if (deletedCount > 0) {
      runInBackground(
        c,
        purgeCacheKeys(edgeCache, c.req.url, [`${MEDIA_URL_PREFIX}${encodeURI(objectKey)}`])
      );
    }
    const storage = await getR2StorageStatus(c.env);
    return c.json({ deleted: deletedCount > 0, storage });
  });

  // ---------------------------------------------------------------------------
  // Fallback to Static SPA Assets
  // ---------------------------------------------------------------------------
  app.all('*', async (c) => {
    if (c.env.ASSETS) {
      return (await c.env.ASSETS.fetch(
        c.req.raw as unknown as Parameters<NonNullable<Env['ASSETS']>['fetch']>[0]
      )) as unknown as Response;
    }
    return c.json({ error: 'Not found' }, 404);
  });

  return app;
}

const app = createWorkerApp();

export default app;
