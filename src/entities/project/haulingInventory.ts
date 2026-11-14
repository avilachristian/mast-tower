import { BAGS_PER_CUBIC_METER, DEFAULT_KG_PER_BAG, PROJECT_MATERIAL_TARGETS } from './mast2Baseline';
import type {
  CentralMaterialItem,
  DailyActivityLogEntry,
  DailyLogMaterialItem,
  HaulerPayoutRecord,
  HaulingLogEntry,
  HaulingMaterialCategory,
  MastProjectState,
  ProjectType,
} from './types';

export const HAULING_CREDIT_BLOCK_KG = 120;
export const HAULING_RATE_PER_BLOCK_PHP = 1100;
export const MAX_TRIPS_PER_HAULER_PER_DAY = 2;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

export function createDefaultCentralMaterials(): CentralMaterialItem[] {
  return [
    {
      id: 'mat-cement',
      name: 'Cement',
      category: 'foundation',
      unit: 'bags',
      haulingMaterialKey: 'cement',
      defaultKgPerUnit: DEFAULT_KG_PER_BAG,
      targetQty: PROJECT_MATERIAL_TARGETS.cementBagsTotal,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '40 kg/bag Portland cement',
    },
    {
      id: 'mat-sand',
      name: 'Sand',
      category: 'foundation',
      unit: 'bags',
      haulingMaterialKey: 'sand',
      purchaseUnit: 'cu.m',
      unitsPerPurchaseUnit: BAGS_PER_CUBIC_METER,
      defaultKgPerUnit: DEFAULT_KG_PER_BAG,
      targetQty: PROJECT_MATERIAL_TARGETS.sandCuMTotal * BAGS_PER_CUBIC_METER,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: 'Purchased in cu.m (1 cu.m ≈ 36 bags)',
    },
    {
      id: 'mat-gravel',
      name: 'Gravel',
      category: 'foundation',
      unit: 'bags',
      haulingMaterialKey: 'gravel',
      purchaseUnit: 'cu.m',
      unitsPerPurchaseUnit: BAGS_PER_CUBIC_METER,
      defaultKgPerUnit: DEFAULT_KG_PER_BAG,
      targetQty: PROJECT_MATERIAL_TARGETS.gravelCuMTotal * BAGS_PER_CUBIC_METER,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: 'Purchased in cu.m (1 cu.m ≈ 36 bags)',
    },
    {
      id: 'mat-main-rebar',
      name: 'Main Rebar',
      category: 'foundation',
      unit: 'pcs',
      haulingMaterialKey: 'main_bar_a',
      targetQty: 496,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: 'Cut main bars for foundation cages',
    },
    {
      id: 'mat-chair-bar',
      name: 'Chair Bar',
      category: 'foundation',
      unit: 'pcs',
      haulingMaterialKey: 'chair_bar_a',
      targetQty: 102,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: 'Spacer / chair bars',
    },
    {
      id: 'mat-rebar-20mm',
      name: '20mmØ Commercial Rebar (6m)',
      category: 'foundation',
      unit: 'pcs',
      haulingMaterialKey: 'rebar_20mm',
      targetQty: PROJECT_MATERIAL_TARGETS.rebar20mmCommercialPcs,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: 'Full-length commercial Ø20mm bars',
    },
    {
      id: 'mat-phenolic',
      name: 'Phenolic',
      category: 'foundation',
      unit: 'pcs',
      haulingMaterialKey: 'phenolic_board',
      targetQty: PROJECT_MATERIAL_TARGETS.phenolicBoardsPcs,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '4ft × 8ft reusable formwork boards',
    },
    {
      id: 'mat-anchor-rod',
      name: 'Ground Anchor Rod (Ø25mm)',
      category: 'foundation',
      unit: 'pcs',
      haulingMaterialKey: 'anchor_rod',
      targetQty: 24,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '2 pcs per pull anchor foundation',
    },
    {
      id: 'mat-tie-wire',
      name: 'Tie Wire',
      category: 'foundation',
      unit: 'kg',
      haulingMaterialKey: 'other',
      defaultKgPerUnit: 1,
      targetQty: 40,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: 'Rebar cage binding wire',
    },
    {
      id: 'part-tower-section',
      name: 'Modular Tower Section (3.0m)',
      category: 'vertical_mast',
      unit: 'sec',
      haulingMaterialKey: 'tower_section',
      targetQty: 41,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '120m + 3m mast sections',
    },
    {
      id: 'part-flange-bolts',
      name: 'Flange Splice Bolt (M16×70)',
      category: 'vertical_mast',
      unit: 'pcs',
      haulingMaterialKey: 'tower_accessory',
      targetQty: 492,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '12 bolts per section splice',
    },
    {
      id: 'part-guy-cable',
      name: 'Guy Wire Strand (Ø11.4mm)',
      category: 'vertical_mast',
      unit: 'pcs',
      haulingMaterialKey: 'tower_accessory',
      targetQty: 48,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '16 guy layers × 3 sectors',
    },
    {
      id: 'part-turnbuckle',
      name: 'Turnbuckle & Shackle Set',
      category: 'vertical_mast',
      unit: 'sets',
      haulingMaterialKey: 'tower_accessory',
      targetQty: 48,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: 'Guy wire tensioning hardware',
    },
    {
      id: 'part-uring-nut3',
      name: 'U-Ring & NUT-3 Clamp',
      category: 'vertical_mast',
      unit: 'sets',
      haulingMaterialKey: 'tower_accessory',
      targetQty: 48,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '100 kN guy plate clamps',
    },
    {
      id: 'part-accessories',
      name: 'Working Platform / Lightning Rod',
      category: 'vertical_mast',
      unit: 'sets',
      haulingMaterialKey: 'tower_accessory',
      targetQty: 2,
      stockYardTotalQty: 0,
      onSiteOpeningQty: 0,
      remarks: '7m platform + 6m lightning mast',
    },
  ];
}

