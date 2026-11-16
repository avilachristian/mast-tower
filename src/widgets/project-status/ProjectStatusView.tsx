import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Layers,
  Printer,
  X,
} from 'lucide-react';
import {
  buildOverallProjectStatusReportData,
  formatDateWithWeekday,
} from '@/entities/project/calculations';
import {
  FOUNDATION_SPECS,
  STATUS_META,
  formatConcreteCuM,
  resolveFoundationSpec,
} from '@/entities/project/mast2Baseline';
import type { FoundationStatus, MastProjectState } from '@/entities/project/types';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { OverallProjectStatusSheet } from './OverallProjectStatusSheet';

export function ProjectStatusView({ project }: { project: MastProjectState }) {
  const [viewMode, setViewMode] = useState<'overview' | 'report'>('overview');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<FoundationStatus>('not_started');
  const [draftPourDate, setDraftPourDate] = useState('');
  const [draftCompletedDate, setDraftCompletedDate] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftLengthM, setDraftLengthM] = useState('');
  const [draftWidthM, setDraftWidthM] = useState('');
  const [draftThicknessM, setDraftThicknessM] = useState('');
  const [draftOverburdenDepthM, setDraftOverburdenDepthM] = useState('');
  const [draftLeanThicknessM, setDraftLeanThicknessM] = useState('');
  const [draftConcreteCoverMm, setDraftConcreteCoverMm] = useState('');

  const selectFoundation = useProjectStore((s) => s.selectFoundation);
  const updateFoundationStatus = useProjectStore((s) => s.updateFoundationStatus);
  const updateFoundationBatch = useProjectStore((s) => s.updateFoundationBatch);
  const setActiveAppTab = useUiStore((s) => s.setActiveAppTab);
  const setOverallReportOpen = useUiStore((s) => s.setOverallReportOpen);

  const overview = useMemo(
    () => buildOverallProjectStatusReportData(project),
    [project]
  );
  const { metrics, stageCounts, sectorSummaries, foundationRows } = overview;

  const editingRow = editingRowId
    ? foundationRows.find((r) => r.id === editingRowId) ?? null
    : null;
  const editingFoundation = editingRowId
    ? project.foundations.find((f) => f.id === editingRowId) ?? null
    : null;

  useEffect(() => {
    if (!editingRowId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingRowId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingRowId]);

  const openEditDetailsModal = (row: (typeof foundationRows)[number]) => {
    const f = project.foundations.find((item) => item.id === row.id);
    const resolved = resolveFoundationSpec(row.type, f?.customSpecs);
    setEditingRowId(row.id);
    setDraftStatus(row.status);
    setDraftPourDate(row.pourDate ?? '');
    setDraftCompletedDate(row.completedDate ?? '');
    setDraftNotes(row.notes ?? '');
    setDraftLengthM(String(resolved.lengthM));
    setDraftWidthM(String(resolved.widthM));
    setDraftThicknessM(String(resolved.thicknessM));
    setDraftOverburdenDepthM(String(resolved.overburdenDepthM));
    setDraftLeanThicknessM(String(resolved.leanThicknessM));
    setDraftConcreteCoverMm(String(resolved.concreteCoverMm));
  };

  const handleSaveDetailsModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRowId) return;
    const targetFoundation = project.foundations.find(
      (item) => item.id === editingRowId
    );
    const detailsPatch = {
      pourDate: draftPourDate.trim() || undefined,
      completedDate: draftCompletedDate.trim() || undefined,
      notes: draftNotes,
    };
    let customSpecsPatch: Parameters<typeof updateFoundationBatch>[1]['customSpecsPatch'];
    if (targetFoundation) {
      const defaults = FOUNDATION_SPECS[targetFoundation.type];
      const len = Number.parseFloat(draftLengthM);
      const wid = Number.parseFloat(draftWidthM);
      const thick = Number.parseFloat(draftThicknessM);
      const over = Number.parseFloat(draftOverburdenDepthM);
      const lean = Number.parseFloat(draftLeanThicknessM);
      const cov = Number.parseFloat(draftConcreteCoverMm);
      const validLen = Number.isFinite(len) && len > 0 ? len : defaults.lengthM;
      const validWid = Number.isFinite(wid) && wid > 0 ? wid : defaults.widthM;
      const validThick =
        Number.isFinite(thick) && thick > 0 ? thick : defaults.thicknessM;
      const validOver =
        Number.isFinite(over) && over >= 0 ? over : defaults.overburdenDepthM;
      const validLean =
        Number.isFinite(lean) && lean >= 0 ? lean : defaults.leanThicknessM;
      const validCov = Number.isFinite(cov) && cov >= 0 ? cov : 50;

      const dimsMatchDefault =
        Math.abs(validLen - defaults.lengthM) <= 1e-6 &&
        Math.abs(validWid - defaults.widthM) <= 1e-6 &&
        Math.abs(validThick - defaults.thicknessM) <= 1e-6 &&
        Math.abs(validOver - defaults.overburdenDepthM) <= 1e-6 &&
        Math.abs(validLean - defaults.leanThicknessM) <= 1e-6;

      customSpecsPatch = {
        lengthM: Math.abs(validLen - defaults.lengthM) > 1e-6 ? validLen : undefined,
        widthM: Math.abs(validWid - defaults.widthM) > 1e-6 ? validWid : undefined,
        thicknessM:
          Math.abs(validThick - defaults.thicknessM) > 1e-6 ? validThick : undefined,
        overburdenDepthM:
          Math.abs(validOver - defaults.overburdenDepthM) > 1e-6
            ? validOver
            : undefined,
        leanThicknessM:
          Math.abs(validLean - defaults.leanThicknessM) > 1e-6
            ? validLean
            : undefined,
        concreteCoverMm: Math.abs(validCov - 50) > 1e-6 ? validCov : undefined,
        ...(dimsMatchDefault
          ? {}
          : {
              size: undefined,
              foundationVolume: undefined,
              leanConcreteVolume: undefined,
              excavationDepth: undefined,
            }),
      };
    }

    updateFoundationBatch(editingRowId, {
      status: draftStatus,
      detailsPatch,
      customSpecsPatch,
    });
    setEditingRowId(null);
  };

  const openFoundationTab = (id: string, tab: 'activity' | 'inspection') => {
    selectFoundation(id);
    setActiveAppTab(tab);
  };

  return (
    <div className="flex flex-col bg-slate-50 min-h-full">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-white border-b border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 text-xs font-bold text-sky-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
            Overall Progress: {metrics.overallProgressPct}%
          </span>
          <span className="text-xs text-slate-600 font-medium">
            {metrics.completedCount}/{metrics.totalFoundations} Completed ·{' '}
            {metrics.pouredConcreteCuM.toFixed(2)}/{metrics.totalConcreteCuM.toFixed(2)} m³ Poured
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('overview')}
              className={`min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer ${
                viewMode === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setViewMode('report')}
              className={`min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer ${
                viewMode === 'report'
                  ? 'bg-white text-sky-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Report Preview
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOverallReportOpen(true)}
            title="Print / Save PDF"
            aria-label="Print / Save PDF"
            className="inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
        </div>
      </div>

      {viewMode === 'report' ? (
        <div className="p-2 sm:p-5">
          <div className="max-w-6xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <OverallProjectStatusSheet
              project={project}
              onSelectFoundation={(id) => openFoundationTab(id, 'activity')}
            />
          </div>
        </div>
      ) : (
        <div className="p-3 sm:p-4 max-w-7xl w-full mx-auto space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Overall Project Progress
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="text-xl font-bold text-sky-700 tabular-nums">
                  {metrics.overallProgressPct}%
                </span>
                <span className="text-[11px] text-slate-500">
                  Updated {formatDateWithWeekday(project.lastUpdated)}
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-sky-600 transition-all"
                  style={{ width: `${metrics.overallProgressPct}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Foundations Completed
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {metrics.completedCount} / {metrics.totalFoundations}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {metrics.pouredOrBeyondCount} poured / cured / backfilled
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Concrete Volume Poured
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {metrics.pouredConcreteCuM.toFixed(2)} m³
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                of {metrics.totalConcreteCuM.toFixed(2)} m³ design total
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Field Logs &amp; Manpower
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {project.dailyLogs.length} Daily Logs
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {metrics.totalManDays} total man-days ({metrics.totalManHours} man-hrs)
              </div>
            </div>
          </div>

          {/* 2D Layout + Stage/Sector Rollup */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7">
              <GroundAnchorPlan2D
                foundations={project.foundations}
                showNodeLabels
                title={`Site Foundation Status Layout — ${project.reportDetails?.projectName?.trim() || project.projectName}${
                  project.reportDetails?.referenceNo?.trim()
                    ? ` (${project.reportDetails.referenceNo.trim()})`
                    : ''
                }`}
                subtitle="Overview of all 13 foundation pads by construction stage — click any pad to open its activity sheet"
                onSelect={(id) => openFoundationTab(id, 'activity')}
              />
            </div>

            <div className="lg:col-span-5 space-y-4">
              {/* Stage Distribution Card */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Stage Breakdown ({metrics.totalFoundations} Foundations)
                  </h2>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {stageCounts.map((stage) => (
                    <div
                      key={stage.status}
                      className="px-3.5 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-xs border border-slate-700 shrink-0"
                          style={{
                            backgroundColor: stage.color,
                            opacity: stage.status === 'not_started' ? 0.3 : 0.9,
                          }}
                        />
                        <span className="font-medium text-slate-800 truncate">
                          {stage.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-500 hidden sm:inline">
                          {stage.foundationIds.length > 0
                            ? stage.foundationIds.join(', ')
                            : '—'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[11px] tabular-nums">
                          {stage.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sector Rollup Card */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Sector Progress Summary
                  </h2>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {sectorSummaries.map((sec) => (
                    <div key={sec.sector} className="px-3.5 py-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{sec.label}</span>
                        <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                          {sec.completedCount}/{sec.foundationCount} Done ·{' '}
                          <span className="text-sky-700 font-bold">{sec.avgProgressPct}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-sky-600 transition-all"
                          style={{ width: `${sec.avgProgressPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Individual Foundation Status Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Individual Status of Each Foundation
                </h2>
                <p className="text-[11px] text-slate-500">
                  Update foundation stage, dates, and notes inline or open a pad in 2D Activity / Inspection
                </p>
              </div>
            </div>

            {/* Mobile Foundation Pad Cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {foundationRows.map((row) => (
                <div key={row.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-sky-700">{row.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                            STATUS_META[row.status].bgClass
                          } ${STATUS_META[row.status].textClass}`}
                        >
                          {STATUS_META[row.status].label}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-900">
                        {row.typeLabel}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.sectorLabel} · {row.sizeLabel} ({row.totalVolumeCuM.toFixed(2)} m³)
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold tabular-nums text-slate-900">
                        {row.progressPct}%
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {row.completedSteps}/{row.totalSteps} tasks
                      </div>
                    </div>
                  </div>

                  {(row.completedDate || row.pourDate || row.notes.trim()) && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-[11px] text-slate-600 space-y-0.5">
                      {row.completedDate && (
                        <div className="font-medium text-emerald-700">
                          Done: {formatDateWithWeekday(row.completedDate)}
                        </div>
                      )}
                      {row.pourDate && (
                        <div className="font-medium text-slate-700">
                          Pour: {formatDateWithWeekday(row.pourDate)}
                        </div>
                      )}
                      {row.notes.trim() && (
                        <div className="text-slate-600 line-clamp-2">{row.notes}</div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => openEditDetailsModal(row)}
                      className="flex-1 min-h-10 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-sky-50 hover:border-sky-300 text-xs font-semibold text-slate-700 hover:text-sky-700 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit Status &amp; Notes
                    </button>
                    <button
                      type="button"
                      onClick={() => openFoundationTab(row.id, 'activity')}
                      title={`Open ${row.id} in 2D Activity`}
                      aria-label={`Open ${row.id} in 2D Activity`}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-slate-700 hover:text-sky-700 cursor-pointer shrink-0"
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openFoundationTab(row.id, 'inspection')}
                      title={`Open ${row.id} in Foundation Inspection`}
                      aria-label={`Open ${row.id} in Foundation Inspection`}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-slate-700 hover:text-sky-700 cursor-pointer shrink-0"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="px-3 py-2 font-bold">Pad ID</th>
                    <th className="px-3 py-2 font-bold">Foundation / Sector</th>
                    <th className="px-3 py-2 font-bold">Size &amp; Volume</th>
                    <th className="px-3 py-2 font-bold text-center">Tasks</th>
                    <th className="px-3 py-2 font-bold">Stage Status</th>
                    <th className="px-3 py-2 font-bold text-center">Progress</th>
                    <th className="px-3 py-2 font-bold">Dates / Notes</th>
                    <th className="px-3 py-2 font-bold text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {foundationRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-bold text-sky-700 whitespace-nowrap">
                        {row.id}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{row.typeLabel}</div>
                        <div className="text-[11px] text-slate-500">{row.sectorLabel}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <div className="font-medium text-slate-800">{row.sizeLabel}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.totalVolumeCuM.toFixed(2)} m³ total
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold tabular-nums text-slate-700">
                        {row.completedSteps}/{row.totalSteps}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          aria-label={`Status for ${row.id}`}
                          value={row.status}
                          onChange={(e) =>
                            updateFoundationStatus(
                              row.id,
                              e.target.value as FoundationStatus
                            )
                          }
                          className={`rounded-md border px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                            STATUS_META[row.status].bgClass
                          } ${STATUS_META[row.status].textClass}`}
                        >
                          {(Object.keys(STATUS_META) as FoundationStatus[]).map((st) => (
                            <option key={st} value={st}>
                              {STATUS_META[st].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-slate-900">
                        {row.progressPct}%
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-600 max-w-xs">
                        <button
                          type="button"
                          onClick={() => openEditDetailsModal(row)}
                          className="group w-full text-left rounded-md px-2 py-1 -mx-2 -my-1 hover:bg-sky-50/80 border border-transparent hover:border-sky-200 transition flex items-start justify-between gap-2 cursor-pointer"
                          title={`Edit dates & notes for ${row.id}`}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            {row.completedDate && (
                              <div className="font-medium text-emerald-700">
                                Done: {formatDateWithWeekday(row.completedDate)}
                              </div>
                            )}
                            {row.pourDate && (
                              <div className="font-medium text-slate-700">
                                Pour: {formatDateWithWeekday(row.pourDate)}
                              </div>
                            )}
                            {row.notes.trim() ? (
                              <div className="truncate text-slate-500">{row.notes}</div>
                            ) : (
                              !row.completedDate &&
                              !row.pourDate && (
                                <span className="text-slate-400 italic">Add dates / notes...</span>
                              )
                            )}
                          </div>
                          <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600 shrink-0 mt-0.5" />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openFoundationTab(row.id, 'activity')}
                            title={`Open ${row.id} in 2D Activity`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-[11px] font-semibold text-slate-700 hover:text-sky-700 cursor-pointer"
                          >
                            <Layers className="w-3 h-3" />
                            <span>Activity</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openFoundationTab(row.id, 'inspection')}
                            title={`Open ${row.id} in Foundation Inspection`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-[11px] font-semibold text-slate-700 hover:text-sky-700 cursor-pointer"
                          >
                            <ClipboardCheck className="w-3 h-3" />
                            <span>Inspect</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Editing Status, Dates & Notes */}
      {editingRow &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setEditingRowId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-foundation-dates-notes-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
                <div>
                  <h3
                    id="edit-foundation-dates-notes-title"
                    className="text-sm font-bold text-slate-900"
                  >
                    Edit Foundation — {editingRow.id}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingRow.typeLabel} · {editingRow.sectorLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRowId(null)}
                  aria-label="Close edit foundation modal"
                  className="h-10 w-10 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveDetailsModal} className="p-4 space-y-4 text-xs overflow-y-auto">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Stage Status
                  </span>
                  <select
                    aria-label={`Modal status for ${editingRow.id}`}
                    value={draftStatus}
                    onChange={(e) => setDraftStatus(e.target.value as FoundationStatus)}
                    className={`w-full h-11 sm:h-9 rounded-lg border px-3 text-xs font-semibold cursor-pointer ${
                      STATUS_META[draftStatus].bgClass
                    } ${STATUS_META[draftStatus].textClass}`}
                  >
                    {(Object.keys(STATUS_META) as FoundationStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Pour Date
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={draftPourDate}
                        onChange={(e) => setDraftPourDate(e.target.value)}
                        className="w-full h-11 sm:h-9 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                      {draftPourDate && (
                        <button
                          type="button"
                          onClick={() => setDraftPourDate('')}
                          className="h-11 sm:h-9 px-3 sm:px-2 rounded-lg border border-slate-200 text-xs sm:text-[11px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {draftPourDate ? formatDateWithWeekday(draftPourDate) : 'Not set'}
                    </div>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Completed Date
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={draftCompletedDate}
                        onChange={(e) => setDraftCompletedDate(e.target.value)}
                        className="w-full h-11 sm:h-9 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                      {draftCompletedDate && (
                        <button
                          type="button"
                          onClick={() => setDraftCompletedDate('')}
                          className="h-11 sm:h-9 px-3 sm:px-2 rounded-lg border border-slate-200 text-xs sm:text-[11px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {draftCompletedDate
                        ? formatDateWithWeekday(draftCompletedDate)
                        : 'Not set'}
                    </div>
                  </label>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                      Dimensions &amp; Concrete Volume
                    </span>
                    {editingFoundation && (
                      <button
                        type="button"
                        onClick={() => {
                          const d = FOUNDATION_SPECS[editingFoundation.type];
                          setDraftLengthM(String(d.lengthM));
                          setDraftWidthM(String(d.widthM));
                          setDraftThicknessM(String(d.thicknessM));
                          setDraftOverburdenDepthM(String(d.overburdenDepthM));
                          setDraftLeanThicknessM(String(d.leanThicknessM));
                          setDraftConcreteCoverMm('50');
                        }}
                        className="text-[11px] font-semibold text-sky-700 hover:text-sky-800 cursor-pointer"
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-[10.5px] font-medium text-slate-600">
                        Length (m)
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={draftLengthM}
                        onChange={(e) => setDraftLengthM(e.target.value)}
                        className="mt-0.5 w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10.5px] font-medium text-slate-600">
                        Width (m)
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={draftWidthM}
                        onChange={(e) => setDraftWidthM(e.target.value)}
                        className="mt-0.5 w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10.5px] font-medium text-slate-600">
                        Pad Depth (m)
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={draftThicknessM}
                        onChange={(e) => setDraftThicknessM(e.target.value)}
                        className="mt-0.5 w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10.5px] font-medium text-slate-600">
                        Overburden (m)
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={draftOverburdenDepthM}
                        onChange={(e) => setDraftOverburdenDepthM(e.target.value)}
                        className="mt-0.5 w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10.5px] font-medium text-slate-600">
                        Lean Bedding (m)
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draftLeanThicknessM}
                        onChange={(e) => setDraftLeanThicknessM(e.target.value)}
                        className="mt-0.5 w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10.5px] font-medium text-slate-600">
                        Cover (mm)
                      </span>
                      <input
                        type="number"
                        step="5"
                        min="0"
                        value={draftConcreteCoverMm}
                        onChange={(e) => setDraftConcreteCoverMm(e.target.value)}
                        className="mt-0.5 w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  {(() => {
                    const preview = resolveFoundationSpec(editingRow.type, {
                      lengthM: Number.parseFloat(draftLengthM),
                      widthM: Number.parseFloat(draftWidthM),
                      thicknessM: Number.parseFloat(draftThicknessM),
                      overburdenDepthM: Number.parseFloat(draftOverburdenDepthM),
                      leanThicknessM: Number.parseFloat(draftLeanThicknessM),
                      concreteCoverMm: Number.parseFloat(draftConcreteCoverMm),
                    });
                    return (
                      <div className="rounded bg-sky-50 border border-sky-200 px-2.5 py-1.5 text-[11px] font-medium text-sky-900 tabular-nums">
                        Calculated Concrete Pour:{' '}
                        <strong>{formatConcreteCuM(preview.structuralConcreteCuM)} m³</strong> AA +{' '}
                        <strong>{preview.leanConcreteCuM.toFixed(2)} m³</strong> Lean ={' '}
                        <strong>{preview.totalConcreteCuM.toFixed(2)} m³</strong> total
                      </div>
                    );
                  })()}
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Field Notes / Remarks
                  </span>
                  <textarea
                    rows={4}
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="Record concrete slump, bolt frame alignment, backfill compaction, or site remarks..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setEditingRowId(null)}
                    className="min-h-11 sm:min-h-0 px-4 sm:px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="min-h-11 sm:min-h-0 px-5 sm:px-4 py-2 sm:py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

