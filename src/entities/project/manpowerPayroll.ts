import { formatDateWithWeekday } from './calculations';
import { todayLocalIso } from '@/shared/lib/dateUtils';
import {
  HAULING_CREDIT_BLOCK_KG,
  HAULING_RATE_PER_BLOCK_PHP,
  computeHaulerCreditLedgers,
  resolveHaulingRateConfig,
} from './haulingInventory';
import type {
  CivilWorksAttendanceRecord,
  CivilWorksPayrollLineItem,
  CivilWorksPayrollSnapshot,
  HaulerPayoutRecord,
  HaulerPayrollLineItem,
  HaulerPayrollSnapshot,
  HaulingLogEntry,
  HaulingRateConfig,
  ManpowerMember,
  MastProjectState,
  PayrollPeriodType,
  WorkerRole,
} from './types';

export const MANPOWER_POSITIONS: WorkerRole[] = [
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
];

export const CIVIL_WORK_POSITIONS: WorkerRole[] = MANPOWER_POSITIONS.filter(
  (role) => role !== 'Horse Hauler'
);

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function parseIsoDateUtc(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

function formatUtcIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(dateStr: string, deltaDays: number): string {
  const parsed = parseIsoDateUtc(dateStr);
  if (!parsed) return dateStr;
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return formatUtcIsoDate(parsed);
}

export type CivilAttendanceCode = 'P' | 'A' | 'NW';

export interface PayrollAttendanceDayCol {
  date: string;
  dayNum: string;
  weekdayShort: string;
  monthDayLabel: string;
}

export interface PayrollAttendanceBucketCol {
  label: string;
  rangeLabel: string;
  dates: string[];
}

export function enumerateIsoDates(startDate: string, endDate: string): string[] {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end && dates.length < 400) {
    dates.push(formatUtcIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function buildAttendanceDayColumns(
  startDate: string,
  endDate: string
): PayrollAttendanceDayCol[] {
  return enumerateIsoDates(startDate, endDate).map((iso) => {
    const dt = parseIsoDateUtc(iso)!;
    const dayNum = String(dt.getUTCDate());
    const weekdayShort = dt
      .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      .toUpperCase();
    const monthShort = dt.toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    return {
      date: iso,
      dayNum,
      weekdayShort,
      monthDayLabel: `${monthShort} ${dayNum}`,
    };
  });
}

export function buildWeeklyBucketsForRange(
  startDate: string,
  endDate: string
): PayrollAttendanceBucketCol[] {
  const allDates = enumerateIsoDates(startDate, endDate);
  const buckets: PayrollAttendanceBucketCol[] = [];
  for (let idx = 0; idx < allDates.length; idx += 7) {
    const slice = allDates.slice(idx, idx + 7);
    const first = parseIsoDateUtc(slice[0])!;
    const last = parseIsoDateUtc(slice[slice.length - 1])!;
    const sameMonth =
      first.getUTCFullYear() === last.getUTCFullYear() &&
      first.getUTCMonth() === last.getUTCMonth();
    const rangeLabel = sameMonth
      ? slice.length === 1
        ? `${first.getUTCDate()}`
        : `${first.getUTCDate()}–${last.getUTCDate()}`
      : `${first.getUTCMonth() + 1}/${first.getUTCDate()}–${last.getUTCMonth() + 1}/${last.getUTCDate()}`;
    buckets.push({
      label: `Week ${buckets.length + 1}`,
      rangeLabel,
      dates: slice,
    });
  }
  return buckets;
}

export function buildMonthBucketsForRange(
  startDate: string,
  endDate: string
): PayrollAttendanceBucketCol[] {
  const allDates = enumerateIsoDates(startDate, endDate);
  const byMonth = new Map<string, string[]>();
  for (const iso of allDates) {
    const key = iso.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(iso);
  }
  return Array.from(byMonth.entries()).map(([key, dates]) => {
    const dt = parseIsoDateUtc(`${key}-01`)!;
    const label = dt.toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    const rangeLabel = String(dt.getUTCFullYear());
    return { label, rangeLabel, dates };
  });
}

export function resolveCivilAttendanceCode(
  date: string,
  memberDates: ReadonlySet<string>,
  siteActiveDates: ReadonlySet<string>
): CivilAttendanceCode {
  if (memberDates.has(date)) return 'P';
  if (siteActiveDates.has(date)) return 'A';
  return 'NW';
}

/**
 * Computes inclusive [startDate, endDate] YYYY-MM-DD bounds for Daily, Weekly
 * (Monday–Sunday), Monthly (1st–last day), or Overall payroll periods.
 */
export function getPayrollPeriodBounds(
  periodType: PayrollPeriodType,
  anchorDate: string,
  availableDates: string[] = []
): { startDate: string; endDate: string; label: string } {
  const safeAnchor = parseIsoDateUtc(anchorDate)
    ? anchorDate
    : todayLocalIso();

  if (periodType === 'daily') {
    return {
      startDate: safeAnchor,
      endDate: safeAnchor,
      label: `Daily — ${formatDateWithWeekday(safeAnchor)}`,
    };
  }

  if (periodType === 'weekly') {
    const parsed = parseIsoDateUtc(safeAnchor)!;
    const utcDay = parsed.getUTCDay(); // 0=Sun..6=Sat
    const diffToMon = utcDay === 0 ? -6 : 1 - utcDay;
    const startDate = addDaysIso(safeAnchor, diffToMon);
    const endDate = addDaysIso(startDate, 6);
    return {
      startDate,
      endDate,
      label: `Weekly (${startDate} to ${endDate})`,
    };
  }

  if (periodType === 'monthly') {
    const parsed = parseIsoDateUtc(safeAnchor)!;
    const year = parsed.getUTCFullYear();
    const monthIdx = parsed.getUTCMonth();
    const startDate = formatUtcIsoDate(new Date(Date.UTC(year, monthIdx, 1)));
    const endDate = formatUtcIsoDate(new Date(Date.UTC(year, monthIdx + 1, 0)));
    const monthName = new Date(Date.UTC(year, monthIdx, 1)).toLocaleDateString(
      'en-US',
      { month: 'long', year: 'numeric', timeZone: 'UTC' }
    );
    return {
      startDate,
      endDate,
      label: `Monthly — ${monthName}`,
    };
  }

  const validDates = availableDates
    .filter((d) => Boolean(parseIsoDateUtc(d)))
    .sort((a, b) => a.localeCompare(b));
  const startDate = validDates[0] ?? safeAnchor;
  const endDate = validDates[validDates.length - 1] ?? safeAnchor;
  return {
    startDate,
    endDate,
    label:
      validDates.length > 0
        ? `Overall (${startDate} to ${endDate})`
        : `Overall (as of ${safeAnchor})`,
  };
}

/**
 * Resolves the full manpower roster for Civil Works workers and Individual
 * Haulers. When `project.manpowerRoster` has not been initialized yet (legacy
 * saved projects), it seeds individual hauler entries from `haulerRoster` and
 * `haulingLogs`. Once `manpowerRoster` exists, edits and deletions stay exact.
 */
export function resolveManpowerRoster(
  project: Pick<MastProjectState, 'manpowerRoster' | 'haulerRoster' | 'haulingLogs'>
): ManpowerMember[] {
  const hasExplicitRoster = Array.isArray(project.manpowerRoster);
  const base = (project.manpowerRoster ?? []).map((m) => ({ ...m }));
  if (hasExplicitRoster) {
    return base;
  }

  const seenHaulers = new Set(
    base
      .filter((m) => m.category === 'hauler')
      .map((m) => normalizeNameKey(m.name))
  );

  const legacyNames: string[] = [];
  for (const name of project.haulerRoster ?? []) {
    const t = name.trim();
    if (t) legacyNames.push(t);
  }
  for (const log of project.haulingLogs ?? []) {
    const t = log.haulerName.trim();
    if (t) legacyNames.push(t);
  }

  for (const rawName of legacyNames) {
    const key = normalizeNameKey(rawName);
    if (!key || seenHaulers.has(key)) continue;
    seenHaulers.add(key);
    base.push({
      id: `hauler-legacy:${key}`,
      name: rawName,
      category: 'hauler',
      position: 'Horse Hauler',
      dailyRatePhp: 0,
      active: true,
    });
  }

  return base;
}

export function resolveKnownHaulerNames(
  project: Pick<MastProjectState, 'manpowerRoster' | 'haulerRoster' | 'haulingLogs'>
): string[] {
  const map = new Map<string, string>();
  for (const member of resolveManpowerRoster(project)) {
    if (member.category !== 'hauler' || !member.active) continue;
    const t = member.name.trim();
    if (t && !map.has(normalizeNameKey(t))) {
      map.set(normalizeNameKey(t), t);
    }
  }
  for (const name of project.haulerRoster ?? []) {
    const t = name.trim();
    if (t && !Array.isArray(project.manpowerRoster) && !map.has(normalizeNameKey(t))) {
      map.set(normalizeNameKey(t), t);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

export interface CivilWorksPayrollPreview {
  startDate: string;
  endDate: string;
  rows: CivilWorksPayrollLineItem[];
  totalWorkersWithAttendance: number;
  totalDaysWorked: number;
  totalGrossPayPhp: number;
  totalDeductionPhp: number;
  totalNetPayPhp: number;
  totalAmountPhp: number;
}

export function computeCivilWorksPayrollPreview(
  roster: ManpowerMember[],
  attendanceRecords: CivilWorksAttendanceRecord[] = [],
  startDate: string,
  endDate: string,
  deductionsByMember: Record<string, number> = {}
): CivilWorksPayrollPreview {
  const civilMembers = roster.filter((m) => m.category === 'civil_works');
  const recordsInRange = attendanceRecords
    .filter((rec) => rec.date >= startDate && rec.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const datesByMember = new Map<string, Set<string>>();
  for (const rec of recordsInRange) {
    for (const memberId of rec.presentMemberIds) {
      if (!datesByMember.has(memberId)) {
        datesByMember.set(memberId, new Set());
      }
      datesByMember.get(memberId)!.add(rec.date);
    }
  }

  const rows: CivilWorksPayrollLineItem[] = civilMembers
    .filter((m) => m.active || (datesByMember.get(m.id)?.size ?? 0) > 0)
    .map((m) => {
      const datesPresent = Array.from(datesByMember.get(m.id) ?? []).sort((a, b) =>
        a.localeCompare(b)
      );
      const daysPresent = datesPresent.length;
      const dailyRatePhp = Math.max(0, Number(m.dailyRatePhp) || 0);
      const grossPayPhp = round2(daysPresent * dailyRatePhp);
      const deductionPhp = Math.max(
        0,
        round2(Number(deductionsByMember[m.id]) || 0)
      );
      const netPayPhp = round2(grossPayPhp - deductionPhp);
      return {
        memberId: m.id,
        name: m.name,
        position: m.position,
        dailyRatePhp,
        daysPresent,
        datesPresent,
        grossPayPhp,
        deductionPhp,
        netPayPhp,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalWorkersWithAttendance = rows.filter((r) => r.daysPresent > 0).length;
  const totalDaysWorked = rows.reduce((sum, r) => sum + r.daysPresent, 0);
  const totalGrossPayPhp = round2(
    rows.reduce((sum, r) => sum + r.grossPayPhp, 0)
  );
  const totalDeductionPhp = round2(
    rows.reduce((sum, r) => sum + (r.deductionPhp ?? 0), 0)
  );
  const totalNetPayPhp = round2(
    rows.reduce((sum, r) => sum + (r.netPayPhp ?? r.grossPayPhp), 0)
  );

  return {
    startDate,
    endDate,
    rows,
    totalWorkersWithAttendance,
    totalDaysWorked,
    totalGrossPayPhp,
    totalDeductionPhp,
    totalNetPayPhp,
    totalAmountPhp: totalNetPayPhp,
  };
}

export interface HaulerDeductionInput {
  amountPhp: number;
  note?: string;
}

export interface HaulerPayrollPreviewRow extends HaulerPayrollLineItem {
  overallEarnedPhp: number;
  overallPaidPhp: number;
  overallDeductionsPhp: number;
  overallBalanceDuePhp: number;
  alreadyDeductedInRangePhp: number;
  baseSuggestedPayoutPhp: number;
  currentOverallExcessKg: number;
}

export interface HaulerPayrollPreview {
  startDate: string;
  endDate: string;
  rows: HaulerPayrollPreviewRow[];
  totalHauledKg: number;
  totalCredits: number;
  totalEarnedPhp: number;
  totalDeductionPhp: number;
  totalSuggestedPayoutPhp: number;
  totalOverallBalanceDuePhp: number;
  rateConfig: HaulingRateConfig;
}

/**
 * Computes Individual Hauler payroll for `[startDate, endDate]` while preserving
 * strict chronological carried-excess continuity from project start.
 */
export function computeHaulerPayrollPreview(
  haulingLogs: HaulingLogEntry[],
  payouts: HaulerPayoutRecord[] = [],
  roster: ManpowerMember[] = [],
  startDate: string,
  endDate: string,
  periodType: PayrollPeriodType = 'weekly',
  rateConfig?: Partial<HaulingRateConfig>,
  deductionsByHauler: Record<string, number | HaulerDeductionInput> = {}
): HaulerPayrollPreview {
  const resolvedRate = resolveHaulingRateConfig(rateConfig);
  const overall = computeHaulerCreditLedgers(
    haulingLogs,
    payouts,
    undefined,
    resolvedRate
  );
  const overallLedgerByKey = new Map(
    overall.ledgers.map((l) => [normalizeNameKey(l.haulerName), l])
  );

  const memberByKey = new Map<string, ManpowerMember>();
  for (const m of roster) {
    if (m.category === 'hauler') {
      memberByKey.set(normalizeNameKey(m.name), m);
    }
  }

  // Filter trips up to endDate for exact chronological prior excess entering [startDate, endDate]
  const tripsUpToEnd = overall.tripsChronological.filter((t) => t.date <= endDate);

  const periodStats = new Map<
    string,
    {
      displayName: string;
      dates: Set<string>;
      tripsCompleted: number;
      hauledKg: number;
      priorExcessKg: number;
      hasSetPriorExcess: boolean;
      lastExcessBeforeRangeKg: number;
      creditsEarned: number;
      endingExcessKg: number;
      grossEarnedPhp: number;
    }
  >();

  for (const trip of tripsUpToEnd) {
    const key = normalizeNameKey(trip.haulerName);
    if (!periodStats.has(key)) {
      periodStats.set(key, {
        displayName: trip.haulerName,
        dates: new Set(),
        tripsCompleted: 0,
        hauledKg: 0,
        priorExcessKg: 0,
        hasSetPriorExcess: false,
        lastExcessBeforeRangeKg: 0,
        creditsEarned: 0,
        endingExcessKg: 0,
        grossEarnedPhp: 0,
      });
    }
    const st = periodStats.get(key)!;
    if (trip.date < startDate) {
      st.lastExcessBeforeRangeKg = trip.excessAfterKg;
      st.endingExcessKg = trip.excessAfterKg;
    } else {
      if (!st.hasSetPriorExcess) {
        st.priorExcessKg = trip.priorExcessKg;
        st.hasSetPriorExcess = true;
      }
      st.dates.add(trip.date);
      st.tripsCompleted += 1;
      st.hauledKg = round2(st.hauledKg + trip.totalKg);
      st.creditsEarned += trip.creditsEarned;
      st.endingExcessKg = trip.excessAfterKg;
      st.grossEarnedPhp += trip.payoutEarnedPhp;
    }
  }

  const paidInRangeByKey = new Map<string, number>();
  const deductedInRangeByKey = new Map<string, number>();
  const overallPaidByKey = new Map<string, number>();
  const overallDeductedByKey = new Map<string, number>();
  const payoutDisplayNames = new Map<string, string>();
  for (const p of payouts) {
    const key = normalizeNameKey(p.haulerName);
    if (!key) continue;
    if (!payoutDisplayNames.has(key)) {
      payoutDisplayNames.set(key, p.haulerName.trim());
    }
    const amt = Math.max(0, Number(p.amountPhp) || 0);
    const inRange = p.date >= startDate && p.date <= endDate;
    if (p.kind === 'deduction') {
      overallDeductedByKey.set(
        key,
        round2((overallDeductedByKey.get(key) ?? 0) + amt)
      );
      if (inRange) {
        deductedInRangeByKey.set(
          key,
          round2((deductedInRangeByKey.get(key) ?? 0) + amt)
        );
      }
    } else {
      overallPaidByKey.set(key, round2((overallPaidByKey.get(key) ?? 0) + amt));
      if (inRange) {
        paidInRangeByKey.set(key, round2((paidInRangeByKey.get(key) ?? 0) + amt));
      }
    }
  }

  const normalizedDeductions = new Map<string, HaulerDeductionInput>();
  for (const [rawKey, val] of Object.entries(deductionsByHauler)) {
    const key = normalizeNameKey(rawKey);
    if (!key) continue;
    const amountPhp = Math.max(
      0,
      round2(typeof val === 'number' ? val : val?.amountPhp ?? 0)
    );
    const note =
      typeof val === 'object' ? val?.note?.trim() || undefined : undefined;
    normalizedDeductions.set(key, { amountPhp, note });
  }

  const allHaulerKeys = new Set<string>([
    ...periodStats.keys(),
    ...overallLedgerByKey.keys(),
    ...payoutDisplayNames.keys(),
    ...Array.from(memberByKey.entries())
      .filter(([, m]) => m.active)
      .map(([k]) => k),
  ]);

  const rows: HaulerPayrollPreviewRow[] = Array.from(allHaulerKeys)
    .map((key) => {
      const member = memberByKey.get(key);
      const pStat = periodStats.get(key);
      const overallRow = overallLedgerByKey.get(key);
      const haulerName =
        member?.name ??
        pStat?.displayName ??
        overallRow?.haulerName ??
        payoutDisplayNames.get(key) ??
        key;
      const tripsCompleted = pStat?.tripsCompleted ?? 0;
      const priorExcessKg = pStat
        ? pStat.hasSetPriorExcess
          ? pStat.priorExcessKg
          : pStat.lastExcessBeforeRangeKg
        : 0;
      const endingExcessKg = pStat?.endingExcessKg ?? 0;
      const hauledKg = pStat?.hauledKg ?? 0;
      const creditsEarned = pStat?.creditsEarned ?? 0;
      const grossEarnedPhp = round2(
        creditsEarned * resolvedRate.ratePerBlockPhp
      );
      const alreadyPaidInRangePhp = paidInRangeByKey.get(key) ?? 0;
      const alreadyDeductedInRangePhp = deductedInRangeByKey.get(key) ?? 0;
      const settledInRangePhp = round2(
        alreadyPaidInRangePhp + alreadyDeductedInRangePhp
      );
      const overallEarnedPhp = overallRow?.grossEarnedPhp ?? 0;
      const overallPaidPhp =
        overallRow?.totalPaidPhp ?? overallPaidByKey.get(key) ?? 0;
      const overallDeductionsPhp =
        overallRow?.totalDeductionsPhp ?? overallDeductedByKey.get(key) ?? 0;
      const overallBalanceDuePhp = round2(
        overallEarnedPhp - overallPaidPhp - overallDeductionsPhp
      );

      const baseSuggestedPayoutPhp =
        periodType === 'overall'
          ? Math.max(0, overallBalanceDuePhp)
          : Math.max(
              0,
              Math.min(
                round2(grossEarnedPhp - settledInRangePhp),
                overallBalanceDuePhp
              )
            );

      const batchDed = normalizedDeductions.get(key);
      const deductionPhp = batchDed?.amountPhp ?? 0;
      const deductionNote = batchDed?.note;
      const payoutReleasedPhp = Math.max(
        0,
        round2(baseSuggestedPayoutPhp - deductionPhp)
      );

      return {
        haulerName,
        memberId: member?.id,
        activeDays: pStat?.dates.size ?? 0,
        tripsCompleted,
        hauledKg,
        priorExcessKg,
        creditsEarned,
        endingExcessKg,
        grossEarnedPhp,
        alreadyPaidInRangePhp,
        alreadyDeductedInRangePhp,
        deductionPhp,
        deductionNote,
        baseSuggestedPayoutPhp,
        payoutReleasedPhp,
        netBalanceAfterPhp: round2(
          Math.max(
            0,
            overallBalanceDuePhp - (payoutReleasedPhp + deductionPhp)
          )
        ),
        overallEarnedPhp,
        overallPaidPhp,
        overallDeductionsPhp,
        overallBalanceDuePhp,
        currentOverallExcessKg: overallRow?.currentExcessKg ?? endingExcessKg,
      };
    })
    .filter(
      (r) =>
        r.tripsCompleted > 0 ||
        r.overallBalanceDuePhp !== 0 ||
        r.overallEarnedPhp > 0 ||
        memberByKey.get(normalizeNameKey(r.haulerName))?.active
    )
    .sort((a, b) => a.haulerName.localeCompare(b.haulerName));

  return {
    startDate,
    endDate,
    rows,
    totalHauledKg: round2(rows.reduce((s, r) => s + r.hauledKg, 0)),
    totalCredits: rows.reduce((s, r) => s + r.creditsEarned, 0),
    totalEarnedPhp: round2(rows.reduce((s, r) => s + r.grossEarnedPhp, 0)),
    totalDeductionPhp: round2(
      rows.reduce((s, r) => s + (r.deductionPhp ?? 0), 0)
    ),
    totalSuggestedPayoutPhp: round2(
      rows.reduce((s, r) => s + r.payoutReleasedPhp, 0)
    ),
    totalOverallBalanceDuePhp: round2(
      rows.reduce((s, r) => s + r.overallBalanceDuePhp, 0)
    ),
    rateConfig: resolvedRate,
  };
}

export function formatCivilPayrollPlainText(
  snapshot: Pick<
    CivilWorksPayrollSnapshot,
    | 'title'
    | 'periodType'
    | 'startDate'
    | 'endDate'
    | 'status'
    | 'paidDate'
    | 'items'
    | 'totalDaysWorked'
    | 'totalAmountPhp'
    | 'totalGrossPayPhp'
    | 'totalDeductionPhp'
    | 'totalNetPayPhp'
    | 'notes'
  >,
  project: Pick<MastProjectState, 'projectName' | 'location' | 'preparedBy'>,
  options?: { includeStatus?: boolean }
): string {
  const includeStatus = options?.includeStatus ?? true;
  const totalDeduction =
    snapshot.totalDeductionPhp ??
    round2(snapshot.items.reduce((s, i) => s + (i.deductionPhp ?? 0), 0));
  const totalGross =
    snapshot.totalGrossPayPhp ??
    round2(snapshot.items.reduce((s, i) => s + i.grossPayPhp, 0));
  const totalNet = snapshot.totalNetPayPhp ?? snapshot.totalAmountPhp;

  const lines: string[] = [
    `CIVIL WORKS PAYROLL — ${snapshot.title}`,
    `Project: ${project.projectName}`,
    `Location: ${project.location}`,
    `Period: ${snapshot.startDate}${snapshot.startDate !== snapshot.endDate ? ` to ${snapshot.endDate}` : ''} (${snapshot.periodType.toUpperCase()})`,
    ...(includeStatus
      ? [
          `Status: ${snapshot.status === 'paid' ? `PAID${snapshot.paidDate ? ` (${snapshot.paidDate})` : ''}` : 'FOR APPROVAL / PENDING'}`,
        ]
      : []),
    `Prepared By: ${project.preparedBy}`,
    '',
    'WORKERS & PAY:',
  ];

  if (snapshot.items.length === 0) {
    lines.push('- No worker attendance recorded in this period.');
  } else {
    for (const item of snapshot.items) {
      const ded = item.deductionPhp ?? 0;
      const net = item.netPayPhp ?? round2(item.grossPayPhp - ded);
      const paySuffix =
        ded > 0
          ? `Gross PHP ${item.grossPayPhp.toLocaleString()} - Ded. PHP ${ded.toLocaleString()} = Net PHP ${net.toLocaleString()}`
          : `PHP ${item.grossPayPhp.toLocaleString()}`;
      lines.push(
        `- ${item.name} (${item.position}): ${item.daysPresent} day${item.daysPresent === 1 ? '' : 's'} × PHP ${item.dailyRatePhp.toLocaleString()} = ${paySuffix}`
      );
    }
  }

  lines.push('', `TOTAL MAN-DAYS: ${snapshot.totalDaysWorked}`);
  if (totalDeduction > 0) {
    lines.push(`TOTAL GROSS PAY: PHP ${totalGross.toLocaleString()}`);
    lines.push(`TOTAL DEDUCTIONS: PHP ${totalDeduction.toLocaleString()}`);
  }
  lines.push(`TOTAL PAYROLL: PHP ${totalNet.toLocaleString()}`);
  if (snapshot.notes?.trim()) {
    lines.push(`Notes: ${snapshot.notes.trim()}`);
  }
  return lines.join('\n');
}

export function formatHaulerPayrollPlainText(
  snapshot: Pick<
    HaulerPayrollSnapshot,
    | 'title'
    | 'periodType'
    | 'startDate'
    | 'endDate'
    | 'status'
    | 'paidDate'
    | 'items'
    | 'totalHauledKg'
    | 'totalCredits'
    | 'totalEarnedPhp'
    | 'totalDeductionPhp'
    | 'totalPayoutPhp'
    | 'creditBlockKg'
    | 'ratePerBlockPhp'
    | 'notes'
  >,
  project: Pick<MastProjectState, 'projectName' | 'location' | 'preparedBy'>,
  options?: { includeStatus?: boolean }
): string {
  const includeStatus = options?.includeStatus ?? true;
  const creditBlockKg = snapshot.creditBlockKg ?? HAULING_CREDIT_BLOCK_KG;
  const ratePerBlockPhp = snapshot.ratePerBlockPhp ?? HAULING_RATE_PER_BLOCK_PHP;
  const totalDeduction =
    snapshot.totalDeductionPhp ??
    round2(snapshot.items.reduce((s, i) => s + (i.deductionPhp ?? 0), 0));
  const lines: string[] = [
    `INDIVIDUAL HAULER PAYROLL — ${snapshot.title}`,
    `Rate: PHP ${ratePerBlockPhp.toLocaleString()} per ${creditBlockKg} kg credit (excess carried over)`,
    `Project: ${project.projectName}`,
    `Location: ${project.location}`,
    `Period: ${snapshot.startDate}${snapshot.startDate !== snapshot.endDate ? ` to ${snapshot.endDate}` : ''} (${snapshot.periodType.toUpperCase()})`,
    ...(includeStatus
      ? [
          `Status: ${snapshot.status === 'paid' ? `PAID${snapshot.paidDate ? ` (${snapshot.paidDate})` : ''}` : 'FOR APPROVAL / PENDING'}`,
        ]
      : []),
    `Prepared By: ${project.preparedBy}`,
    '',
    'INDIVIDUAL HAULERS:',
  ];

  if (snapshot.items.length === 0) {
    lines.push('- No hauler trips or payouts in this period.');
  } else {
    for (const item of snapshot.items) {
      const ded = item.deductionPhp ?? 0;
      const dedSegment =
        ded > 0
          ? ` | Ded.: PHP ${ded.toLocaleString()}${item.deductionNote?.trim() ? ` (${item.deductionNote.trim()})` : ''}`
          : '';
      const payoutLabel = ded > 0 ? 'Net Payout' : 'Payout';
      lines.push(
        `- ${item.haulerName}: ${item.tripsCompleted} trip${item.tripsCompleted === 1 ? '' : 's'}, ${item.hauledKg} kg hauled (prior excess ${item.priorExcessKg} kg -> ${item.creditsEarned} credit${item.creditsEarned === 1 ? '' : 's'}, ending excess ${item.endingExcessKg} kg) | Earned: PHP ${item.grossEarnedPhp.toLocaleString()}${dedSegment} | ${payoutLabel}: PHP ${item.payoutReleasedPhp.toLocaleString()}`
      );
    }
  }

  lines.push(
    '',
    `TOTAL HAULED: ${snapshot.totalHauledKg} kg (${snapshot.totalCredits} credits)`,
    `TOTAL PERIOD EARNED: PHP ${snapshot.totalEarnedPhp.toLocaleString()}`,
    ...(totalDeduction > 0
      ? [`TOTAL DEDUCTIONS: PHP ${totalDeduction.toLocaleString()}`]
      : []),
    `TOTAL PAYOUT AMOUNT: PHP ${snapshot.totalPayoutPhp.toLocaleString()}`
  );
  if (snapshot.notes?.trim()) {
    lines.push(`Notes: ${snapshot.notes.trim()}`);
  }
  return lines.join('\n');
}
