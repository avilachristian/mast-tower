import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BarChart3,
  Building2,
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
  RefreshCw,
  RotateCcw,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  computeCivilWorksPayrollPreview,
  computeHaulerPayrollPreview,
  getPayrollPeriodBounds,
  resolveManpowerRoster,
} from '@/entities/project/manpowerPayroll';
import { computeVerticalMastMetrics } from '@/entities/project/verticalMastCalculations';
import { navigateTo, useAppRoute } from '@/shared/lib/router';
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
import { AdminLoginView } from '@/widgets/auth/AdminLoginView';
import { ClientShowcaseView } from '@/widgets/client-showcase/ClientShowcaseView';
import { AppDialogModal } from '@/widgets/common/AppDialogModal';
import { ToastBanner } from '@/widgets/common/ToastBanner';
import { PwaStatusBanner } from '@/widgets/pwa/PwaStatusBanner';
import { ClientVisibilityModal } from '@/widgets/projects/ClientVisibilityModal';
import {
  CloudSyncControls,
  CloudSyncPanel,
} from '@/widgets/storage/CloudSyncControls';
import {
  R2StorageAlertBanner,
  R2StorageHeaderPill,
} from '@/widgets/storage/R2StorageStatusBadge';
import { DailyLogPrintModal } from '@/widgets/daily-logs/DailyLogPrintModal';
import { DailyLogsView } from '@/widgets/daily-logs/DailyLogsView';
import { HaulingInventoryView } from '@/widgets/hauling/HaulingInventoryView';
import { FoundationInspectionView } from '@/widgets/inspection/FoundationInspectionView';
import { InspectionPrintModal } from '@/widgets/inspection/InspectionPrintModal';
import { ManpowerView } from '@/widgets/manpower/ManpowerView';
import { PayrollPrintModal, type PayrollSheetData } from '@/widgets/manpower/PayrollPrintModal';
import { OverallVerticalMastStatusPrintModal } from '@/widgets/mast-tower/OverallVerticalMastStatusPrintModal';
import { VerticalMastActivityPrintModal } from '@/widgets/mast-tower/VerticalMastActivityPrintModal';
import { VerticalMastActivityView } from '@/widgets/mast-tower/VerticalMastActivityView';
import { VerticalMastInspectionPrintModal } from '@/widgets/mast-tower/VerticalMastInspectionPrintModal';
import { VerticalMastInspectionView } from '@/widgets/mast-tower/VerticalMastInspectionView';
import { VerticalMastOrderModal } from '@/widgets/mast-tower/VerticalMastOrderModal';
import { VerticalMastStatusView } from '@/widgets/mast-tower/VerticalMastStatusView';
import { ProjectReportDetailsPanel } from '@/widgets/project-details/ProjectReportDetailsPanel';
import { ProjectLauncherView } from '@/widgets/projects/ProjectLauncherView';
import { OverallProjectStatusPrintModal } from '@/widgets/project-status/OverallProjectStatusPrintModal';
import { ProjectStatusView } from '@/widgets/project-status/ProjectStatusView';
import { FoundationActivityReportView } from '@/widgets/report/FoundationActivityReportView';
import { PrintableReportModal } from '@/widgets/report/PrintableReportModal';

