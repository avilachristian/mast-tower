import { create } from 'zustand';
import {
  computeDailyLogMaterialRemaining,
  recalculateDailyLogCarryOver,
} from '@/entities/project/calculations';
import {
  createDefaultCentralMaterials,
  resolveCentralMaterials,
  syncDailyLogMaterialsWithHauling,
} from '@/entities/project/haulingInventory';
import { resolveManpowerRoster } from '@/entities/project/manpowerPayroll';
import {
  BAGS_PER_CUBIC_METER,
  checklistFromStatus,
  createCleanBaselineProject,
  createSampleMast2Project,
  deriveStatusFromChecklist,
  emptyChecklist,
  resolveFoundationSpec,
} from '@/entities/project/mast2Baseline';
import {
  createCleanVerticalMastProject,
  createInitialVerticalMastState,
  createSampleVerticalMastProject,
  deriveGuyLayerStatusFromSectors,
  deriveSectionStatusFromChecklist,
  guySectorsFromStatus,
  normalizeVerticalMastState,
  sectionChecklistFromStatus,
} from '@/entities/project/verticalMastBaseline';
import {
  validateFoundationChecklistToggle,
  type FoundationChecklistViolation,
} from '@/entities/project/foundationValidation';
import {
  validateGuyLayerUpdate,
  validateTowerSectionRangeUpdate,
  validateTowerSectionUpdate,
  type VerticalMastOrderViolation,
} from '@/entities/project/verticalMastValidation';
import { useUiStore } from '@/shared/state/uiStore';
import { replaceInlineImageUrlsInState } from '@/shared/lib/inlineImageRefs';
import {
  createCoalescedIdbWriter,
  idbGet,
  idbSet,
  isIndexedDbAvailable,
  LEGACY_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
} from '@/shared/storage/indexedDb';
import {
  resolveClientShowcaseSettings,
} from '@/entities/project/clientProjection';
import type {
  CentralMaterialItem,
  CivilWorksAttendanceRecord,
  CivilWorksPayrollSnapshot,
  ClientShowcaseSettings,
  CustomFoundationInspectionItem,
  DailyActivityLogEntry,
  FoundationCustomSpecs,
  FoundationInspectionEntry,
  FoundationInspectionItemKey,
  FoundationInspectionMeta,
  FoundationInspectionStatus,
  FoundationManualMaterialEntry,
  FoundationManualMaterialKey,
  FoundationRecord,
  FoundationStageChecklist,
  FoundationStatus,
  GuyLayerRecord,
  GuyLayerStatus,
  GuySectorProgress,
  HaulerPayoutRecord,
  HaulerPayrollSnapshot,
  HaulingLogEntry,
  HaulingMaterialCategory,
  ManpowerMember,
  MastProjectState,
  ProjectSyncStatus,
  ProjectType,
  ReportDetailsSpec,
  SavedProjectRecord,
  SectorId,
  SiteEquipmentItem,
  TowerSectionChecklist,
  TowerSectionRecord,
  TowerSectionStatus,
  VerticalMastState,
} from '@/entities/project/types';

const LEGACY_BOILERPLATE_NOTES = new Set([
  'Excavation completed by previous contractor.',
  'Excavation completed by previous contractor. Principal base with M27 embedded bolt frame & locating plate.',
]);

function stripLegacyBoilerplateNotes(state: MastProjectState): MastProjectState {
  let changed = false;
  const foundations = state.foundations.map((f) => {
    if (f.notes && LEGACY_BOILERPLATE_NOTES.has(f.notes.trim())) {
      changed = true;
      return { ...f, notes: '' };
    }
    return f;
  });

  const legacyRecord = state as MastProjectState & { schedule?: unknown };
  const hasLegacySchedule = 'schedule' in legacyRecord;
  const hasLegacyDailyLogPhase = (state.dailyLogs ?? []).some(
    (log) => 'schedulePhaseId' in (log as unknown as Record<string, unknown>)
  );

  if (!changed && !hasLegacySchedule && !hasLegacyDailyLogPhase) {
    return state;
  }

  const { schedule: _omittedSchedule, ...restState } = legacyRecord;
  void _omittedSchedule;

  const dailyLogs = hasLegacyDailyLogPhase
    ? state.dailyLogs.map((log) => {
        const { schedulePhaseId: _omittedPhase, ...restLog } = log as DailyActivityLogEntry & {
          schedulePhaseId?: unknown;
        };
        void _omittedPhase;
        return restLog as DailyActivityLogEntry;
      })
    : state.dailyLogs;

  return {
    ...restState,
    foundations,
    dailyLogs,
  };
}

export interface CreateProjectOptions {
  projectType?: ProjectType;
  projectName?: string;
  location?: string;
  contractor?: string;
  preparedBy?: string;
  referenceNo?: string;
  towerHeightM?: number;
  template?: 'clean' | 'sample';
  copyLogosFromCurrent?: boolean;
}

export interface WorkspacePayload {
  activeProjectId: string;
  projects: SavedProjectRecord[];
}

function cloneProjectState(state: MastProjectState): MastProjectState {
  return JSON.parse(JSON.stringify(state)) as MastProjectState;
}

function createProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildSavedRecord(
  state: MastProjectState,
  id = createProjectId()
): SavedProjectRecord {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    state,
  };
}

function isValidProjectState(value: unknown): value is MastProjectState {
  const candidate = value as Partial<MastProjectState> | null | undefined;
  return Boolean(
    candidate &&
    Array.isArray(candidate.foundations) &&
    candidate.foundations.length > 0
  );
}

function normalizeProjectRecord(record: SavedProjectRecord): SavedProjectRecord {
  const cleaned = stripLegacyBoilerplateNotes(record.state);
  return cleaned.verticalMast
    ? {
      ...record,
      state: {
        ...cleaned,
        verticalMast: normalizeVerticalMastState(cleaned.verticalMast),
      },
    }
    : { ...record, state: cleaned };
}

export function parseWorkspacePayload(raw: unknown): WorkspacePayload | null {
  if (!raw) return null;
  const parsed =
    typeof raw === 'string'
      ? (JSON.parse(raw) as Partial<WorkspacePayload>)
      : (raw as Partial<WorkspacePayload>);
  const validProjects = Array.isArray(parsed.projects)
    ? parsed.projects
      .filter((p) => p && p.id && isValidProjectState(p.state))
      .map(normalizeProjectRecord)
    : [];
  if (validProjects.length === 0) return null;
  const active =
    validProjects.find((p) => p.id === parsed.activeProjectId) ?? validProjects[0];
  return { activeProjectId: active.id, projects: validProjects };
}

export function parseLegacyWorkspacePayload(raw: unknown): WorkspacePayload | null {
  if (!raw) return null;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isValidProjectState(parsed)) return null;
  const normalized = normalizeProjectRecord(buildSavedRecord(parsed, 'proj-1'));
  return { activeProjectId: normalized.id, projects: [normalized] };
}

function createFallbackWorkspace(): WorkspacePayload {
  const fallback = buildSavedRecord(createSampleMast2Project(), 'proj-default');
  return { activeProjectId: fallback.id, projects: [fallback] };
}

const workspaceIdbWriter = createCoalescedIdbWriter<WorkspacePayload>(
  WORKSPACE_STORAGE_KEY,
  { debounceMs: 450 }
);
let workspaceFlushListenersRegistered = false;
if (typeof window !== 'undefined' && !workspaceFlushListenersRegistered) {
  workspaceFlushListenersRegistered = true;
  window.addEventListener('pagehide', () => {
    void workspaceIdbWriter.flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void workspaceIdbWriter.flush();
    }
  });
}
let hydrationPromise: Promise<void> | null = null;

export interface ProjectSyncHooks {
  onProjectMutated?: (projectId: string) => void;
  onProjectCreated?: (record: SavedProjectRecord) => void;
  onProjectDeleted?: (projectId: string) => void;
  onClientSettingsChanged?: (
    projectId: string,
    settings: ClientShowcaseSettings,
    hadUnsavedStateEdits?: boolean
  ) => void;
}

let activeSyncHooks: ProjectSyncHooks = {};

export function registerProjectSyncHooks(hooks: ProjectSyncHooks): void {
  activeSyncHooks = hooks;
}

function persistWorkspace(activeProjectId: string, projects: SavedProjectRecord[]) {
  if (!isIndexedDbAvailable()) return;
  workspaceIdbWriter.enqueue({ activeProjectId, projects });
}

function commitActiveProject(
  s: { activeProjectId: string; projects: SavedProjectRecord[] },
  nextProject: MastProjectState
): { project: MastProjectState; projects: SavedProjectRecord[] } {
  const now = new Date().toISOString();
  const hasActive = s.projects.some((p) => p.id === s.activeProjectId);
  const projects = hasActive
    ? s.projects.map((p) =>
      p.id === s.activeProjectId
        ? {
          ...p,
          updatedAt: now,
          syncStatus: (p.syncStatus === 'local_only' ? 'local_only' : 'pending') as ProjectSyncStatus,
          state: nextProject,
        }
        : p
    )
    : [
      {
        id: s.activeProjectId,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending' as ProjectSyncStatus,
        state: nextProject,
      },
      ...s.projects,
    ];
  persistWorkspace(s.activeProjectId, projects);
  activeSyncHooks.onProjectMutated?.(s.activeProjectId);
  return { project: nextProject, projects };
}

function applyFoundationStatusToRecord(
  f: FoundationRecord,
  status: FoundationStatus,
  today: string
): FoundationRecord {
  const spec = resolveFoundationSpec(f.type, f.customSpecs);
  const checklist = checklistFromStatus(status);
  const isPoured =
    status === 'concreted' || status === 'curing' || status === 'completed';
  return {
    ...f,
    status,
    checklist,
    pourDate: isPoured ? f.pourDate || today : f.pourDate,
    completedDate: status === 'completed' ? f.completedDate || today : undefined,
    actualCementBagsUsed:
      isPoured && f.actualCementBagsUsed === 0
        ? spec.cementBags
        : f.actualCementBagsUsed,
    actualSandBagsUsed:
      isPoured && f.actualSandBagsUsed === 0
        ? spec.sandBags
        : f.actualSandBagsUsed,
    actualGravelBagsUsed:
      isPoured && f.actualGravelBagsUsed === 0
        ? spec.gravelBags
        : f.actualGravelBagsUsed,
  };
}

