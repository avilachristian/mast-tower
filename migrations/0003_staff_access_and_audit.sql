ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('super_admin','staff'));
ALTER TABLE admin_users ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE admin_users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1));
ALTER TABLE admin_users ADD COLUMN created_by TEXT;
-- A single existing account is the project owner. Multiple-account installations
-- require explicit owner designation before enabling the new Worker.
UPDATE admin_users SET role = 'super_admin'
WHERE id = (SELECT id FROM admin_users) AND (SELECT COUNT(*) FROM admin_users) = 1;
CREATE UNIQUE INDEX idx_admin_username_unique ON admin_users(LOWER(username));
CREATE TABLE admin_user_projects (
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, project_id)
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  diff_json TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  version_before INTEGER,
  version_after INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_project_date ON audit_logs(project_id,created_at DESC,id DESC);
CREATE INDEX idx_audit_actor_date ON audit_logs(user_id,created_at DESC,id DESC);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TABLE staff_operations (
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, operation_id)
);
