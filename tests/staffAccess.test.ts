import { requestJson } from '../src/shared/api/client';
import { invalidateSessionRequests } from '../src/shared/api/sessionEpoch';
import { ensureSeededAdminUser } from '../worker/auth';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { R2Bucket } from '../worker/cloudflareTypes';
import { createTestD1 } from './helpers/d1';
import { createWorkerApp } from '../worker/index';
import { createSampleMast2Project } from '../src/entities/project/mast2Baseline';
import {
  applyCommand,
  parseCommand,
  workspaceDto,
} from '../worker/staffDomain';
import type { Env, ProjectRow } from '../worker/types';
import { useAuthStore } from '../src/shared/state/authStore';
import {
  useProjectStore,
  clearOwnerWorkspaceMemory,
} from '../src/shared/state/projectStore';
import { syncSingleProjectToCloud } from '../src/shared/storage/cloudSync';

async function setup() {
  const db = createTestD1(),
    app = createWorkerApp({ edgeCache: null }),
    env: Env = {
      DB: db,
      IMAGES_BUCKET: {
        list: async () => ({ objects: [], truncated: false }),
        delete: async () => {},
      } as unknown as R2Bucket,
      ADMIN_USERNAME: 'owner',
      ADMIN_PASSWORD: 'OwnerPassword123',
    };
  const call = (
    path: string,
    method = 'GET',
    body?: unknown,
    cookie?: string
  ) =>
    app.request(
      path,
      {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          'Content-Type': 'application/json',
        },
        ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
      },
      env
    );
  const login = async (username: string, password: string) => {
    const r = await call('/api/auth/login', 'POST', { username, password });
    expect(r.status).toBe(200);
    return r.headers.get('set-cookie')!.split(';')[0];
  };
  const owner = await login('owner', 'OwnerPassword123');
  const state = createSampleMast2Project();
  state.manpowerRoster = [
    {
      id: 'worker',
      name: 'Worker',
      category: 'civil_works',
      position: 'Laborer',
      dailyRatePhp: 777,
      active: true,
    },
    {
      id: 'hauler',
      name: 'Hauler',
      category: 'hauler',
      position: 'Horse Hauler',
      dailyRatePhp: 0,
      active: true,
    },
  ];
  state.haulerRoster = ['Hauler'];
  state.civilAttendance = [
    { date: '2026-11-17', presentMemberIds: ['worker'] },
  ];
  const created = await call(
    '/api/admin/projects',
    'POST',
    { id: 'project', state },
    owner
  );
  expect(created.status).toBe(201);
  const other = await call(
    '/api/admin/projects',
    'POST',
    { id: 'other', state },
    owner
  );
  expect(other.status).toBe(201);
  const create = async (
    username: string,
    permissions = ['manpower_payroll', 'hauling_inventory']
  ) => {
    const r = await call(
      '/api/admin/users',
      'POST',
      {
        username,
        displayName: username,
        password: 'StaffPassword123',
        permissions,
        projectIds: ['project'],
      },
      owner
    );
    expect(r.status).toBe(201);
    return ((await r.json()) as { user: { id: string } }).user.id;
  };
  const staffId = await create('staff'),
    staff = await login('staff', 'StaffPassword123');
  const command = (
    payload: unknown,
    version = 1,
    operationId: string = crypto.randomUUID(),
    type = 'member.save'
  ) =>
    call(
      '/api/admin/staff/projects/project/commands',
      'POST',
      { operationId, expectedVersion: version, type, payload },
      staff
    );
  return { db, app, env, call, login, owner, staff, staffId, create, command };
}
const member = {
  id: 'worker',
  name: 'Worker',
  category: 'civil_works',
  position: 'Laborer',
  dailyRatePhp: 850,
  active: true,
};

