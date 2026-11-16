import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  Layers,
  Loader2,
  LogOut,
  Menu,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  resolveHaulingRateConfig,
} from '@/entities/project/haulingInventory';
import {
  computeCivilWorksPayrollPreview,
  computeHaulerPayrollPreview,
  getPayrollPeriodBounds,
  resolveManpowerRoster,
} from '@/entities/project/manpowerPayroll';
import { computeVerticalMastMetrics } from '@/entities/project/verticalMastCalculations';
import { apiClient } from '@/shared/api/client';
import { todayLocalIso } from '@/shared/lib/dateUtils';
import { navigateTo } from '@/shared/lib/router';
import { usePwaStore } from '@/shared/pwa/pwaManager';
import { useAuthStore } from '@/shared/state/authStore';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
import { useStorageQuotaStore } from '@/shared/state/storageQuotaStore';
import { useUiStore } from '@/shared/state/uiStore';
import {
  doesRecordNeedSync,
  hydrateCloudWorkspace,
  initializeCloudSync,
  resolveConflictOverwriteCloud,
  resolveConflictUseCloud,
  syncPendingChangesForClientPreview,
  useCloudSyncStore,
} from '@/shared/storage/cloudSync';
import { PwaStatusBanner } from '@/widgets/pwa/PwaStatusBanner';
import {
  CloudSyncControls,
  CloudSyncPanel,
} from '@/widgets/storage/CloudSyncControls';
import {
  R2StorageAlertBanner,
  R2StorageHeaderPill,
} from '@/widgets/storage/R2StorageStatusBadge';
import type { PayrollSheetData } from '@/widgets/manpower/PayrollPrintModal';

const ProjectLauncherView = lazy(() =>
  import('@/widgets/projects/ProjectLauncherView').then((m) => ({
    default: m.ProjectLauncherView,
  }))
);
const VerticalMastStatusView = lazy(() =>
  import('@/widgets/mast-tower/VerticalMastStatusView').then((m) => ({
    default: m.VerticalMastStatusView,
  }))
);
const ProjectStatusView = lazy(() =>
  import('@/widgets/project-status/ProjectStatusView').then((m) => ({
    default: m.ProjectStatusView,
  }))
);
const ProjectReportDetailsPanel = lazy(() =>
  import('@/widgets/project-details/ProjectReportDetailsPanel').then((m) => ({
    default: m.ProjectReportDetailsPanel,
  }))
);
const HaulingInventoryView = lazy(() =>
  import('@/widgets/hauling/HaulingInventoryView').then((m) => ({
    default: m.HaulingInventoryView,
  }))
);
const DailyLogsView = lazy(() =>
  import('@/widgets/daily-logs/DailyLogsView').then((m) => ({
    default: m.DailyLogsView,
  }))
);
const ManpowerView = lazy(() =>
  import('@/widgets/manpower/ManpowerView').then((m) => ({
    default: m.ManpowerView,
  }))
);
const VerticalMastInspectionView = lazy(() =>
  import('@/widgets/mast-tower/VerticalMastInspectionView').then((m) => ({
    default: m.VerticalMastInspectionView,
  }))
);
const FoundationInspectionView = lazy(() =>
  import('@/widgets/inspection/FoundationInspectionView').then((m) => ({
    default: m.FoundationInspectionView,
  }))
);
const VerticalMastActivityView = lazy(() =>
  import('@/widgets/mast-tower/VerticalMastActivityView').then((m) => ({
    default: m.VerticalMastActivityView,
  }))
);
const FoundationActivityReportView = lazy(() =>
  import('@/widgets/report/FoundationActivityReportView').then((m) => ({
    default: m.FoundationActivityReportView,
  }))
);
const OverallVerticalMastStatusPrintModal = lazy(() =>
  import('@/widgets/mast-tower/OverallVerticalMastStatusPrintModal').then((m) => ({
    default: m.OverallVerticalMastStatusPrintModal,
  }))
);
const OverallProjectStatusPrintModal = lazy(() =>
  import('@/widgets/project-status/OverallProjectStatusPrintModal').then((m) => ({
    default: m.OverallProjectStatusPrintModal,
  }))
);
const VerticalMastActivityPrintModal = lazy(() =>
  import('@/widgets/mast-tower/VerticalMastActivityPrintModal').then((m) => ({
    default: m.VerticalMastActivityPrintModal,
  }))
);
const PrintableReportModal = lazy(() =>
  import('@/widgets/report/PrintableReportModal').then((m) => ({
    default: m.PrintableReportModal,
  }))
);
const VerticalMastInspectionPrintModal = lazy(() =>
  import('@/widgets/mast-tower/VerticalMastInspectionPrintModal').then((m) => ({
    default: m.VerticalMastInspectionPrintModal,
  }))
);
const InspectionPrintModal = lazy(() =>
  import('@/widgets/inspection/InspectionPrintModal').then((m) => ({
    default: m.InspectionPrintModal,
  }))
);
const DailyLogPrintModal = lazy(() =>
  import('@/widgets/daily-logs/DailyLogPrintModal').then((m) => ({
    default: m.DailyLogPrintModal,
  }))
);
const PayrollPrintModal = lazy(() =>
  import('@/widgets/manpower/PayrollPrintModal').then((m) => ({
    default: m.PayrollPrintModal,
  }))
);
const VerticalMastOrderModal = lazy(() =>
  import('@/widgets/mast-tower/VerticalMastOrderModal').then((m) => ({
    default: m.VerticalMastOrderModal,
  }))
);
const ClientVisibilityModal = lazy(() =>
  import('@/widgets/projects/ClientVisibilityModal').then((m) => ({
    default: m.ClientVisibilityModal,
  }))
);
const ConflictDiffModal = lazy(() =>
  import('@/widgets/storage/ConflictDiffModal').then((m) => ({
    default: m.ConflictDiffModal,
  }))
);
const GlobalSearchModal = lazy(() =>
  import('@/widgets/search/GlobalSearchModal').then((m) => ({
    default: m.GlobalSearchModal,
  }))
);
const PhotoGalleryModal = lazy(() =>
  import('@/widgets/gallery/PhotoGalleryModal').then((m) => ({
    default: m.PhotoGalleryModal,
  }))
);
import type { SearchResultItem } from '@/shared/search/globalProjectSearch';

function WorkspaceTabFallback() {
  return (
    <div className="min-h-[260px] flex items-center justify-center p-6">
      <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-500">
        <div className="w-4 h-4 rounded-full border-2 border-sky-600 border-t-transparent animate-spin" />
        <span>Loading module...</span>
      </div>
    </div>
  );
}

