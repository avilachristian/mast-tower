import {
  computeCivilWorksPayrollPreview,
  computeHaulerPayrollPreview,
  resolveManpowerRoster,
  resolveKnownHaulerNames,
} from '../src/entities/project/manpowerPayroll';
import {
  resolveCentralMaterials,
  resolveHaulingRateConfig,
  computeCentralMaterialStatuses,
} from '../src/entities/project/haulingInventory';
import type {
  MastProjectState,
  ManpowerMember,
  HaulingLogEntry,
  CentralMaterialItem,
  CivilWorksPayrollSnapshot,
  HaulerPayrollSnapshot,
  HaulerPayoutRecord,
  ReportDetailsSpec,
} from '../src/entities/project/types';
import type {
  StaffCommand,
  StaffWorkspaceDto,
  StaffPermission,
} from '../src/shared/api/access';
import type { AdminSessionUser, ProjectRow } from './types';

export class CommandError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CommandError('Expected an object.');
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    throw new CommandError('Unexpected fields in request.');
}
export function str(value: unknown, max = 200, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new CommandError('Invalid text value.');
  return value.trim();
}
export function num(value: unknown, min = 0, max = 1e9): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new CommandError('Invalid numeric value.');
  return value;
}
export function choice<T extends string>(
  value: unknown,
  values: readonly T[]
): T {
  if (!values.includes(value as T)) throw new CommandError('Invalid option.');
  return value as T;
}
export function date(value: unknown): string {
  const s = str(value, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s + 'T00:00:00Z')) ||
    new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s
  )
    throw new CommandError('Invalid date.');
  return s;
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const roles = [
  'Site Engineer',
  'Foreman',
  'Safety Officer',
  'First Aider',
  'Skilled',
  'Mason',
  'Steelman',
  'Carpenter',
  'Laborer',
  'Horse Hauler',
  'Operator',
] as const;
const materials = [
  'cement',
  'sand',
  'gravel',
  'main_bar_a',
  'chair_bar_a',
  'main_bar_b',
  'chair_bar_b',
  'main_bar_c',
  'chair_bar_c',
  'rebar_20mm',
  'anchor_rod',
  'phenolic_board',
  'tower_section',
  'tower_accessory',
  'other',
] as const;
export function workspaceDto(
  row: ProjectRow,
  user: AdminSessionUser
): StaffWorkspaceDto {
  const s = JSON.parse(row.state_json) as MastProjectState;
  const payroll = user.permissions.includes('manpower_payroll'),
    hauling = user.permissions.includes('hauling_inventory');
  const rd: ReportDetailsSpec = {};
  const keys = [
    'projectName',
    'projectLocation',
    'clientName',
    'contractor',
    'referenceNo',
    'revision',
    'preparedBy',
    'preparedTitle',
    'preparedSignatureUrl',
    'checkedBy',
    'checkedTitle',
    'checkedSignatureUrl',
    'approvedBy',
    'approvedTitle',
    'approvedSignatureUrl',
    'logos',
    'logoHeightPx',
  ] as const;
  for (const k of keys)
    if (s.reportDetails?.[k] !== undefined)
      Object.assign(rd, { [k]: s.reportDetails[k] });
  return {
    id: row.id,
    version: row.version,
    permissions: user.permissions,
    context: {
      projectName: s.projectName,
      location: s.location,
      contractor: s.contractor,
      preparedBy: s.preparedBy,
      projectType: s.projectType,
      lastUpdated: s.lastUpdated,
      reportDetails: rd,
    },
    haulerNames: resolveKnownHaulerNames(s),
    destinations: hauling
      ? s.foundations.map((f) => ({ id: f.id, name: f.name }))
      : [],
    haulingLogs: payroll || hauling ? s.haulingLogs : [],
    haulingRateConfig: resolveHaulingRateConfig(s),
    ...(hauling
      ? {
          centralMaterials: resolveCentralMaterials(s),
          inventorySummary: computeCentralMaterialStatuses(s),
        }
      : {}),
    ...(payroll
      ? {
          manpowerRoster: resolveManpowerRoster(s),
          civilAttendance: s.civilAttendance ?? [],
          civilPayrollHistory: s.civilPayrollHistory ?? [],
          haulerPayrollHistory: s.haulerPayrollHistory ?? [],
          haulerPayouts: s.haulerPayouts ?? [],
        }
      : {}),
  };
}
export function parseCommand(raw: unknown): StaffCommand {
  const v = object(raw);
  exact(v, ['operationId', 'expectedVersion', 'type', 'payload']);
  const operationId = str(v.operationId, 100);
  if (!/^[\w-]+$/.test(operationId))
    throw new CommandError('Invalid operation ID.');
  const expectedVersion = num(v.expectedVersion, 1);
  if (!Number.isInteger(expectedVersion))
    throw new CommandError('Invalid version.');
  return {
    operationId,
    expectedVersion,
    type: choice(v.type, [
      'member.save',
      'attendance.save',
      'payroll.create',
      'payroll.status',
      'payout.save',
      'hauling.save',
      'material.save',
      'material.delete',
      'rates.save',
    ] as const),
    payload: object(v.payload),
  };
}
function put<T extends { id: string }>(
  records: T[],
  record: T,
  updating: boolean
): T[] {
  if (updating && !records.some((r) => r.id === record.id))
    throw new CommandError('Record no longer exists.', 409);
  return updating
    ? records.map((r) => (r.id === record.id ? record : r))
    : [...records, record];
}
function linked(
  snapshot: HaulerPayrollSnapshot,
  day: string
): HaulerPayoutRecord[] {
  return snapshot.items.flatMap((i) =>
    (['payout', 'deduction'] as const).flatMap((kind) => {
      const amountPhp =
        kind === 'payout' ? i.payoutReleasedPhp : (i.deductionPhp ?? 0);
      return amountPhp > 0
        ? [
            {
              id: crypto.randomUUID(),
              date: day,
              haulerName: i.haulerName,
              amountPhp,
              kind,
              notes: `Hauler Payroll: ${snapshot.title}`,
              payrollSnapshotId: snapshot.id,
            },
          ]
        : [];
    })
  );
}
export function applyCommand(
  state: MastProjectState,
  command: StaffCommand,
  permissions: StaffPermission[]
): MastProjectState {
  const p = command.payload,
    s = structuredClone(state),
    hauling = [
      'hauling.save',
      'material.save',
      'material.delete',
      'rates.save',
    ].includes(command.type);
  if (!permissions.includes(hauling ? 'hauling_inventory' : 'manpower_payroll'))
    throw new CommandError('This action is not permitted.', 403);
  const roster = resolveManpowerRoster(s),
    id = p.id === undefined ? crypto.randomUUID() : str(p.id),
    updating = p.id !== undefined;
  switch (command.type) {
    case 'member.save': {
      exact(p, [
        'id',
        'name',
        'category',
        'position',
        'dailyRatePhp',
        'active',
        'notes',
      ]);
      const category = choice(p.category, ['civil_works', 'hauler'] as const),
        position = choice(p.position, roles),
        name = str(p.name);
      if (typeof p.active !== 'boolean')
        throw new CommandError('Invalid active status.');
      if (
        roster.some(
          (m) => m.id !== id && m.name.toLowerCase() === name.toLowerCase()
        )
      )
        throw new CommandError('A worker with that name already exists.');
      const old = roster.find((m) => m.id === id);
      if (
        old &&
        old.category !== category &&
        (s.haulingLogs.some((l) => l.haulerName === old.name) ||
          (s.civilAttendance ?? []).some((a) =>
            a.presentMemberIds.includes(id)
          ))
      )
        throw new CommandError(
          'Cannot change category of a worker with attendance or hauling records.'
        );
      const member: ManpowerMember = {
        id,
        name,
        category,
        position: category === 'hauler' ? 'Horse Hauler' : position,
        dailyRatePhp: category === 'hauler' ? 0 : num(p.dailyRatePhp),
        active: p.active,
        notes: p.notes === undefined ? undefined : str(p.notes, 2000, true),
      };
      if (category === 'civil_works' && position === 'Horse Hauler')
        throw new CommandError('Select a civil works position.');
      s.manpowerRoster = put(roster, member, updating);
      s.haulerRoster = s.manpowerRoster
        .filter((m) => m.category === 'hauler' && m.active)
        .map((m) => m.name);
      if (old?.category === 'hauler' && old.name !== name) {
        s.haulingLogs = s.haulingLogs.map((l) =>
          l.haulerName.toLowerCase() === old.name.toLowerCase()
            ? { ...l, haulerName: name }
            : l
        );
        s.haulerPayouts = (s.haulerPayouts ?? []).map((l) =>
          l.haulerName.toLowerCase() === old.name.toLowerCase()
            ? { ...l, haulerName: name }
            : l
        );
      }
      break;
    }
    case 'attendance.save': {
      exact(p, ['date', 'presentMemberIds', 'notes']);
      const day = date(p.date);
      if (
        !Array.isArray(p.presentMemberIds) ||
        p.presentMemberIds.length > 10000
      )
        throw new CommandError('Invalid attendance.');
      const ids = [...new Set(p.presentMemberIds.map((v) => str(v)))];
      if (
        ids.some(
          (mid) =>
            !roster.some((m) => m.id === mid && m.category === 'civil_works')
        )
      )
        throw new CommandError('Unknown civil worker.');
      s.civilAttendance = [
        ...(s.civilAttendance ?? []).filter((a) => a.date !== day),
        {
          date: day,
          presentMemberIds: ids,
          notes: p.notes === undefined ? undefined : str(p.notes, 2000, true),
        },
      ];
      break;
    }
    case 'rates.save':
      exact(p, ['creditBlockKg', 'ratePerBlockPhp']);
      s.haulingRateConfig = {
        creditBlockKg: num(p.creditBlockKg, 0.01),
        ratePerBlockPhp: num(p.ratePerBlockPhp),
      };
      break;
    case 'material.save': {
      exact(p, [
        'id',
        'name',
        'category',
        'unit',
        'haulingMaterialKey',
        'purchaseUnit',
        'unitsPerPurchaseUnit',
        'defaultKgPerUnit',
        'targetQty',
        'stockYardTotalQty',
        'onSiteOpeningQty',
        'remarks',
      ]);
      const item: CentralMaterialItem = {
        id,
        name: str(p.name),
        category: choice(p.category, [
          'foundation',
          'vertical_mast',
          'shared',
        ] as const),
        unit: str(p.unit, 30),
        haulingMaterialKey: choice(p.haulingMaterialKey, materials),
        targetQty: num(p.targetQty),
        stockYardTotalQty: num(p.stockYardTotalQty),
      };
      if (p.onSiteOpeningQty !== undefined)
        item.onSiteOpeningQty = num(p.onSiteOpeningQty);
      if (p.defaultKgPerUnit !== undefined)
        item.defaultKgPerUnit = num(p.defaultKgPerUnit);
      if (p.unitsPerPurchaseUnit !== undefined)
        item.unitsPerPurchaseUnit = num(p.unitsPerPurchaseUnit, 0.001);
      if (p.purchaseUnit !== undefined)
        item.purchaseUnit = str(p.purchaseUnit, 30, true);
      if (p.remarks !== undefined) item.remarks = str(p.remarks, 2000, true);
      s.centralMaterials = put(resolveCentralMaterials(s), item, updating);
      break;
    }
    case 'material.delete': {
      exact(p, ['id']);
      const targetId = str(p.id);
      const current = resolveCentralMaterials(s);
      if (!current.some((m) => m.id === targetId)) {
        throw new CommandError('Record no longer exists.', 409);
      }
      s.centralMaterials = current.filter((m) => m.id !== targetId);
      break;
    }
    case 'hauling.save': {
      exact(p, [
        'id',
        'date',
        'haulerName',
        'tripNumber',
        'tripGroupId',
        'materialId',
        'itemLabel',
        'horsesUsed',
        'tripsCount',
        'material',
        'unitLabel',
        'quantity',
        'kgPerUnit',
        'destinationFoundationId',
        'weather',
        'remarks',
      ]);
      const haulerName = str(p.haulerName);
      if (
        !resolveKnownHaulerNames(s).some(
          (n) => n.toLowerCase() === haulerName.toLowerCase()
        )
      )
        throw new CommandError(
          'Select an existing hauler. Ask the Site Engineer to add one if needed.'
        );
      const materialId = str(p.materialId),
        item = resolveCentralMaterials(s).find((m) => m.id === materialId);
      if (!item) throw new CommandError('Unknown material.');
      const destination = str(p.destinationFoundationId);
      if (
        destination !== 'STOCKPILE' &&
        !s.foundations.some((f) => f.id === destination)
      )
        throw new CommandError('Unknown destination.');
      const quantity = num(p.quantity, 0.001),
        kgPerUnit = num(p.kgPerUnit, 0.001),
        horsesUsed = num(p.horsesUsed, 1, 10000),
        tripsCount = num(p.tripsCount, 0, 10000);
      if (!Number.isInteger(horsesUsed) || !Number.isInteger(tripsCount))
        throw new CommandError('Horses and trips must be whole numbers.');
      const log: HaulingLogEntry = {
        id,
        date: date(p.date),
        haulerName,
        materialId,
        itemLabel: item.name,
        material: item.haulingMaterialKey,
        unitLabel: item.unit,
        horsesUsed,
        tripsCount,
        quantity,
        kgPerUnit,
        totalKg: Math.round(quantity * kgPerUnit * 100) / 100,
        equivalentCuM: ['sand', 'gravel'].includes(item.haulingMaterialKey)
          ? Math.round((quantity / 36) * 100) / 100
          : 0,
        destinationFoundationId: destination,
        weather: str(p.weather, 100, true),
        remarks: str(p.remarks, 2000, true),
      };
      if (p.tripNumber !== undefined) {
        log.tripNumber = num(p.tripNumber, 1, 2);
        if (!Number.isInteger(log.tripNumber))
          throw new CommandError('Trip number must be 1 or 2.');
      }
      if (p.tripGroupId !== undefined) {
        log.tripGroupId = str(p.tripGroupId);
        const group = s.haulingLogs.filter(
          (l) => l.id !== id && l.tripGroupId === log.tripGroupId
        );
        if (
          group.some(
            (l) =>
              l.date !== log.date ||
              l.haulerName !== log.haulerName ||
              l.tripNumber !== log.tripNumber
          )
        )
          throw new CommandError(
            'Edit all items of this grouped trip together through the Site Engineer.'
          );
      }
      s.haulingLogs = put(s.haulingLogs, log, updating);
      break;
    }
    case 'payout.save': {
      exact(p, ['id', 'date', 'haulerName', 'amountPhp', 'kind', 'notes']);
      const haulerName = str(p.haulerName);
      if (!resolveKnownHaulerNames(s).includes(haulerName))
        throw new CommandError('Unknown hauler.');
      if (
        (s.haulerPayouts ?? []).some((r) => r.id === id && r.payrollSnapshotId)
      )
        throw new CommandError(
          'Change linked payments using the payroll status.'
        );
      s.haulerPayouts = put(
        s.haulerPayouts ?? [],
        {
          id,
          date: date(p.date),
          haulerName,
          amountPhp: num(p.amountPhp, 0.01),
          kind: choice(p.kind, ['payout', 'deduction'] as const),
          notes: p.notes === undefined ? undefined : str(p.notes, 2000, true),
        },
        updating
      );
      break;
    }
    case 'payroll.create': {
      exact(p, [
        'kind',
        'startDate',
        'endDate',
        'periodType',
        'title',
        'notes',
        'deductions',
        'payouts',
        'memberIds',
      ]);
      const kind = choice(p.kind, ['civil', 'hauler'] as const),
        start = date(p.startDate),
        end = date(p.endDate);
      if (
        start > end ||
        (Date.parse(end) - Date.parse(start)) / 86400000 > 3660
      )
        throw new CommandError('Invalid payroll range.');
      const periodType = choice(p.periodType, [
          'daily',
          'weekly',
          'monthly',
          'overall',
        ] as const),
        title = str(p.title),
        notes = p.notes === undefined ? undefined : str(p.notes, 2000, true);
      const deductions = object(p.deductions ?? {}),
        payouts = object(p.payouts ?? {});
      for (const v of [...Object.values(deductions), ...Object.values(payouts)])
        num(v);
      if (
        p.memberIds !== undefined &&
        (!Array.isArray(p.memberIds) ||
          p.memberIds.some((v) => typeof v !== 'string'))
      )
        throw new CommandError('Invalid payroll selection.');
      const selected = p.memberIds as string[] | undefined;
      if (kind === 'civil') {
        const preview = computeCivilWorksPayrollPreview(
          roster,
          s.civilAttendance,
          start,
          end,
          deductions as Record<string, number>
        );
        const items = preview.rows.filter(
          (r) => !selected || selected.includes(r.memberId)
        );
        if (!items.length)
          throw new CommandError('No workers in this payroll.');
        const sum = (
          key: 'grossPayPhp' | 'deductionPhp' | 'netPayPhp' | 'daysPresent'
        ) =>
          Math.round(items.reduce((a, r) => a + (r[key] ?? 0), 0) * 100) / 100;
        const record: CivilWorksPayrollSnapshot = {
          id,
          createdAt: new Date().toISOString(),
          periodType,
          startDate: start,
          endDate: end,
          title,
          notes,
          status: 'generated',
          items,
          totalDaysWorked: sum('daysPresent'),
          totalAmountPhp: sum('netPayPhp'),
          totalGrossPayPhp: sum('grossPayPhp'),
          totalDeductionPhp: sum('deductionPhp'),
          totalNetPayPhp: sum('netPayPhp'),
        };
        s.civilPayrollHistory = [record, ...(s.civilPayrollHistory ?? [])];
      } else {
        const preview = computeHaulerPayrollPreview(
          s.haulingLogs,
          s.haulerPayouts,
          roster,
          start,
          end,
          periodType,
          s.haulingRateConfig,
          deductions as Record<string, number>
        );
        const items = preview.rows
          .filter((r) => !selected || selected.includes(r.haulerName))
          .map((r) => {
            const payout = Number(payouts[r.haulerName] ?? r.payoutReleasedPhp);
            if (payout + (r.deductionPhp ?? 0) > r.overallBalanceDuePhp + 0.01)
              throw new CommandError(
                'Payout and deduction exceed available hauler balance.'
              );
            return {
              ...r,
              payoutReleasedPhp: payout,
              netBalanceAfterPhp: Math.max(
                0,
                r.overallBalanceDuePhp - payout - (r.deductionPhp ?? 0)
              ),
            };
          });
        if (!items.length)
          throw new CommandError('No haulers in this payroll.');
        const sum = (
          key:
            | 'hauledKg'
            | 'creditsEarned'
            | 'grossEarnedPhp'
            | 'deductionPhp'
            | 'payoutReleasedPhp'
        ) =>
          Math.round(items.reduce((a, r) => a + (r[key] ?? 0), 0) * 100) / 100;
        const record: HaulerPayrollSnapshot = {
          id,
          createdAt: new Date().toISOString(),
          periodType,
          startDate: start,
          endDate: end,
          title,
          notes,
          status: 'generated',
          items,
          totalHauledKg: sum('hauledKg'),
          totalCredits: sum('creditsEarned'),
          totalEarnedPhp: sum('grossEarnedPhp'),
          totalDeductionPhp: sum('deductionPhp'),
          totalPayoutPhp: sum('payoutReleasedPhp'),
          ...preview.rateConfig,
        };
        s.haulerPayrollHistory = [record, ...(s.haulerPayrollHistory ?? [])];
      }
      break;
    }
    case 'payroll.status': {
      exact(p, ['id', 'kind', 'status', 'paidDate']);
      if (!updating) throw new CommandError('Payroll ID required.');
      const kind = choice(p.kind, ['civil', 'hauler'] as const),
        status = choice(p.status, ['generated', 'paid'] as const),
        paidDate = status === 'paid' ? date(p.paidDate ?? today()) : undefined;
      if (kind === 'civil') {
        const record = (s.civilPayrollHistory ?? []).find((r) => r.id === id);
        if (!record) throw new CommandError('Payroll not found.', 409);
        s.civilPayrollHistory = put(
          s.civilPayrollHistory ?? [],
          { ...record, status, paidDate },
          true
        );
      } else {
        const record = (s.haulerPayrollHistory ?? []).find((r) => r.id === id);
        if (!record) throw new CommandError('Payroll not found.', 409);
        const next = { ...record, status, paidDate };
        s.haulerPayrollHistory = put(s.haulerPayrollHistory ?? [], next, true);
        const base = (s.haulerPayouts ?? []).filter(
          (r) => r.payrollSnapshotId !== id
        );
        if (status === 'paid' && record.status !== 'paid') {
          const current = computeHaulerPayrollPreview(
            s.haulingLogs,
            base,
            roster,
            record.startDate,
            record.endDate,
            record.periodType,
            s.haulingRateConfig
          );
          for (const i of record.items) {
            const balance =
              current.rows.find((r) => r.haulerName === i.haulerName)
                ?.overallBalanceDuePhp ?? 0;
            if (i.payoutReleasedPhp + (i.deductionPhp ?? 0) > balance + 0.01)
              throw new CommandError(
                'Hauler balance changed. Review payroll before marking paid.',
                409
              );
          }
        }
        s.haulerPayouts = [
          ...base,
          ...(status === 'paid' ? linked(next, paidDate!) : []),
        ];
      }
      break;
    }
  }
  s.lastUpdated = today();
  return s;
}