export function resolveCentralMaterials(
  project: Pick<MastProjectState, 'centralMaterials'>
): CentralMaterialItem[] {
  if (project.centralMaterials && project.centralMaterials.length > 0) {
    return project.centralMaterials;
  }
  return createDefaultCentralMaterials();
}

export function matchHaulingEntryToCentralMaterial(
  entry: Pick<HaulingLogEntry, 'materialId' | 'material' | 'itemLabel'>,
  materials: CentralMaterialItem[]
): CentralMaterialItem | undefined {
  if (entry.materialId) {
    const byId = materials.find((m) => m.id === entry.materialId);
    if (byId) return byId;
  }
  if (entry.itemLabel) {
    const labelKey = normalizeKey(entry.itemLabel);
    const byName = materials.find((m) => normalizeKey(m.name) === labelKey);
    if (byName) return byName;
  }
  const byCategory = materials.find(
    (m) =>
      m.haulingMaterialKey === entry.material &&
      entry.material !== 'other' &&
      entry.material !== 'tower_accessory'
  );
  return byCategory;
}

export interface HaulingTripSummary {
  tripKey: string;
  tripGroupId?: string;
  date: string;
  haulerName: string;
  tripNumber: 1 | 2;
  items: HaulingLogEntry[];
  totalKg: number;
  priorExcessKg: number;
  effectiveKg: number;
  creditsEarned: number;
  payoutEarnedPhp: number;
  excessAfterKg: number;
  remarks: string;
}

export interface HaulerCreditLedgerRow {
  haulerName: string;
  activeDays: number;
  tripsCompleted: number;
  totalHauledKg: number;
  totalCredits: number;
  currentExcessKg: number;
  kgToNextCredit: number;
  grossEarnedPhp: number;
  totalPaidPhp: number;
  balanceDuePhp: number;
  materialTotals: {
    materialId: string;
    name: string;
    unit: string;
    qty: number;
    kg: number;
  }[];
}

/**
 * Groups hauling entries into chronological trips per hauler (max 2 trips/day)
 * and computes ₱1,100 per completed 120 kg block with continuous carried excess.
 */
