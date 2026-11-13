import { create } from 'zustand';
import { recalculateDailyLogCarryOver } from '@/entities/project/calculations';
import {
  BAGS_PER_CUBIC_METER,
  FOUNDATION_SPECS,
  checklistFromStatus,
  createCleanBaselineProject,
  createSampleMast2Project,
  deriveStatusFromChecklist,
  emptyChecklist,
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
import type {
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
  HaulingLogEntry,
  MastProjectState,
  ProjectType,
  ReportDetailsSpec,
  SavedProjectRecord,
  ScheduleActivityItem,
  SectorId,
  SiteEquipmentItem,
  TowerSectionChecklist,
  TowerSectionRecord,
  TowerSectionStatus,
  VerticalMastState,
} from '@/entities/project/types';

const LEGACY_STORAGE_KEY = 'mast2-tower-report-generator-v1';
const WORKSPACE_STORAGE_KEY = 'mast2-tower-projects-workspace-v1';

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
  return changed ? { ...state, foundations } : state;
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

interface WorkspacePayload {
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

function loadInitialWorkspace(): WorkspacePayload {
  const fallback = buildSavedRecord(createSampleMast2Project(), 'proj-default');
  if (typeof window === 'undefined') {
    return { activeProjectId: fallback.id, projects: [fallback] };
  }
  try {
    const workspaceRaw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (workspaceRaw) {
      const parsed = JSON.parse(workspaceRaw) as Partial<WorkspacePayload>;
      const validProjects = Array.isArray(parsed.projects)
        ? parsed.projects
            .filter((p) => p && p.id && isValidProjectState(p.state))
            .map((p) => {
              const cleaned = stripLegacyBoilerplateNotes(p.state);
              return cleaned.verticalMast
                ? {
                    ...p,
                    state: {
                      ...cleaned,
                      verticalMast: normalizeVerticalMastState(cleaned.verticalMast),
                    },
                  }
                : { ...p, state: cleaned };
            })
        : [];
      if (validProjects.length > 0) {
        const active =
          validProjects.find((p) => p.id === parsed.activeProjectId) ?? validProjects[0];
        return { activeProjectId: active.id, projects: validProjects };
      }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (isValidProjectState(legacyParsed)) {
        const migrated = buildSavedRecord(legacyParsed, 'proj-1');
        return { activeProjectId: migrated.id, projects: [migrated] };
      }
    }
  } catch {
    // Ignore read/parse errors
  }
  return { activeProjectId: fallback.id, projects: [fallback] };
}

function persistWorkspace(activeProjectId: string, projects: SavedProjectRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({ activeProjectId, projects })
    );
  } catch {
    // Ignore quota errors
  }
}

