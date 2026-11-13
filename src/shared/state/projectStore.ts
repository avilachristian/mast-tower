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
import type {
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
  HaulingLogEntry,
  MastProjectState,
  ReportDetailsSpec,
  SavedProjectRecord,
  ScheduleActivityItem,
  SiteEquipmentItem,
} from '@/entities/project/types';

const LEGACY_STORAGE_KEY = 'mast2-tower-report-generator-v1';
const WORKSPACE_STORAGE_KEY = 'mast2-tower-projects-workspace-v1';

export interface CreateProjectOptions {
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
        ? parsed.projects.filter((p) => p && p.id && isValidProjectState(p.state))
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
  loadSampleData: () => void;
  resetCleanBaseline: () => void;
  importProjectJson: (jsonText: string) => void;
  exportProjectJson: () => string;
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
      const base =
        options.template === 'sample'
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

  loadSampleData: () =>
    set((s) => commitActiveProject(s, createSampleMast2Project())),

  resetCleanBaseline: () =>
    set((s) => commitActiveProject(s, createCleanBaselineProject())),

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
  };
});

