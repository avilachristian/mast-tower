import { useEffect, useState, type FormEvent } from 'react';
import { requestJson } from '@/shared/api/client';
import type {
  AccessUser,
  AuditEntry,
  StaffPermission,
} from '@/shared/api/access';
import './access.css';

export function AccountAuditPanel() {
  const [open, setOpen] = useState<'accounts' | 'audit' | null>(null),
    [users, setUsers] = useState<AccessUser[]>([]),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [editing, setEditing] = useState<AccessUser | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [filters, setFilters] = useState({
      projectId: '',
      userId: '',
      domain: '',
      from: '',
      to: '',
    });
  async function loadUsers() {
    const r = await requestJson<{
      users: AccessUser[];
      projects: { id: string; name: string }[];
    }>('/api/admin/users');
    setUsers(r.users);
    setProjects(r.projects);
  }
  async function loadAudit(next?: string) {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters))
        if (v)
          params.set(
            k,
            k === 'to'
              ? v + 'T23:59:59.999Z'
              : k === 'from'
                ? v + 'T00:00:00.000Z'
                : v
          );
      if (next) params.set('cursor', next);
      const r = await requestJson<{
        entries: AuditEntry[];
        nextCursor: string | null;
      }>('/api/admin/audit?' + params);
      setEntries((old) => (next ? [...old, ...r.entries] : r.entries));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to load audit history.'
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (open) void loadUsers().catch((e) => setError(e.message));
  }, [open]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      fd = new FormData(form),
      permissions = fd.getAll('permissions') as StaffPermission[],
      projectIds = fd.getAll('projectIds') as string[];
    const payload = {
      displayName: fd.get('displayName'),
      permissions,
      projectIds,
      ...(editing
        ? { isActive: fd.get('isActive') === 'on' }
        : { username: fd.get('username'), password: fd.get('password') }),
    };
    setBusy(true);
    setError('');
    try {
      await requestJson(
        '/api/admin/users' +
          (editing ? '/' + encodeURIComponent(editing.id) : ''),
        { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) }
      );
      setEditing(null);
      form.reset();
      await loadUsers();
      setNotice('Account saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save account.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="access-owner-tools print:hidden">
        <button
          onClick={() => {
            setOpen('accounts');
            setError('');
          }}
        >
          Team accounts
        </button>
        <button
          onClick={() => {
            setOpen('audit');
            void loadAudit();
          }}
        >
          Audit history
        </button>
      </div>
      {open && (
        <div
          className="access-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={open === 'accounts' ? 'Team accounts' : 'Audit history'}
        >
          <div className="access-dialog access-page">
            <header>
              <h1>{open === 'accounts' ? 'Team accounts' : 'Audit history'}</h1>
              <button onClick={() => setOpen(null)}>Close</button>
            </header>
            {error && (
              <p className="access-error" role="alert">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {open === 'accounts' ? (
              <>
                <div className="access-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Role</th>
                        <th>Access</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            {u.displayName}
                            <br />
                            {u.username}
                          </td>
                          <td>
                            {u.role === 'super_admin'
                              ? 'Site Engineer'
                              : 'Admin Staff'}
                          </td>
                          <td>
                            {u.permissions.join(', ')}
                            <br />
                            {u.projectIds
                              .map(
                                (id) =>
                                  projects.find((p) => p.id === id)?.name ?? id
                              )
                              .join(', ')}
                          </td>
                          <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                          <td>
                            {u.role === 'staff' && (
                              <button onClick={() => setEditing(u)}>
                                Edit account
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h2>
                  {editing
                    ? 'Edit ' + editing.username
                    : 'Create staff account'}
                </h2>
                <form onSubmit={(e) => void save(e)} key={editing?.id ?? 'new'}>
                  <fieldset disabled={busy}>
                    {!editing && (
                      <>
                        <label>
                          Username
                          <input
                            name="username"
                            required
                            minLength={3}
                            maxLength={64}
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          Initial password
                          <input
                            name="password"
                            type="password"
                            required
                            minLength={8}
                            maxLength={200}
                            autoComplete="new-password"
                          />
                        </label>
                      </>
                    )}
                    <label>
                      Display name
                      <input
                        name="displayName"
                        required
                        defaultValue={editing?.displayName}
                      />
                    </label>
                    <h3>Modules</h3>
                    {(['manpower_payroll', 'hauling_inventory'] as const).map(
                      (p) => (
                        <label key={p}>
                          <input
                            type="checkbox"
                            name="permissions"
                            value={p}
                            defaultChecked={
                              editing ? editing.permissions.includes(p) : true
                            }
                          />
                          {p === 'manpower_payroll'
                            ? 'Manpower & payroll'
                            : 'Hauling & inventory'}
                        </label>
                      )
                    )}
                    <h3>Assigned projects</h3>
                    {projects.map((p) => (
                      <label key={p.id}>
                        <input
                          type="checkbox"
                          name="projectIds"
                          value={p.id}
                          defaultChecked={editing?.projectIds.includes(p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                    {editing && (
                      <label>
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={editing.isActive}
                        />
                        Active account
                      </label>
                    )}
                    <div className="access-toolbar">
                      <button type="submit">Save account</button>
                      {editing && (
                        <button type="button" onClick={() => setEditing(null)}>
                          Cancel edit
                        </button>
                      )}
                    </div>
                  </fieldset>
                </form>
                {editing && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      setBusy(true);
                      void requestJson(
                        '/api/admin/users/' +
                          encodeURIComponent(editing.id) +
                          '/reset-password',
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            password: fd.get('password'),
                          }),
                        }
                      )
                        .then(() => {
                          setEditing(null);
                          setNotice(
                            'Password reset. Existing staff sessions have been revoked.'
                          );
                        })
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <label>
                      New password
                      <input
                        type="password"
                        name="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </label>
                    <button type="submit" disabled={busy}>
                      Reset password & revoke sessions
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                <p>
                  History records changes accepted by the server. Offline owner
                  edits are attributed to the account uploading them at sync
                  time.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void loadAudit();
                  }}
                >
                  <label>
                    Project
                    <select
                      value={filters.projectId}
                      onChange={(e) =>
                        setFilters({ ...filters, projectId: e.target.value })
                      }
                    >
                      <option value="">All projects (including deleted)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Person
                    <select
                      value={filters.userId}
                      onChange={(e) =>
                        setFilters({ ...filters, userId: e.target.value })
                      }
                    >
                      <option value="">Everyone</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Module
                    <select
                      value={filters.domain}
                      onChange={(e) =>
                        setFilters({ ...filters, domain: e.target.value })
                      }
                    >
                      <option value="">All modules</option>
                      {[
                        'manpower_payroll',
                        'hauling_inventory',
                        'project',
                        'account',
                      ].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    From (UTC)
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) =>
                        setFilters({ ...filters, from: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    To (UTC)
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) =>
                        setFilters({ ...filters, to: e.target.value })
                      }
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    Filter history
                  </button>
                </form>
                {!entries.length && <p>No history entries found.</p>}
                {entries.map((entry) => (
                  <article className="access-card" key={entry.id}>
                    <strong>{entry.summary}</strong>
                    <p>
                      {entry.display_name} ({entry.username}) ·{' '}
                      {new Date(entry.created_at).toLocaleString()} ·{' '}
                      {entry.domain}
                    </p>
                    <details>
                      <summary>View changed fields</summary>
                      <div className="access-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Before</th>
                              <th>After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(
                              JSON.parse(entry.diff_json) as Record<
                                string,
                                { old: unknown; new: unknown }
                              >
                            ).map(([field, v]) => (
                              <tr key={field}>
                                <td>{field}</td>
                                <td>
                                  <pre>{JSON.stringify(v.old, null, 2)}</pre>
                                </td>
                                <td>
                                  <pre>{JSON.stringify(v.new, null, 2)}</pre>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </article>
                ))}
                {cursor && (
                  <button
                    disabled={busy}
                    onClick={() => void loadAudit(cursor)}
                  >
                    Load more
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