export function computeHaulerCreditLedgers(
  logs: HaulingLogEntry[],
  payouts: HaulerPayoutRecord[] = [],
  centralMaterials: CentralMaterialItem[] = createDefaultCentralMaterials()
): {
  tripsChronological: HaulingTripSummary[];
  tripsNewestFirst: HaulingTripSummary[];
  ledgers: HaulerCreditLedgerRow[];
  totalHauledKg: number;
  totalCredits: number;
  totalEarnedPhp: number;
  totalPaidPhp: number;
  totalBalanceDuePhp: number;
  totalActiveExcessKg: number;
} {
  const tripGroups = new Map<
    string,
    {
      tripKey: string;
      tripGroupId?: string;
      date: string;
      haulerName: string;
      tripNumber: 1 | 2;
      orderIndex: number;
      items: HaulingLogEntry[];
    }
  >();

  // Preserve chronological order for ties by iterating oldest-added or index order
  logs.forEach((entry, idx) => {
    const haulerName = entry.haulerName.trim() || 'Unnamed Hauler';
    const tripNumber: 1 | 2 = entry.tripNumber === 2 ? 2 : 1;
    const tripKey = entry.tripGroupId
      ? `grp:${entry.tripGroupId}`
      : `${entry.date}__${normalizeKey(haulerName)}__${tripNumber}`;

    if (!tripGroups.has(tripKey)) {
      tripGroups.set(tripKey, {
        tripKey,
        tripGroupId: entry.tripGroupId,
        date: entry.date,
        haulerName,
        tripNumber,
        orderIndex: idx,
        items: [],
      });
    }
    tripGroups.get(tripKey)!.items.push(entry);
  });

  const sortedRawTrips = Array.from(tripGroups.values()).sort((a, b) => {
    const dateDiff = (a.date || '').localeCompare(b.date || '');
    if (dateDiff !== 0) return dateDiff;
    if (a.tripNumber !== b.tripNumber) return a.tripNumber - b.tripNumber;
    return b.orderIndex - a.orderIndex; // newest entries are prepended in store; older first
  });

  const excessByHauler = new Map<string, number>();
  const haulerStats = new Map<
    string,
    {
      displayName: string;
      dates: Set<string>;
      tripsCompleted: number;
      totalHauledKg: number;
      totalCredits: number;
      currentExcessKg: number;
      grossEarnedPhp: number;
      materials: Map<string, { materialId: string; name: string; unit: string; qty: number; kg: number }>;
    }
  >();

  const tripsChronological: HaulingTripSummary[] = sortedRawTrips.map((group) => {
    const hKey = normalizeKey(group.haulerName);
    const totalKg = round2(group.items.reduce((sum, i) => sum + (Number(i.totalKg) || 0), 0));
    const priorExcessKg = excessByHauler.get(hKey) ?? 0;
    const effectiveKg = round2(totalKg + priorExcessKg);
    const creditsEarned = Math.floor(effectiveKg / HAULING_CREDIT_BLOCK_KG);
    const payoutEarnedPhp = creditsEarned * HAULING_RATE_PER_BLOCK_PHP;
    const excessAfterKg = round2(effectiveKg - creditsEarned * HAULING_CREDIT_BLOCK_KG);

    excessByHauler.set(hKey, excessAfterKg);

    if (!haulerStats.has(hKey)) {
      haulerStats.set(hKey, {
        displayName: group.haulerName,
        dates: new Set(),
        tripsCompleted: 0,
        totalHauledKg: 0,
        totalCredits: 0,
        currentExcessKg: 0,
        grossEarnedPhp: 0,
        materials: new Map(),
      });
    }
    const st = haulerStats.get(hKey)!;
    st.dates.add(group.date);
    st.tripsCompleted += 1;
    st.totalHauledKg = round2(st.totalHauledKg + totalKg);
    st.totalCredits += creditsEarned;
    st.currentExcessKg = excessAfterKg;
    st.grossEarnedPhp += payoutEarnedPhp;

    for (const item of group.items) {
      const matched = matchHaulingEntryToCentralMaterial(item, centralMaterials);
      const matId = matched?.id ?? item.materialId ?? item.itemLabel ?? item.material;
      const matName = matched?.name ?? item.itemLabel ?? item.material;
      const matUnit = item.unitLabel || matched?.unit || 'pcs';
      const matKey = normalizeKey(matName);
      const prevMat = st.materials.get(matKey) ?? {
        materialId: matId,
        name: matName,
        unit: matUnit,
        qty: 0,
        kg: 0,
      };
      st.materials.set(matKey, {
        ...prevMat,
        qty: round2(prevMat.qty + (Number(item.quantity) || 0)),
        kg: round2(prevMat.kg + (Number(item.totalKg) || 0)),
      });
    }

    const remarks = group.items
      .map((i) => i.remarks?.trim())
      .filter((r): r is string => Boolean(r))
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .join(' · ');

    return {
      tripKey: group.tripKey,
      tripGroupId: group.tripGroupId,
      date: group.date,
      haulerName: group.haulerName,
      tripNumber: group.tripNumber,
      items: group.items,
      totalKg,
      priorExcessKg,
      effectiveKg,
      creditsEarned,
      payoutEarnedPhp,
      excessAfterKg,
      remarks,
    };
  });

  const paidByHauler = new Map<string, number>();
  for (const p of payouts) {
    const hKey = normalizeKey(p.haulerName);
    if (!hKey) continue;
    paidByHauler.set(hKey, round2((paidByHauler.get(hKey) ?? 0) + (Number(p.amountPhp) || 0)));
  }

  const ledgers: HaulerCreditLedgerRow[] = Array.from(haulerStats.entries())
    .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
    .map(([hKey, st]) => {
      const totalPaidPhp = paidByHauler.get(hKey) ?? 0;
      return {
        haulerName: st.displayName,
        activeDays: st.dates.size,
        tripsCompleted: st.tripsCompleted,
        totalHauledKg: st.totalHauledKg,
        totalCredits: st.totalCredits,
        currentExcessKg: st.currentExcessKg,
        kgToNextCredit: round2(HAULING_CREDIT_BLOCK_KG - st.currentExcessKg),
        grossEarnedPhp: st.grossEarnedPhp,
        totalPaidPhp,
        balanceDuePhp: round2(st.grossEarnedPhp - totalPaidPhp),
        materialTotals: Array.from(st.materials.values()),
      };
    });

  const tripsNewestFirst = [...tripsChronological].reverse();
  const totalHauledKg = round2(ledgers.reduce((s, r) => s + r.totalHauledKg, 0));
  const totalCredits = ledgers.reduce((s, r) => s + r.totalCredits, 0);
  const totalEarnedPhp = ledgers.reduce((s, r) => s + r.grossEarnedPhp, 0);
  const totalPaidPhp = round2(ledgers.reduce((s, r) => s + r.totalPaidPhp, 0));
  const totalBalanceDuePhp = round2(totalEarnedPhp - totalPaidPhp);
  const totalActiveExcessKg = round2(ledgers.reduce((s, r) => s + r.currentExcessKg, 0));

  return {
    tripsChronological,
    tripsNewestFirst,
    ledgers,
    totalHauledKg,
    totalCredits,
    totalEarnedPhp,
    totalPaidPhp,
    totalBalanceDuePhp,
    totalActiveExcessKg,
  };
}

