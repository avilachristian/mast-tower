-- Cloudflare D1 migration 0002: Free-tier efficiency, precomputed client DTOs, normalized project_media links, and O(1) storage counters

ALTER TABLE projects ADD COLUMN client_dto_json TEXT;

CREATE TABLE IF NOT EXISTS project_media (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL REFERENCES media_objects(object_key) ON DELETE CASCADE,
  PRIMARY KEY (project_id, object_key)
);

CREATE INDEX IF NOT EXISTS idx_project_media_key
  ON project_media (object_key);

CREATE INDEX IF NOT EXISTS idx_media_created_orphan
  ON media_objects (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_admin_users_lower_username
  ON admin_users (LOWER(username));

CREATE TABLE IF NOT EXISTS storage_counters (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_bytes INTEGER NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Backfill normalized project_media links for existing assigned media rows
INSERT OR IGNORE INTO project_media (project_id, object_key)
SELECT m.project_id, m.object_key
FROM media_objects m
JOIN projects p ON p.id = m.project_id
WHERE m.project_id IS NOT NULL;

-- Initialize singleton storage counter from current media_objects rows
INSERT OR IGNORE INTO storage_counters (id, total_bytes, object_count, updated_at)
SELECT 1, COALESCE(SUM(size_bytes), 0), COUNT(*), datetime('now')
FROM media_objects;