export function AdminWorkspace() {
  const {
    projects,
    activeProjectId,
    project,
    selectedFoundationId,
    selectFoundation,
    switchProject,
    setProjectPhase,
    updateReportDetails,
    resetCleanBaseline,
    exportProjectJson,
    importProjectJson,
  } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      activeProjectId: s.activeProjectId,
      project: s.project,
      selectedFoundationId: s.selectedFoundationId,
      selectFoundation: s.selectFoundation,
      switchProject: s.switchProject,
      setProjectPhase: s.setProjectPhase,
      updateReportDetails: s.updateReportDetails,
      resetCleanBaseline: s.resetCleanBaseline,
      exportProjectJson: s.exportProjectJson,
      importProjectJson: s.importProjectJson,
    }))
  );

  const authUser = useAuthStore((s) => s.user);
  const offlineCached = useAuthStore((s) => s.offlineCached);
  const logout = useAuthStore((s) => s.logout);
  const conflictProjectId = useCloudSyncStore((s) => s.conflictProjectId);
  const conflictServerRecord = useCloudSyncStore((s) => s.conflictServerRecord);
  const [showConflictDiff, setShowConflictDiff] = useState(false);
  const [fetchingConflictServer, setFetchingConflictServer] = useState(false);
  const syncError = useCloudSyncStore((s) => s.lastError);
  const pendingDeleteCount = useCloudSyncStore((s) => s.pendingDeleteIds.length);
  const r2StatusLevel = useStorageQuotaStore((s) => s.status?.level);
  const [clientModalProjectId, setClientModalProjectId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openingClientView, setOpeningClientView] = useState(false);
  const activeRecord = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  );
  const hasUnsyncedProjects = useMemo(
    () => projects.some((p) => doesRecordNeedSync(p)),
    [projects]
  );

  const localConflictRecord = useMemo(() => {
    if (!conflictProjectId) return null;
    const rec = projects.find((p) => p.id === conflictProjectId);
    if (!rec) return null;
    if (activeProjectId === conflictProjectId) {
      return {
        ...rec,
        state: project,
      };
    }
    return rec;
  }, [conflictProjectId, projects, activeProjectId, project]);

  const handleOpenConflictDiff = async () => {
    if (!conflictProjectId) return;
    if (conflictServerRecord) {
      setShowConflictDiff(true);
      return;
    }
    setFetchingConflictServer(true);
    try {
      const res = await apiClient.getAdminProject(conflictProjectId);
      if (res.project) {
        useCloudSyncStore.getState().setStatePatch({ conflictServerRecord: res.project });
        setShowConflictDiff(true);
      }
    } catch {
      useFeedbackStore.getState().pushToast({
        tone: 'error',
        message: 'Could not fetch server copy for comparison.',
      });
    } finally {
      setFetchingConflictServer(false);
    }
  };

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [photoGalleryInitialId, setPhotoGalleryInitialId] = useState<string | undefined>(undefined);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectSearchResult = (item: SearchResultItem) => {
    if (item.navigation.phase && item.navigation.phase !== (project.projectType ?? 'foundation')) {
      setProjectPhase(item.navigation.phase);
    }
    if (item.navigation.foundationId) {
      selectFoundation(item.navigation.foundationId);
    }
    if (item.navigation.manpowerSubTab) {
      setManpowerSubTab(item.navigation.manpowerSubTab);
    }
    if (item.navigation.manpowerMode) {
      setManpowerPaymentMode(item.navigation.manpowerMode);
    }
    if (item.category === 'photos' && item.navigation.photoId) {
      setPhotoGalleryInitialId(item.navigation.photoId);
      setPhotoGalleryOpen(true);
      return;
    }
    setActiveAppTab(item.navigation.tab);
  };

  const {
    activeAppTab,
    setActiveAppTab,
    projectBrowserOpen,
    setProjectBrowserOpen,
    reportOpen,
    setReportOpen,
    inspectionReportOpen,
    setInspectionReportOpen,
    overallReportOpen,
    setOverallReportOpen,
    dailyLogPrintId,
    setDailyLogPrintId,
    selectedMastTarget,
    manpowerPaymentMode,
    setManpowerSubTab,
    setManpowerPaymentMode,
    payrollPrintTarget,
    setPayrollPrintTarget,
    hasOrderViolation,
    adminUiStyle,
    setAdminUiStyle,
  } = useUiStore(
    useShallow((s) => ({
      activeAppTab: s.activeAppTab,
      setActiveAppTab: s.setActiveAppTab,
      projectBrowserOpen: s.projectBrowserOpen,
      setProjectBrowserOpen: s.setProjectBrowserOpen,
      reportOpen: s.reportOpen,
      setReportOpen: s.setReportOpen,
      inspectionReportOpen: s.inspectionReportOpen,
      setInspectionReportOpen: s.setInspectionReportOpen,
      overallReportOpen: s.overallReportOpen,
      setOverallReportOpen: s.setOverallReportOpen,
      dailyLogPrintId: s.dailyLogPrintId,
      setDailyLogPrintId: s.setDailyLogPrintId,
      selectedMastTarget: s.selectedMastTarget,
      manpowerPaymentMode: s.manpowerPaymentMode,
      setManpowerSubTab: s.setManpowerSubTab,
      setManpowerPaymentMode: s.setManpowerPaymentMode,
      payrollPrintTarget: s.payrollPrintTarget,
      setPayrollPrintTarget: s.setPayrollPrintTarget,
      hasOrderViolation: Boolean(
        s.mastOrderViolation || s.foundationOrderViolation
      ),
      adminUiStyle: s.adminUiStyle,
      setAdminUiStyle: s.setAdminUiStyle,
    }))
  );
  const showAlert = useFeedbackStore((s) => s.showAlert);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);

  const isVerticalMast = project.projectType === 'vertical_mast';
  const updateAvailable = usePwaStore((s) => s.updateAvailable);
  const isUpdating = usePwaStore((s) => s.isUpdating);
  const applyUpdate = usePwaStore((s) => s.applyUpdate);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeCloudSync();
    void hydrateCloudWorkspace();
  }, []);

  const selectedFoundation = useMemo(
    () =>
      project.foundations.find((f) => f.id === selectedFoundationId) ??
      project.foundations[0],
    [project.foundations, selectedFoundationId]
  );

  const completedCount = useMemo(
    () => project.foundations.filter((f) => f.status === 'completed').length,
    [project.foundations]
  );

  const verticalMastMetrics = useMemo(
    () => computeVerticalMastMetrics(project),
    [project]
  );

  const activePrintDailyLog = useMemo(
    () =>
      dailyLogPrintId
        ? project.dailyLogs.find((l) => l.id === dailyLogPrintId) ?? project.dailyLogs[0]
        : null,
    [dailyLogPrintId, project.dailyLogs]
  );

  const manpowerRoster = useMemo(() => resolveManpowerRoster(project), [project]);

  const activePayrollPrintData = useMemo<PayrollSheetData | null>(() => {
    if (!payrollPrintTarget) return null;
    if (payrollPrintTarget.kind === 'civil') {
      const saved = payrollPrintTarget.snapshotId
        ? project.civilPayrollHistory?.find(
            (s) => s.id === payrollPrintTarget.snapshotId
          )
        : undefined;
      if (saved) return { kind: 'civil', snapshot: saved };

      const dates = (project.civilAttendance ?? []).map((a) => a.date);
      const todayIso = todayLocalIso();
      const bounds = getPayrollPeriodBounds('overall', todayIso, dates);
      const preview = computeCivilWorksPayrollPreview(
        manpowerRoster,
        project.civilAttendance ?? [],
        bounds.startDate,
        bounds.endDate
      );
      return {
        kind: 'civil',
        snapshot: {
          id: 'live-overall',
          periodType: 'overall',
          startDate: bounds.startDate,
          endDate: bounds.endDate,
          title: bounds.label,
          items: preview.rows.filter((r) => r.daysPresent > 0),
          totalDaysWorked: preview.totalDaysWorked,
          totalGrossPayPhp: preview.totalGrossPayPhp,
          totalDeductionPhp: preview.totalDeductionPhp,
          totalNetPayPhp: preview.totalNetPayPhp,
          totalAmountPhp: preview.totalAmountPhp,
          status: 'generated',
          createdAt: new Date().toISOString(),
        },
      };
    }

    const saved = payrollPrintTarget.snapshotId
      ? project.haulerPayrollHistory?.find(
          (s) => s.id === payrollPrintTarget.snapshotId
        )
      : undefined;
    if (saved) return { kind: 'hauler', snapshot: saved };

    const dates = [
      ...project.haulingLogs.map((l) => l.date),
      ...(project.haulerPayouts ?? []).map((p) => p.date),
    ];
    const todayIso = todayLocalIso();
    const bounds = getPayrollPeriodBounds('overall', todayIso, dates);
    const rateConfig = resolveHaulingRateConfig(project);
    const preview = computeHaulerPayrollPreview(
      project.haulingLogs,
      project.haulerPayouts ?? [],
      manpowerRoster,
      bounds.startDate,
      bounds.endDate,
      'overall',
      rateConfig
    );
    return {
      kind: 'hauler',
      snapshot: {
        id: 'live-overall',
        periodType: 'overall',
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        title: bounds.label,
        items: preview.rows,
        totalHauledKg: preview.totalHauledKg,
        totalCredits: preview.totalCredits,
        totalEarnedPhp: preview.totalEarnedPhp,
        totalDeductionPhp: preview.totalDeductionPhp,
        totalPayoutPhp: preview.totalSuggestedPayoutPhp,
        creditBlockKg: rateConfig.creditBlockKg,
        ratePerBlockPhp: rateConfig.ratePerBlockPhp,
        status: 'generated',
        createdAt: new Date().toISOString(),
      },
    };
  }, [payrollPrintTarget, project, manpowerRoster]);

  const anyPrintModalOpen =
    reportOpen ||
    inspectionReportOpen ||
    overallReportOpen ||
    Boolean(activePrintDailyLog) ||
    Boolean(activePayrollPrintData);

  const handleExportJson = () => {
    const json = exportProjectJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const displayName =
      project.reportDetails?.projectName?.trim() || project.projectName || 'mast-project';
    const slug =
      displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'mast-project';
    a.href = url;
    a.download = `${slug}-${project.lastUpdated}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      importProjectJson(text);
    } catch (err) {
      await showAlert({
        tone: 'danger',
        title: 'Import Failed',
        message: err instanceof Error ? err.message : 'Failed to import JSON.',
      });
    } finally {
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const isOffline =
    offlineCached || (typeof navigator !== 'undefined' && navigator.onLine === false);
  const mobileMenuDotTone =
    conflictProjectId || r2StatusLevel === 'blocked' || syncError
      ? 'bg-rose-500'
      : isOffline ||
          hasUnsyncedProjects ||
          pendingDeleteCount > 0 ||
          r2StatusLevel === 'warning'
        ? 'bg-amber-500'
        : updateAvailable
          ? 'bg-emerald-500'
          : null;

  const handleOpenReport = () => {
    if (activeAppTab === 'project_status') {
      setOverallReportOpen(true);
    } else if (activeAppTab === 'daily_logs' && project.dailyLogs[0]) {
      setDailyLogPrintId(project.dailyLogs[0].id);
    } else if (activeAppTab === 'inspection') {
      setInspectionReportOpen(true);
    } else if (activeAppTab === 'manpower') {
      setPayrollPrintTarget({
        kind: manpowerPaymentMode === 'hauler' ? 'hauler' : 'civil',
      });
    } else {
      setReportOpen(true);
    }
  };

  const handleResetAll = async () => {
    const confirmed = await requestConfirm({
      tone: 'danger',
      title: 'Reset All Project Data?',
      message:
        'Reset all foundation & vertical mast progress, photos, daily logs, and material inputs?',
      confirmLabel: 'Reset All',
    });
    if (confirmed) {
      resetCleanBaseline();
    }
  };

  const handleOpenClientView = async () => {
    if (openingClientView) return;
    setOpeningClientView(true);
    try {
      await syncPendingChangesForClientPreview(activeProjectId);
    } finally {
      setOpeningClientView(false);
      setMobileMenuOpen(false);
    }
    navigateTo('/');
  };

  const isSwiss = adminUiStyle === 'swiss';
  const projectDisplayName =
    project.reportDetails?.projectName?.trim() || project.projectName;
  const activeManpowerCount = useMemo(
    () => manpowerRoster.filter((m) => m.active).length,
    [manpowerRoster]
  );

  const handleSelectPhase = (phase: 'foundation' | 'vertical_mast') => {
    setProjectPhase(phase);
    setReportOpen(false);
    setInspectionReportOpen(false);
    setOverallReportOpen(false);
  };

  const workspaceTabs = useMemo(
    () => [
      {
        id: 'project_status' as const,
        num: '01',
        label: 'Project Status',
        mobileTitle: 'Project Status',
        Icon: BarChart3,
        badge: undefined as number | undefined,
        mobileBadgeBg: '',
      },
      {
        id: 'activity' as const,
        num: '02',
        label: isVerticalMast ? '2D Erection & Layout' : '2D Activity',
        mobileTitle: isVerticalMast ? '2D Erection & Layout' : '2D Activity',
        Icon: Layers,
        badge: undefined as number | undefined,
        mobileBadgeBg: '',
      },
      {
        id: 'inspection' as const,
        num: '03',
        label: isVerticalMast ? 'Tower Inspection' : 'Foundation Inspection',
        mobileTitle: isVerticalMast ? 'Tower Inspection' : 'Foundation Inspection',
        Icon: ClipboardCheck,
        badge: undefined as number | undefined,
        mobileBadgeBg: '',
      },
      {
        id: 'hauling_inventory' as const,
        num: '04',
        label: 'Hauling & Inventory',
        mobileTitle: `Hauling & Inventory (${project.haulingLogs.length})`,
        Icon: Truck,
        badge: project.haulingLogs.length > 0 ? project.haulingLogs.length : undefined,
        mobileBadgeBg: isSwiss ? 'bg-neutral-950' : 'bg-amber-600',
      },
      {
        id: 'daily_logs' as const,
        num: '05',
        label: 'Daily Logs',
        mobileTitle: `Daily Logs (${project.dailyLogs.length})`,
        Icon: ClipboardList,
        badge: project.dailyLogs.length,
        mobileBadgeBg: isSwiss ? 'bg-neutral-950' : 'bg-sky-600',
      },
      {
        id: 'manpower' as const,
        num: '06',
        label: 'Manpower',
        mobileTitle: 'Manpower & Payroll',
        Icon: Users,
        badge: manpowerRoster.length > 0 ? activeManpowerCount : undefined,
        mobileBadgeBg: '',
      },
      {
        id: 'project_details' as const,
        num: '07',
        label: 'Project Details',
        mobileTitle: 'Project Details',
        Icon: Building2,
        badge: undefined as number | undefined,
        mobileBadgeBg: '',
      },
    ],
    [
      isVerticalMast,
      project.haulingLogs.length,
      project.dailyLogs.length,
      manpowerRoster.length,
      activeManpowerCount,
      isSwiss,
    ]
  );

  const alertsBanner = (
    <div className={`print:hidden ${isSwiss ? 'px-4 sm:px-8 lg:px-10 pt-3' : 'max-w-7xl px-3 sm:px-4 pt-2'} w-full mx-auto space-y-2 empty:hidden`}>
      <R2StorageAlertBanner />

      {conflictProjectId && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Cloud Sync Conflict:</strong> Another device saved a newer version of this project while you were editing.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleOpenConflictDiff()}
              disabled={fetchingConflictServer}
              className="px-2.5 py-1 rounded-md border border-amber-400 bg-amber-100 hover:bg-amber-200 font-semibold cursor-pointer text-amber-900 disabled:opacity-50"
            >
              {fetchingConflictServer ? 'Loading...' : 'Review Differences'}
            </button>
            <button
              type="button"
              onClick={() => void resolveConflictUseCloud()}
              className="px-2.5 py-1 rounded-md border border-amber-300 bg-white hover:bg-amber-100 font-semibold cursor-pointer"
            >
              Use Cloud Copy
            </button>
            <button
              type="button"
              onClick={() => void resolveConflictOverwriteCloud()}
              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
            >
              Keep My Local Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const mainContentElement = (
    <main className={`flex-1 ${!projectBrowserOpen ? 'pb-20 md:pb-0' : ''} ${anyPrintModalOpen ? 'print:hidden' : ''}`}>
      <Suspense fallback={<WorkspaceTabFallback />}>
        {projectBrowserOpen ? (
          <ProjectLauncherView onClose={() => setProjectBrowserOpen(false)} />
        ) : activeAppTab === 'project_status' ? (
          isVerticalMast ? (
            <VerticalMastStatusView />
          ) : (
            <ProjectStatusView project={project} />
          )
        ) : activeAppTab === 'project_details' ? (
          <ProjectReportDetailsPanel
            project={project}
            onChange={(patch) => updateReportDetails(patch)}
            onOpenReport={() => setReportOpen(true)}
          />
        ) : activeAppTab === 'hauling_inventory' ? (
          <HaulingInventoryView />
        ) : activeAppTab === 'daily_logs' ? (
          <DailyLogsView project={project} foundations={project.foundations} />
        ) : activeAppTab === 'manpower' ? (
          <ManpowerView />
        ) : activeAppTab === 'inspection' ? (
          isVerticalMast ? (
            <VerticalMastInspectionView />
          ) : (
            selectedFoundation && (
              <FoundationInspectionView
                project={project}
                selectedFoundation={selectedFoundation}
              />
            )
          )
        ) : isVerticalMast ? (
          <VerticalMastActivityView />
        ) : (
          selectedFoundation && (
            <FoundationActivityReportView
              project={project}
              selectedFoundation={selectedFoundation}
            />
          )
        )}
      </Suspense>
    </main>
  );

  return (
    <div
      className={`min-h-dvh flex flex-col ${
        isSwiss ? 'bg-[#F7F6F2] text-neutral-900' : 'bg-slate-50 text-slate-900'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleImportFile}
        className="hidden"
      />

      {isSwiss ? (
        <>
          {/* Compact Swiss Mobile / Tablet Top Header (< lg) */}
          <header className="lg:hidden print:hidden sticky top-0 z-30 bg-[#F2F0EA] text-neutral-900 border-b border-stone-300">
            <div className="min-h-14 py-1.5 px-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setProjectBrowserOpen(!projectBrowserOpen)}
                  title="Open Project Browser & Launcher"
                  aria-label="Open Project Browser & Launcher"
                  className="inline-flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-white text-[11px] font-mono uppercase tracking-wider cursor-pointer shrink-0"
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>{projects.length}</span>
                </button>

                {projects.length > 1 && !projectBrowserOpen ? (
                  <select
                    aria-label="Switch Active Project"
                    value={activeProjectId}
                    onChange={(e) => switchProject(e.target.value)}
                    className="flex-1 min-w-0 max-w-full sm:max-w-[300px] min-h-10 truncate border border-stone-400 bg-[#F7F6F2] px-2.5 py-1.5 text-xs font-bold text-neutral-950 focus:border-neutral-950 focus:outline-none cursor-pointer"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.state.reportDetails?.projectName?.trim() || p.state.projectName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <h1 className="text-xs sm:text-sm font-bold tracking-tight text-neutral-950 truncate">
                    {projectDisplayName}
                  </h1>
                )}

                {!projectBrowserOpen && (
                  <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 border border-stone-300 bg-[#F7F6F2] text-[10px] font-mono text-neutral-700 shrink-0 tabular-nums">
                    <span>Found: {completedCount}/{project.foundations.length}</span>
                    <span className="text-stone-400">·</span>
                    <span>
                      Mast: {verticalMastMetrics ? `${verticalMastMetrics.erectedSections}/${verticalMastMetrics.totalSections}` : '0/41'}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setGlobalSearchOpen(true)}
                  aria-label="Search project"
                  title="Search project (Ctrl+K)"
                  className="inline-flex items-center justify-center min-h-10 min-w-10 px-2.5 py-2 border border-stone-400 bg-white hover:border-neutral-950 text-neutral-900 text-[11px] font-mono uppercase tracking-wider transition cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoGalleryInitialId(undefined);
                    setPhotoGalleryOpen(true);
                  }}
                  aria-label="Open photo gallery"
                  title="Project Photo Gallery"
                  className="inline-flex items-center justify-center min-h-10 min-w-10 px-2.5 py-2 border border-stone-400 bg-white hover:border-neutral-950 text-neutral-900 text-[11px] font-mono uppercase tracking-wider transition cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close workspace menu' : 'Open workspace menu'}
                title="Workspace menu, Cloud Sync & Tools"
                className="relative inline-flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 border border-stone-400 bg-white hover:border-neutral-950 text-neutral-900 text-[11px] font-mono uppercase tracking-wider transition cursor-pointer shrink-0"
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                <span className="hidden sm:inline">Menu</span>
                {mobileMenuDotTone && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white ${mobileMenuDotTone}`}
                  />
                )}
              </button>
            </div>
            </div>

            {!projectBrowserOpen && (
              <nav className="px-3 pb-2 pt-1.5 border-t border-stone-300 bg-[#F7F6F2] flex flex-col md:flex-row md:flex-wrap md:items-center gap-1.5">
                <div
                  role="group"
                  aria-label="Project Phase Toggle"
                  className="md:order-last md:ml-auto grid grid-cols-2 md:inline-flex items-center border border-stone-400 bg-white p-0.5 text-[11px] font-mono uppercase"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectPhase('foundation')}
                    className={`min-h-9 md:min-h-0 px-2.5 py-1 text-center cursor-pointer transition ${
                      !isVerticalMast ? 'bg-neutral-950 text-white font-bold' : 'text-neutral-600 hover:text-neutral-950'
                    }`}
                  >
                    Foundation
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPhase('vertical_mast')}
                    className={`min-h-9 md:min-h-0 px-2.5 py-1 text-center cursor-pointer transition ${
                      isVerticalMast ? 'bg-neutral-950 text-white font-bold' : 'text-neutral-600 hover:text-neutral-950'
                    }`}
                  >
                    Vertical Mast
                  </button>
                </div>

                <div className="hidden md:flex items-center gap-1 flex-wrap text-[11px] font-mono uppercase">
                  {workspaceTabs.map((tab) => {
                    const active = activeAppTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveAppTab(tab.id)}
                        className={`px-2 py-1 inline-flex items-center gap-1.5 transition cursor-pointer ${
                          active
                            ? 'bg-neutral-950 text-white font-bold'
                            : 'border border-stone-300 bg-white text-neutral-700 hover:border-neutral-950'
                        }`}
                      >
                        <span>{tab.num} · {tab.label}</span>
                        {tab.badge !== undefined && (
                          <span className="opacity-75 text-[10px]">({tab.badge})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>
            )}
          </header>

          {/* Layout A · Sticky Left Architectural Rail (lg+) + Stone Workspace Canvas */}
          <div className="flex-1 lg:grid lg:grid-cols-12 lg:items-start">
            <aside className="hidden lg:flex lg:col-span-3 bg-[#F2F0EA] border-r border-stone-300 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto p-5 xl:p-6 flex-col justify-between gap-6 print:hidden">
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  <span className="truncate">Admin // Field Console</span>
                  <span
                    className={`shrink-0 font-bold ${
                      activeRecord?.clientSettings?.enabled ? 'text-emerald-700' : 'text-neutral-500'
                    }`}
                  >
                    {activeRecord?.clientSettings?.enabled ? 'Client Live' : 'Private'}
                  </span>
                </div>

                {/* Active Project Switcher */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                      Active Project ({projects.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setProjectBrowserOpen(!projectBrowserOpen)}
                      className="text-[10px] font-mono uppercase tracking-wider underline underline-offset-4 text-neutral-800 hover:text-neutral-950 cursor-pointer"
                    >
                      {projectBrowserOpen ? 'Back to Editor' : 'All Projects'}
                    </button>
                  </div>

                  {projects.length > 1 && !projectBrowserOpen ? (
                    <select
                      aria-label="Switch Active Project"
                      value={activeProjectId}
                      onChange={(e) => switchProject(e.target.value)}
                      className="w-full rounded-none border border-stone-400 bg-[#F7F6F2] px-2.5 py-1.5 text-xs font-bold text-neutral-950 focus:border-neutral-950 focus:outline-none cursor-pointer"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.state.reportDetails?.projectName?.trim() || p.state.projectName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <h1 className="text-lg font-bold tracking-tight text-neutral-950 leading-snug">
                      {projectDisplayName}
                    </h1>
                  )}

                  {!projectBrowserOpen && (
                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px] font-mono text-neutral-600 tabular-nums">
                      <span>
                        Found:{' '}
                        <strong className={!isVerticalMast ? 'text-neutral-950' : ''}>
                          {completedCount}/{project.foundations.length}
                        </strong>
                      </span>
                      <span>
                        Mast:{' '}
                        <strong className={isVerticalMast ? 'text-neutral-950' : ''}>
                          {verticalMastMetrics
                            ? `${verticalMastMetrics.erectedSections}/${verticalMastMetrics.totalSections}`
                            : '0/41'}
                        </strong>{' '}
                        Sec
                      </span>
                    </div>
                  )}
                </div>

                {/* Engineering Phase Toggle */}
                {!projectBrowserOpen && (
                  <div className="space-y-1.5 pt-3 border-t border-stone-300">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                      Engineering Phase
                    </div>
                    <div
                      role="group"
                      aria-label="Project Phase Toggle"
                      className="grid grid-cols-2 border border-stone-400 bg-[#F7F6F2] p-0.5 text-[11px] font-mono uppercase"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectPhase('foundation')}
                        className={`py-1.5 text-center transition-colors cursor-pointer ${
                          !isVerticalMast
                            ? 'bg-neutral-950 text-white font-bold'
                            : 'text-neutral-600 hover:text-neutral-950'
                        }`}
                      >
                        Foundation
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPhase('vertical_mast')}
                        className={`py-1.5 text-center transition-colors cursor-pointer ${
                          isVerticalMast
                            ? 'bg-neutral-950 text-white font-bold'
                            : 'text-neutral-600 hover:text-neutral-950'
                        }`}
                      >
                        Vert. Mast
                      </button>
                    </div>
                  </div>
                )}

                {/* 01..07 Module Navigation */}
                {!projectBrowserOpen && (
                  <nav className="space-y-1 pt-3 border-t border-stone-300 text-[11px] font-mono uppercase tracking-wider">
                    <div className="text-[10px] text-neutral-500 mb-1.5">Modules</div>
                    {workspaceTabs.map((tab) => {
                      const active = activeAppTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveAppTab(tab.id)}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-neutral-950 text-white font-bold'
                              : 'text-neutral-700 hover:bg-stone-200/70 hover:text-neutral-950'
                          }`}
                        >
                          <span className="truncate">{tab.num} · {tab.label}</span>
                          {tab.badge !== undefined && (
                            <span className="text-[10px] opacity-75 shrink-0 tabular-nums">
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                )}

                {/* Cloud Sync, Client Share & Workspace Tools */}
                <div className="pt-3 border-t border-stone-300 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    Sync &amp; Output
                  </div>

                  <CloudSyncControls inlinePanel />
                  <R2StorageHeaderPill showAlways />

                  {updateAvailable && (
                    <button
                      type="button"
                      onClick={() => void applyUpdate()}
                      disabled={isUpdating}
                      className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-mono uppercase tracking-wider inline-flex items-center justify-between gap-2 cursor-pointer disabled:opacity-70"
                    >
                      <span>{isUpdating ? 'Updating App...' : 'Update Available'}</span>
                      <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                    </button>
                  )}

                  {!projectBrowserOpen && (
                    <>
                      <button
                        type="button"
                        onClick={() => setGlobalSearchOpen(true)}
                        className="w-full py-1.5 px-2.5 border border-stone-300 bg-white text-neutral-800 hover:border-neutral-950 text-[11px] font-mono uppercase tracking-wider inline-flex items-center justify-between gap-2 cursor-pointer transition-colors"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Search className="w-3.5 h-3.5 shrink-0" />
                          <span>Search Records</span>
                        </span>
                        <kbd className="text-[10px] text-neutral-400 font-mono">Ctrl+K</kbd>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPhotoGalleryInitialId(undefined);
                          setPhotoGalleryOpen(true);
                        }}
                        className="w-full py-1.5 px-2.5 border border-stone-300 bg-white text-neutral-800 hover:border-neutral-950 text-[11px] font-mono uppercase tracking-wider inline-flex items-center justify-between gap-2 cursor-pointer transition-colors"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 shrink-0" />
                          <span>Photo Gallery</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenReport}
                        className="w-full py-2 px-3 bg-neutral-950 hover:bg-neutral-800 text-white text-[11px] font-mono uppercase tracking-wider inline-flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span>Open Report PDF</span>
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setClientModalProjectId(activeProjectId)}
                        className={`w-full py-1.5 px-2.5 border text-[11px] font-mono uppercase tracking-wider inline-flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          activeRecord?.clientSettings?.enabled
                            ? 'border-emerald-700 bg-white text-emerald-800 font-bold hover:bg-emerald-50'
                            : 'border-stone-300 bg-white text-neutral-800 hover:border-neutral-950'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span>Client Share</span>
                        </span>
                        <span>{activeRecord?.clientSettings?.enabled ? 'Live' : 'Private'}</span>
                      </button>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={handleExportJson}
                          className="py-1.5 px-2 border border-stone-300 bg-white hover:border-neutral-950 text-[10px] font-mono uppercase text-neutral-800 inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3 shrink-0" />
                          <span>Export</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="py-1.5 px-2 border border-stone-300 bg-white hover:border-neutral-950 text-[10px] font-mono uppercase text-neutral-800 inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3 h-3 shrink-0" />
                          <span>Import</span>
                        </button>
                      </div>
                    </>
                  )}

                  <div className={`grid ${projectBrowserOpen ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5`}>
                    <button
                      type="button"
                      disabled={openingClientView}
                      onClick={() => void handleOpenClientView()}
                      className="py-1.5 px-2 border border-stone-300 bg-white hover:border-neutral-950 disabled:opacity-60 text-[10px] font-mono uppercase text-neutral-800 inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {openingClientView ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      )}
                      <span>{openingClientView ? 'Syncing' : 'Client View'}</span>
                    </button>

                    {!projectBrowserOpen && (
                      <button
                        type="button"
                        onClick={() => void handleResetAll()}
                        className="py-1.5 px-2 border border-stone-300 bg-white hover:border-rose-700 hover:text-rose-700 text-[10px] font-mono uppercase text-neutral-700 inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 shrink-0" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Sticky Left Rail Footer: Persisted UI Style Switch & Sign Out */}
              <div className="pt-4 border-t border-stone-300 space-y-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    Workspace Style
                  </div>
                  <div className="grid grid-cols-2 border border-stone-400 bg-[#F7F6F2] p-0.5 text-[10px] font-mono uppercase">
                    <button
                      type="button"
                      onClick={() => setAdminUiStyle('classic')}
                      className="py-1 text-center text-neutral-600 hover:text-neutral-950 cursor-pointer transition-colors"
                    >
                      Classic
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminUiStyle('swiss')}
                      className="py-1 text-center bg-neutral-950 text-white font-bold cursor-pointer transition-colors"
                    >
                      Layout A
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] font-mono pt-1">
                  <span className="text-neutral-600 truncate">
                    {authUser?.username ?? 'Admin'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="underline underline-offset-4 text-neutral-700 hover:text-rose-700 cursor-pointer shrink-0 inline-flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </aside>

            <div className="lg:col-span-9 min-w-0 flex flex-col">
              {alertsBanner}
              {mainContentElement}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Classic Top Header + Navigation */}
          <header className="print:hidden sticky top-0 z-30 bg-white text-slate-900 border-b border-slate-200">
            <div className="min-h-14 md:min-h-12 py-1.5 md:py-0 px-2.5 sm:px-3 flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setProjectBrowserOpen(!projectBrowserOpen)}
                  title="Open Project Browser & Launcher"
                  aria-label="Open Project Browser & Launcher"
                  className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 min-h-10 sm:min-h-0 px-2.5 py-2 sm:py-1 rounded-lg sm:rounded-md text-xs font-bold transition cursor-pointer shrink-0 ${
                    projectBrowserOpen
                      ? 'bg-sky-700 text-white shadow-xs'
                      : 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs'
                  }`}
                >
                  <FolderKanban className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Projects</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-white/25 text-white text-[10px] font-bold">
                    {projects.length}
                  </span>
                </button>

                {projects.length > 1 && !projectBrowserOpen ? (
                  <select
                    aria-label="Switch Active Project"
                    value={activeProjectId}
                    onChange={(e) => switchProject(e.target.value)}
                    className="flex-1 min-w-0 max-w-full sm:max-w-[300px] min-h-10 sm:min-h-0 truncate rounded-lg sm:rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2.5 py-2 sm:py-1 text-xs sm:text-sm font-bold text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.state.reportDetails?.projectName?.trim() || p.state.projectName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 truncate">
                    {projectDisplayName}
                  </h1>
                )}

                {!projectBrowserOpen && (
                  <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-600 shrink-0">
                    <span className={!isVerticalMast ? 'font-bold text-sky-700' : ''}>
                      Foundation: {completedCount}/{project.foundations.length}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className={isVerticalMast ? 'font-bold text-teal-700' : ''}>
                      Mast: {verticalMastMetrics ? `${verticalMastMetrics.erectedSections}/${verticalMastMetrics.totalSections}` : '0/41'} Sec
                    </span>
                  </span>
                )}
              </div>

              {/* Desktop Controls (>= md) */}
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                {!projectBrowserOpen && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {updateAvailable && (
                      <button
                        type="button"
                        onClick={() => void applyUpdate()}
                        disabled={isUpdating}
                        title="Update to newest app version"
                        aria-label="Update to newest app version"
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs disabled:opacity-70"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                        <span>{isUpdating ? 'Updating...' : 'Update'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenReport}
                      title="Open Report Preview"
                      aria-label="Open Report Preview"
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportJson}
                      title="Export JSON Backup"
                      aria-label="Export JSON Backup"
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Import JSON Backup"
                      aria-label="Import JSON Backup"
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Import</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleResetAll()}
                      title="Reset All"
                      aria-label="Reset All"
                      className="inline-flex items-center justify-center px-2 py-1.5 rounded-md bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-xs text-slate-500 hover:text-rose-600 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Cloud, R2 Quota, Showcase, Style & Auth Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setGlobalSearchOpen(true)}
                    title="Global Search across logs, inspections, payroll & photos (Ctrl+K)"
                    aria-label="Global Project Search"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden lg:inline">Search</span>
                    <kbd className="hidden xl:inline-flex items-center text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                      Ctrl+K
                    </kbd>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPhotoGalleryInitialId(undefined);
                      setPhotoGalleryOpen(true);
                    }}
                    title="Project Photo Gallery & Offline Storage"
                    aria-label="Open Photo Gallery"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden xl:inline">Photos</span>
                  </button>

                  <R2StorageHeaderPill />

                  {!projectBrowserOpen && (
                    <button
                      type="button"
                      onClick={() => setClientModalProjectId(activeProjectId)}
                      title="Configure Client Showcase visibility for active project"
                      aria-label="Client Showcase settings"
                      className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-xs font-semibold transition cursor-pointer ${
                        activeRecord?.clientSettings?.enabled
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">
                        {activeRecord?.clientSettings?.enabled ? 'Client: Live' : 'Client Share'}
                      </span>
                    </button>
                  )}

                  <CloudSyncControls />

                  <button
                    type="button"
                    disabled={openingClientView}
                    onClick={() => void handleOpenClientView()}
                    title="Sync pending edits and open Public Client Showcase Page"
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-700 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    {openingClientView ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span className="hidden lg:inline">
                      {openingClientView ? 'Syncing...' : 'Client View'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminUiStyle('swiss')}
                    title="Switch to Client-Matched Swiss Left-Rail Layout (Layout A)"
                    aria-label="Switch Admin UI Style to Swiss Left-Rail"
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                  >
                    <PanelLeft className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden xl:inline">Layout A</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void logout()}
                    title={`Sign out${authUser ? ` (${authUser.username})` : ''}`}
                    aria-label="Sign out of Admin Workspace"
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-xs font-semibold text-slate-600 hover:text-rose-700 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Mobile Compact Menu Toggle (< md) */}
              <div className="flex md:hidden items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setGlobalSearchOpen(true)}
                  aria-label="Search project"
                  title="Search project (Ctrl+K)"
                  className="inline-flex items-center justify-center min-h-10 min-w-10 px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoGalleryInitialId(undefined);
                    setPhotoGalleryOpen(true);
                  }}
                  aria-label="Open photo gallery"
                  title="Project Photo Gallery"
                  className="inline-flex items-center justify-center min-h-10 min-w-10 px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  aria-expanded={mobileMenuOpen}
                  aria-label={mobileMenuOpen ? 'Close workspace menu' : 'Open workspace menu'}
                  title="Workspace menu, Cloud Sync & Tools"
                  className="relative inline-flex items-center justify-center min-h-10 min-w-10 px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  {mobileMenuDotTone && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white ${mobileMenuDotTone}`}
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Navigation Bar (Phase Toggle on all viewports; Text Tabs on Desktop >= md) */}
            {!projectBrowserOpen && (
              <nav className="px-2.5 sm:px-3 pb-2 bg-slate-50/70 border-t border-slate-100 pt-1.5 flex flex-col md:flex-row md:flex-wrap md:items-center gap-1.5">
                <div
                  role="group"
                  aria-label="Project Phase Toggle"
                  className="md:order-last md:ml-auto grid grid-cols-2 md:inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-xs"
                >
                  <span className="hidden lg:inline px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Phase:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectPhase('foundation')}
                    className={`min-h-9 md:min-h-0 px-2.5 py-1.5 md:py-1 rounded-md text-xs font-semibold transition cursor-pointer text-center ${
                      !isVerticalMast
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Foundation Phase
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPhase('vertical_mast')}
                    className={`min-h-9 md:min-h-0 px-2.5 py-1.5 md:py-1 rounded-md text-xs font-semibold transition cursor-pointer text-center ${
                      isVerticalMast
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Vertical Mast Phase
                  </button>
                </div>

                <div className="hidden md:flex items-center gap-1.5 flex-wrap">
                  {workspaceTabs.map((tab) => {
                    const active = activeAppTab === tab.id;
                    const TabIcon = tab.Icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveAppTab(tab.id)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          active
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <TabIcon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                        {tab.badge !== undefined && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                              active
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>
            )}
          </header>

          {alertsBanner}
          {mainContentElement}
        </>
      )}

      {/* Slide-Over Workspace Drawer (mobile on Classic, < lg on Layout A) */}
      {mobileMenuOpen &&
        createPortal(
          <div className={`fixed inset-0 z-50 flex justify-end ${isSwiss ? 'lg:hidden' : 'md:hidden'}`}>
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Workspace Menu"
              className="relative w-[min(22rem,92vw)] h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Admin Workspace Menu
                  </div>
                  <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                    {projectDisplayName}
                  </div>
                  {!projectBrowserOpen && (
                    <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      Foundation: {completedCount}/{project.foundations.length} · Mast:{' '}
                      {verticalMastMetrics
                        ? `${verticalMastMetrics.erectedSections}/${verticalMastMetrics.totalSections}`
                        : '0/41'}{' '}
                      Sec
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close workspace menu"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
                {/* Quick Tools */}
                <section className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Quick Tools
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setGlobalSearchOpen(true);
                      }}
                      className="py-2 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-slate-500" />
                      <span>Search</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setPhotoGalleryInitialId(undefined);
                        setPhotoGalleryOpen(true);
                      }}
                      className="py-2 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-500" />
                      <span>Photos</span>
                    </button>
                  </div>
                </section>

                {/* Workspace Style Selector */}
                <section className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Workspace Style
                  </div>
                  <div className="grid grid-cols-2 rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setAdminUiStyle('classic')}
                      className={`py-1.5 rounded-md font-semibold cursor-pointer transition ${
                        !isSwiss
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Classic
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminUiStyle('swiss')}
                      className={`py-1.5 rounded-md font-semibold cursor-pointer transition ${
                        isSwiss
                          ? 'bg-neutral-950 text-white font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Layout A
                    </button>
                  </div>
                </section>

                {/* Cloud Sync & R2 Quota */}
                <section className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Cloud Sync &amp; Storage
                  </div>
                  <R2StorageHeaderPill showAlways />
                  <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                    <CloudSyncPanel onActionComplete={() => setMobileMenuOpen(false)} />
                  </div>
                </section>

                {/* Client Showcase */}
                <section className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Client Showcase
                  </div>
                  {!projectBrowserOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setClientModalProjectId(activeProjectId);
                      }}
                      className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold inline-flex items-center justify-between gap-2 cursor-pointer ${
                        activeRecord?.clientSettings?.enabled
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Globe className="w-4 h-4 shrink-0" />
                        <span>Client Share Settings</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase">
                        {activeRecord?.clientSettings?.enabled ? 'Live' : 'Private'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={openingClientView}
                    onClick={() => void handleOpenClientView()}
                    className="w-full py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {openingClientView ? (
                      <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                    ) : (
                      <ExternalLink className="w-4 h-4 text-slate-500" />
                    )}
                    <span>
                      {openingClientView ? 'Syncing & Opening Client View...' : 'Open Client View'}
                    </span>
                  </button>
                </section>

                {/* Project Tools */}
                {!projectBrowserOpen && (
                  <section className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Report &amp; Backup Tools
                    </div>

                    {updateAvailable && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          void applyUpdate();
                        }}
                        disabled={isUpdating}
                        className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                      >
                        <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                        <span>{isUpdating ? 'Updating App...' : 'Update to Newest Version'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleOpenReport();
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Open Report Preview</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleExportJson();
                        }}
                        className="py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Export JSON</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Import JSON</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void handleResetAll();
                      }}
                      className="w-full py-2 px-3 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-xs font-semibold text-rose-700 inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset All Project Data</span>
                    </button>
                  </section>
                )}
              </div>

              <div className="p-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Signed In As
                  </div>
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {authUser?.username ?? 'Admin'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void logout();
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-xs font-semibold text-rose-700 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </aside>
          </div>,
          document.body
        )}

      {/* Printable Overall Project Status Report Modal */}
      {overallReportOpen && (
        <Suspense fallback={null}>
          {isVerticalMast ? (
            <OverallVerticalMastStatusPrintModal
              open={overallReportOpen}
              onClose={() => setOverallReportOpen(false)}
              project={project}
            />
          ) : (
            <OverallProjectStatusPrintModal
              open={overallReportOpen}
              onClose={() => setOverallReportOpen(false)}
              project={project}
            />
          )}
        </Suspense>
      )}

      {/* Printable Activity / Erection Report Modal */}
      {reportOpen && (
        <Suspense fallback={null}>
          {isVerticalMast ? (
            <VerticalMastActivityPrintModal
              open={reportOpen}
              onClose={() => setReportOpen(false)}
              project={project}
              target={selectedMastTarget}
            />
          ) : (
            <PrintableReportModal
              project={project}
              onClose={() => setReportOpen(false)}
            />
          )}
        </Suspense>
      )}

      {/* Printable Inspection Report Modal */}
      {inspectionReportOpen && (
        <Suspense fallback={null}>
          {isVerticalMast ? (
            <VerticalMastInspectionPrintModal
              open={inspectionReportOpen}
              onClose={() => setInspectionReportOpen(false)}
              project={project}
              target={selectedMastTarget}
            />
          ) : (
            <InspectionPrintModal
              project={project}
              onClose={() => setInspectionReportOpen(false)}
            />
          )}
        </Suspense>
      )}

      {/* Printable Daily Log Modal */}
      {activePrintDailyLog && (
        <Suspense fallback={null}>
          <DailyLogPrintModal
            project={project}
            log={activePrintDailyLog}
            onSelectLog={(id) => setDailyLogPrintId(id)}
            onClose={() => setDailyLogPrintId(null)}
          />
        </Suspense>
      )}

      {/* Printable Payroll Sheet Modal (triggered from header Report button) */}
      {activePayrollPrintData && (
        <Suspense fallback={null}>
          <PayrollPrintModal
            project={project}
            data={activePayrollPrintData}
            onClose={() => setPayrollPrintTarget(null)}
          />
        </Suspense>
      )}

      {/* Vertical Mast Bottom-Up Erection Check Modal */}
      {hasOrderViolation && (
        <Suspense fallback={null}>
          <VerticalMastOrderModal />
        </Suspense>
      )}

      {/* Client Showcase Visibility & Sharing Modal */}
      {clientModalProjectId !== null && (
        <Suspense fallback={null}>
          <ClientVisibilityModal
            projectId={clientModalProjectId}
            open
            onClose={() => setClientModalProjectId(null)}
          />
        </Suspense>
      )}

      {/* Cloud Sync Conflict Comparison Diff Modal */}
      {showConflictDiff && conflictServerRecord && localConflictRecord && (
        <Suspense fallback={null}>
          <ConflictDiffModal
            localRecord={localConflictRecord}
            cloudRecord={conflictServerRecord}
            onUseCloud={async () => {
              setShowConflictDiff(false);
              await resolveConflictUseCloud();
            }}
            onKeepLocal={async () => {
              setShowConflictDiff(false);
              await resolveConflictOverwriteCloud();
            }}
            onClose={() => setShowConflictDiff(false)}
          />
        </Suspense>
      )}

      {/* Global Project Search Modal */}
      {globalSearchOpen && (
        <Suspense fallback={null}>
          <GlobalSearchModal
            project={project}
            isOpen={globalSearchOpen}
            onClose={() => setGlobalSearchOpen(false)}
            onSelectResult={handleSelectSearchResult}
            onOpenPhotoGallery={() => {
              setPhotoGalleryInitialId(undefined);
              setPhotoGalleryOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* Project Photo Gallery Modal */}
      {photoGalleryOpen && (
        <Suspense fallback={null}>
          <PhotoGalleryModal
            project={project}
            isOpen={photoGalleryOpen}
            onClose={() => {
              setPhotoGalleryOpen(false);
              setPhotoGalleryInitialId(undefined);
            }}
            initialPhotoId={photoGalleryInitialId}
          />
        </Suspense>
      )}

      {/* PWA Offline / Update Notification Banner */}
      <PwaStatusBanner hasBottomNav={!projectBrowserOpen} />

      {/* Dedicated Mobile Bottom Icon-Only Navigation Bar */}
      {!projectBrowserOpen && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className={`md:hidden print:hidden fixed bottom-0 inset-x-0 z-30 border-t safe-area-pb ${
            isSwiss
              ? 'bg-[#F2F0EA] border-stone-300'
              : 'bg-white/95 backdrop-blur border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]'
          }`}
        >
          <div className="grid grid-cols-7 h-16">
            {workspaceTabs.map((tab) => {
              const active = activeAppTab === tab.id;
              const TabIcon = tab.Icon;
              const showBadge =
                tab.id === 'hauling_inventory' || tab.id === 'daily_logs'
                  ? (tab.badge ?? 0) > 0
                  : false;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveAppTab(tab.id)}
                  title={tab.mobileTitle}
                  aria-label={tab.mobileTitle}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center justify-center transition cursor-pointer ${
                    isSwiss
                      ? active
                        ? 'text-neutral-950 bg-white'
                        : 'text-neutral-600 hover:bg-stone-200/60'
                      : active
                        ? 'text-sky-600 bg-sky-50/70'
                        : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  {active && (
                    <span
                      className={`absolute top-0 inset-x-3 h-0.5 ${
                        isSwiss ? 'bg-neutral-950' : 'rounded-b-full bg-sky-600'
                      }`}
                    />
                  )}
                  {showBadge ? (
                    <div className="relative">
                      <TabIcon className="w-6 h-6" />
                      <span
                        className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-white text-[10px] font-bold leading-none ${
                          isSwiss
                            ? 'bg-neutral-950'
                            : `rounded-full ring-2 ring-white ${tab.mobileBadgeBg}`
                        }`}
                      >
                        {tab.badge}
                      </span>
                    </div>
                  ) : (
                    <TabIcon className="w-6 h-6" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