function applyFoundationCustomSpecsPatch(
  f: FoundationRecord,
  patch: Partial<FoundationCustomSpecs>
): FoundationRecord {
  const merged: FoundationCustomSpecs = {
    ...(f.customSpecs ?? {}),
    ...patch,
  };
  const cleaned = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined)
  ) as FoundationCustomSpecs;
  return {
    ...f,
    customSpecs: Object.keys(cleaned).length > 0 ? cleaned : undefined,
  };
}

type InspectionHolder = {
  inspectionChecklist?: Partial<
    Record<FoundationInspectionItemKey, FoundationInspectionEntry>
  >;
  customInspectionItems?: CustomFoundationInspectionItem[];
  removedInspectionKeys?: string[];
  inspectionMeta?: FoundationInspectionMeta;
};

function patchInspectionItemInHolder<T extends InspectionHolder>(
  holder: T,
  key: FoundationInspectionItemKey,
  patch: Partial<FoundationInspectionEntry>
): T {
  const currentMap = holder.inspectionChecklist ?? {};
  const prevEntry: FoundationInspectionEntry = currentMap[key] ?? {
    status: 'Pending',
    remarks: '',
  };
  const customInspectionItems = holder.customInspectionItems?.map((ci) =>
    ci.key === key
      ? {
        ...ci,
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.planMeasurement !== undefined
          ? { planMeasurement: patch.planMeasurement }
          : {}),
      }
      : ci
  );
  return {
    ...holder,
    ...(customInspectionItems ? { customInspectionItems } : {}),
    inspectionChecklist: {
      ...currentMap,
      [key]: {
        ...prevEntry,
        ...patch,
      },
    },
  };
}

function addInspectionItemInHolder<T extends InspectionHolder>(
  holder: T,
  item: {
    description: string;
    planMeasurement: string;
    status?: FoundationInspectionStatus;
    actualMeasurement?: string;
    remarks?: string;
  }
): T {
  const description = item.description.trim();
  if (!description) return holder;
  const newKey = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const customInspectionItems = [
    ...(holder.customInspectionItems ?? []),
    { key: newKey, description, planMeasurement: item.planMeasurement },
  ];
  return {
    ...holder,
    customInspectionItems,
    inspectionChecklist: {
      ...(holder.inspectionChecklist ?? {}),
      [newKey]: {
        status: item.status ?? 'Pending',
        description,
        planMeasurement: item.planMeasurement,
        actualMeasurement: item.actualMeasurement ?? '',
        remarks: item.remarks ?? '',
      },
    },
  };
}

function removeInspectionItemInHolder<T extends InspectionHolder>(
  holder: T,
  key: FoundationInspectionItemKey
): T {
  const isCustom = (holder.customInspectionItems ?? []).some((ci) => ci.key === key);
  const nextMap = { ...(holder.inspectionChecklist ?? {}) };
  delete nextMap[key];
  const hasEntries = Object.keys(nextMap).length > 0;
  if (isCustom) {
    const remainingCustom = (holder.customInspectionItems ?? []).filter(
      (ci) => ci.key !== key
    );
    return {
      ...holder,
      customInspectionItems: remainingCustom.length > 0 ? remainingCustom : undefined,
      inspectionChecklist: hasEntries ? nextMap : undefined,
    };
  }
  const removedSet = new Set(holder.removedInspectionKeys ?? []);
  removedSet.add(key);
  return {
    ...holder,
    removedInspectionKeys: Array.from(removedSet),
    inspectionChecklist: hasEntries ? nextMap : undefined,
  };
}

function resetInspectionChecklistInHolder<T extends InspectionHolder>(holder: T): T {
  return {
    ...holder,
    inspectionChecklist: undefined,
    customInspectionItems: undefined,
    removedInspectionKeys: undefined,
  };
}

function syncVerticalMastFlags(vm: VerticalMastState): VerticalMastState {
  const normalized = normalizeVerticalMastState(vm);
  const s03 = normalized.sections.find((s) => s.hasPlatform);
  const topSec = normalized.sections.find((s) => s.hasLightningRod);
  return {
    ...normalized,
    platformStatus:
      s03?.status === 'plumbed_verified'
        ? 'verified'
        : s03?.checklist.guyPlatesOrFixturesReady || s03?.status === 'bolted_torqued'
          ? 'installed'
          : 'not_started',
    lightningRodStatus:
      topSec?.status === 'plumbed_verified'
        ? 'verified'
        : topSec?.checklist.guyPlatesOrFixturesReady || topSec?.status === 'bolted_torqued'
          ? 'installed'
          : 'not_started',
  };
}

export interface HaulingTripInputItem {
  materialId?: string;
  itemLabel: string;
  material: HaulingMaterialCategory;
  unitLabel: string;
  quantity: number;
  totalKg: number;
}

export interface HaulingTripInput {
  date: string;
  haulerName: string;
  tripNumber: 1 | 2;
  items: HaulingTripInputItem[];
  weather?: string;
  remarks?: string;
}

function buildHaulingTripEntries(
  trip: HaulingTripInput,
  tripGroupId = `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
): HaulingLogEntry[] {
  const haulerName = trip.haulerName.trim() || 'Unnamed Hauler';
  const weather = trip.weather?.trim() || 'Field Log';
  const remarks = trip.remarks?.trim() || '';

  return trip.items
    .filter((item) => item.quantity > 0 || item.totalKg > 0)
    .map((item, idx) => {
      const quantity = Math.max(0, Number(item.quantity) || 0);
      const totalKg = Number(Math.max(0, Number(item.totalKg) || 0).toFixed(2));
      const kgPerUnit = quantity > 0 ? Number((totalKg / quantity).toFixed(2)) : totalKg;
      const equivalentCuM =
        item.material === 'sand' || item.material === 'gravel'
          ? Number((quantity / BAGS_PER_CUBIC_METER).toFixed(2))
          : 0;
      return {
        id: `hl-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        date: trip.date,
        haulerName,
        tripNumber: trip.tripNumber,
        tripGroupId,
        materialId: item.materialId,
        itemLabel: item.itemLabel.trim() || 'Material',
        horsesUsed: 1,
        tripsCount: idx === 0 ? 1 : 0,
        material: item.material,
        unitLabel: item.unitLabel.trim() || 'pcs',
        quantity,
        kgPerUnit,
        totalKg,
        equivalentCuM,
        destinationFoundationId: 'STOCKPILE',
        weather,
        remarks,
      };
    });
}

function appendHaulerToRoster(
  roster: string[] | undefined,
  haulerName: string
): string[] {
  const trimmed = haulerName.trim();
  const existing = roster ?? [];
  if (!trimmed) return existing;
  if (existing.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }
  return [...existing, trimmed];
}