describe('Staff access with real SQLite transactions', () => {
  it('filters assigned project lists, denies full-state and administrative endpoints, and protects the owner', async () => {
    const { call, staff, owner } = await setup();
    const list = await call(
      '/api/admin/staff/projects',
      'GET',
      undefined,
      staff
    );
    expect(
      ((await list.json()) as { projects: { id: string }[] }).projects.map(
        (p) => p.id
      )
    ).toEqual(['project']);
    for (const [path, method] of [
      ['/api/admin/projects', 'GET'],
      ['/api/admin/projects/project', 'GET'],
      ['/api/admin/projects/project', 'PUT'],
      ['/api/admin/projects/project', 'DELETE'],
      ['/api/admin/users', 'GET'],
      ['/api/admin/users', 'POST'],
      ['/api/admin/audit', 'GET'],
      ['/api/admin/storage', 'GET'],
      ['/api/admin/storage/reconcile', 'POST'],
      ['/api/admin/images/upload', 'POST'],
      ['/api/admin/images/x', 'DELETE'],
      ['/api/admin/projects/project/visibility', 'PATCH'],
    ])
      expect((await call(path, method, {}, staff)).status, path).toBe(403);
    expect(
      (
        await call(
          '/api/admin/staff/projects/other/workspace',
          'GET',
          undefined,
          staff
        )
      ).status
    ).toBe(404);
    const me = await call('/api/auth/me', 'GET', undefined, owner),
      id = ((await me.json()) as { user: { id: string } }).user.id;
    expect(
      (
        await call(
          '/api/admin/users/' + id,
          'PATCH',
          { isActive: false },
          owner
        )
      ).status
    ).toBe(403);
  });
  it('returns only hauling data to hauling-only staff, including inventory usage aggregates without daily logs', async () => {
    const { call, owner, staffId, staff } = await setup();
    await call(
      '/api/admin/users/' + staffId,
      'PATCH',
      { permissions: ['hauling_inventory'] },
      owner
    );
    const res = await call(
        '/api/admin/staff/projects/project/workspace',
        'GET',
        undefined,
        staff
      ),
      text = await res.text();
    const dto = JSON.parse(text).workspace;
    expect(dto.inventorySummary.length).toBeGreaterThan(0);
    for (const key of [
      'manpowerRoster',
      'civilAttendance',
      'civilPayrollHistory',
      'haulerPayouts',
      'foundations',
      'dailyLogs',
      'verticalMast',
      'clientSettings',
    ])
      expect(dto).not.toHaveProperty(key);
    expect(text).not.toContain('dailyRatePhp');
    expect(text).not.toContain('777');
    expect(
      (
        await call(
          '/api/admin/staff/projects/project/commands',
          'POST',
          {
            operationId: 'no-payroll',
            expectedVersion: 1,
            type: 'member.save',
            payload: member,
          },
          staff
        )
      ).status
    ).toBe(403);
  });
  it('allows payroll-only dependencies without granting hauling edits', async () => {
    const { call, owner, staffId, staff } = await setup();
    await call(
      '/api/admin/users/' + staffId,
      'PATCH',
      { permissions: ['manpower_payroll'] },
      owner
    );
    const dto = (
      (await (
        await call(
          '/api/admin/staff/projects/project/workspace',
          'GET',
          undefined,
          staff
        )
      ).json()) as { workspace: Record<string, unknown> }
    ).workspace;
    expect(dto.manpowerRoster).toBeDefined();
    expect(dto.haulingLogs).toBeDefined();
    expect(dto).not.toHaveProperty('centralMaterials');
    expect(
      (
        await call(
          '/api/admin/staff/projects/project/commands',
          'POST',
          {
            operationId: 'rates-denied',
            expectedVersion: 1,
            type: 'rates.save',
            payload: { creditBlockKg: 120, ratePerBlockPhp: 1000 },
          },
          staff
        )
      ).status
    ).toBe(403);
  });
  it('saves permitted fields, preserves construction state, and records trusted field diffs', async () => {
    const { db, command, staffId } = await setup();
    const before = db.sqlite
      .prepare('SELECT state_json FROM projects WHERE id = ?')
      .get('project')!.state_json as string;
    const response = await command(member);
    expect(response.status).toBe(200);
    const after = JSON.parse(
      db.sqlite
        .prepare('SELECT state_json FROM projects WHERE id = ?')
        .get('project')!.state_json as string
    );
    expect(after.foundations).toEqual(JSON.parse(before).foundations);
    expect(after.manpowerRoster[0].dailyRatePhp).toBe(850);
    const log = db.sqlite
      .prepare('SELECT * FROM audit_logs WHERE user_id = ? AND entity_id = ?')
      .get(staffId, 'worker')!;
    expect(log.username).toBe('staff');
    expect(JSON.parse(log.diff_json as string).dailyRatePhp).toEqual({
      old: 777,
      new: 850,
    });
    expect(log.version_after).toBe(2);
  });
  it('deduplicates retries and rejects altered requests or stale versions with no extra audits', async () => {
    const { db, command, staffId } = await setup();
    expect((await command(member, 1, 'once')).status).toBe(200);
    const retry = await command(member, 1, 'once');
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { replayed: boolean }).replayed).toBe(true);
    expect(
      (await command({ ...member, dailyRatePhp: 999 }, 1, 'once')).status
    ).toBe(409);
    const conflict = await command(
      { ...member, dailyRatePhp: 999 },
      1,
      'later'
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).not.toContain('foundations');
    expect(
      db.sqlite
        .prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE user_id = ?')
        .get(staffId)!.n
    ).toBe(1);
  });
  it('rolls back the project and operation receipt if audit persistence fails', async () => {
    const { db, command } = await setup();
    db.sqlite.exec(
      "CREATE TRIGGER fail_staff_audit BEFORE INSERT ON audit_logs WHEN NEW.username = 'staff' BEGIN SELECT RAISE(ABORT,'test audit failure'); END"
    );
    expect((await command(member)).status).toBe(500);
    const row = db.sqlite
      .prepare('SELECT version,state_json FROM projects WHERE id = ?')
      .get('project')!;
    expect(row.version).toBe(1);
    expect(
      JSON.parse(row.state_json as string).manpowerRoster[0].dailyRatePhp
    ).toBe(777);
    expect(
      db.sqlite.prepare('SELECT COUNT(*) AS n FROM staff_operations').get()!.n
    ).toBe(0);
  });
  it('rejects extra fields, negative amounts, invalid attendance and unsupported deletion', async () => {
    const { command } = await setup();
    expect((await command({ ...member, role: 'super_admin' })).status).toBe(
      400
    );
    expect((await command({ ...member, dailyRatePhp: -1 })).status).toBe(400);
    expect(
      (
        await command(
          { date: '2026-11-17', presentMemberIds: ['missing'] },
          1,
          'attendance',
          'attendance.save'
        )
      ).status
    ).toBe(400);
    expect(
      (await command({ id: 'worker' }, 1, 'delete', 'member.delete')).status
    ).toBe(400);
  });
  it('generates payroll on the server and preserves payment-status behavior', async () => {
    const { command, call, staff, db } = await setup();
    expect(
      (
        await command(
          {
            kind: 'civil',
            startDate: '2026-11-17',
            endDate: '2026-11-17',
            periodType: 'daily',
            title: 'Test payroll',
            deductions: { worker: 77 },
          },
          1,
          'payroll',
          'payroll.create'
        )
      ).status
    ).toBe(200);
    const workspace = (
      (await (
        await call(
          '/api/admin/staff/projects/project/workspace',
          'GET',
          undefined,
          staff
        )
      ).json()) as {
        workspace: {
          civilPayrollHistory: { id: string; totalAmountPhp: number }[];
        };
      }
    ).workspace;
    const payroll = workspace.civilPayrollHistory[0];
    expect(payroll.totalAmountPhp).toBe(700);
    expect(
      (
        await command(
          {
            id: payroll.id,
            kind: 'civil',
            status: 'paid',
            paidDate: '2026-11-17',
          },
          2,
          'paid',
          'payroll.status'
        )
      ).status
    ).toBe(200);
    const state = JSON.parse(
      db.sqlite
        .prepare('SELECT state_json FROM projects WHERE id = ?')
        .get('project')!.state_json as string
    );
    expect(state.civilPayrollHistory[0].status).toBe('paid');
  });
  it('applies assignment changes immediately and revokes sessions on reset/deactivation', async () => {
    const { call, staff, staffId, owner, login } = await setup();
    await call(
      '/api/admin/users/' + staffId,
      'PATCH',
      { projectIds: [] },
      owner
    );
    expect(
      (
        await call(
          '/api/admin/staff/projects/project/workspace',
          'GET',
          undefined,
          staff
        )
      ).status
    ).toBe(404);
    expect(
      (
        await call(
          '/api/admin/users/' + staffId + '/reset-password',
          'POST',
          { password: 'NewPassword123' },
          owner
        )
      ).status
    ).toBe(200);
    expect(
      (await call('/api/admin/staff/projects', 'GET', undefined, staff)).status
    ).toBe(401);
    const renewed = await login('staff', 'NewPassword123');
    await call(
      '/api/admin/users/' + staffId,
      'PATCH',
      { isActive: false },
      owner
    );
    expect(
      (await call('/api/admin/staff/projects', 'GET', undefined, renewed))
        .status
    ).toBe(401);
  });
  it('keeps audit append-only, excludes credentials, survives project deletion and paginates', async () => {
    const { db, call, owner, command } = await setup();
    await command(member);
    await call('/api/admin/projects/project', 'DELETE', undefined, owner);
    const list = await call(
      '/api/admin/audit?limit=1',
      'GET',
      undefined,
      owner
    );
    const page = (await list.json()) as {
      entries: { id: string }[];
      nextCursor: string;
    };
    expect(page.entries).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    const next = await call(
      '/api/admin/audit?limit=1&cursor=' + encodeURIComponent(page.nextCursor),
      'GET',
      undefined,
      owner
    );
    expect(
      ((await next.json()) as { entries: { id: string }[] }).entries[0].id
    ).not.toBe(page.entries[0].id);
    expect(
      db.sqlite
        .prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE project_id = ?')
        .get('project')!.n
    ).toBeGreaterThan(1);
    const raw = JSON.stringify(
      db.sqlite.prepare('SELECT * FROM audit_logs').all()
    );
    expect(raw).not.toMatch(/OwnerPassword123|StaffPassword123|pbkdf2_sha256/);
    expect(() =>
      db.sqlite.exec("UPDATE audit_logs SET summary='tampered'")
    ).toThrow('append-only');
    expect(() => db.sqlite.exec('DELETE FROM audit_logs')).toThrow(
      'append-only'
    );
  });
  it('rejects self promotion and case-insensitive duplicate usernames', async () => {
    const { call, owner, staff, staffId } = await setup();
    expect(
      (
        await call(
          '/api/admin/users/' + staffId,
          'PATCH',
          { role: 'super_admin' },
          owner
        )
      ).status
    ).toBe(400);
    expect(
      (
        await call(
          '/api/admin/users/' + staffId,
          'PATCH',
          { permissions: ['*'] },
          staff
        )
      ).status
    ).toBe(403);
    expect(
      (
        await call(
          '/api/admin/users',
          'POST',
          {
            username: 'STAFF',
            displayName: 'Duplicate',
            password: 'Duplicate123',
            permissions: [],
            projectIds: [],
          },
          owner
        )
      ).status
    ).toBe(409);
  });
});