export interface CentralMaterialStatusRow {
  item: CentralMaterialItem;
  stockYardTotalQty: number;
  stockYardTotalCuM: number | null;
  hauledQty: number;
  hauledKg: number;
  stockYardRemainingQty: number;
  stockYardRemainingCuM: number | null;
  onSiteOpeningQty: number;
  totalDeliveredToSiteQty: number;
  usedOnSiteQty: number;
  onSiteRemainingQty: number;
  stillNeededOnSiteQty: number;
  stillNeededCuM: number | null;
}

/**
 * Computes centralized Stock Yard & On-Site material balances across
 * editable yard totals, horse hauling trips, and Daily Log material usage.
 */
export function computeCentralMaterialStatuses(
  project: Pick<
    MastProjectState,
    'centralMaterials' | 'haulingLogs' | 'dailyLogs'
  >
): CentralMaterialStatusRow[] {
  const materials = resolveCentralMaterials(project);
  const hauledQtyMap = new Map<string, number>();
  const hauledKgMap = new Map<string, number>();

  for (const log of project.haulingLogs) {
    const matched = matchHaulingEntryToCentralMaterial(log, materials);
    if (!matched) continue;
    hauledQtyMap.set(
      matched.id,
      round2((hauledQtyMap.get(matched.id) ?? 0) + (Number(log.quantity) || 0))
    );
    hauledKgMap.set(
      matched.id,
      round2((hauledKgMap.get(matched.id) ?? 0) + (Number(log.totalKg) || 0))
    );
  }

  const usedById = new Map<string, number>();
  const usedByName = new Map<string, number>();
  for (const dl of project.dailyLogs) {
    for (const mat of dl.materialsOnSite ?? []) {
      const used = Math.max(0, Number(mat.usedTodayQty) || 0);
      if (used <= 0) continue;
      if (mat.id) {
        usedById.set(mat.id, round2((usedById.get(mat.id) ?? 0) + used));
      }
      const nameKey = normalizeKey(mat.name);
      if (nameKey) {
        usedByName.set(nameKey, round2((usedByName.get(nameKey) ?? 0) + used));
      }
    }
  }

  return materials.map((item) => {
    const hauledQty = hauledQtyMap.get(item.id) ?? 0;
    const hauledKg = hauledKgMap.get(item.id) ?? 0;
    const stockYardTotalQty = round2(item.stockYardTotalQty);
    const stockYardRemainingQty = round2(stockYardTotalQty - hauledQty);
    const onSiteOpeningQty = round2(item.onSiteOpeningQty ?? 0);
    const totalDeliveredToSiteQty = round2(onSiteOpeningQty + hauledQty);

    const usedFromId = usedById.get(item.id);
    const usedFromName = usedByName.get(normalizeKey(item.name));
    const usedOnSiteQty = round2(usedFromId ?? usedFromName ?? 0);

    const onSiteRemainingQty = Math.max(
      0,
      round2(totalDeliveredToSiteQty - usedOnSiteQty)
    );
    const stillNeededOnSiteQty = Math.max(
      0,
      round2(item.targetQty - totalDeliveredToSiteQty)
    );

    const factor = item.unitsPerPurchaseUnit;
    return {
      item,
      stockYardTotalQty,
      stockYardTotalCuM: factor ? round2(stockYardTotalQty / factor) : null,
      hauledQty,
      hauledKg,
      stockYardRemainingQty,
      stockYardRemainingCuM: factor ? round2(stockYardRemainingQty / factor) : null,
      onSiteOpeningQty,
      totalDeliveredToSiteQty,
      usedOnSiteQty,
      onSiteRemainingQty,
      stillNeededOnSiteQty,
      stillNeededCuM: factor ? round2(stillNeededOnSiteQty / factor) : null,
    };
  });
}