function appendHaulerToManpowerRoster(
  project: MastProjectState,
  haulerName: string
): ManpowerMember[] {
  const trimmed = haulerName.trim();
  const base = resolveManpowerRoster(project);
  if (!trimmed) return base;
  const key = trimmed.toLowerCase();
  const existingIdx = base.findIndex(
    (m) => m.category === 'hauler' && m.name.trim().toLowerCase() === key
  );
  if (existingIdx >= 0) {
    if (!base[existingIdx].active) {
      return base.map((m, idx) =>
        idx === existingIdx ? { ...m, active: true } : m
      );
    }
    return base;
  }
  return [
    ...base,
    {
      id: `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      category: 'hauler',
      position: 'Horse Hauler',
      dailyRatePhp: 0,
      active: true,
    },
  ];
}

function deriveLegacyHaulerNames(roster: ManpowerMember[]): string[] {
  return roster
    .filter((m) => m.category === 'hauler' && m.active)
    .map((m) => m.name.trim())
    .filter(Boolean);
}

function buildHaulingRecord(
  entry: Omit<HaulingLogEntry, 'id' | 'totalKg' | 'equivalentCuM'>
): HaulingLogEntry {
  const totalKg = Number((entry.quantity * entry.kgPerUnit).toFixed(2));
  const equivalentCuM =
    entry.material === 'sand' || entry.material === 'gravel'
      ? Number((entry.quantity / BAGS_PER_CUBIC_METER).toFixed(2))
      : 0;
  return {
    ...entry,
    id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    totalKg,
    equivalentCuM,
  };
}

interface ProjectStore {
  projects: SavedProjectRecord[];
  activeProjectId: string;
  project: MastProjectState;
  selectedFoundationId: string;
  storageHydrated: boolean;
  hydrateFromStorage: () => Promise<void>;
  createProject: (options?: CreateProjectOptions) => string;
  switchProject: (projectId: string) => void;
  duplicateProject: (projectId: string, newName?: string) => string | null;
  deleteProject: (projectId: string) => void;
  importProjectAsNew: (jsonText: string) => string;
  selectFoundation: (id: string) => void;
  updateFoundationStatus: (id: string, status: FoundationStatus) => void;
  toggleFoundationChecklistItem: (
    id: string,
    key: keyof FoundationStageChecklist
  ) => FoundationChecklistViolation | null;
  updateFoundationDetails: (
    id: string,
    patch: Partial<
      Pick<
        FoundationRecord,
        | 'pourDate'
        | 'completedDate'
        | 'actualCementBagsUsed'
        | 'actualSandBagsUsed'
        | 'actualGravelBagsUsed'
        | 'notes'
      >
    >
  ) => void;
  updateFoundationBatch: (
    id: string,
    batch: {
      status?: FoundationStatus;
      detailsPatch?: Partial<
        Pick<
          FoundationRecord,
          | 'pourDate'
          | 'completedDate'
          | 'actualCementBagsUsed'
          | 'actualSandBagsUsed'
          | 'actualGravelBagsUsed'
          | 'notes'
        >
      >;
      customSpecsPatch?: Partial<FoundationCustomSpecs>;
    }
  ) => void;
  updateFoundationInspectionItem: (
    id: string,
    key: FoundationInspectionItemKey,
    patch: Partial<FoundationInspectionEntry>
  ) => void;
  addFoundationInspectionItem: (
    id: string,
    item: {
      description: string;
      planMeasurement: string;
      status?: FoundationInspectionStatus;
      actualMeasurement?: string;
      remarks?: string;
    }
  ) => void;
  removeFoundationInspectionItem: (
    id: string,
    key: FoundationInspectionItemKey
  ) => void;
  resetFoundationInspectionChecklist: (id: string) => void;
  updateFoundationInspectionMeta: (
    id: string,
    patch: Partial<FoundationInspectionMeta>
  ) => void;
  updateFoundationMaterial: (
    id: string,
    key: FoundationManualMaterialKey,
    patch: Partial<FoundationManualMaterialEntry>
  ) => void;
  resetFoundationMaterials: (id: string) => void;
  updateFoundationCustomSpecs: (
    id: string,
    patch: Partial<FoundationCustomSpecs>
  ) => void;
  resetFoundationCustomSpecs: (id: string) => void;
  addHaulingLog: (entry: Omit<HaulingLogEntry, 'id' | 'totalKg' | 'equivalentCuM'>) => void;
  addHaulingBatch: (
    entries: Omit<HaulingLogEntry, 'id' | 'totalKg' | 'equivalentCuM'>[]
  ) => void;
  deleteHaulingLog: (id: string) => void;
  deleteHaulingLogs: (ids: string[]) => void;
  addHaulingTrip: (trip: HaulingTripInput) => void;
  replaceHaulingTrip: (oldItemIds: string[], trip: HaulingTripInput) => void;
  updateCentralMaterial: (
    id: string,
    patch: Partial<Omit<CentralMaterialItem, 'id'>>
  ) => void;
  addCentralMaterial: (item: Omit<CentralMaterialItem, 'id'>) => string;
  deleteCentralMaterial: (id: string) => void;
  addHaulerRosterMember: (name: string) => void;
  addHaulerPayout: (payout: Omit<HaulerPayoutRecord, 'id'>) => void;
  deleteHaulerPayout: (id: string) => void;
  addManpowerMember: (member: Omit<ManpowerMember, 'id'>) => string;
  updateManpowerMember: (
    id: string,
    patch: Partial<Omit<ManpowerMember, 'id'>>
  ) => void;
  deleteManpowerMember: (id: string) => void;
  setCivilAttendanceForDate: (
    date: string,
    presentMemberIds: string[],
    notes?: string
  ) => void;
  toggleCivilAttendanceMember: (date: string, memberId: string) => void;
  createCivilPayrollSnapshot: (
    snapshot: Omit<CivilWorksPayrollSnapshot, 'id' | 'createdAt'>
  ) => string;
  updateCivilPayrollStatus: (
    id: string,
    status: 'generated' | 'paid',
    paidDate?: string
  ) => void;
  deleteCivilPayrollSnapshot: (id: string) => void;
  createHaulerPayrollSnapshot: (
    snapshot: Omit<HaulerPayrollSnapshot, 'id' | 'createdAt'>
  ) => string;
  updateHaulerPayrollStatus: (
    id: string,
    status: 'generated' | 'paid',
    paidDate?: string
  ) => void;
  deleteHaulerPayrollSnapshot: (id: string) => void;
  syncDailyLogDeliveriesFromHauling: (logId: string) => void;
  addDailyLog: (entry: Omit<DailyActivityLogEntry, 'id' | 'totalWorkers' | 'totalManHours'>) => void;
  updateDailyLog: (id: string, patch: Partial<Omit<DailyActivityLogEntry, 'id'>>) => void;
  deleteDailyLog: (id: string) => void;
  updateProjectMeta: (
    patch: Partial<Pick<MastProjectState, 'projectName' | 'location' | 'preparedBy' | 'contractor'>>
  ) => void;
  updateReportDetails: (patch: Partial<ReportDetailsSpec>) => void;
  updateInventoryItem: (
    id: string,
    patch: Partial<Pick<SiteEquipmentItem, 'onHandQty' | 'deliveredQty' | 'remarks'>>
  ) => void;
  setProjectPhase: (phase: ProjectType) => void;
  loadSampleData: () => void;
  resetCleanBaseline: () => void;
  importProjectJson: (jsonText: string) => void;
  exportProjectJson: () => string;

  // Vertical Mast Tower phase actions
  updateTowerSectionStatus: (
    id: string,
    status: TowerSectionStatus
  ) => VerticalMastOrderViolation | null;
  toggleTowerSectionChecklistItem: (
    id: string,
    key: keyof TowerSectionChecklist
  ) => VerticalMastOrderViolation | null;
  updateTowerSectionDetails: (
    id: string,
    patch: Partial<
      Pick<
        TowerSectionRecord,
        'installedDate' | 'verifiedDate' | 'verticalityMm' | 'notes' | 'legSpec' | 'boltSpec'
      >
    >
  ) => void;
  batchUpdateTowerSectionRange: (
    fromSectionNo: number,
    toSectionNo: number,
    status: TowerSectionStatus
  ) => VerticalMastOrderViolation | null;
  updateGuyLayerStatus: (
    id: string,
    status: GuyLayerStatus
  ) => VerticalMastOrderViolation | null;
  updateGuyLayerSector: (
    id: string,
    sector: Exclude<SectorId, 'CENTER'>,
    patch: Partial<GuySectorProgress>
  ) => VerticalMastOrderViolation | null;
  toggleGuyLayerSectorInstalled: (
    id: string,
    sector: Exclude<SectorId, 'CENTER'>
  ) => VerticalMastOrderViolation | null;
  toggleGuyLayerAllTensioned: (id: string) => VerticalMastOrderViolation | null;
  updateGuyLayerDetails: (
    id: string,
    patch: Partial<
      Pick<GuyLayerRecord, 'installedDate' | 'verifiedDate' | 'notes' | 'cableSpec'>
    >
  ) => void;
  updateMastInspectionItem: (
    targetKind: 'section' | 'guy_layer',
    id: string,
    key: FoundationInspectionItemKey,
    patch: Partial<FoundationInspectionEntry>
  ) => void;
  addMastInspectionItem: (
    targetKind: 'section' | 'guy_layer',
    id: string,
    item: {
      description: string;
      planMeasurement: string;
      status?: FoundationInspectionStatus;
      actualMeasurement?: string;
      remarks?: string;
    }
  ) => void;
  removeMastInspectionItem: (
    targetKind: 'section' | 'guy_layer',
    id: string,
    key: FoundationInspectionItemKey
  ) => void;
  resetMastInspectionChecklist: (
    targetKind: 'section' | 'guy_layer',
    id: string
  ) => void;
  updateMastInspectionMeta: (
    targetKind: 'section' | 'guy_layer',
    id: string,
    patch: Partial<FoundationInspectionMeta>
  ) => void;

  // Online Cloud Sync & Client Showcase Visibility Actions
  updateProjectClientSettings: (
    projectId: string,
    patch: Partial<ClientShowcaseSettings>,
    options?: { skipAutoSync?: boolean }
  ) => void;
  applyUploadedImageUrls: (
    projectId: string,
    urlMap: ReadonlyMap<string, string>
  ) => void;
  applyCloudWorkspace: (cloudProjects: SavedProjectRecord[]) => void;
  applyCloudSyncResult: (
    projectId: string,
    serverRecord: SavedProjectRecord,
    expectedSnapshotUpdatedAt?: string
  ) => void;
  markProjectSyncStatus: (
    projectId: string,
    syncStatus: ProjectSyncStatus
  ) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  const initialWorkspace = createFallbackWorkspace();
  const initialActive = initialWorkspace.projects[0];

  return {
    projects: initialWorkspace.projects,
    activeProjectId: initialActive.id,
    project: initialActive.state,
    selectedFoundationId: initialActive.state.foundations[0]?.id ?? 'PF-0',
    storageHydrated: !isIndexedDbAvailable(),

    hydrateFromStorage: () => {
      if (hydrationPromise) return hydrationPromise;
      hydrationPromise = (async () => {
        if (typeof window === 'undefined') {
          set({ storageHydrated: true });
          return;
        }
        try {
          if (navigator.storage?.persist) {
            void navigator.storage.persist().catch(() => { });
          }

          let loaded: WorkspacePayload | null = null;
          if (isIndexedDbAvailable()) {
            const idbRaw = await idbGet<WorkspacePayload>(WORKSPACE_STORAGE_KEY);
            loaded = parseWorkspacePayload(idbRaw);
          }

          if (!loaded) {
            const workspaceRaw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
            const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
            try {
              loaded =
                parseWorkspacePayload(workspaceRaw) ??
                parseLegacyWorkspacePayload(legacyRaw);
            } catch {
              loaded = null;
            }

            if (loaded && isIndexedDbAvailable()) {
              await idbSet(WORKSPACE_STORAGE_KEY, loaded);
              try {
                window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
                window.localStorage.removeItem(LEGACY_STORAGE_KEY);
              } catch {
                // Ignore localStorage cleanup errors
              }
            }
          }

          if (loaded && loaded.projects.length > 0) {
            const active =
              loaded.projects.find((p) => p.id === loaded.activeProjectId) ??
              loaded.projects[0];
            set({
              projects: loaded.projects,
              activeProjectId: active.id,
              project: active.state,
              selectedFoundationId: active.state.foundations[0]?.id ?? 'PF-0',
            });
          }
        } catch {
          // Ignore storage read/migration errors and continue with fallback workspace
        } finally {
          set({ storageHydrated: true });
        }
      })();
      return hydrationPromise;
    },

    createProject: (options = {}) => {
      const s = get();
      const projectType: ProjectType = options.projectType ?? 'foundation';
      const base =
        projectType === 'vertical_mast'
          ? options.template === 'sample'
            ? createSampleVerticalMastProject()
            : createCleanVerticalMastProject()
          : options.template === 'sample'
            ? createSampleMast2Project()
            : (() => {
              const clean = createCleanBaselineProject();
              return {
                ...clean,
                foundations: clean.foundations.map((f) => ({
                  ...f,
                  status: 'not_started' as const,
                  checklist: emptyChecklist(),
                  notes: '',
                })),
              };
            })();
      const projectName = options.projectName?.trim() || `Project ${s.projects.length + 1}`;
      const location = options.location?.trim() || base.location;
      const contractor = options.contractor?.trim() || base.contractor;
      const preparedBy = options.preparedBy?.trim() || base.preparedBy;
      const towerHeightM =
        typeof options.towerHeightM === 'number' && options.towerHeightM > 0
          ? options.towerHeightM
          : base.towerHeightM;
      const inheritedLogos =
        options.copyLogosFromCurrent && s.project.reportDetails?.logos
          ? cloneProjectState(s.project).reportDetails?.logos
          : undefined;
      const nextState: MastProjectState = {
        ...base,
        projectType,
        verticalMast: base.verticalMast ?? createInitialVerticalMastState(),
        projectName,
        location,
        contractor,
        preparedBy,
        towerHeightM,
        lastUpdated: new Date().toISOString().slice(0, 10),
        reportDetails: {
          ...(base.reportDetails ?? {}),
          projectName,
          projectLocation: location,
          contractor,
          preparedBy,
          ...(options.referenceNo?.trim()
            ? { referenceNo: options.referenceNo.trim() }
            : {}),
          ...(options.copyLogosFromCurrent && s.project.reportDetails?.logoHeightPx
            ? { logoHeightPx: s.project.reportDetails.logoHeightPx }
            : {}),
          ...(inheritedLogos ? { logos: inheritedLogos } : {}),
        },
      };
      const record: SavedProjectRecord = {
        ...buildSavedRecord(nextState),
        syncStatus: 'pending',
      };
      const projects = [record, ...s.projects];
      persistWorkspace(record.id, projects);
      set({
        projects,
        activeProjectId: record.id,
        project: record.state,
        selectedFoundationId: record.state.foundations[0]?.id ?? 'PF-0',
      });
      activeSyncHooks.onProjectCreated?.(record);
      return record.id;
    },

    switchProject: (projectId) =>
      set((s) => {
        const target = s.projects.find((p) => p.id === projectId);
        if (!target) return s;
        persistWorkspace(target.id, s.projects);
        return {
          activeProjectId: target.id,
          project: target.state,
          selectedFoundationId: target.state.foundations[0]?.id ?? 'PF-0',
        };
      }),

    duplicateProject: (projectId, newName) => {
      const s = get();
      const source = s.projects.find((p) => p.id === projectId);
      if (!source) return null;
      const cloned = cloneProjectState(source.state);
      const sourceName =
        cloned.reportDetails?.projectName?.trim() || cloned.projectName;
      const copyName = newName?.trim() || `${sourceName} (Copy)`;
      const today = new Date().toISOString().slice(0, 10);
      const nextState: MastProjectState = {
        ...cloned,
        projectName: copyName,
        lastUpdated: today,
        reportDetails: {
          ...(cloned.reportDetails ?? {}),
          projectName: copyName,
        },
      };
      const record: SavedProjectRecord = {
        ...buildSavedRecord(nextState),
        syncStatus: 'pending',
      };
      const projects = [record, ...s.projects];
      persistWorkspace(record.id, projects);
      set({
        projects,
        activeProjectId: record.id,
        project: record.state,
        selectedFoundationId: record.state.foundations[0]?.id ?? 'PF-0',
      });
      activeSyncHooks.onProjectCreated?.(record);
      return record.id;
    },

    deleteProject: (projectId) => {
      set((s) => {
        const remaining = s.projects.filter((p) => p.id !== projectId);
        if (remaining.length === 0) {
          const fresh: SavedProjectRecord = {
            ...buildSavedRecord(createCleanBaselineProject()),
            syncStatus: 'local_only',
          };
          persistWorkspace(fresh.id, [fresh]);
          return {
            projects: [fresh],
            activeProjectId: fresh.id,
            project: fresh.state,
            selectedFoundationId: fresh.state.foundations[0]?.id ?? 'PF-0',
          };
        }
        const nextActive =
          s.activeProjectId === projectId
            ? remaining[0]
            : remaining.find((p) => p.id === s.activeProjectId) ?? remaining[0];
        persistWorkspace(nextActive.id, remaining);
        return {
          projects: remaining,
          activeProjectId: nextActive.id,
          project: nextActive.state,
          selectedFoundationId:
            s.activeProjectId === projectId
              ? nextActive.state.foundations[0]?.id ?? 'PF-0'
              : s.selectedFoundationId,
        };
      });
      activeSyncHooks.onProjectDeleted?.(projectId);
    },

    importProjectAsNew: (jsonText) => {
      const parsed = JSON.parse(jsonText) as MastProjectState;
      if (!parsed || !Array.isArray(parsed.foundations) || parsed.foundations.length !== 13) {
        throw new Error('Invalid Mast 2 project JSON file (expected 13 foundations).');
      }
      const s = get();
      const record: SavedProjectRecord = {
        ...buildSavedRecord(parsed),
        syncStatus: 'pending',
      };
      const projects = [record, ...s.projects];
      persistWorkspace(record.id, projects);
      set({
        projects,
        activeProjectId: record.id,
        project: record.state,
        selectedFoundationId: record.state.foundations[0].id,
      });
      activeSyncHooks.onProjectCreated?.(record);
      return record.id;
    },

    selectFoundation: (id) => set({ selectedFoundationId: id }),

    updateFoundationStatus: (id, status) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) =>
          f.id === id ? applyFoundationStatusToRecord(f, status, today) : f
        );
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    toggleFoundationChecklistItem: (id, key) => {
      const curr = get();
      const targetFoundation = curr.project.foundations.find((f) => f.id === id);
      if (!targetFoundation) return null;

      const violation = validateFoundationChecklistToggle(targetFoundation, key);
      if (violation) {
        useUiStore.getState().setFoundationOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      set((s) => {
        const foundations = s.project.foundations.map((f) => {
          if (f.id !== id) return f;
          const nextVal = !Boolean(f.checklist[key]);
          const checklist = {
            ...f.checklist,
            [key]: nextVal,
            ...(key === 'formworkBraced' ? { anchorHardwareAligned: nextVal } : {}),
          };
          const status = deriveStatusFromChecklist(checklist);
          const spec = resolveFoundationSpec(f.type, f.customSpecs);
          const isPoured = checklist.concretePoured;
          return {
            ...f,
            checklist,
            status,
            pourDate: isPoured ? f.pourDate || today : f.pourDate,
            completedDate: status === 'completed' ? f.completedDate || today : undefined,
            actualCementBagsUsed:
              isPoured && f.actualCementBagsUsed === 0 ? spec.cementBags : f.actualCementBagsUsed,
            actualSandBagsUsed:
              isPoured && f.actualSandBagsUsed === 0 ? spec.sandBags : f.actualSandBagsUsed,
            actualGravelBagsUsed:
              isPoured && f.actualGravelBagsUsed === 0 ? spec.gravelBags : f.actualGravelBagsUsed,
          };
        });
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      });
      return null;
    },

    updateFoundationDetails: (id, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) =>
          f.id === id ? { ...f, ...patch } : f
        );
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    updateFoundationBatch: (id, batch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) => {
          if (f.id !== id) return f;
          let updated: FoundationRecord = f;
          if (batch.customSpecsPatch) {
            updated = applyFoundationCustomSpecsPatch(updated, batch.customSpecsPatch);
          }
          if (batch.status !== undefined) {
            updated = applyFoundationStatusToRecord(updated, batch.status, today);
          }
          if (batch.detailsPatch) {
            updated = { ...updated, ...batch.detailsPatch };
          }
          return updated;
        });
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    updateFoundationInspectionItem: (id, key, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) => {
          if (f.id !== id) return f;
          const currentMap = f.inspectionChecklist ?? {};
          const prevEntry: FoundationInspectionEntry = currentMap[key] ?? {
            status: 'Pending',
            remarks: '',
          };
          const customInspectionItems = f.customInspectionItems?.map((ci) =>
            ci.key === key
              ? {
                ...ci,
                ...(patch.description !== undefined ? { description: patch.description } : {}),
                ...(patch.planMeasurement !== undefined
                  ? { planMeasurement: patch.planMeasurement }
                  : {}),
              }
              : ci
          );
          return {
            ...f,
            ...(customInspectionItems ? { customInspectionItems } : {}),
            inspectionChecklist: {
              ...currentMap,
              [key]: {
                ...prevEntry,
                ...patch,
              },
            },
          };
        });
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    addFoundationInspectionItem: (id, item) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const description = item.description.trim();
        if (!description) return s;
        const newKey = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const planMeasurement = item.planMeasurement;
        const foundations = s.project.foundations.map((f) => {
          if (f.id !== id) return f;
          const customInspectionItems = [
            ...(f.customInspectionItems ?? []),
            { key: newKey, description, planMeasurement },
          ];
          const currentMap = f.inspectionChecklist ?? {};
          return {
            ...f,
            customInspectionItems,
            inspectionChecklist: {
              ...currentMap,
              [newKey]: {
                status: item.status ?? 'Pending',
                description,
                planMeasurement,
                actualMeasurement: item.actualMeasurement ?? '',
                remarks: item.remarks ?? '',
              },
            },
          };
        });
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    removeFoundationInspectionItem: (id, key) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) => {
          if (f.id !== id) return f;
          const isCustom = (f.customInspectionItems ?? []).some((ci) => ci.key === key);
          const nextMap = { ...(f.inspectionChecklist ?? {}) };
          delete nextMap[key];
          const hasEntries = Object.keys(nextMap).length > 0;
          if (isCustom) {
            const remainingCustom = (f.customInspectionItems ?? []).filter((ci) => ci.key !== key);
            return {
              ...f,
              customInspectionItems: remainingCustom.length > 0 ? remainingCustom : undefined,
              inspectionChecklist: hasEntries ? nextMap : undefined,
            };
          }
          const removedSet = new Set(f.removedInspectionKeys ?? []);
          removedSet.add(key);
          return {
            ...f,
            removedInspectionKeys: Array.from(removedSet),
            inspectionChecklist: hasEntries ? nextMap : undefined,
          };
        });
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    resetFoundationInspectionChecklist: (id) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) =>
          f.id === id
            ? {
              ...f,
              inspectionChecklist: undefined,
              customInspectionItems: undefined,
              removedInspectionKeys: undefined,
            }
            : f
        );
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    updateFoundationInspectionMeta: (id, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) => {
          if (f.id !== id) return f;
          return {
            ...f,
            inspectionMeta: {
              ...(f.inspectionMeta ?? {}),
              ...patch,
            },
          };
        });
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    updateFoundationMaterial: (id, key, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) => {
          if (f.id !== id) return f;
          const currentMap = f.manualMaterials ?? {};
          const defaultRemarks =
            key === 'main_rebar' || key === 'chair_bar' ? `For ${f.id}` : '';
          const prevEntry: FoundationManualMaterialEntry = currentMap[key] ?? {
            onSite: 0,
            remarks: defaultRemarks,
          };
          return {
            ...f,
            manualMaterials: {
              ...currentMap,
              [key]: {
                ...prevEntry,
                ...patch,
              },
            },
          };
        });
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    resetFoundationMaterials: (id) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) =>
          f.id === id ? { ...f, manualMaterials: undefined } : f
        );
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    updateFoundationCustomSpecs: (id, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) =>
          f.id === id ? applyFoundationCustomSpecsPatch(f, patch) : f
        );
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    resetFoundationCustomSpecs: (id) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const foundations = s.project.foundations.map((f) =>
          f.id === id ? { ...f, customSpecs: undefined } : f
        );
        const next: MastProjectState = { ...s.project, lastUpdated: today, foundations };
        return commitActiveProject(s, next);
      }),

    addHaulingLog: (entry) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const newLog = buildHaulingRecord(entry);
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          haulingLogs: [newLog, ...s.project.haulingLogs],
        };
        return commitActiveProject(s, next);
      }),

    addHaulingBatch: (entries) =>
      set((s) => {
        if (entries.length === 0) return s;
        const today = new Date().toISOString().slice(0, 10);
        const created = entries.map(buildHaulingRecord);
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          haulingLogs: [...created, ...s.project.haulingLogs],
        };
        return commitActiveProject(s, next);
      }),

    deleteHaulingLog: (id) =>
      set((s) => {
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulingLogs: s.project.haulingLogs.filter((l) => l.id !== id),
        };
        return commitActiveProject(s, next);
      }),

    deleteHaulingLogs: (ids) =>
      set((s) => {
        const idSet = new Set(ids);
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulingLogs: s.project.haulingLogs.filter((l) => !idSet.has(l.id)),
        };
        return commitActiveProject(s, next);
      }),

    addHaulingTrip: (trip) =>
      set((s) => {
        const created = buildHaulingTripEntries(trip);
        if (created.length === 0) return s;
        const manpowerRoster = appendHaulerToManpowerRoster(
          s.project,
          trip.haulerName
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerRoster: appendHaulerToRoster(s.project.haulerRoster, trip.haulerName),
          manpowerRoster,
          haulingLogs: [...created, ...s.project.haulingLogs],
        };
        return commitActiveProject(s, next);
      }),

    replaceHaulingTrip: (oldItemIds, trip) =>
      set((s) => {
        const removeSet = new Set(oldItemIds);
        const remaining = s.project.haulingLogs.filter((l) => !removeSet.has(l.id));
        const existingGroupId = s.project.haulingLogs.find(
          (l) => removeSet.has(l.id) && l.tripGroupId
        )?.tripGroupId;
        const created = buildHaulingTripEntries(trip, existingGroupId);
        const manpowerRoster = appendHaulerToManpowerRoster(
          s.project,
          trip.haulerName
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerRoster: appendHaulerToRoster(s.project.haulerRoster, trip.haulerName),
          manpowerRoster,
          haulingLogs: [...created, ...remaining],
        };
        return commitActiveProject(s, next);
      }),

    updateCentralMaterial: (id, patch) =>
      set((s) => {
        const base = resolveCentralMaterials(s.project);
        const centralMaterials = base.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          centralMaterials,
        };
        return commitActiveProject(s, next);
      }),

    addCentralMaterial: (item) => {
      const id = `cmat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set((s) => {
        const base = resolveCentralMaterials(s.project);
        const centralMaterials: CentralMaterialItem[] = [...base, { ...item, id }];
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          centralMaterials,
        };
        return commitActiveProject(s, next);
      });
      return id;
    },

    deleteCentralMaterial: (id) =>
      set((s) => {
        const base = resolveCentralMaterials(s.project);
        const centralMaterials = base.filter((item) => item.id !== id);
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          centralMaterials:
            centralMaterials.length > 0 ? centralMaterials : createDefaultCentralMaterials(),
        };
        return commitActiveProject(s, next);
      }),

    addHaulerRosterMember: (name) =>
      set((s) => {
        const nextRoster = appendHaulerToRoster(s.project.haulerRoster, name);
        const manpowerRoster = appendHaulerToManpowerRoster(s.project, name);
        if (
          nextRoster === (s.project.haulerRoster ?? []) &&
          manpowerRoster === s.project.manpowerRoster
        ) {
          return s;
        }
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerRoster: nextRoster,
          manpowerRoster,
        });
      }),

    addHaulerPayout: (payout) =>
      set((s) => {
        const amountPhp = Math.max(0, Number(payout.amountPhp) || 0);
        const haulerName = payout.haulerName.trim();
        if (!haulerName || amountPhp <= 0) return s;
        const record: HaulerPayoutRecord = {
          id: `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          date: payout.date,
          haulerName,
          amountPhp,
          notes: payout.notes?.trim() || undefined,
          payrollSnapshotId: payout.payrollSnapshotId,
        };
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerRoster: appendHaulerToRoster(s.project.haulerRoster, haulerName),
          manpowerRoster: appendHaulerToManpowerRoster(s.project, haulerName),
          haulerPayouts: [record, ...(s.project.haulerPayouts ?? [])],
        });
      }),

    deleteHaulerPayout: (id) =>
      set((s) => ({
        ...commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerPayouts: (s.project.haulerPayouts ?? []).filter((p) => p.id !== id),
        }),
      })),

    addManpowerMember: (member) => {
      const id = `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set((s) => {
        const name = member.name.trim();
        if (!name) return s;
        const category = member.position === 'Horse Hauler' ? 'hauler' : member.category;
        const dailyRatePhp =
          category === 'hauler' ? 0 : Math.max(0, Number(member.dailyRatePhp) || 0);
        const newMember: ManpowerMember = {
          id,
          name,
          category,
          position: category === 'hauler' ? 'Horse Hauler' : member.position,
          dailyRatePhp,
          active: member.active ?? true,
          notes: member.notes?.trim() || undefined,
        };
        const current = resolveManpowerRoster(s.project);
        const manpowerRoster = [...current, newMember];
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          manpowerRoster,
          haulerRoster: deriveLegacyHaulerNames(manpowerRoster),
        });
      });
      return id;
    },

    updateManpowerMember: (id, patch) =>
      set((s) => {
        const current = resolveManpowerRoster(s.project);
        const target = current.find((m) => m.id === id);
        if (!target) return s;

        const nextCategory =
          patch.position === 'Horse Hauler'
            ? 'hauler'
            : patch.category ?? target.category;
        const nextPosition: ManpowerMember['position'] =
          nextCategory === 'hauler'
            ? 'Horse Hauler'
            : patch.position && patch.position !== 'Horse Hauler'
              ? patch.position
              : target.position === 'Horse Hauler'
                ? 'Laborer'
                : target.position;
        const nextName = patch.name !== undefined ? patch.name.trim() || target.name : target.name;
        const nextRate =
          nextCategory === 'hauler'
            ? 0
            : patch.dailyRatePhp !== undefined
              ? Math.max(0, Number(patch.dailyRatePhp) || 0)
              : target.dailyRatePhp;

        const manpowerRoster = current.map((m) =>
          m.id === id
            ? {
                ...m,
                ...patch,
                id,
                name: nextName,
                category: nextCategory,
                position: nextPosition,
                dailyRatePhp: nextRate,
                notes:
                  patch.notes !== undefined
                    ? patch.notes.trim() || undefined
                    : m.notes,
              }
            : m
        );

        const renamedHauler =
          target.category === 'hauler' &&
          nextCategory === 'hauler' &&
          nextName !== target.name;
        const oldNameKey = target.name.trim().toLowerCase();

        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          manpowerRoster,
          haulerRoster: deriveLegacyHaulerNames(manpowerRoster),
          ...(renamedHauler
            ? {
                haulingLogs: s.project.haulingLogs.map((log) =>
                  log.haulerName.trim().toLowerCase() === oldNameKey
                    ? { ...log, haulerName: nextName }
                    : log
                ),
                haulerPayouts: (s.project.haulerPayouts ?? []).map((p) =>
                  p.haulerName.trim().toLowerCase() === oldNameKey
                    ? { ...p, haulerName: nextName }
                    : p
                ),
              }
            : {}),
        });
      }),

    deleteManpowerMember: (id) =>
      set((s) => {
        const current = resolveManpowerRoster(s.project);
        const manpowerRoster = current.filter((m) => m.id !== id);
        const civilAttendance = (s.project.civilAttendance ?? [])
          .map((rec) => ({
            ...rec,
            presentMemberIds: rec.presentMemberIds.filter((mid) => mid !== id),
          }))
          .filter((rec) => rec.presentMemberIds.length > 0 || Boolean(rec.notes?.trim()));

        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          manpowerRoster,
          haulerRoster: deriveLegacyHaulerNames(manpowerRoster),
          civilAttendance,
        });
      }),

    setCivilAttendanceForDate: (date, presentMemberIds, notes) =>
      set((s) => {
        if (!date) return s;
        const uniqueIds = Array.from(new Set(presentMemberIds));
        const existing = s.project.civilAttendance ?? [];
        const hasEntry = existing.some((r) => r.date === date);
        let civilAttendance: CivilWorksAttendanceRecord[];
        if (uniqueIds.length === 0 && !notes?.trim()) {
          civilAttendance = existing.filter((r) => r.date !== date);
        } else if (hasEntry) {
          civilAttendance = existing.map((r) =>
            r.date === date
              ? {
                  date,
                  presentMemberIds: uniqueIds,
                  notes: notes !== undefined ? notes.trim() || undefined : r.notes,
                }
              : r
          );
        } else {
          civilAttendance = [
            ...existing,
            {
              date,
              presentMemberIds: uniqueIds,
              notes: notes?.trim() || undefined,
            },
          ].sort((a, b) => b.date.localeCompare(a.date));
        }

        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          civilAttendance,
        });
      }),

    toggleCivilAttendanceMember: (date, memberId) =>
      set((s) => {
        if (!date || !memberId) return s;
        const existing = s.project.civilAttendance ?? [];
        const currentRec = existing.find((r) => r.date === date);
        const prevIds = currentRec?.presentMemberIds ?? [];
        const isPresent = prevIds.includes(memberId);
        const nextIds = isPresent
          ? prevIds.filter((id) => id !== memberId)
          : [...prevIds, memberId];

        let civilAttendance: CivilWorksAttendanceRecord[];
        if (nextIds.length === 0 && !currentRec?.notes?.trim()) {
          civilAttendance = existing.filter((r) => r.date !== date);
        } else if (currentRec) {
          civilAttendance = existing.map((r) =>
            r.date === date ? { ...r, presentMemberIds: nextIds } : r
          );
        } else {
          civilAttendance = [
            ...existing,
            { date, presentMemberIds: nextIds },
          ].sort((a, b) => b.date.localeCompare(a.date));
        }

        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          civilAttendance,
        });
      }),

    createCivilPayrollSnapshot: (snapshot) => {
      const id = `cpay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set((s) => {
        const record: CivilWorksPayrollSnapshot = {
          ...snapshot,
          id,
          createdAt: new Date().toISOString(),
        };
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          civilPayrollHistory: [record, ...(s.project.civilPayrollHistory ?? [])],
        });
      });
      return id;
    },

    updateCivilPayrollStatus: (id, status, paidDate) =>
      set((s) => {
        const today = paidDate ?? new Date().toISOString().slice(0, 10);
        const civilPayrollHistory = (s.project.civilPayrollHistory ?? []).map((rec) =>
          rec.id === id
            ? {
                ...rec,
                status,
                paidDate: status === 'paid' ? today : undefined,
              }
            : rec
        );
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          civilPayrollHistory,
        });
      }),

    deleteCivilPayrollSnapshot: (id) =>
      set((s) => ({
        ...commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          civilPayrollHistory: (s.project.civilPayrollHistory ?? []).filter(
            (r) => r.id !== id
          ),
        }),
      })),

    createHaulerPayrollSnapshot: (snapshot) => {
      const id = `hpay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set((s) => {
        const today = snapshot.paidDate ?? new Date().toISOString().slice(0, 10);
        const record: HaulerPayrollSnapshot = {
          ...snapshot,
          id,
          createdAt: new Date().toISOString(),
          paidDate: snapshot.status === 'paid' ? today : undefined,
        };
        const linkedPayouts: HaulerPayoutRecord[] =
          snapshot.status === 'paid'
            ? snapshot.items
                .filter((item) => item.payoutReleasedPhp > 0)
                .map((item, idx) => ({
                  id: `pay-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                  date: today,
                  haulerName: item.haulerName,
                  amountPhp: item.payoutReleasedPhp,
                  notes: `Hauler Payroll: ${snapshot.title}`,
                  payrollSnapshotId: id,
                }))
            : [];
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerPayrollHistory: [record, ...(s.project.haulerPayrollHistory ?? [])],
          haulerPayouts: [...linkedPayouts, ...(s.project.haulerPayouts ?? [])],
        });
      });
      return id;
    },

    updateHaulerPayrollStatus: (id, status, paidDate) =>
      set((s) => {
        const target = (s.project.haulerPayrollHistory ?? []).find((r) => r.id === id);
        if (!target) return s;
        const today = paidDate ?? new Date().toISOString().slice(0, 10);
        const haulerPayrollHistory = (s.project.haulerPayrollHistory ?? []).map((rec) =>
          rec.id === id
            ? {
                ...rec,
                status,
                paidDate: status === 'paid' ? today : undefined,
              }
            : rec
        );
        // Remove previous linked payouts for this snapshot, then re-create if marked paid
        const basePayouts = (s.project.haulerPayouts ?? []).filter(
          (p) => p.payrollSnapshotId !== id
        );
        const linkedPayouts: HaulerPayoutRecord[] =
          status === 'paid'
            ? target.items
                .filter((item) => item.payoutReleasedPhp > 0)
                .map((item, idx) => ({
                  id: `pay-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                  date: today,
                  haulerName: item.haulerName,
                  amountPhp: item.payoutReleasedPhp,
                  notes: `Hauler Payroll: ${target.title}`,
                  payrollSnapshotId: id,
                }))
            : [];

        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerPayrollHistory,
          haulerPayouts: [...linkedPayouts, ...basePayouts],
        });
      }),

    deleteHaulerPayrollSnapshot: (id) =>
      set((s) => ({
        ...commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          haulerPayrollHistory: (s.project.haulerPayrollHistory ?? []).filter(
            (r) => r.id !== id
          ),
          haulerPayouts: (s.project.haulerPayouts ?? []).filter(
            (p) => p.payrollSnapshotId !== id
          ),
        }),
      })),

    syncDailyLogDeliveriesFromHauling: (logId) =>
      set((s) => {
        const target = s.project.dailyLogs.find((l) => l.id === logId);
        if (!target) return s;
        const currentRows = target.materialsOnSite ?? [];
        const syncedRows = syncDailyLogMaterialsWithHauling(
          s.project,
          target.date,
          currentRows,
          computeDailyLogMaterialRemaining
        );
        const updatedLogs = s.project.dailyLogs.map((l) =>
          l.id === logId ? { ...l, materialsOnSite: syncedRows } : l
        );
        const dailyLogs = recalculateDailyLogCarryOver(updatedLogs, logId);
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          dailyLogs,
        });
      }),

    addDailyLog: (entry) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const totalWorkers = entry.workers.reduce((sum, w) => sum + Math.max(0, w.count), 0);
        const totalManHours = entry.workers.reduce(
          (sum, w) => sum + Math.max(0, w.count) * Math.max(0, w.hours),
          0
        );
        const findUsed = (keyword: string, fallback: number) => {
          const match = entry.materialsOnSite?.find((m) =>
            m.name.toLowerCase().includes(keyword)
          );
          return match ? Math.max(0, match.usedTodayQty) : fallback;
        };
        const newLog: DailyActivityLogEntry = {
          ...entry,
          id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          totalWorkers,
          totalManHours,
          cementUsedBags: entry.materialsOnSite ? findUsed('cement', entry.cementUsedBags) : entry.cementUsedBags,
          sandUsedBags: entry.materialsOnSite ? findUsed('sand', entry.sandUsedBags) : entry.sandUsedBags,
          gravelUsedBags: entry.materialsOnSite ? findUsed('gravel', entry.gravelUsedBags) : entry.gravelUsedBags,
        };
        const combinedLogs = [newLog, ...s.project.dailyLogs];
        const dailyLogs =
          newLog.materialsOnSite && newLog.materialsOnSite.length > 0
            ? recalculateDailyLogCarryOver(combinedLogs, newLog.id)
            : combinedLogs;
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          dailyLogs,
        };
        return commitActiveProject(s, next);
      }),

    updateDailyLog: (id, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const updatedLogs = s.project.dailyLogs.map((log) => {
          if (log.id !== id) return log;
          const mergedWorkers = patch.workers ?? log.workers;
          const totalWorkers = mergedWorkers.reduce((sum, w) => sum + Math.max(0, w.count), 0);
          const totalManHours = mergedWorkers.reduce(
            (sum, w) => sum + Math.max(0, w.count) * Math.max(0, w.hours),
            0
          );
          const mats = patch.materialsOnSite ?? log.materialsOnSite;
          const findUsed = (keyword: string, fallback: number) => {
            const match = mats?.find((m) => m.name.toLowerCase().includes(keyword));
            return match ? Math.max(0, match.usedTodayQty) : fallback;
          };
          return {
            ...log,
            ...patch,
            workers: mergedWorkers,
            totalWorkers,
            totalManHours,
            cementUsedBags: mats ? findUsed('cement', patch.cementUsedBags ?? log.cementUsedBags) : (patch.cementUsedBags ?? log.cementUsedBags),
            sandUsedBags: mats ? findUsed('sand', patch.sandUsedBags ?? log.sandUsedBags) : (patch.sandUsedBags ?? log.sandUsedBags),
            gravelUsedBags: mats ? findUsed('gravel', patch.gravelUsedBags ?? log.gravelUsedBags) : (patch.gravelUsedBags ?? log.gravelUsedBags),
          };
        });
        const dailyLogs = patch.materialsOnSite
          ? recalculateDailyLogCarryOver(updatedLogs, id)
          : updatedLogs;
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          dailyLogs,
        };
        return commitActiveProject(s, next);
      }),

    deleteDailyLog: (id) =>
      set((s) => {
        const remainingLogs = s.project.dailyLogs.filter((l) => l.id !== id);
        const dailyLogs = recalculateDailyLogCarryOver(remainingLogs);
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          dailyLogs,
        };
        return commitActiveProject(s, next);
      }),

    updateProjectMeta: (patch) =>
      set((s) => {
        const nextDetails: ReportDetailsSpec = {
          ...s.project.reportDetails,
          ...(patch.projectName !== undefined ? { projectName: patch.projectName } : {}),
          ...(patch.location !== undefined ? { projectLocation: patch.location } : {}),
          ...(patch.preparedBy !== undefined ? { preparedBy: patch.preparedBy } : {}),
          ...(patch.contractor !== undefined ? { contractor: patch.contractor } : {}),
        };
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          ...patch,
          reportDetails: nextDetails,
        };
        return commitActiveProject(s, next);
      }),

    updateReportDetails: (patch) =>
      set((s) => {
        const merged: ReportDetailsSpec = {
          ...s.project.reportDetails,
          ...patch,
        };
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          ...(patch.projectName?.trim() ? { projectName: patch.projectName.trim() } : {}),
          ...(patch.projectLocation?.trim() ? { location: patch.projectLocation.trim() } : {}),
          ...(patch.preparedBy?.trim() ? { preparedBy: patch.preparedBy.trim() } : {}),
          ...(patch.contractor?.trim() ? { contractor: patch.contractor.trim() } : {}),
          reportDetails: merged,
        };
        return commitActiveProject(s, next);
      }),

    updateInventoryItem: (id, patch) =>
      set((s) => {
        const inventory = s.project.inventory.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: new Date().toISOString().slice(0, 10),
          inventory,
        };
        return commitActiveProject(s, next);
      }),

    setProjectPhase: (phase) =>
      set((s) =>
        commitActiveProject(s, {
          ...s.project,
          projectType: phase,
          verticalMast: s.project.verticalMast
            ? normalizeVerticalMastState(s.project.verticalMast)
            : createInitialVerticalMastState(),
        })
      ),

    loadSampleData: () =>
      set((s) =>
        commitActiveProject(
          s,
          s.project.projectType === 'vertical_mast'
            ? createSampleVerticalMastProject()
            : createSampleMast2Project()
        )
      ),

    resetCleanBaseline: () =>
      set((s) =>
        commitActiveProject(
          s,
          s.project.projectType === 'vertical_mast'
            ? createCleanVerticalMastProject()
            : createCleanBaselineProject()
        )
      ),

    importProjectJson: (jsonText) => {
      const parsed = JSON.parse(jsonText) as MastProjectState;
      if (!parsed || !Array.isArray(parsed.foundations) || parsed.foundations.length !== 13) {
        throw new Error('Invalid Mast 2 project JSON file (expected 13 foundations).');
      }
      const cleaned = stripLegacyBoilerplateNotes(parsed);
      set((s) => ({
        ...commitActiveProject(s, cleaned),
        selectedFoundationId: cleaned.foundations[0].id,
      }));
    },

    exportProjectJson: () => JSON.stringify(get().project, null, 2),

    updateTowerSectionStatus: (id, status) => {
      const curr = get();
      const vm = curr.project.verticalMast ?? createInitialVerticalMastState();
      const violation = validateTowerSectionUpdate(vm, id, status);
      if (violation) {
        useUiStore.getState().setMastOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      const isInstalled =
        status === 'hoisted' || status === 'bolted_torqued' || status === 'plumbed_verified';
      set((s) => {
        const activeVm = s.project.verticalMast ?? createInitialVerticalMastState();
        const sections = activeVm.sections.map((sec) =>
          sec.id === id
            ? {
              ...sec,
              status,
              checklist: sectionChecklistFromStatus(status),
              installedDate: isInstalled
                ? sec.installedDate || today
                : status === 'not_started'
                  ? undefined
                  : sec.installedDate,
              verifiedDate:
                status === 'plumbed_verified' ? sec.verifiedDate || today : undefined,
            }
            : sec
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          verticalMast: syncVerticalMastFlags({ ...activeVm, sections }),
        };
        return commitActiveProject(s, next);
      });
      return null;
    },

    toggleTowerSectionChecklistItem: (id, key) => {
      const curr = get();
      const vm = curr.project.verticalMast ?? createInitialVerticalMastState();
      const targetSec = vm.sections.find((sec) => sec.id === id);
      if (!targetSec) return null;

      const nextVal = !targetSec.checklist[key];
      const nextChecklist =
        key === 'plumbedAndInspected'
          ? sectionChecklistFromStatus(nextVal ? 'plumbed_verified' : 'not_started')
          : {
            ...targetSec.checklist,
            [key]: nextVal,
          };
      const nextStatus = deriveSectionStatusFromChecklist(nextChecklist);
      const violation = validateTowerSectionUpdate(vm, id, nextStatus);
      if (violation) {
        useUiStore.getState().setMastOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      set((s) => {
        const activeVm = s.project.verticalMast ?? createInitialVerticalMastState();
        const sections = activeVm.sections.map((sec) => {
          if (sec.id !== id) return sec;
          return {
            ...sec,
            checklist: nextChecklist,
            status: nextStatus,
            installedDate:
              nextChecklist.hoistedInPosition || nextChecklist.plumbedAndInspected
                ? sec.installedDate || today
                : undefined,
            verifiedDate:
              nextStatus === 'plumbed_verified' ? sec.verifiedDate || today : undefined,
          };
        });
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          verticalMast: syncVerticalMastFlags({ ...activeVm, sections }),
        };
        return commitActiveProject(s, next);
      });
      return null;
    },

    updateTowerSectionDetails: (id, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const vm = s.project.verticalMast ?? createInitialVerticalMastState();
        const sections = vm.sections.map((sec) =>
          sec.id === id ? { ...sec, ...patch } : sec
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          verticalMast: { ...vm, sections },
        };
        return commitActiveProject(s, next);
      }),

    batchUpdateTowerSectionRange: (fromSectionNo, toSectionNo, status) => {
      const curr = get();
      const vm = curr.project.verticalMast ?? createInitialVerticalMastState();
      const violation = validateTowerSectionRangeUpdate(
        vm,
        fromSectionNo,
        toSectionNo,
        status
      );
      if (violation) {
        useUiStore.getState().setMastOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      const lo = Math.min(fromSectionNo, toSectionNo);
      const hi = Math.max(fromSectionNo, toSectionNo);
      const isInstalled =
        status === 'hoisted' || status === 'bolted_torqued' || status === 'plumbed_verified';
      set((s) => {
        const activeVm = s.project.verticalMast ?? createInitialVerticalMastState();
        const sections = activeVm.sections.map((sec) =>
          sec.sectionNo >= lo && sec.sectionNo <= hi
            ? {
              ...sec,
              status,
              checklist: sectionChecklistFromStatus(status),
              installedDate: isInstalled
                ? sec.installedDate || today
                : status === 'not_started'
                  ? undefined
                  : sec.installedDate,
              verifiedDate:
                status === 'plumbed_verified' ? sec.verifiedDate || today : undefined,
            }
            : sec
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          verticalMast: syncVerticalMastFlags({ ...activeVm, sections }),
        };
        return commitActiveProject(s, next);
      });
      return null;
    },

    updateGuyLayerStatus: (id, status) => {
      const curr = get();
      const vm = curr.project.verticalMast ?? createInitialVerticalMastState();
      const violation = validateGuyLayerUpdate(vm, id, status);
      if (violation) {
        useUiStore.getState().setMastOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      const template = guySectorsFromStatus(status);
      set((s) => {
        const activeVm = s.project.verticalMast ?? createInitialVerticalMastState();
        const guyLayers = activeVm.guyLayers.map((g) =>
          g.id === id
            ? {
              ...g,
              status,
              sectors: {
                I: { ...g.sectors.I, ...template.I },
                II: { ...g.sectors.II, ...template.II },
                III: { ...g.sectors.III, ...template.III },
              },
              installedDate: status !== 'not_started' ? g.installedDate || today : undefined,
              verifiedDate:
                status === 'tensioned_verified' ? g.verifiedDate || today : undefined,
            }
            : g
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          verticalMast: { ...activeVm, guyLayers },
        };
        return commitActiveProject(s, next);
      });
      return null;
    },

    updateGuyLayerSector: (id, sector, patch) => {
      const curr = get();
      const vm = curr.project.verticalMast ?? createInitialVerticalMastState();
      const targetGuy = vm.guyLayers.find((g) => g.id === id);
      if (!targetGuy) return null;

      const prevSector = targetGuy.sectors[sector];
      const nextSector: GuySectorProgress = {
        ...prevSector,
        ...patch,
      };
      if (patch.tensioned) {
        nextSector.pulled = true;
        nextSector.terminated = true;
      } else if (patch.terminated) {
        nextSector.pulled = true;
      }
      const nextSectors = {
        ...targetGuy.sectors,
        [sector]: nextSector,
      };
      const nextStatus = deriveGuyLayerStatusFromSectors(nextSectors);
      const violation = validateGuyLayerUpdate(vm, id, nextStatus);
      if (violation) {
        useUiStore.getState().setMastOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      set((s) => {
        const activeVm = s.project.verticalMast ?? createInitialVerticalMastState();
        const guyLayers = activeVm.guyLayers.map((g) =>
          g.id === id
            ? {
              ...g,
              sectors: nextSectors,
              status: nextStatus,
              installedDate:
                nextStatus !== 'not_started' ? g.installedDate || today : undefined,
              verifiedDate:
                nextStatus === 'tensioned_verified' ? g.verifiedDate || today : undefined,
            }
            : g
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          verticalMast: { ...activeVm, guyLayers },
        };
        return commitActiveProject(s, next);
      });
      return null;
    },

    toggleGuyLayerSectorInstalled: (id, sector) => {
      const curr = get();
      const vm = curr.project.verticalMast ?? createInitialVerticalMastState();
      const targetGuy = vm.guyLayers.find((g) => g.id === id);
      if (!targetGuy) return null;

      const prev = targetGuy.sectors[sector];
      const currentlyInstalled = Boolean(prev.terminated || prev.tensioned);
      const nextSector: GuySectorProgress = currentlyInstalled
        ? { ...prev, pulled: false, terminated: false, tensioned: false }
        : { ...prev, pulled: true, terminated: true };
      const nextSectors = { ...targetGuy.sectors, [sector]: nextSector };
      const nextStatus = deriveGuyLayerStatusFromSectors(nextSectors);
      const violation = validateGuyLayerUpdate(vm, id, nextStatus);
      if (violation) {
        useUiStore.getState().setMastOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      set((s) => {
        const activeVm = s.project.verticalMast ?? createInitialVerticalMastState();
        const guyLayers = activeVm.guyLayers.map((g) =>
          g.id === id
            ? {
              ...g,
              sectors: nextSectors,
              status: nextStatus,
              installedDate:
                nextStatus !== 'not_started' ? g.installedDate || today : undefined,
              verifiedDate:
                nextStatus === 'tensioned_verified' ? g.verifiedDate || today : undefined,
            }
            : g
        );
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: today,
          verticalMast: { ...activeVm, guyLayers },
        });
      });
      return null;
    },

    toggleGuyLayerAllTensioned: (id) => {
      const curr = get();
      const vm = curr.project.verticalMast ?? createInitialVerticalMastState();
      const targetGuy = vm.guyLayers.find((g) => g.id === id);
      if (!targetGuy) return null;

      const allTensioned = (['I', 'II', 'III'] as const).every(
        (k) => targetGuy.sectors[k].tensioned
      );
      const nextSectors = allTensioned
        ? {
          I: { ...targetGuy.sectors.I, pulled: true, terminated: true, tensioned: false },
          II: { ...targetGuy.sectors.II, pulled: true, terminated: true, tensioned: false },
          III: { ...targetGuy.sectors.III, pulled: true, terminated: true, tensioned: false },
        }
        : {
          I: { ...targetGuy.sectors.I, pulled: true, terminated: true, tensioned: true },
          II: { ...targetGuy.sectors.II, pulled: true, terminated: true, tensioned: true },
          III: { ...targetGuy.sectors.III, pulled: true, terminated: true, tensioned: true },
        };
      const nextStatus = deriveGuyLayerStatusFromSectors(nextSectors);
      const violation = validateGuyLayerUpdate(vm, id, nextStatus);
      if (violation) {
        useUiStore.getState().setMastOrderViolation(violation);
        return violation;
      }

      const today = new Date().toISOString().slice(0, 10);
      set((s) => {
        const activeVm = s.project.verticalMast ?? createInitialVerticalMastState();
        const guyLayers = activeVm.guyLayers.map((g) =>
          g.id === id
            ? {
              ...g,
              sectors: nextSectors,
              status: nextStatus,
              installedDate:
                nextStatus !== 'not_started' ? g.installedDate || today : undefined,
              verifiedDate:
                nextStatus === 'tensioned_verified' ? g.verifiedDate || today : undefined,
            }
            : g
        );
        return commitActiveProject(s, {
          ...s.project,
          lastUpdated: today,
          verticalMast: { ...activeVm, guyLayers },
        });
      });
      return null;
    },

    updateGuyLayerDetails: (id, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const vm = s.project.verticalMast ?? createInitialVerticalMastState();
        const guyLayers = vm.guyLayers.map((g) =>
          g.id === id ? { ...g, ...patch } : g
        );
        const next: MastProjectState = {
          ...s.project,
          lastUpdated: today,
          verticalMast: { ...vm, guyLayers },
        };
        return commitActiveProject(s, next);
      }),

    updateMastInspectionItem: (targetKind, id, key, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const vm = s.project.verticalMast ?? createInitialVerticalMastState();
        const nextVm: VerticalMastState =
          targetKind === 'section'
            ? {
              ...vm,
              sections: vm.sections.map((sec) =>
                sec.id === id ? patchInspectionItemInHolder(sec, key, patch) : sec
              ),
            }
            : {
              ...vm,
              guyLayers: vm.guyLayers.map((g) =>
                g.id === id ? patchInspectionItemInHolder(g, key, patch) : g
              ),
            };
        return commitActiveProject(s, { ...s.project, lastUpdated: today, verticalMast: nextVm });
      }),

    addMastInspectionItem: (targetKind, id, item) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const vm = s.project.verticalMast ?? createInitialVerticalMastState();
        const nextVm: VerticalMastState =
          targetKind === 'section'
            ? {
              ...vm,
              sections: vm.sections.map((sec) =>
                sec.id === id ? addInspectionItemInHolder(sec, item) : sec
              ),
            }
            : {
              ...vm,
              guyLayers: vm.guyLayers.map((g) =>
                g.id === id ? addInspectionItemInHolder(g, item) : g
              ),
            };
        return commitActiveProject(s, { ...s.project, lastUpdated: today, verticalMast: nextVm });
      }),

    removeMastInspectionItem: (targetKind, id, key) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const vm = s.project.verticalMast ?? createInitialVerticalMastState();
        const nextVm: VerticalMastState =
          targetKind === 'section'
            ? {
              ...vm,
              sections: vm.sections.map((sec) =>
                sec.id === id ? removeInspectionItemInHolder(sec, key) : sec
              ),
            }
            : {
              ...vm,
              guyLayers: vm.guyLayers.map((g) =>
                g.id === id ? removeInspectionItemInHolder(g, key) : g
              ),
            };
        return commitActiveProject(s, { ...s.project, lastUpdated: today, verticalMast: nextVm });
      }),

    resetMastInspectionChecklist: (targetKind, id) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const vm = s.project.verticalMast ?? createInitialVerticalMastState();
        const nextVm: VerticalMastState =
          targetKind === 'section'
            ? {
              ...vm,
              sections: vm.sections.map((sec) =>
                sec.id === id ? resetInspectionChecklistInHolder(sec) : sec
              ),
            }
            : {
              ...vm,
              guyLayers: vm.guyLayers.map((g) =>
                g.id === id ? resetInspectionChecklistInHolder(g) : g
              ),
            };
        return commitActiveProject(s, { ...s.project, lastUpdated: today, verticalMast: nextVm });
      }),

    updateMastInspectionMeta: (targetKind, id, patch) =>
      set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const vm = s.project.verticalMast ?? createInitialVerticalMastState();
        const nextVm: VerticalMastState =
          targetKind === 'section'
            ? {
              ...vm,
              sections: vm.sections.map((sec) =>
                sec.id === id
                  ? { ...sec, inspectionMeta: { ...(sec.inspectionMeta ?? {}), ...patch } }
                  : sec
              ),
            }
            : {
              ...vm,
              guyLayers: vm.guyLayers.map((g) =>
                g.id === id
                  ? { ...g, inspectionMeta: { ...(g.inspectionMeta ?? {}), ...patch } }
                  : g
              ),
            };
        return commitActiveProject(s, { ...s.project, lastUpdated: today, verticalMast: nextVm });
      }),

    updateProjectClientSettings: (projectId, patch, options) => {
      let resolvedNext: ClientShowcaseSettings | null = null;
      let hadUnsavedStateEdits = false;
      set((s) => {
        const now = new Date().toISOString();
        const settingFeatured = patch.featured === true;
        const projects = s.projects.map((p) => {
          if (p.id === projectId) {
            hadUnsavedStateEdits =
              p.syncStatus === 'pending' || p.syncStatus === 'local_only';
            const current = resolveClientShowcaseSettings(p);
            const merged = resolveClientShowcaseSettings({
              id: p.id,
              state: p.state,
              clientSettings: { ...current, ...patch },
            });
            resolvedNext = merged;
            return {
              ...p,
              updatedAt: now,
              syncStatus: 'pending' as ProjectSyncStatus,
              clientSettings: merged,
            };
          }
          if (settingFeatured && p.clientSettings?.featured) {
            return {
              ...p,
              clientSettings: { ...p.clientSettings, featured: false },
            };
          }
          return p;
        });
        persistWorkspace(s.activeProjectId, projects);
        return { projects };
      });
      if (resolvedNext && !options?.skipAutoSync) {
        activeSyncHooks.onClientSettingsChanged?.(
          projectId,
          resolvedNext,
          hadUnsavedStateEdits
        );
      }
    },

    applyUploadedImageUrls: (projectId, urlMap) =>
      set((s) => {
        if (urlMap.size === 0) return s;
        let nextActiveState: MastProjectState | undefined;
        let anyChanged = false;
        const projects = s.projects.map((p) => {
          if (p.id !== projectId) return p;
          const { nextState, replacedCount } = replaceInlineImageUrlsInState(
            p.state,
            urlMap
          );
          if (replacedCount === 0) return p;
          anyChanged = true;
          if (s.activeProjectId === projectId) {
            nextActiveState = nextState;
          }
          return {
            ...p,
            state: nextState,
          };
        });
        if (!anyChanged) return s;
        persistWorkspace(s.activeProjectId, projects);
        return {
          projects,
          ...(nextActiveState ? { project: nextActiveState } : {}),
        };
      }),

    applyCloudWorkspace: (cloudProjects) =>
      set((s) => {
        const cloudById = new Map(cloudProjects.map((cp) => [cp.id, cp]));
        const localById = new Map(s.projects.map((lp) => [lp.id, lp]));

        const merged: SavedProjectRecord[] = [];
        for (const cp of cloudProjects) {
          const local = localById.get(cp.id);
          if (
            local &&
            (local.syncStatus === 'pending' || local.syncStatus === 'conflict')
          ) {
            merged.push({ ...local });
          } else {
            merged.push({ ...normalizeProjectRecord(cp), syncStatus: 'synced' });
          }
        }

        // Preserve any local-only or offline-created projects not yet in cloud
        for (const lp of s.projects) {
          if (!cloudById.has(lp.id)) {
            if (lp.id === 'proj-default' && cloudProjects.length > 0 && lp.syncStatus !== 'pending') {
              continue;
            }
            merged.push({
              ...lp,
              syncStatus: lp.syncStatus === 'pending' ? 'pending' : 'local_only',
            });
          }
        }

        const nextList = merged.length > 0 ? merged : s.projects;
        const nextActive =
          nextList.find((p) => p.id === s.activeProjectId) ?? nextList[0];

        persistWorkspace(nextActive.id, nextList);
        return {
          projects: nextList,
          activeProjectId: nextActive.id,
          project: nextActive.state,
          selectedFoundationId: nextActive.state.foundations[0]?.id ?? 'PF-0',
        };
      }),

    applyCloudSyncResult: (projectId, serverRecord, expectedSnapshotUpdatedAt) =>
      set((s) => {
        const current = s.projects.find((p) => p.id === projectId);
        const normalized = normalizeProjectRecord(serverRecord);
        const editedMidSync = Boolean(
          expectedSnapshotUpdatedAt &&
            current &&
            current.updatedAt !== expectedSnapshotUpdatedAt
        );

        const nextRecord: SavedProjectRecord = editedMidSync && current
          ? {
              ...current,
              version: normalized.version,
              syncStatus: 'pending',
            }
          : {
              ...normalized,
              syncStatus: 'synced',
            };

        const projects = s.projects.map((p) => (p.id === projectId ? nextRecord : p));
        persistWorkspace(s.activeProjectId, projects);
        const isActive = s.activeProjectId === projectId;
        return {
          projects,
          ...(isActive && !editedMidSync ? { project: nextRecord.state } : {}),
        };
      }),

    markProjectSyncStatus: (projectId, syncStatus) =>
      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === projectId ? { ...p, syncStatus } : p
        );
        persistWorkspace(s.activeProjectId, projects);
        return { projects };
      }),
  };
});