describe('Migration and client isolation', () => {
  it('promotes a single existing owner and preserves projects', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync('migrations/0001_init.sql', 'utf8'));
    db.exec(
      "INSERT INTO admin_users VALUES ('old','owner','Owner','hash','now','now')"
    );
    db.exec(
      "INSERT INTO projects(id,name,state_json,created_at,updated_at) VALUES ('project','Existing','{}','now','now')"
    );
    db.exec(readFileSync('migrations/0002_efficiency_indexes.sql', 'utf8'));
    db.exec(readFileSync('migrations/0003_staff_access_and_audit.sql', 'utf8'));
    expect(
      db.prepare('SELECT role,permissions_json FROM admin_users').get()
    ).toMatchObject({ role: 'super_admin', permissions_json: '[]' });
    expect(db.prepare('SELECT name FROM projects').get()!.name).toBe(
      'Existing'
    );
    db.close();
  });
  it('drops owner memory without uploading it as staff', async () => {
    const project = createSampleMast2Project();
    useProjectStore.setState({
      project,
      projects: [
        {
          id: 'private',
          state: project,
          createdAt: 'now',
          updatedAt: 'now',
          syncStatus: 'pending',
        },
      ],
      activeProjectId: 'private',
    });
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'staff',
        username: 'staff',
        displayName: 'Staff',
        role: 'staff',
        permissions: ['manpower_payroll'],
        projectIds: [],
        isActive: true,
      },
    });
    expect(await syncSingleProjectToCloud('private')).toBe(false);
    clearOwnerWorkspaceMemory();
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().activeProjectId).toBe('');
  });
  it('domain commands and DTOs do not expose unrelated project state', () => {
    const state = createSampleMast2Project();
    expect(() =>
      applyCommand(
        state,
        parseCommand({
          operationId: 'x',
          expectedVersion: 1,
          type: 'rates.save',
          payload: { creditBlockKg: 120, ratePerBlockPhp: 900 },
        }),
        ['manpower_payroll']
      )
    ).toThrow('not permitted');
    const dto = workspaceDto(
      { id: 'x', version: 1, state_json: JSON.stringify(state) } as ProjectRow,
      {
        id: 's',
        username: 's',
        displayName: 's',
        role: 'staff',
        permissions: [],
        projectIds: ['x'],
        isActive: true,
      }
    );
    expect(dto).not.toHaveProperty('manpowerRoster');
    expect(dto.haulingLogs).toEqual([]);
  });
});