function commitActiveProject(
  s: { activeProjectId: string; projects: SavedProjectRecord[] },
  nextProject: MastProjectState
): { project: MastProjectState; projects: SavedProjectRecord[] } {
  const now = new Date().toISOString();
  const hasActive = s.projects.some((p) => p.id === s.activeProjectId);
  const projects = hasActive
    ? s.projects.map((p) =>
        p.id === s.activeProjectId ? { ...p, updatedAt: now, state: nextProject } : p
      )
    : [
        { id: s.activeProjectId, createdAt: now, updatedAt: now, state: nextProject },
        ...s.projects,
      ];
  persistWorkspace(s.activeProjectId, projects);
  return { project: nextProject, projects };
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
  ) => void;
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
  addDailyLog: (entry: Omit<DailyActivityLogEntry, 'id' | 'totalWorkers' | 'totalManHours'>) => void;
  updateDailyLog: (id: string, patch: Partial<Omit<DailyActivityLogEntry, 'id'>>) => void;
  deleteDailyLog: (id: string) => void;
  updateProjectMeta: (
    patch: Partial<Pick<MastProjectState, 'projectName' | 'location' | 'preparedBy' | 'contractor'>>
  ) => void;
  updateReportDetails: (patch: Partial<ReportDetailsSpec>) => void;
  updateScheduleItem: (
    id: string,
    patch: Partial<Pick<ScheduleActivityItem, 'status' | 'progressPct'>>
  ) => void;
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
  updateTowerSectionStatus: (id: string, status: TowerSectionStatus) => void;
  toggleTowerSectionChecklistItem: (
    id: string,
    key: keyof TowerSectionChecklist
  ) => void;
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
  ) => void;
  updateGuyLayerStatus: (id: string, status: GuyLayerStatus) => void;
  updateGuyLayerSector: (
    id: string,
    sector: Exclude<SectorId, 'CENTER'>,
    patch: Partial<GuySectorProgress>
  ) => void;
  toggleGuyLayerSectorInstalled: (
    id: string,
    sector: Exclude<SectorId, 'CENTER'>
  ) => void;
  toggleGuyLayerAllTensioned: (id: string) => void;
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
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  const initialWorkspace = loadInitialWorkspace();
  const initialActive =
    initialWorkspace.projects.find((p) => p.id === initialWorkspace.activeProjectId) ??
    initialWorkspace.projects[0];

  return {
    projects: initialWorkspace.projects,
    activeProjectId: initialActive.id,
    project: initialActive.state,
    selectedFoundationId: initialActive.state.foundations[0]?.id ?? 'PF-0',

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
      const record = buildSavedRecord(nextState);
      const projects = [record, ...s.projects];
      persistWorkspace(record.id, projects);
      set({
        projects,
        activeProjectId: record.id,
        project: record.state,
        selectedFoundationId: record.state.foundations[0]?.id ?? 'PF-0',
      });
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
      const record = buildSavedRecord(nextState);
      const projects = [record, ...s.projects];
      persistWorkspace(record.id, projects);
      set({
        projects,
        activeProjectId: record.id,
        project: record.state,
        selectedFoundationId: record.state.foundations[0]?.id ?? 'PF-0',
      });
      return record.id;
    },

    deleteProject: (projectId) =>
      set((s) => {
        const remaining = s.projects.filter((p) => p.id !== projectId);
        if (remaining.length === 0) {
          const fresh = buildSavedRecord(createCleanBaselineProject());
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
      }),

    importProjectAsNew: (jsonText) => {
      const parsed = JSON.parse(jsonText) as MastProjectState;
      if (!parsed || !Array.isArray(parsed.foundations) || parsed.foundations.length !== 13) {
        throw new Error('Invalid Mast 2 project JSON file (expected 13 foundations).');
      }
      const s = get();
      const record = buildSavedRecord(parsed);
      const projects = [record, ...s.projects];
      persistWorkspace(record.id, projects);
      set({
        projects,
        activeProjectId: record.id,
        project: record.state,
        selectedFoundationId: record.state.foundations[0].id,
      });
      return record.id;
    },

    selectFoundation: (id) => set({ selectedFoundationId: id }),

  updateFoundationStatus: (id, status) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const foundations = s.project.foundations.map((f) => {
        if (f.id !== id) return f;
        const spec = FOUNDATION_SPECS[f.type];
        const checklist = checklistFromStatus(status);
        const isPoured = status === 'concreted' || status === 'curing' || status === 'completed';
        return {
          ...f,
          status,
          checklist,
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
    }),

  toggleFoundationChecklistItem: (id, key) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const foundations = s.project.foundations.map((f) => {
        if (f.id !== id) return f;
        const nextVal = !Boolean(f.checklist[key]);
        const checklist = {
          ...f.checklist,
          [key]: nextVal,
          ...(key === 'formworkBraced' ? { anchorHardwareAligned: nextVal } : {}),
        };
        const status = deriveStatusFromChecklist(checklist);
        const spec = FOUNDATION_SPECS[f.type];
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
    }),

  updateFoundationDetails: (id, patch) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const foundations = s.project.foundations.map((f) =>
        f.id === id ? { ...f, ...patch } : f
      );
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
        f.id === id
          ? {
              ...f,
              customSpecs: {
                ...(f.customSpecs ?? {}),
                ...patch,
              },
            }
          : f
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

  updateScheduleItem: (id, patch) =>
    set((s) => {
      const schedule = s.project.schedule.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      );
      const next: MastProjectState = {
        ...s.project,
        lastUpdated: new Date().toISOString().slice(0, 10),
        schedule,
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
    set((s) => ({
      ...commitActiveProject(s, parsed),
      selectedFoundationId: parsed.foundations[0].id,
    }));
  },

  exportProjectJson: () => JSON.stringify(get().project, null, 2),

  updateTowerSectionStatus: (id, status) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const vm = s.project.verticalMast ?? createInitialVerticalMastState();
      const isInstalled =
        status === 'hoisted' || status === 'bolted_torqued' || status === 'plumbed_verified';
      const sections = vm.sections.map((sec) =>
        sec.id === id
          ? {
              ...sec,
              status,
              checklist: sectionChecklistFromStatus(status),
              installedDate: isInstalled ? sec.installedDate || today : sec.installedDate,
              verifiedDate:
                status === 'plumbed_verified' ? sec.verifiedDate || today : undefined,
            }
          : sec
      );
      const next: MastProjectState = {
        ...s.project,
        lastUpdated: today,
        verticalMast: syncVerticalMastFlags({ ...vm, sections }),
      };
      return commitActiveProject(s, next);
    }),

  toggleTowerSectionChecklistItem: (id, key) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const vm = s.project.verticalMast ?? createInitialVerticalMastState();
      const sections = vm.sections.map((sec) => {
        if (sec.id !== id) return sec;
        const nextVal = !sec.checklist[key];
        const checklist =
          key === 'plumbedAndInspected'
            ? sectionChecklistFromStatus(nextVal ? 'plumbed_verified' : 'not_started')
            : {
                ...sec.checklist,
                [key]: nextVal,
              };
        const status = deriveSectionStatusFromChecklist(checklist);
        return {
          ...sec,
          checklist,
          status,
          installedDate:
            checklist.hoistedInPosition || checklist.plumbedAndInspected
              ? sec.installedDate || today
              : undefined,
          verifiedDate:
            status === 'plumbed_verified' ? sec.verifiedDate || today : undefined,
        };
      });
      const next: MastProjectState = {
        ...s.project,
        lastUpdated: today,
        verticalMast: syncVerticalMastFlags({ ...vm, sections }),
      };
      return commitActiveProject(s, next);
    }),

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

  batchUpdateTowerSectionRange: (fromSectionNo, toSectionNo, status) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const lo = Math.min(fromSectionNo, toSectionNo);
      const hi = Math.max(fromSectionNo, toSectionNo);
      const vm = s.project.verticalMast ?? createInitialVerticalMastState();
      const isInstalled =
        status === 'hoisted' || status === 'bolted_torqued' || status === 'plumbed_verified';
      const sections = vm.sections.map((sec) =>
        sec.sectionNo >= lo && sec.sectionNo <= hi
          ? {
              ...sec,
              status,
              checklist: sectionChecklistFromStatus(status),
              installedDate: isInstalled ? sec.installedDate || today : sec.installedDate,
              verifiedDate:
                status === 'plumbed_verified' ? sec.verifiedDate || today : undefined,
            }
          : sec
      );
      const next: MastProjectState = {
        ...s.project,
        lastUpdated: today,
        verticalMast: syncVerticalMastFlags({ ...vm, sections }),
      };
      return commitActiveProject(s, next);
    }),

  updateGuyLayerStatus: (id, status) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const vm = s.project.verticalMast ?? createInitialVerticalMastState();
      const template = guySectorsFromStatus(status);
      const guyLayers = vm.guyLayers.map((g) =>
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
        verticalMast: { ...vm, guyLayers },
      };
      return commitActiveProject(s, next);
    }),

  updateGuyLayerSector: (id, sector, patch) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const vm = s.project.verticalMast ?? createInitialVerticalMastState();
      const guyLayers = vm.guyLayers.map((g) => {
        if (g.id !== id) return g;
        const prevSector = g.sectors[sector];
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
        const sectors = {
          ...g.sectors,
          [sector]: nextSector,
        };
        const status = deriveGuyLayerStatusFromSectors(sectors);
        return {
          ...g,
          sectors,
          status,
          installedDate: status !== 'not_started' ? g.installedDate || today : undefined,
          verifiedDate:
            status === 'tensioned_verified' ? g.verifiedDate || today : undefined,
        };
      });
      const next: MastProjectState = {
        ...s.project,
        lastUpdated: today,
        verticalMast: { ...vm, guyLayers },
      };
      return commitActiveProject(s, next);
    }),

  toggleGuyLayerSectorInstalled: (id, sector) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const vm = s.project.verticalMast ?? createInitialVerticalMastState();
      const guyLayers = vm.guyLayers.map((g) => {
        if (g.id !== id) return g;
        const prev = g.sectors[sector];
        const currentlyInstalled = Boolean(prev.terminated || prev.tensioned);
        const nextSector: GuySectorProgress = currentlyInstalled
          ? { ...prev, pulled: false, terminated: false, tensioned: false }
          : { ...prev, pulled: true, terminated: true };
        const sectors = { ...g.sectors, [sector]: nextSector };
        const status = deriveGuyLayerStatusFromSectors(sectors);
        return {
          ...g,
          sectors,
          status,
          installedDate: status !== 'not_started' ? g.installedDate || today : undefined,
          verifiedDate:
            status === 'tensioned_verified' ? g.verifiedDate || today : undefined,
        };
      });
      return commitActiveProject(s, {
        ...s.project,
        lastUpdated: today,
        verticalMast: { ...vm, guyLayers },
      });
    }),

  toggleGuyLayerAllTensioned: (id) =>
    set((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const vm = s.project.verticalMast ?? createInitialVerticalMastState();
      const guyLayers = vm.guyLayers.map((g) => {
        if (g.id !== id) return g;
        const allTensioned = (['I', 'II', 'III'] as const).every(
          (k) => g.sectors[k].tensioned
        );
        const sectors = allTensioned
          ? {
              I: { ...g.sectors.I, pulled: true, terminated: true, tensioned: false },
              II: { ...g.sectors.II, pulled: true, terminated: true, tensioned: false },
              III: { ...g.sectors.III, pulled: true, terminated: true, tensioned: false },
            }
          : {
              I: { ...g.sectors.I, pulled: true, terminated: true, tensioned: true },
              II: { ...g.sectors.II, pulled: true, terminated: true, tensioned: true },
              III: { ...g.sectors.III, pulled: true, terminated: true, tensioned: true },
            };
        const status = deriveGuyLayerStatusFromSectors(sectors);
        return {
          ...g,
          sectors,
          status,
          installedDate: status !== 'not_started' ? g.installedDate || today : undefined,
          verifiedDate:
            status === 'tensioned_verified' ? g.verifiedDate || today : undefined,
        };
      });
      return commitActiveProject(s, {
        ...s.project,
        lastUpdated: today,
        verticalMast: { ...vm, guyLayers },
      });
    }),

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
  };
});

