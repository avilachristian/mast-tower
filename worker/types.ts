import type { D1Database, Fetcher, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  IMAGES_BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  R2_QUOTA_BYTES?: string;
  R2_WARN_REMAINING_BYTES?: string;
  R2_BLOCK_REMAINING_BYTES?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_DISPLAY_NAME?: string;
}

export interface ProjectRow {
  id: string;
  slug: string | null;
  name: string;
  project_type: string;
  client_visible: number;
  client_featured: number;
  client_settings_json: string;
  state_json: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface AdminSessionUser {
  id: string;
  username: string;
  displayName: string;
}
