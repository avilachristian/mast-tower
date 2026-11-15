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
  recordFailedLoginAttempt,
  requireAdmin,
  setSessionCookie,
} from './auth';
import {
  cleanupOrphanedMediaKeys,
  extractMediaKeysFromProjectState,
  getR2StorageStatus,
  MEDIA_URL_PREFIX,
  R2UploadRejectedError,
  reconcileR2BucketUsage,
  uploadImageToR2,
  type MediaCategory,
} from './r2Service';
import type { AdminSessionUser, Env, ProjectRow } from './types';

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
): Promise<void> {
  const rows = await env.DB.prepare(
    'SELECT id, client_settings_json FROM projects WHERE client_featured = 1 AND id != ?'
  )
    .bind(activeFeaturedId)
    .all<{ id: string; client_settings_json: string }>();

  for (const row of rows.results ?? []) {
    const parsed = parseJsonSafe<Partial<ClientShowcaseSettings>>(
      row.client_settings_json,
      {}
    );
    const updated = JSON.stringify({ ...parsed, featured: false });
    await env.DB.prepare(
      'UPDATE projects SET client_featured = 0, client_settings_json = ? WHERE id = ?'
    )
      .bind(updated, row.id)
      .run();
  }
}

async function linkProjectMediaKeys(
  env: Env,
  projectId: string,
  keys: Iterable<string>
): Promise<void> {
  for (const key of keys) {
    await env.DB.prepare(
      'UPDATE media_objects SET project_id = ? WHERE object_key = ? AND (project_id IS NULL OR project_id != ?)'
    )
      .bind(projectId, key, projectId)
      .run();
  }
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

export function createWorkerApp() {
  const app = new Hono<AppContext>();

  app.get('/api/health', (c) =>
    c.json({ ok: true, timestamp: new Date().toISOString() })
  );

  // ---------------------------------------------------------------------------
  // Public Client Showcase Endpoints (Strictly Sanitized DTOs)
  // ---------------------------------------------------------------------------
  app.get('/api/client/projects', async (c) => {
    const result = await c.env.DB.prepare(
      `SELECT * FROM projects
       WHERE client_visible = 1
       ORDER BY client_featured DESC, updated_at DESC`
    ).all<ProjectRow>();

    const projects = (result.results ?? []).map((row) =>
      buildClientShowcaseDto(rowToSavedProjectRecord(row))
    );

    return c.json(
      { projects },
      200,
      { 'Cache-Control': 'no-store' }
    );
  });

  app.get('/api/client/projects/:idOrSlug', async (c) => {
    const idOrSlug = c.req.param('idOrSlug');
    const row = await c.env.DB.prepare(
      `SELECT * FROM projects
       WHERE client_visible = 1 AND (id = ? OR slug = ?)
       LIMIT 1`
    )
      .bind(idOrSlug, idOrSlug)
      .first<ProjectRow>();

    if (!row) {
      return c.json(
        { error: 'Published project not found.', code: 'NOT_FOUND' },
        404
      );
    }

    return c.json(
      { project: buildClientShowcaseDto(rowToSavedProjectRecord(row)) },
      200,
      { 'Cache-Control': 'no-store' }
    );
  });

  // ---------------------------------------------------------------------------
  // Same-Origin Image Serving from R2 (Zero-CORS for Vector PDF Exports)
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
    headers.set('ETag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(object.body as BodyInit, {
      status: 200,
      headers,
    });
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

    const clientIp =
      c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';
    const ipKey = `${clientIp}:${username.toLowerCase()}`;

    const rate = await checkLoginRateLimit(c.env, ipKey);
    if (!rate.allowed) {
      return c.json(
        {
          error: `Too many failed sign-in attempts. Please wait ${rate.retryAfterSec} seconds and try again.`,
          code: 'RATE_LIMITED',
          retryAfterSec: rate.retryAfterSec,
        },
        429
      );
    }

    const user = await authenticateAdminCredentials(c.env, username, password);
    if (!user) {
      await recordFailedLoginAttempt(c.env, ipKey);
      return c.json(
        { error: 'Invalid admin username or password.', code: 'INVALID_CREDENTIALS' },
        401
      );
    }

    await clearLoginAttempts(c.env, ipKey);
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

    if (finalSettings.featured) {
      await clearOtherFeaturedProjects(c.env, id);
    }

    await c.env.DB.prepare(
      `INSERT INTO projects (
         id, slug, name, project_type, client_visible, client_featured,
         client_settings_json, state_json, version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
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
        createdAt,
        updatedAt
      )
      .run();

    await linkProjectMediaKeys(
      c.env,
      id,
      extractMediaKeysFromProjectState(body.state)
    );

    const created = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    )
      .bind(id)
      .first<ProjectRow>();

    const storage = await getR2StorageStatus(c.env);
    return c.json(
      {
        project: created ? rowToSavedProjectRecord(created) : null,
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
      if (finalSettings.featured) {
        await clearOtherFeaturedProjects(c.env, id);
      }

      await c.env.DB.prepare(
        `INSERT INTO projects (
           id, slug, name, project_type, client_visible, client_featured,
           client_settings_json, state_json, version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
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
          now,
          now
        )
        .run();

      await linkProjectMediaKeys(
        c.env,
        id,
        extractMediaKeysFromProjectState(body.state)
      );

      const savedRow = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ?'
      )
        .bind(id)
        .first<ProjectRow>();
      const storage = await getR2StorageStatus(c.env);
      return c.json({
        project: savedRow ? rowToSavedProjectRecord(savedRow) : null,
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

    if (finalSettings.featured) {
      await clearOtherFeaturedProjects(c.env, id);
    }

    const name =
      body.state.reportDetails?.projectName?.trim() ||
      body.state.projectName ||
      existing.name;
    const projectType = body.state.projectType ?? 'foundation';
    const nextVersion = existing.version + 1;

    await c.env.DB.prepare(
      `UPDATE projects
       SET slug = ?, name = ?, project_type = ?, client_visible = ?, client_featured = ?,
           client_settings_json = ?, state_json = ?, version = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        uniqueSlug,
        name,
        projectType,
        finalSettings.enabled ? 1 : 0,
        finalSettings.featured ? 1 : 0,
        JSON.stringify(finalSettings),
        JSON.stringify(body.state),
        nextVersion,
        now,
        id
      )
      .run();

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

    const updatedRow = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    )
      .bind(id)
      .first<ProjectRow>();
    const storage = await getR2StorageStatus(c.env);

    return c.json({
      project: updatedRow ? rowToSavedProjectRecord(updatedRow) : null,
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

    if (finalSettings.featured) {
      await clearOtherFeaturedProjects(c.env, id);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE projects
       SET slug = ?, client_visible = ?, client_featured = ?, client_settings_json = ?,
           version = version + 1, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        uniqueSlug,
        finalSettings.enabled ? 1 : 0,
        finalSettings.featured ? 1 : 0,
        JSON.stringify(finalSettings),
        now,
        id
      )
      .run();

    const updatedRow = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    )
      .bind(id)
      .first<ProjectRow>();

    return c.json({
      project: updatedRow ? rowToSavedProjectRecord(updatedRow) : null,
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

    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    const deletedMediaCount = await cleanupOrphanedMediaKeys(c.env, candidateKeys);
    const storage = await getR2StorageStatus(c.env);

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
        categoryRaw === 'logo'
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
