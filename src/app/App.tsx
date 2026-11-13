import { useMemo, useRef } from 'react';
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  FolderKanban,
  Layers,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { DailyLogPrintModal } from '@/widgets/daily-logs/DailyLogPrintModal';
import { DailyLogsView } from '@/widgets/daily-logs/DailyLogsView';
import { FoundationInspectionView } from '@/widgets/inspection/FoundationInspectionView';
import { InspectionPrintModal } from '@/widgets/inspection/InspectionPrintModal';
import { ProjectReportDetailsPanel } from '@/widgets/project-details/ProjectReportDetailsPanel';
import { ProjectLauncherView } from '@/widgets/projects/ProjectLauncherView';
import { OverallProjectStatusPrintModal } from '@/widgets/project-status/OverallProjectStatusPrintModal';
import { ProjectStatusView } from '@/widgets/project-status/ProjectStatusView';
import { FoundationActivityReportView } from '@/widgets/report/FoundationActivityReportView';
import { PrintableReportModal } from '@/widgets/report/PrintableReportModal';

export function App() {
  const {
    projects,
    activeProjectId,
    project,
    selectedFoundationId,
    switchProject,
    updateReportDetails,
    resetCleanBaseline,
    exportProjectJson,
    importProjectJson,
  } = useProjectStore();

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
  } = useUiStore();

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

  const activePrintDailyLog = useMemo(
    () =>
      dailyLogPrintId
        ? project.dailyLogs.find((l) => l.id === dailyLogPrintId) ?? project.dailyLogs[0]
        : null,
    [dailyLogPrintId, project.dailyLogs]
  );

  const anyPrintModalOpen =
    reportOpen ||
    inspectionReportOpen ||
    overallReportOpen ||
    Boolean(activePrintDailyLog);

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
      window.alert(err instanceof Error ? err.message : 'Failed to import JSON.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 text-slate-900">
      {/* Slim Mobile-First Header */}
      <header className="print:hidden sticky top-0 z-30 bg-white text-slate-900 border-b border-slate-200">
        <div className="h-12 px-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setProjectBrowserOpen(!projectBrowserOpen)}
              title="Open Project Browser & Launcher"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer shrink-0 ${
                projectBrowserOpen
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Projects</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white/25 text-white text-[10px] font-bold">
                {projects.length}
              </span>
            </button>

            {projects.length > 1 && !projectBrowserOpen ? (
              <select
                aria-label="Switch Active Project"
                value={activeProjectId}
                onChange={(e) => switchProject(e.target.value)}
                className="max-w-[210px] sm:max-w-[300px] truncate rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 text-xs sm:text-sm font-bold text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer"
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
              <span className="hidden md:inline px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-600 shrink-0">
                {completedCount}/{project.foundations.length} Done
              </span>
            )}
          </div>

          {/* Utility Actions */}
          {!projectBrowserOpen && (
            <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (activeAppTab === 'project_status') {
                  setOverallReportOpen(true);
                } else if (activeAppTab === 'daily_logs' && project.dailyLogs[0]) {
                  setDailyLogPrintId(project.dailyLogs[0].id);
                } else if (activeAppTab === 'inspection') {
                  setInspectionReportOpen(true);
                } else {
                  setReportOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              title="Export JSON Backup"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Export</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import JSON Backup"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reset all foundation progress, photos, daily logs, and material inputs?')) {
                  resetCleanBaseline();
                }
              }}
              title="Reset All"
              className="inline-flex items-center px-2 py-1.5 rounded-md bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-xs text-slate-500 hover:text-rose-600 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            </div>
          )}
        </div>

        {/* Navigation Bar */}
        {!projectBrowserOpen && (
          <nav className="px-3 pb-2 flex flex-wrap items-center gap-1.5 bg-slate-50/70 border-t border-slate-100 pt-1.5">
          <button
            type="button"
            onClick={() => setActiveAppTab('project_status')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
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
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'activity'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2D Activity</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('inspection')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'inspection'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Foundation Inspection</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveAppTab('daily_logs')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
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
            onClick={() => setActiveAppTab('project_details')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeAppTab === 'project_details'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Project Details</span>
          </button>
          </nav>
        )}
      </header>

      {/* Main Content (hidden while printing modal) */}
      <main className={`flex-1 ${anyPrintModalOpen ? 'print:hidden' : ''}`}>
        {projectBrowserOpen ? (
          <ProjectLauncherView onClose={() => setProjectBrowserOpen(false)} />
        ) : activeAppTab === 'project_status' ? (
          <ProjectStatusView project={project} />
        ) : activeAppTab === 'project_details' ? (
          <ProjectReportDetailsPanel
            project={project}
            onChange={(patch) => updateReportDetails(patch)}
            onOpenReport={() => setReportOpen(true)}
          />
        ) : activeAppTab === 'daily_logs' ? (
          <DailyLogsView project={project} foundations={project.foundations} />
        ) : activeAppTab === 'inspection' ? (
          selectedFoundation && (
            <FoundationInspectionView
              project={project}
              selectedFoundation={selectedFoundation}
            />
          )
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
      {overallReportOpen && (
        <OverallProjectStatusPrintModal
          open={overallReportOpen}
          onClose={() => setOverallReportOpen(false)}
          project={project}
        />
      )}

      {/* Printable Foundation Activity Report Modal */}
      {reportOpen && (
        <PrintableReportModal
          project={project}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Printable Foundation Inspection Report Modal */}
      {inspectionReportOpen && (
        <InspectionPrintModal
          project={project}
          onClose={() => setInspectionReportOpen(false)}
        />
      )}

      {/* Printable Daily Log Modal */}
      {activePrintDailyLog && (
        <DailyLogPrintModal
          project={project}
          log={activePrintDailyLog}
          onSelectLog={(id) => setDailyLogPrintId(id)}
          onClose={() => setDailyLogPrintId(null)}
        />
      )}
    </div>
  );
}

export default App;
