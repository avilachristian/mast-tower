import { createTestD1 as createMockD1 } from './helpers/d1';
import { describe, expect, it } from 'vitest';
import type { R2Bucket } from '../worker/cloudflareTypes';
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

    // Verify GET /api/admin/projects?summary=1 (B3)
    const summaryRes = await app.request(
      '/api/admin/projects?summary=1',
      { headers: { Cookie: cookie } },
      env
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson = (await summaryRes.json()) as {
      projects: Array<{ id: string; name: string; version: number; state?: unknown }>;
    };
    expect(summaryJson.projects.length).toBeGreaterThan(0);
    const p1Summary = summaryJson.projects.find((p) => p.id === 'proj-1');
    expect(p1Summary).toBeDefined();
    expect(p1Summary?.state).toBeUndefined();

    // Verify GET /api/admin/projects/:id (B3)
    const singleRes = await app.request(
      '/api/admin/projects/proj-1',
      { headers: { Cookie: cookie } },
      env
    );
    expect(singleRes.status).toBe(200);
    const singleJson = (await singleRes.json()) as {
      project: { id: string; state: { foundations: unknown[] } };
    };
    expect(singleJson.project.id).toBe('proj-1');
    expect(singleJson.project.state.foundations).toBeDefined();
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
      const bytes = new Uint8Array(byteLen);
      if (byteLen >= 3) {
        bytes[0] = 0xff;
        bytes[1] = 0xd8;
        bytes[2] = 0xff;
      }
      form.append('file', new File([bytes], 'photo.jpg', { type: 'image/jpeg' }));
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
    expect(imgRes.headers.get('X-Content-Type-Options')).toBe('nosniff');

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
    const sharedBytes = new Uint8Array(500);
    sharedBytes[0] = 0xff;
    sharedBytes[1] = 0xd8;
    sharedBytes[2] = 0xff;
    form.append('file', new File([sharedBytes], 'shared.jpg', { type: 'image/jpeg' }));
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

  it('rejects SVG uploads and validates binary image magic bytes', async () => {
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

    // 1. Attempt SVG upload -> rejected 415
    const svgForm = new FormData();
    svgForm.append('projectId', 'proj-img');
    svgForm.append('category', 'logo');
    svgForm.append('file', new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'logo.svg', { type: 'image/svg+xml' }));

    const svgRes = await app.request(
      '/api/admin/images/upload',
      { method: 'POST', headers: { Cookie: cookie }, body: svgForm },
      env
    );
    expect(svgRes.status).toBe(415);
    const svgJson = (await svgRes.json()) as { code: string };
    expect(svgJson.code).toBe('UNSUPPORTED_IMAGE_TYPE');

    // 2. Attempt forged MIME with invalid binary payload (e.g. text disguised as image/jpeg)
    const forgedForm = new FormData();
    forgedForm.append('projectId', 'proj-img');
    forgedForm.append('category', 'daily_log');
    forgedForm.append('file', new File(['not an actual jpeg file content at all'], 'fake.jpg', { type: 'image/jpeg' }));

    const forgedRes = await app.request(
      '/api/admin/images/upload',
      { method: 'POST', headers: { Cookie: cookie }, body: forgedForm },
      env
    );
    expect(forgedRes.status).toBe(415);
    const forgedJson = (await forgedRes.json()) as { code: string };
    expect(forgedJson.code).toBe('INVALID_IMAGE_SIGNATURE');

    // 3. Valid PNG upload with proper magic bytes (89 50 4E 47 0D 0A 1A 0A)
    const pngForm = new FormData();
    pngForm.append('projectId', 'proj-img');
    pngForm.append('category', 'logo');
    const validPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    pngForm.append('file', new File([validPngBytes], 'logo.png', { type: 'image/png' }));

    const pngRes = await app.request(
      '/api/admin/images/upload',
      { method: 'POST', headers: { Cookie: cookie }, body: pngForm },
      env
    );
    expect(pngRes.status).toBe(201);
  });
});