describe('Concurrent saves, payroll settlement and session transitions', () => {
  it('accepts only one of two commands based on the same project version', async () => {
    const { command, db, staffId } = await setup();
    const responses = await Promise.all([
      command(member, 1, 'concurrent-a'),
      command({ ...member, dailyRatePhp: 900 }, 1, 'concurrent-b'),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      db.sqlite
        .prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE user_id = ?')
        .get(staffId)!.n
    ).toBe(1);
    expect(
      db.sqlite
        .prepare('SELECT version FROM projects WHERE id = ?')
        .get('project')!.version
    ).toBe(2);
  });
  it('calculates hauling weight and hauler payroll deductions, then settles linked payouts exactly once', async () => {
    const { command, db } = await setup();
    const hauling = {
      date: '2026-11-17',
      haulerName: 'Hauler',
      materialId: 'mat-cement',
      tripNumber: 1,
      horsesUsed: 1,
      tripsCount: 1,
      quantity: 3,
      kgPerUnit: 40,
      destinationFoundationId: 'STOCKPILE',
      weather: 'Sunny',
      remarks: '',
    };
    expect((await command(hauling, 1, 'hauling', 'hauling.save')).status).toBe(
      200
    );
    expect(
      (
        await command(
          {
            kind: 'hauler',
            startDate: '2026-11-17',
            endDate: '2026-11-17',
            periodType: 'daily',
            title: 'Hauler payroll',
            deductions: { Hauler: 100 },
            memberIds: ['Hauler'],
          },
          2,
          'hauler-payroll',
          'payroll.create'
        )
      ).status
    ).toBe(200);
    let state = JSON.parse(
      db.sqlite
        .prepare('SELECT state_json FROM projects WHERE id = ?')
        .get('project')!.state_json as string
    );
    const payroll = state.haulerPayrollHistory[0];
    expect(payroll.totalPayoutPhp).toBe(1000);
    expect(payroll.totalDeductionPhp).toBe(100);
    expect(
      (
        await command(
          {
            id: payroll.id,
            kind: 'hauler',
            status: 'paid',
            paidDate: '2026-11-17',
          },
          3,
          'settle',
          'payroll.status'
        )
      ).status
    ).toBe(200);
    expect(
      (
        await command(
          {
            id: payroll.id,
            kind: 'hauler',
            status: 'paid',
            paidDate: '2026-11-17',
          },
          3,
          'settle',
          'payroll.status'
        )
      ).status
    ).toBe(200);
    state = JSON.parse(
      db.sqlite
        .prepare('SELECT state_json FROM projects WHERE id = ?')
        .get('project')!.state_json as string
    );
    expect(
      state.haulerPayouts.filter(
        (r: { payrollSnapshotId: string }) => r.payrollSnapshotId === payroll.id
      )
    ).toHaveLength(2);
    expect(
      (
        await command(
          { ...hauling, tripNumber: 3 },
          4,
          'bad-trip',
          'hauling.save'
        )
      ).status
    ).toBe(400);
  });
  it('rolls back account creation if its audit insert fails', async () => {
    const { db, call, owner } = await setup();
    db.sqlite.exec(
      "CREATE TRIGGER fail_account_audit BEFORE INSERT ON audit_logs WHEN NEW.domain = 'account' BEGIN SELECT RAISE(ABORT,'test account audit failure'); END"
    );
    expect(
      (
        await call(
          '/api/admin/users',
          'POST',
          {
            username: 'failed-staff',
            displayName: 'Failure test',
            password: 'TestPassword123',
            permissions: [],
            projectIds: ['project'],
          },
          owner
        )
      ).status
    ).toBe(500);
    expect(
      db.sqlite
        .prepare('SELECT id FROM admin_users WHERE username = ?')
        .get('failed-staff')
    ).toBeUndefined();
  });
  it('bootstraps only the configured owner when multiple migrated accounts have no owner', async () => {
    const db = createTestD1();
    db.sqlite
      .prepare(
        "INSERT INTO admin_users(id,username,display_name,password_hash,created_at,updated_at) VALUES ('one','owner','Owner','hash','now','now'),('two','staff','Staff','hash','now','now')"
      )
      .run();
    await ensureSeededAdminUser({
      DB: db,
      IMAGES_BUCKET: {} as R2Bucket,
      ADMIN_USERNAME: 'owner',
      ADMIN_PASSWORD: 'OwnerPassword123',
    } as Env);
    expect(
      db.sqlite.prepare('SELECT role FROM admin_users WHERE id = ?').get('one')!
        .role
    ).toBe('super_admin');
    expect(
      db.sqlite.prepare('SELECT role FROM admin_users WHERE id = ?').get('two')!
        .role
    ).toBe('staff');
  });
  it('rejects a response from the previous account before it reaches a store', async () => {
    let complete!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          })
      )
    );
    try {
      const response = requestJson('/api/admin/projects');
      invalidateSessionRequests();
      complete(
        new Response(JSON.stringify({ projects: ['private-owner-project'] }))
      );
      await expect(response).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('supports material.delete command with hauling_inventory permission', () => {
    const state = createSampleMast2Project();
    const afterDelete = applyCommand(
      state,
      parseCommand({
        operationId: 'op-del-mat-1',
        expectedVersion: 1,
        type: 'material.delete',
        payload: { id: 'mat-cement' },
      }),
      ['hauling_inventory']
    );
    expect(
      afterDelete.centralMaterials?.some((m) => m.id === 'mat-cement')
    ).toBe(false);

    expect(() =>
      applyCommand(
        afterDelete,
        parseCommand({
          operationId: 'op-del-mat-2',
          expectedVersion: 2,
          type: 'material.delete',
          payload: { id: 'mat-cement' },
        }),
        ['hauling_inventory']
      )
    ).toThrow('Record no longer exists.');

    expect(() =>
      applyCommand(
        state,
        parseCommand({
          operationId: 'op-del-mat-3',
          expectedVersion: 1,
          type: 'material.delete',
          payload: { id: 'mat-sand' },
        }),
        ['manpower_payroll']
      )
    ).toThrow('This action is not permitted.');
  });
});
