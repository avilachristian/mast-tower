import type { D1PreparedStatement } from './cloudflareTypes';
import type { AdminSessionUser, Env } from './types';

export interface Change {
  domain: string;
  entity: string;
  entityId: string;
  action: string;
  diff: Record<string, { old: unknown; new: unknown }>;
}
function safe(value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('data:'))
    return '[inline attachment]';
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !/password|token|secret|hash/i.test(k))
        .map(([k, v]) => [k, safe(v)])
    );
  return value ?? null;
}
export function diffRecords(
  before: unknown,
  after: unknown
): Record<string, { old: unknown; new: unknown }> {
  const a = (before ?? {}) as Record<string, unknown>,
    b = (after ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter(
        (k) =>
          JSON.stringify(a[k]) !== JSON.stringify(b[k]) &&
          !/password|token|secret|hash/i.test(k)
      )
      .map((k) => [k, { old: safe(a[k]), new: safe(b[k]) }])
  );
}
export function projectChanges(before: unknown, after: unknown): Change[] {
  const a = (before ?? {}) as Record<string, unknown>,
    b = (after ?? {}) as Record<string, unknown>;
  const result: Change[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (
      key === 'lastUpdated' ||
      JSON.stringify(a[key]) === JSON.stringify(b[key])
    )
      continue;
    const domain = /payroll|manpower|attendance|payout|haulerRoster/i.test(key)
      ? 'manpower_payroll'
      : /haul|material|inventory/i.test(key)
        ? 'hauling_inventory'
        : 'project';
    const prev = a[key],
      next = b[key];
    const isEntityArray = (v: unknown) =>
      Array.isArray(v) &&
      v.every((x) => x && typeof x === 'object' && ('id' in x || 'date' in x));
    if (
      (prev === undefined || isEntityArray(prev)) &&
      (next === undefined || isEntityArray(next)) &&
      (Array.isArray(prev) || Array.isArray(next))
    ) {
      const map = (v: unknown) =>
        new Map(
          ((v ?? []) as { id?: string; date?: string }[]).map((r) => [
            r.id ?? r.date!,
            r,
          ])
        );
      const old = map(prev),
        updated = map(next);
      for (const id of new Set([...old.keys(), ...updated.keys()])) {
        const diff = diffRecords(old.get(id), updated.get(id));
        if (Object.keys(diff).length)
          result.push({
            domain,
            entity: key,
            entityId: id,
            action: !old.has(id)
              ? 'CREATE'
              : !updated.has(id)
                ? 'DELETE'
                : 'UPDATE',
            diff,
          });
      }
    } else
      result.push({
        domain,
        entity: key,
        entityId: key,
        action: 'UPDATE',
        diff: { [key]: { old: safe(prev), new: safe(next) } },
      });
  }
  return result;
}
export function auditStatement(
  env: Env,
  user: AdminSessionUser,
  projectId: string | null,
  changes: Change[],
  operationId: string,
  before: number | null,
  after: number | null
): D1PreparedStatement {
  const events = (
    changes.length
      ? changes
      : [
          {
            domain: 'project',
            entity: 'project',
            entityId: projectId ?? user.id,
            action: 'UPDATE',
            diff: {},
          },
        ]
  ).map((ch) => ({
    id: crypto.randomUUID(),
    domain: ch.domain,
    action: ch.action,
    entity: ch.entity,
    entityId: ch.entityId,
    summary: `${ch.action} ${ch.entity} ${ch.entityId}`,
    diff: JSON.stringify(ch.diff),
  }));
  return env.DB.prepare(
    `INSERT INTO audit_logs (id,project_id,user_id,username,display_name,domain,action,entity_type,entity_id,summary,diff_json,operation_id,version_before,version_after,created_at)
    SELECT json_extract(value,'$.id'), ?, ?, ?, ?, json_extract(value,'$.domain'), json_extract(value,'$.action'), json_extract(value,'$.entity'), json_extract(value,'$.entityId'), json_extract(value,'$.summary'), json_extract(value,'$.diff'), ?, ?, ?, ?
    FROM json_each(?) WHERE changes() > 0`
  ).bind(
    projectId,
    user.id,
    user.username,
    user.displayName,
    operationId,
    before,
    after,
    new Date().toISOString(),
    JSON.stringify(events)
  );
}
export async function auditedWrite(
  env: Env,
  statement: D1PreparedStatement,
  user: AdminSessionUser,
  projectId: string,
  before: unknown,
  after: unknown,
  versionBefore: number | null,
  versionAfter: number | null
) {
  const results = await env.DB.batch([
    statement,
    auditStatement(
      env,
      user,
      projectId,
      projectChanges(before, after),
      crypto.randomUUID(),
      versionBefore,
      versionAfter
    ),
  ]);
  return results[0];
}