function AdminWorkspace() {
  const {
    projects,
    activeProjectId,
    project,
    selectedFoundationId,
    switchProject,
    setProjectPhase,
    updateReportDetails,
    resetCleanBaseline,
    exportProjectJson,
    importProjectJson,
  } = useProjectStore();

  const authUser = useAuthStore((s) => s.user);
  const offlineCached = useAuthStore((s) => s.offlineCached);
  const logout = useAuthStore((s) => s.logout);
  const conflictProjectId = useCloudSyncStore((s) => s.conflictProjectId);
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
    payrollPrintTarget,
    setPayrollPrintTarget,
  } = useUiStore();
  const showAlert = useFeedbackStore((s) => s.showAlert);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);

  const isVerticalMast = project.projectType === 'vertical_mast';
  const updateAvailable = usePwaStore((s) => s.updateAvailable);
  const isUpdating = usePwaStore((s) => s.isUpdating);
  const applyUpdate = usePwaStore((s) => s.applyUpdate);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const todayIso = new Date().toISOString().slice(0, 10);
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
    const todayIso = new Date().toISOString().slice(0, 10);
    const bounds = getPayrollPeriodBounds('overall', todayIso, dates);
    const preview = computeHaulerPayrollPreview(
      project.haulingLogs,
      project.haulerPayouts ?? [],
      manpowerRoster,
      bounds.startDate,
      bounds.endDate,
      'overall'
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
        totalPayoutPhp: preview.totalSuggestedPayoutPhp,
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

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 text-slate-900">
      {/* Slim Mobile-First Header */}
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
                {project.reportDetails?.projectName?.trim() || project.projectName}
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

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />

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

            {/* Cloud, R2 Quota, Showcase & Auth Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
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
          <div className="flex md:hidden items-center shrink-0">
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

        {/* Mobile Drawer Menu (< md) */}
        {mobileMenuOpen &&
          createPortal(
            <div className="fixed inset-0 z-50 md:hidden flex justify-end">
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
                      {project.reportDetails?.projectName?.trim() || project.projectName}
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

        {/* Navigation Bar (Phase Toggle on all viewports; Text Tabs on Desktop >= md) */}
        {!projectBrowserOpen && (
          <nav className="px-2.5 sm:px-3 pb-2 bg-slate-50/70 border-t border-slate-100 pt-1.5 flex flex-col md:flex-row md:flex-wrap md:items-center gap-1.5">
          {/* Phase Toggle — compact full-width 2-button bar on mobile, right-aligned pill on desktop */}
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
              onClick={() => {
                setProjectPhase('foundation');
                setReportOpen(false);
                setInspectionReportOpen(false);
                setOverallReportOpen(false);
              }}
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
              onClick={() => {
                setProjectPhase('vertical_mast');
                setReportOpen(false);
                setInspectionReportOpen(false);
                setOverallReportOpen(false);
              }}
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
          <button
            type="button"
            onClick={() => setActiveAppTab('project_status')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'project_status'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Project Status</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('activity')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'activity'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isVerticalMast ? '2D Erection & Layout' : '2D Activity'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('inspection')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'inspection'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>
              {isVerticalMast ? 'Tower Inspection' : 'Foundation Inspection'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('hauling_inventory')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'hauling_inventory'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Hauling &amp; Inventory</span>
            {project.haulingLogs.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeAppTab === 'hauling_inventory'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {project.haulingLogs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('daily_logs')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'daily_logs'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Daily Logs</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeAppTab === 'daily_logs'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {project.dailyLogs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('manpower')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'manpower'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manpower</span>
            {manpowerRoster.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeAppTab === 'manpower'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {manpowerRoster.filter((m) => m.active).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('project_details')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'project_details'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Project Details</span>
          </button>
          </div>
          </nav>
        )}
      </header>

      {/* R2 Storage Free Tier Quota Warning (<= 1 GB) / Block (< 100 MB) Banner */}
      <div className="print:hidden max-w-7xl w-full mx-auto px-3 sm:px-4 pt-2 space-y-2 empty:hidden">
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

      {/* Main Content (hidden while printing modal) */}
      <main className={`flex-1 ${!projectBrowserOpen ? 'pb-20 md:pb-0' : ''} ${anyPrintModalOpen ? 'print:hidden' : ''}`}>
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
      </main>

      {/* Printable Overall Project Status Report Modal */}
      {overallReportOpen &&
        (isVerticalMast ? (
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
        ))}

      {/* Printable Activity / Erection Report Modal */}
      {reportOpen &&
        (isVerticalMast ? (
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
        ))}

      {/* Printable Inspection Report Modal */}
      {inspectionReportOpen &&
        (isVerticalMast ? (
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
        ))}

      {/* Printable Daily Log Modal */}
      {activePrintDailyLog && (
        <DailyLogPrintModal
          project={project}
          log={activePrintDailyLog}
          onSelectLog={(id) => setDailyLogPrintId(id)}
          onClose={() => setDailyLogPrintId(null)}
        />
      )}

      {/* Printable Payroll Sheet Modal (triggered from header Report button) */}
      {activePayrollPrintData && (
        <PayrollPrintModal
          project={project}
          data={activePayrollPrintData}
          onClose={() => setPayrollPrintTarget(null)}
        />
      )}

      {/* Vertical Mast Bottom-Up Erection Check Modal */}
      <VerticalMastOrderModal />

      {/* Client Showcase Visibility & Sharing Modal */}
      <ClientVisibilityModal
        projectId={clientModalProjectId}
        open={clientModalProjectId !== null}
        onClose={() => setClientModalProjectId(null)}
      />

      {/* PWA Offline / Update Notification Banner */}
      <PwaStatusBanner hasBottomNav={!projectBrowserOpen} />

      {/* Dedicated Mobile Bottom Icon-Only Navigation Bar */}
      {!projectBrowserOpen && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className="md:hidden print:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] safe-area-pb"
        >
          <div className="grid grid-cols-7 h-16">
            <button
              type="button"
              onClick={() => setActiveAppTab('project_status')}
              title="Project Status"
              aria-label="Project Status"
              aria-current={activeAppTab === 'project_status' ? 'page' : undefined}
              className={`relative flex items-center justify-center transition cursor-pointer ${
                activeAppTab === 'project_status'
                  ? 'text-sky-600 bg-sky-50/70'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {activeAppTab === 'project_status' && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-sky-600" />
              )}
              <BarChart3 className="w-6 h-6" />
            </button>

            <button
              type="button"
              onClick={() => setActiveAppTab('activity')}
              title={isVerticalMast ? '2D Erection & Layout' : '2D Activity'}
              aria-label={isVerticalMast ? '2D Erection & Layout' : '2D Activity'}
              aria-current={activeAppTab === 'activity' ? 'page' : undefined}
              className={`relative flex items-center justify-center transition cursor-pointer ${
                activeAppTab === 'activity'
                  ? 'text-sky-600 bg-sky-50/70'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {activeAppTab === 'activity' && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-sky-600" />
              )}
              <Layers className="w-6 h-6" />
            </button>

            <button
              type="button"
              onClick={() => setActiveAppTab('inspection')}
              title={isVerticalMast ? 'Tower Inspection' : 'Foundation Inspection'}
              aria-label={isVerticalMast ? 'Tower Inspection' : 'Foundation Inspection'}
              aria-current={activeAppTab === 'inspection' ? 'page' : undefined}
              className={`relative flex items-center justify-center transition cursor-pointer ${
                activeAppTab === 'inspection'
                  ? 'text-sky-600 bg-sky-50/70'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {activeAppTab === 'inspection' && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-sky-600" />
              )}
              <ClipboardCheck className="w-6 h-6" />
            </button>

            <button
              type="button"
              onClick={() => setActiveAppTab('hauling_inventory')}
              title={`Hauling & Inventory (${project.haulingLogs.length})`}
              aria-label={`Hauling & Inventory (${project.haulingLogs.length})`}
              aria-current={activeAppTab === 'hauling_inventory' ? 'page' : undefined}
              className={`relative flex items-center justify-center transition cursor-pointer ${
                activeAppTab === 'hauling_inventory'
                  ? 'text-sky-600 bg-sky-50/70'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {activeAppTab === 'hauling_inventory' && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-sky-600" />
              )}
              <div className="relative">
                <Truck className="w-6 h-6" />
                {project.haulingLogs.length > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold leading-none ring-2 ring-white">
                    {project.haulingLogs.length}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveAppTab('daily_logs')}
              title={`Daily Logs (${project.dailyLogs.length})`}
              aria-label={`Daily Logs (${project.dailyLogs.length})`}
              aria-current={activeAppTab === 'daily_logs' ? 'page' : undefined}
              className={`relative flex items-center justify-center transition cursor-pointer ${
                activeAppTab === 'daily_logs'
                  ? 'text-sky-600 bg-sky-50/70'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {activeAppTab === 'daily_logs' && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-sky-600" />
              )}
              <div className="relative">
                <ClipboardList className="w-6 h-6" />
                {project.dailyLogs.length > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-sky-600 text-white text-[10px] font-bold leading-none ring-2 ring-white">
                    {project.dailyLogs.length}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveAppTab('manpower')}
              title="Manpower & Payroll"
              aria-label="Manpower & Payroll"
              aria-current={activeAppTab === 'manpower' ? 'page' : undefined}
              className={`relative flex items-center justify-center transition cursor-pointer ${
                activeAppTab === 'manpower'
                  ? 'text-sky-600 bg-sky-50/70'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {activeAppTab === 'manpower' && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-sky-600" />
              )}
              <Users className="w-6 h-6" />
            </button>

            <button
              type="button"
              onClick={() => setActiveAppTab('project_details')}
              title="Project Details"
              aria-label="Project Details"
              aria-current={activeAppTab === 'project_details' ? 'page' : undefined}
              className={`relative flex items-center justify-center transition cursor-pointer ${
                activeAppTab === 'project_details'
                  ? 'text-sky-600 bg-sky-50/70'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {activeAppTab === 'project_details' && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-sky-600" />
              )}
              <Building2 className="w-6 h-6" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export function App() {
  const route = useAppRoute();
  const authStatus = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);
  const projectBrowserOpen = useUiStore((s) => s.projectBrowserOpen);

  useEffect(() => {
    if (route.kind !== 'admin') return;
    initializeCloudSync();
    if (authStatus === 'unknown') {
      void checkSession();
    } else if (authStatus === 'authenticated') {
      void hydrateCloudWorkspace();
    }
  }, [route.kind, authStatus, checkSession]);

  const showAdminBottomNav =
    route.kind === 'admin' && authStatus === 'authenticated' && !projectBrowserOpen;

  return (
    <>
      {route.kind === 'client' ? (
        <ClientShowcaseView slug={route.slug} />
      ) : authStatus === 'unknown' ? (
        <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-6 text-center space-y-2.5 shadow-xs">
            <div className="w-8 h-8 rounded-full border-2 border-sky-600 border-t-transparent animate-spin mx-auto" />
            <div className="text-xs font-semibold text-slate-600">
              Verifying administrator session...
            </div>
          </div>
        </div>
      ) : authStatus === 'unauthenticated' ? (
        <AdminLoginView />
      ) : (
        <AdminWorkspace />
      )}

      {/* App-Wide Custom Alert / Confirm Modal & Status Toasts */}
      <AppDialogModal />
      <ToastBanner hasBottomNav={showAdminBottomNav} />
    </>
  );
}

export default App;