/**
 * Returns total hauled quantities (in pcs/bags/etc.) delivered to site on a given date,
 * indexed by both CentralMaterialItem.id and normalized material name.
 */
export function getHauledDeliveriesForDate(
  haulingLogs: HaulingLogEntry[],
  date: string,
  centralMaterials: CentralMaterialItem[]
): { byId: Map<string, number>; byName: Map<string, number> } {
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();

  for (const log of haulingLogs) {
    if (log.date !== date) continue;
    const qty = Math.max(0, Number(log.quantity) || 0);
    if (qty <= 0) continue;
    const matched = matchHaulingEntryToCentralMaterial(log, centralMaterials);
    if (matched) {
      byId.set(matched.id, round2((byId.get(matched.id) ?? 0) + qty));
      byName.set(
        normalizeKey(matched.name),
        round2((byName.get(normalizeKey(matched.name)) ?? 0) + qty)
      );
    } else if (log.itemLabel) {
      const k = normalizeKey(log.itemLabel);
      byName.set(k, round2((byName.get(k) ?? 0) + qty));
    }
  }

  return { byId, byName };
}

/**
 * Builds the initial Daily Log material rows for a draft date, merging phase-relevant
 * centralized materials, previous-day carry-over remaining quantities, and hauled deliveries on `date`.
 */
