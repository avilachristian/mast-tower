import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  Download,
  FolderKanban,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { computeProjectMetrics, formatDateWithWeekday } from '@/entities/project/calculations';
import type { SavedProjectRecord } from '@/entities/project/types';
import { useProjectStore } from '@/shared/state/projectStore';

function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mast-project'
  );
}

export function ProjectLauncherView({ onClose }: { onClose: () => void }) {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) => s.project);
  const createProject = useProjectStore((s) => s.createProject);
  const switchProject = useProjectStore((s) => s.switchProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const importProjectAsNew = useProjectStore((s) => s.importProjectAsNew);

  const hasCurrentLogos = Boolean(
    activeProject.reportDetails?.logos?.left?.dataUrl ||
      activeProject.reportDetails?.logos?.center?.dataUrl ||
      activeProject.reportDetails?.logos?.right?.dataUrl
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newReferenceNo, setNewReferenceNo] = useState('');
  const [newContractor, setNewContractor] = useState(
    activeProject.reportDetails?.contractor || activeProject.contractor
  );
  const [newPreparedBy, setNewPreparedBy] = useState(
    activeProject.reportDetails?.preparedBy || activeProject.preparedBy
  );
  const [newHeightM, setNewHeightM] = useState(String(activeProject.towerHeightM || 120));
  const [newTemplate, setNewTemplate] = useState<'clean' | 'sample'>('clean');
  const [copyLogos, setCopyLogos] = useState(hasCurrentLogos);

  const importInputRef = useRef<HTMLInputElement>(null);

  const enrichedProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects
      .map((record) => {
        const state = record.state;
        const displayName = state.reportDetails?.projectName?.trim() || state.projectName;
        const displayLocation =
          state.reportDetails?.projectLocation?.trim() || state.location;
        const displayContractor =
          state.reportDetails?.contractor?.trim() || state.contractor;
        const displayRef = state.reportDetails?.referenceNo?.trim() || '';
        const metrics = computeProjectMetrics(state);
        return {
          record,
          displayName,
          displayLocation,
          displayContractor,
          displayRef,
          metrics,
        };
      })
      .filter((item) => {
        if (!q) return true;
        return (
          item.displayName.toLowerCase().includes(q) ||
          item.displayLocation.toLowerCase().includes(q) ||
          item.displayContractor.toLowerCase().includes(q) ||
          item.displayRef.toLowerCase().includes(q)
        );
      });
  }, [projects, searchQuery]);

  const handleOpenCreate = () => {
    setNewName(`Guyed Mast Tower – Mast ${projects.length + 1}`);
    setNewLocation('');
    setNewReferenceNo('');
    setNewContractor(activeProject.reportDetails?.contractor || activeProject.contractor);
    setNewPreparedBy(activeProject.reportDetails?.preparedBy || activeProject.preparedBy);
    setNewHeightM(String(activeProject.towerHeightM || 120));
    setNewTemplate('clean');
    setCopyLogos(hasCurrentLogos);
    setCreatingOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const parsedHeight = Number(newHeightM);
    createProject({
      projectName: newName.trim(),
      location: newLocation.trim() || undefined,
      referenceNo: newReferenceNo.trim() || undefined,
      contractor: newContractor.trim() || undefined,
      preparedBy: newPreparedBy.trim() || undefined,
      towerHeightM:
        Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 120,
      template: newTemplate,
      copyLogosFromCurrent: copyLogos,
    });
    setCreatingOpen(false);
    onClose();
  };

  const handleOpenProject = (id: string) => {
    switchProject(id);
    onClose();
  };

  const handleDuplicate = (record: SavedProjectRecord, displayName: string) => {
    duplicateProject(record.id, `${displayName} (Copy)`);
    onClose();
  };

  const handleExportRecord = (record: SavedProjectRecord, displayName: string) => {
    const json = JSON.stringify(record.state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugifyFilename(displayName)}-${record.state.lastUpdated}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      importProjectAsNew(text);
      onClose();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to import project JSON.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-full bg-slate-50 py-5 px-3 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Top Launcher Banner */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Project Browser &amp; Launcher
              </h2>
              <p className="text-xs text-slate-500">
                Switch between mast tower sites, create new clean projects, or import saved backups ({projects.length}{' '}
                {projects.length === 1 ? 'project' : 'projects'} saved locally)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Workspace
            </button>

            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              Import JSON as New Project
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />

            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Create New Project Form */}
        {creatingOpen && (
          <form
            onSubmit={handleCreateSubmit}
            className="rounded-xl border-2 border-sky-300 bg-white p-4 sm:p-5 shadow-md space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Create New Project</h3>
                <p className="text-[11px] text-slate-500">
                  Creates an independent 13-foundation workspace with its own logs, inspections, and letterhead
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreatingOpen(false)}
                className="px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">
                  Project / Site Name *
                </span>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Guyed Mast Tower – Mast 3"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">
                  Site Location
                </span>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. Mt. Labo Peak, Camarines Norte"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">
                  Reference / Document No.
                </span>
                <input
                  type="text"
                  value={newReferenceNo}
                  onChange={(e) => setNewReferenceNo(e.target.value)}
                  placeholder="e.g. REF-CIV-2026-003"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">
                  Contractor
                </span>
                <input
                  type="text"
                  value={newContractor}
                  onChange={(e) => setNewContractor(e.target.value)}
                  placeholder="Contractor / Builder name"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">
                  Prepared By (Site Engineer)
                </span>
                <input
                  type="text"
                  value={newPreparedBy}
                  onChange={(e) => setNewPreparedBy(e.target.value)}
                  placeholder="Lead engineer name"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">
                  Tower Height (m)
                </span>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={newHeightM}
                  onChange={(e) => setNewHeightM(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setNewTemplate('clean')}
                className={`text-left rounded-lg border p-3 transition cursor-pointer ${
                  newTemplate === 'clean'
                    ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>Clean Project Baseline</span>
                  {newTemplate === 'clean' && (
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  All 13 foundations start pending (0%) with empty daily logs and clean checklists.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setNewTemplate('sample')}
                className={`text-left rounded-lg border p-3 transition cursor-pointer ${
                  newTemplate === 'sample'
                    ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Sample Demo Data
                  </span>
                  {newTemplate === 'sample' && (
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Pre-populated example progress, pours, and sample daily worker logs for testing.
                </p>
              </button>
            </div>

            {hasCurrentLogos && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={copyLogos}
                  onChange={(e) => setCopyLogos(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>Reuse uploaded report letterhead logos from current active project</span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCreatingOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Create &amp; Open Project
              </button>
            </div>
          </form>
        )}

        {/* Search Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects by name, location, reference no., or contractor..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none shadow-2xs"
            />
          </div>
          <div className="text-xs text-slate-500">
            Showing {enrichedProjects.length} of {projects.length}{' '}
            {projects.length === 1 ? 'project' : 'projects'}
          </div>
        </div>

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enrichedProjects.map(
            ({
              record,
              displayName,
              displayLocation,
              displayContractor,
              displayRef,
              metrics,
            }) => {
              const isActive = record.id === activeProjectId;

              return (
                <div
                  key={record.id}
                  className={`rounded-xl border bg-white p-4 flex flex-col justify-between gap-3 transition shadow-sm ${
                    isActive
                      ? 'border-sky-500 ring-2 ring-sky-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                          {displayName}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-block text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                            {record.state.towerHeightM}m Tower
                          </span>
                          {displayRef && (
                            <span className="inline-block text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                              {displayRef}
                            </span>
                          )}
                        </div>
                      </div>

                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          Active
                        </span>
                      )}
                    </div>

                    {/* Meta Info */}
                    <div className="space-y-1 text-[11px] text-slate-600">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{displayLocation || 'No location set'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{displayContractor || '—'}</span>
                      </div>
                    </div>

                    {/* Progress Bar & Counters */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-700">
                          Overall Progress
                        </span>
                        <span className="font-bold text-slate-900">
                          {metrics.overallProgressPct}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-sky-600 rounded-full transition-all"
                          style={{ width: `${metrics.overallProgressPct}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 pt-1 text-center text-[10px]">
                        <div className="rounded-md bg-slate-50 border border-slate-200 py-1 px-1.5">
                          <div className="font-bold text-slate-900">
                            {metrics.completedCount}/{record.state.foundations.length}
                          </div>
                          <div className="text-slate-500">Completed</div>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 py-1 px-1.5">
                          <div className="font-bold text-slate-900">
                            {metrics.pouredOrBeyondCount}/{record.state.foundations.length}
                          </div>
                          <div className="text-slate-500">Poured+</div>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 py-1 px-1.5">
                          <div className="font-bold text-slate-900">
                            {record.state.dailyLogs.length}
                          </div>
                          <div className="text-slate-500">Daily Logs</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-2.5 border-t border-slate-100 space-y-2">
                    <div className="text-[10px] text-slate-400">
                      Updated {formatDateWithWeekday(record.state.lastUpdated)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenProject(record.id)}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-sky-600 hover:bg-sky-700 text-white'
                        }`}
                      >
                        {isActive ? 'Resume Workspace' : 'Open Project'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDuplicate(record, displayName)}
                        title="Duplicate project"
                        aria-label={`Duplicate ${displayName}`}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportRecord(record, displayName)}
                        title="Export project JSON backup"
                        aria-label={`Export ${displayName}`}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const msg =
                            projects.length === 1
                              ? `Delete "${displayName}" and start a fresh blank project?`
                              : `Delete project "${displayName}"? Export a JSON backup first if you still need it.`;
                          if (window.confirm(msg)) {
                            deleteProject(record.id);
                          }
                        }}
                        title="Delete project"
                        aria-label={`Delete ${displayName}`}
                        className="p-1.5 rounded-lg border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-slate-500 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
          )}

          {/* Quick Add Project Dashed Card */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="rounded-xl border-2 border-dashed border-slate-300 hover:border-sky-400 hover:bg-sky-50/50 p-6 flex flex-col items-center justify-center text-center gap-2 min-h-[240px] transition cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-full bg-slate-100 group-hover:bg-sky-100 text-slate-500 group-hover:text-sky-600 flex items-center justify-center transition">
              <Plus className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-800 group-hover:text-sky-700">
              Create New Project
            </div>
            <div className="text-xs text-slate-500 max-w-[210px]">
              Start a new tower foundation &amp; reporting workspace cleanly
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

