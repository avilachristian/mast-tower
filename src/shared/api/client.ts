import { currentSessionEpoch } from './sessionEpoch';
import type {
  ClientProjectShowcaseDto,
  ClientShowcaseSettings,
  MastProjectState,
  PublicProjectSummary,
  SavedProjectRecord,
} from '@/entities/project/types';
import type { R2StorageStatus } from '@/shared/storage/r2Quota';

export type AdminUserDto = import('./access').AccessUser;

export interface SavedProjectSummary {
  id: string;
  name: string;
  slug: string;
  projectType: string;
  clientVisible: boolean;
  clientFeatured: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  payload: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    payload?: unknown
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export class R2StorageBlockedError extends ApiError {
  storage?: R2StorageStatus;

  constructor(message: string, storage?: R2StorageStatus, payload?: unknown) {
    super(507, 'R2_STORAGE_BLOCKED', message, payload);
    this.storage = storage;
  }
}

export async function requestJson<T>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const requestEpoch = currentSessionEpoch();
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, {
    ...init,
    cache: init.cache ?? 'no-store',
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  if (requestEpoch !== currentSessionEpoch())
    throw new ApiError(
      409,
      'SESSION_CHANGED',
      'The signed-in account changed. Please retry in the current session.'
    );
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const code =
      typeof data.code === 'string' ? data.code : `HTTP_${res.status}`;
    const message =
      typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`;

    if (res.status === 507 || code === 'R2_STORAGE_BLOCKED') {
      throw new R2StorageBlockedError(
        message,
        data.storage as R2StorageStatus | undefined,
        data
      );
    }

    throw new ApiError(res.status, code, message, data);
  }

  return data as T;
}

export const apiClient = {
  // Public Client Showcase (uses 'no-cache' so browser honors ETag / 304 conditional revalidation)
  fetchClientProjects: () =>
    requestJson<{ projects: ClientProjectShowcaseDto[] }>(
      '/api/client/projects',
      {
        cache: 'no-cache',
      }
    ),

  fetchClientProject: (idOrSlug: string) =>
    requestJson<{
      project: ClientProjectShowcaseDto;
      availableProjects?: PublicProjectSummary[];
    }>(`/api/client/projects/${encodeURIComponent(idOrSlug)}`, {
      cache: 'no-cache',
    }),

  // Admin Auth
  getSession: () =>
    requestJson<{ authenticated: boolean; user: AdminUserDto | null }>(
      '/api/auth/me'
    ),

  login: (username: string, password: string) =>
    requestJson<{ authenticated: boolean; user: AdminUserDto }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    ),

  logout: () =>
    requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  // Admin Projects
  listAdminProjects: () =>
    requestJson<{ projects: SavedProjectRecord[]; storage: R2StorageStatus }>(
      '/api/admin/projects'
    ),

  listAdminProjectSummaries: () =>
    requestJson<{ projects: SavedProjectSummary[]; storage: R2StorageStatus }>(
      '/api/admin/projects?summary=1'
    ),

  getAdminProject: (id: string) =>
    requestJson<{ project: SavedProjectRecord }>(
      `/api/admin/projects/${encodeURIComponent(id)}`
    ),

  createAdminProject: (payload: {
    id?: string;
    state: MastProjectState;
    clientSettings?: Partial<ClientShowcaseSettings>;
    createdAt?: string;
    updatedAt?: string;
  }) =>
    requestJson<{ project: SavedProjectRecord; storage: R2StorageStatus }>(
      '/api/admin/projects',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  saveAdminProject: (
    id: string,
    payload: {
      state: MastProjectState;
      clientSettings?: Partial<ClientShowcaseSettings>;
      expectedVersion?: number;
    }
  ) =>
    requestJson<{ project: SavedProjectRecord; storage: R2StorageStatus }>(
      `/api/admin/projects/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  updateClientVisibility: (
    id: string,
    patch: Partial<ClientShowcaseSettings>
  ) =>
    requestJson<{ project: SavedProjectRecord }>(
      `/api/admin/projects/${encodeURIComponent(id)}/visibility`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),

  deleteAdminProject: (id: string) =>
    requestJson<{
      ok: boolean;
      deletedMediaCount: number;
      storage: R2StorageStatus;
    }>(`/api/admin/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // R2 Storage & Images
  getStorageStatus: () =>
    requestJson<{ storage: R2StorageStatus }>('/api/admin/storage'),

  reconcileStorageStatus: () =>
    requestJson<{ storage: R2StorageStatus }>('/api/admin/storage/reconcile', {
      method: 'POST',
    }),

  uploadImageToR2: (params: {
    blob: Blob;
    filename: string;
    projectId: string;
    category: 'inspection' | 'daily_log' | 'logo' | 'signature';
  }) => {
    const formData = new FormData();
    formData.append('file', params.blob, params.filename);
    formData.append('projectId', params.projectId);
    formData.append('category', params.category);

    return requestJson<{
      objectKey: string;
      url: string;
      sizeBytes: number;
      storage: R2StorageStatus;
    }>('/api/admin/images/upload', {
      method: 'POST',
      body: formData,
    });
  },
};
