import { Hono } from 'hono';
import type { AdminSessionUser, Env, ProjectRow, AdminUserRow } from './types';
import { hashPassword, sessionDto, sha256Hex } from './auth';
import { auditStatement, diffRecords } from './audit';
import {
  applyCommand,
  CommandError,
  exact,
  object,
  parseCommand,
  str,
  workspaceDto,
} from './staffDomain';
import type { StaffPermission } from '../src/shared/api/access';
import type { MastProjectState } from '../src/entities/project/types';
import type { D1PreparedStatement } from '@cloudflare/workers-types';

type Persist = (
  env: Env,
  row: ProjectRow,
  next: MastProjectState,
  now: string
) => D1PreparedStatement;
export function accessRoutes(
  persist: Persist,
  invalidate: (url: string, row: ProjectRow) => Promise<void>
) {
  const app = new Hono<{
    Bindings: Env;
    Variables: { adminUser?: AdminSessionUser };
  }>();
  app.onError((err, c) =>
    err instanceof SyntaxError
      ? c.json({ error: 'Invalid JSON request.', code: 'INVALID_REQUEST' }, 400)
      : err instanceof CommandError
        ? c.json(
            {
              error: err.message,
              code: err.status === 409 ? 'VERSION_CONFLICT' : 'INVALID_REQUEST',
            },
            err.status
          )
        : c.json(
            {
              error: 'The request could not be saved. Please retry.',
              code: 'SAVE_FAILED',
            },
            500
          )
  );
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('/users*', async (c, next) => {
    if (c.get('adminUser')?.role !== 'super_admin')
      return c.json({ error: 'Site Engineer access required.' }, 403);
    await next();
  });
  app.use('/audit*', async (c, next) => {
    if (c.get('adminUser')?.role !== 'super_admin')
      return c.json({ error: 'Site Engineer access required.' }, 403);
    await next();
  });
  app.get('/users', async (c) => {
    const rows = await c.env.DB.prepare(
      'SELECT * FROM admin_users ORDER BY created_at'
    ).all<AdminUserRow>();
    const users = await Promise.all(
      rows.results.map((r) => sessionDto(c.env, r))
    );
    const projects = await c.env.DB.prepare(
      'SELECT id, name FROM projects ORDER BY name'
    ).all<{ id: string; name: string }>();
    return c.json({ users, projects: projects.results });
  });
  function permissions(v: unknown): StaffPermission[] {
    if (
      !Array.isArray(v) ||
      v.some((x) => x !== 'manpower_payroll' && x !== 'hauling_inventory')
    )
      throw new CommandError('Invalid permissions.');
    return [...new Set(v)] as StaffPermission[];
  }
  async function assignments(env: Env, v: unknown): Promise<string[]> {
    if (
      !Array.isArray(v) ||
      v.some((x) => typeof x !== 'string') ||
      v.length > 1000
    )
      throw new CommandError('Invalid project assignments.');
    const ids = [...new Set(v)] as string[];
    for (const id of ids)
      if (
        !(await env.DB.prepare('SELECT id FROM projects WHERE id = ?')
          .bind(id)
          .first())
      )
        throw new CommandError('Unknown project assignment.');
    return ids;
  }
  const accountAudit = (
    env: Env,
    actor: AdminSessionUser,
    id: string,
    before: unknown,
    after: unknown,
    action: string
  ) =>
    auditStatement(
      env,
      actor,
      null,
      [
        {
          domain: 'account',
          entity: 'user_account',
          entityId: id,
          action,
          diff: diffRecords(before, after),
        },
      ],
      crypto.randomUUID(),
      null,
      null
    );
  app.post('/users', async (c) => {
    const body = object(await c.req.json());
    exact(body, [
      'username',
      'displayName',
      'password',
      'permissions',
      'projectIds',
    ]);
    const username = str(body.username, 64).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username))
      throw new CommandError(
        'Username must contain 3–64 letters, numbers, dots, dashes or underscores.'
      );
    const displayName = str(body.displayName),
      password = str(body.password, 200);
    if (password.length < 8)
      throw new CommandError('Use a password of at least 8 characters.');
    if (
      await c.env.DB.prepare(
        'SELECT id FROM admin_users WHERE LOWER(username) = ?'
      )
        .bind(username)
        .first()
    )
      throw new CommandError('Username already exists.', 409);
    const perms = permissions(body.permissions),
      projectIds = await assignments(c.env, body.projectIds),
      id = crypto.randomUUID(),
      now = new Date().toISOString(),
      actor = c.get('adminUser')!;
    const user = {
      id,
      username,
      displayName,
      role: 'staff',
      permissions: perms,
      projectIds,
      isActive: true,
    };
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO admin_users (id,username,display_name,password_hash,created_at,updated_at,role,permissions_json,is_active,created_by) VALUES (?,?,?,?,?,?,'staff',?,1,?)"
      ).bind(
        id,
        username,
        displayName,
        await hashPassword(password),
        now,
        now,
        JSON.stringify(perms),
        actor.id
      ),
      accountAudit(c.env, actor, id, null, user, 'CREATE'),
      ...projectIds.map((pid) =>
        c.env.DB.prepare(
          'INSERT INTO admin_user_projects(user_id,project_id) VALUES (?,?)'
        ).bind(id, pid)
      ),
    ]);
    return c.json({ user }, 201);
  });
  app.patch('/users/:id', async (c) => {
    const id = c.req.param('id'),
      row = await c.env.DB.prepare('SELECT * FROM admin_users WHERE id = ?')
        .bind(id)
        .first<AdminUserRow>();
    if (!row) throw new CommandError('Account not found.', 404);
    if (row.role === 'super_admin')
      throw new CommandError('The Site Engineer account is protected.', 403);
    const body = object(await c.req.json());
    exact(body, ['displayName', 'permissions', 'projectIds', 'isActive']);
    const before = await sessionDto(c.env, row),
      displayName =
        body.displayName === undefined
          ? row.display_name
          : str(body.displayName),
      perms =
        body.permissions === undefined
          ? before.permissions
          : permissions(body.permissions),
      projectIds =
        body.projectIds === undefined
          ? before.projectIds
          : await assignments(c.env, body.projectIds);
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean')
      throw new CommandError('Invalid account status.');
    const active = body.isActive ?? before.isActive;
    const after = {
      ...before,
      displayName,
      permissions: perms,
      projectIds,
      isActive: active,
    };
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE admin_users SET display_name = ?, permissions_json = ?, is_active = ?, updated_at = ? WHERE id = ? AND role = ?'
      ).bind(
        displayName,
        JSON.stringify(perms),
        active ? 1 : 0,
        new Date().toISOString(),
        id,
        'staff'
      ),
      accountAudit(c.env, c.get('adminUser')!, id, before, after, 'UPDATE'),
      c.env.DB.prepare(
        'DELETE FROM admin_user_projects WHERE user_id = ?'
      ).bind(id),
      ...projectIds.map((pid) =>
        c.env.DB.prepare(
          'INSERT INTO admin_user_projects(user_id,project_id) VALUES (?,?)'
        ).bind(id, pid)
      ),
      ...(!active
        ? [
            c.env.DB.prepare(
              'DELETE FROM admin_sessions WHERE user_id = ?'
            ).bind(id),
          ]
        : []),
    ]);
    return c.json({ user: after });
  });
  app.post('/users/:id/reset-password', async (c) => {
    const id = c.req.param('id'),
      row = await c.env.DB.prepare('SELECT * FROM admin_users WHERE id = ?')
        .bind(id)
        .first<AdminUserRow>();
    if (!row) throw new CommandError('Account not found.', 404);
    if (row.role === 'super_admin')
      throw new CommandError('The Site Engineer account is protected.', 403);
    const body = object(await c.req.json());
    exact(body, ['password']);
    const password = str(body.password, 200);
    if (password.length < 8)
      throw new CommandError('Use a password of at least 8 characters.');
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?'
      ).bind(await hashPassword(password), new Date().toISOString(), id),
      accountAudit(
        c.env,
        c.get('adminUser')!,
        id,
        { reset: false },
        { reset: true },
        'PASSWORD_RESET'
      ),
      c.env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(id),
    ]);
    return c.json({ ok: true });
  });
  app.get('/staff/projects', async (c) => {
    const user = c.get('adminUser')!;
    const projects = await c.env.DB.prepare(
      'SELECT p.id, p.name FROM projects p JOIN admin_user_projects a ON a.project_id = p.id WHERE a.user_id = ? ORDER BY p.name'
    )
      .bind(user.id)
      .all();
    return c.json({ projects: projects.results });
  });
  async function assigned(env: Env, user: AdminSessionUser, id: string) {
    if (!user.projectIds.includes(id))
      throw new CommandError('Project not found.', 404);
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?')
      .bind(id)
      .first<ProjectRow>();
    if (!row) throw new CommandError('Project not found.', 404);
    return row;
  }
  app.get('/staff/projects/:id/workspace', async (c) => {
    const user = c.get('adminUser')!;
    return c.json({
      workspace: workspaceDto(
        await assigned(c.env, user, c.req.param('id')),
        user
      ),
    });
  });
  app.post('/staff/projects/:id/commands', async (c) => {
    const user = c.get('adminUser')!,
      row = await assigned(c.env, user, c.req.param('id')),
      command = parseCommand(await c.req.json());
    // Validate current permission even for a replay, before looking up its receipt.
    const permission = ['hauling.save', 'material.save', 'rates.save'].includes(
      command.type
    )
      ? 'hauling_inventory'
      : 'manpower_payroll';
    if (!user.permissions.includes(permission))
      throw new CommandError('This action is not permitted.', 403);
    const hash = await sha256Hex(JSON.stringify(command));
    const receipt = () =>
      c.env.DB.prepare(
        'SELECT * FROM staff_operations WHERE user_id = ? AND operation_id = ?'
      )
        .bind(user.id, command.operationId)
        .first<{
          project_id: string;
          payload_hash: string;
          result_version: number;
        }>();
    const replay = await receipt();
    if (replay) {
      if (replay.project_id !== row.id || replay.payload_hash !== hash)
        throw new CommandError(
          'Operation ID already used with a different request.',
          409
        );
      return c.json({
        workspace: workspaceDto(row, user),
        replayed: true,
        resultVersion: replay.result_version,
      });
    }
    if (command.expectedVersion !== row.version)
      throw new CommandError(
        'Project changed. Refresh and review your form before submitting again.',
        409
      );
    const next = applyCommand(
        JSON.parse(row.state_json),
        command,
        user.permissions
      ),
      now = new Date().toISOString();
    try {
      const { projectChanges } = await import('./audit');
      const results = await c.env.DB.batch([
        persist(c.env, row, next, now),
        auditStatement(
          c.env,
          user,
          row.id,
          projectChanges(JSON.parse(row.state_json), next),
          command.operationId,
          row.version,
          row.version + 1
        ),
        c.env.DB.prepare(
          'INSERT INTO staff_operations(user_id,operation_id,project_id,payload_hash,result_version,created_at) SELECT ?,?,?,?,?,? WHERE changes() > 0'
        ).bind(
          user.id,
          command.operationId,
          row.id,
          hash,
          row.version + 1,
          now
        ),
      ]);
      if (results[0].meta.changes !== 1)
        throw new CommandError(
          'Project changed. Refresh and review your form before submitting again.',
          409
        );
    } catch (err) {
      if (err instanceof CommandError) throw err;
      const duplicate = await receipt();
      if (
        !duplicate ||
        duplicate.payload_hash !== hash ||
        duplicate.project_id !== row.id
      )
        throw err;
      const current = await assigned(c.env, user, row.id);
      return c.json({
        workspace: workspaceDto(current, user),
        replayed: true,
        resultVersion: duplicate.result_version,
      });
    }
    await invalidate(c.req.url, row);
    return c.json({
      workspace: workspaceDto(
        {
          ...row,
          state_json: JSON.stringify(next),
          version: row.version + 1,
          updated_at: now,
        },
        user
      ),
      resultVersion: row.version + 1,
    });
  });
  app.get('/audit', async (c) => {
    const conditions: string[] = [],
      values: (string | number)[] = [];
    for (const [query, column] of [
      ['projectId', 'project_id'],
      ['userId', 'user_id'],
      ['domain', 'domain'],
    ] as const) {
      const v = c.req.query(query);
      if (v) {
        conditions.push(`${column} = ?`);
        values.push(str(v));
      }
    }
    for (const [query, op] of [
      ['from', '>='],
      ['to', '<='],
    ] as const) {
      const v = c.req.query(query);
      if (v) {
        conditions.push(`created_at ${op} ?`);
        values.push(str(v, 40));
      }
    }
    const cursor = c.req.query('cursor');
    if (cursor) {
      let v: string[];
      try {
        v = JSON.parse(cursor);
      } catch {
        throw new CommandError('Invalid cursor.');
      }
      if (!Array.isArray(v) || v.length !== 2)
        throw new CommandError('Invalid cursor.');
      conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
      values.push(str(v[0], 40), str(v[0], 40), str(v[1]));
    }
    const limit = Math.min(
      100,
      Math.max(1, Number(c.req.query('limit')) || 30)
    );
    const result = await c.env.DB.prepare(
      `SELECT * FROM audit_logs ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC,id DESC LIMIT ?`
    )
      .bind(...values, limit + 1)
      .all<{ id: string; created_at: string }>();
    const entries = result.results.slice(0, limit),
      last = entries.at(-1);
    return c.json({
      entries,
      nextCursor:
        result.results.length > limit && last
          ? JSON.stringify([last.created_at, last.id])
          : null,
    });
  });
  app.get('/audit/:id', async (c) => {
    const entry = await c.env.DB.prepare(
      'SELECT * FROM audit_logs WHERE id = ?'
    )
      .bind(c.req.param('id'))
      .first();
    if (!entry) throw new CommandError('Audit record not found.', 404);
    return c.json({ entry });
  });
  return app;
}