export function buildCentralizedDailyLogMaterials(
  project: Pick<
    MastProjectState,
    'projectType' | 'centralMaterials' | 'haulingLogs' | 'dailyLogs'
  >,
  prevLog: DailyActivityLogEntry | null | undefined,
  date: string,
  computeRemaining: (item: Pick<DailyLogMaterialItem, 'onSiteQty' | 'deliveredQty' | 'usedTodayQty'>) => number
): DailyLogMaterialItem[] {
  const phase: ProjectType = project.projectType ?? 'foundation';
  const central = resolveCentralMaterials(project);
  const phaseItems = central.filter(
    (m) => m.category === phase || m.category === 'shared'
  );
  const deliveries = getHauledDeliveriesForDate(project.haulingLogs, date, central);

  const prevRows = prevLog?.materialsOnSite ?? [];
  const prevById = new Map<string, DailyLogMaterialItem>();
  const prevByName = new Map<string, DailyLogMaterialItem>();
  for (const r of prevRows) {
    if (r.id) prevById.set(r.id, r);
    const k = normalizeKey(r.name);
    if (k) prevByName.set(k, r);
  }

  // If there is no previous Daily Log yet, count opening on-site + trips hauled strictly before `date`
  const priorHauledById = new Map<string, number>();
  if (!prevLog) {
    for (const log of project.haulingLogs) {
      if ((log.date || '') >= date) continue;
      const matched = matchHaulingEntryToCentralMaterial(log, central);
      if (!matched) continue;
      priorHauledById.set(
        matched.id,
        round2((priorHauledById.get(matched.id) ?? 0) + (Number(log.quantity) || 0))
      );
    }
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const rows: DailyLogMaterialItem[] = phaseItems.map((item) => {
    const k = normalizeKey(item.name);
    seenIds.add(item.id);
    seenNames.add(k);

    const prevMatch = prevById.get(item.id) ?? prevByName.get(k);
    const onSiteQty = prevMatch
      ? computeRemaining(prevMatch)
      : round2((item.onSiteOpeningQty ?? 0) + (priorHauledById.get(item.id) ?? 0));
    const deliveredQty =
      deliveries.byId.get(item.id) ?? deliveries.byName.get(k) ?? 0;

    return {
      id: item.id,
      name: item.name,
      unit: prevMatch?.unit || item.unit,
      onSiteQty,
      deliveredQty,
      usedTodayQty: 0,
      remainingQty: computeRemaining({
        onSiteQty,
        deliveredQty,
        usedTodayQty: 0,
      }),
      remarks: '',
    };
  });

  // Preserve carried-over custom rows from prevLog that are not in phaseItems
  for (const prev of prevRows) {
    const k = normalizeKey(prev.name);
    if (!k || seenIds.has(prev.id) || seenNames.has(k)) continue;
    const carryOver = computeRemaining(prev);
    const deliveredQty = deliveries.byName.get(k) ?? 0;
    if (carryOver <= 0 && deliveredQty <= 0) continue;
    seenIds.add(prev.id);
    seenNames.add(k);
    rows.push({
      ...prev,
      onSiteQty: carryOver,
      deliveredQty,
      usedTodayQty: 0,
      remainingQty: computeRemaining({
        onSiteQty: carryOver,
        deliveredQty,
        usedTodayQty: 0,
      }),
      remarks: '',
    });
  }

  return rows;
}

/**
 * Syncs `deliveredQty` on an existing set of Daily Log material rows from hauling trips on `date`,
 * preserving `onSiteQty`, `usedTodayQty`, and `remarks` on existing rows.
 */
export function syncDailyLogMaterialsWithHauling(
  project: Pick<MastProjectState, 'centralMaterials' | 'haulingLogs'>,
  date: string,
  currentRows: DailyLogMaterialItem[],
  computeRemaining: (item: Pick<DailyLogMaterialItem, 'onSiteQty' | 'deliveredQty' | 'usedTodayQty'>) => number
): DailyLogMaterialItem[] {
  const central = resolveCentralMaterials(project);
  const deliveries = getHauledDeliveriesForDate(project.haulingLogs, date, central);
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const nextRows = currentRows.map((row) => {
    const k = normalizeKey(row.name);
    if (row.id) seenIds.add(row.id);
    if (k) seenNames.add(k);
    const syncedDelivered =
      deliveries.byId.get(row.id) ?? deliveries.byName.get(k) ?? 0;
    return {
      ...row,
      deliveredQty: syncedDelivered,
      remainingQty: computeRemaining({
        onSiteQty: row.onSiteQty,
        deliveredQty: syncedDelivered,
        usedTodayQty: row.usedTodayQty,
      }),
    };
  });

  // Add any centralized material hauled on `date` that wasn't already listed in currentRows
  for (const item of central) {
    const k = normalizeKey(item.name);
    if (seenIds.has(item.id) || seenNames.has(k)) continue;
    const deliveredQty = deliveries.byId.get(item.id) ?? deliveries.byName.get(k) ?? 0;
    if (deliveredQty <= 0) continue;
    seenIds.add(item.id);
    seenNames.add(k);
    nextRows.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      onSiteQty: 0,
      deliveredQty,
      usedTodayQty: 0,
      remainingQty: computeRemaining({
        onSiteQty: 0,
        deliveredQty,
        usedTodayQty: 0,
      }),
      remarks: '',
    });
  }

  return nextRows;
}

export function suggestHaulingMaterialCategory(
  materialName: string
): HaulingMaterialCategory {
  const k = normalizeKey(materialName);
  if (k.includes('cement')) return 'cement';
  if (k.includes('sand')) return 'sand';
  if (k.includes('gravel')) return 'gravel';
  if (k.includes('20mm') || k.includes('commercial')) return 'rebar_20mm';
  if (k.includes('main')) return 'main_bar_a';
  if (k.includes('chair')) return 'chair_bar_a';
  if (k.includes('phenolic')) return 'phenolic_board';
  if (k.includes('anchor')) return 'anchor_rod';
  if (k.includes('tower section')) return 'tower_section';
  if (
    k.includes('bolt') ||
    k.includes('guy') ||
    k.includes('turnbuckle') ||
    k.includes('clamp') ||
    k.includes('platform') ||
    k.includes('lightning')
  ) {
    return 'tower_accessory';
  }
  return 'other';
}

