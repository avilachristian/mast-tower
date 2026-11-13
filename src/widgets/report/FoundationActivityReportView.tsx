import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Printer,
  RotateCcw,
} from 'lucide-react';
import {
  buildFoundationActivityReportData,
  formatDateWithWeekday,
} from '@/entities/project/calculations';
import {
  FOUNDATION_SPECS,
  STATUS_META,
  formatConcreteCuM,
  resolveFoundationSpec,
} from '@/entities/project/mast2Baseline';
import type {
  FoundationCustomSpecs,
  FoundationRecord,
  FoundationStatus,
  MastProjectState,
} from '@/entities/project/types';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { ActivityReportSheet } from './ActivityReportSheet';

export function FoundationActivityReportView({
  project,
  selectedFoundation,
}: {
  project: MastProjectState;
  selectedFoundation: FoundationRecord;
}) {
  const [viewMode, setViewMode] = useState<'workspace' | 'report'>('workspace');

  const selectFoundation = useProjectStore((s) => s.selectFoundation);
  const updateFoundationStatus = useProjectStore((s) => s.updateFoundationStatus);
  const toggleFoundationChecklistItem = useProjectStore(
    (s) => s.toggleFoundationChecklistItem
  );
  const updateFoundationCustomSpecs = useProjectStore(
    (s) => s.updateFoundationCustomSpecs
  );
  const resetFoundationCustomSpecs = useProjectStore(
    (s) => s.resetFoundationCustomSpecs
  );

  const setReportOpen = useUiStore((s) => s.setReportOpen);

  const report = buildFoundationActivityReportData(project, null, selectedFoundation);
  const resolvedSpec = resolveFoundationSpec(
    selectedFoundation.type,
    selectedFoundation.customSpecs
  );

  const handleNumericDimensionChange = (
    field:
      | 'lengthM'
      | 'widthM'
      | 'thicknessM'
      | 'overburdenDepthM'
      | 'leanThicknessM'
      | 'concreteCoverMm',
    raw: string
  ) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    const minVal =
      field === 'lengthM' || field === 'widthM' || field === 'thicknessM'
        ? 0.05
        : 0;
    const val = Math.max(minVal, parsed);
    const patch: Partial<FoundationCustomSpecs> = {
      [field]: val,
      // Clear auto-derived label overrides so dynamic volumes/sizes reflect immediately
      ...(field === 'concreteCoverMm'
        ? { cover: undefined }
        : {
            size: undefined,
            foundationVolume: undefined,
            leanConcreteVolume: undefined,
            excavationDepth: undefined,
          }),
    };
    updateFoundationCustomSpecs(selectedFoundation.id, patch);
  };

  const handleCountOverrideChange = (
    field:
      | 'rebarM02Count'
      | 'rebarM26Count'
      | 'phenolicBoards'
      | 'cementBags'
      | 'sandBags'
      | 'gravelBags',
    raw: string
  ) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const val = Math.max(0, parsed);
    const patch: Partial<FoundationCustomSpecs> = {
      [field]: val,
      ...(field === 'rebarM02Count' ? { mainRebar: undefined } : {}),
      ...(field === 'rebarM26Count' ? { chairBar: undefined } : {}),
    };
    updateFoundationCustomSpecs(selectedFoundation.id, patch);
  };

  return (
    <div className="flex flex-col bg-slate-50 min-h-full">
      {/* Foundation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-white border-b border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
          <select
            aria-label="Select Foundation"
            value={selectedFoundation.id}
            onChange={(e) => selectFoundation(e.target.value)}
            className="w-full sm:w-auto max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
          >
            {project.foundations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} — {FOUNDATION_SPECS[f.type].label} ({STATUS_META[f.status].shortLabel})
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            {report.sizeLabel} · {formatConcreteCuM(resolvedSpec.structuralConcreteCuM)} m³ AA (
            {resolvedSpec.totalConcreteCuM.toFixed(2)} m³ total)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('workspace')}
              className={`min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer ${
                viewMode === 'workspace'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Edit Activity
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
            onClick={() => setReportOpen(true)}
            title="Print / Save PDF"
            aria-label="Print / Save PDF"
            className="inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'report' ? (
        <div className="p-2 sm:p-5">
          <div className="max-w-5xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <ActivityReportSheet
              project={project}
              foundation={selectedFoundation}
              onSelectFoundation={selectFoundation}
            />
          </div>
        </div>
      ) : (
        <div className="p-3 sm:p-4 max-w-7xl w-full mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column: 2D Tower Layout */}
            <div className="lg:col-span-6 space-y-4">
              <GroundAnchorPlan2D
                foundations={project.foundations}
                selectedId={selectedFoundation.id}
                onSelect={selectFoundation}
                title={`2D Foundation Layout — ${project.reportDetails?.projectName?.trim() || project.projectName}${
                  project.reportDetails?.referenceNo?.trim()
                    ? ` (${project.reportDetails.referenceNo.trim()})`
                    : ''
                }`}
                subtitle="Select any foundation pad on the plan to update its construction activities and report details"
                compact
              />
            </div>

            {/* Right Column: Activities & Specs */}
            <div className="lg:col-span-6 space-y-4">
              {/* Activities Card */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Activities — {selectedFoundation.id} ({resolvedSpec.label})
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Tap tasks to update status for the report
                    </p>
                  </div>
                  <select
                    value={selectedFoundation.status}
                    onChange={(e) =>
                      updateFoundationStatus(
                        selectedFoundation.id,
                        e.target.value as FoundationStatus
                      )
                    }
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                      STATUS_META[selectedFoundation.status].bgClass
                    } ${STATUS_META[selectedFoundation.status].textClass}`}
                  >
                    {(Object.keys(STATUS_META) as FoundationStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 space-y-1.5">
                  {report.tasks.map((task, idx) => (
                    <button
                      key={task.key}
                      type="button"
                      onClick={() =>
                        toggleFoundationChecklistItem(selectedFoundation.id, task.key)
                      }
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-xs transition cursor-pointer ${
                        task.done
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {task.done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span>
                          {idx + 1}. {task.description}
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                          task.done
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {task.statusLabel}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Dates Quick Info */}
                {(selectedFoundation.pourDate || selectedFoundation.completedDate) && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-700 flex flex-wrap gap-4">
                    {selectedFoundation.pourDate && (
                      <div>
                        Pour Date:{' '}
                        <strong>{formatDateWithWeekday(selectedFoundation.pourDate)}</strong>
                      </div>
                    )}
                    {selectedFoundation.completedDate && (
                      <div>
                        Completed Date:{' '}
                        <strong>{formatDateWithWeekday(selectedFoundation.completedDate)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Editable Foundation Design Details Card */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Foundation Details — {selectedFoundation.id}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Edit dimensions, volumes, depth, cover, rebars, or accessories for reports
                    </p>
                  </div>
                  {selectedFoundation.customSpecs && (
                    <button
                      type="button"
                      onClick={() => resetFoundationCustomSpecs(selectedFoundation.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Defaults
                    </button>
                  )}
                </div>

                <div className="p-3.5 space-y-3 text-xs">
                  {/* Dynamic Dimensions & Depths (drives Concrete Pour Volume) */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                        Pad Dimensions &amp; Depths (Dynamic Volume)
                      </span>
                      <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10.5px] font-semibold text-sky-800 tabular-nums">
                        Pour: {formatConcreteCuM(resolvedSpec.structuralConcreteCuM)} m³ AA +{' '}
                        {resolvedSpec.leanConcreteCuM.toFixed(2)} m³ Lean ={' '}
                        {resolvedSpec.totalConcreteCuM.toFixed(2)} m³ Total
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Length (m)
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          value={resolvedSpec.lengthM}
                          onChange={(e) =>
                            handleNumericDimensionChange('lengthM', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Width (m)
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          value={resolvedSpec.widthM}
                          onChange={(e) =>
                            handleNumericDimensionChange('widthM', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Pad Depth (m)
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          value={resolvedSpec.thicknessM}
                          onChange={(e) =>
                            handleNumericDimensionChange('thicknessM', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Overburden (m)
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={resolvedSpec.overburdenDepthM}
                          onChange={(e) =>
                            handleNumericDimensionChange(
                              'overburdenDepthM',
                              e.target.value
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Lean Concrete (m)
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={resolvedSpec.leanThicknessM}
                          onChange={(e) =>
                            handleNumericDimensionChange('leanThicknessM', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Cover (mm)
                        </span>
                        <input
                          type="number"
                          step="5"
                          min="0"
                          value={resolvedSpec.concreteCoverMm}
                          onChange={(e) =>
                            handleNumericDimensionChange('concreteCoverMm', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Required Material & Rebar Counts (auto-scaled on volume change, editable) */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Design Material &amp; Rebar Quantities
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Cement (bags)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={resolvedSpec.cementBags}
                          onChange={(e) =>
                            handleCountOverrideChange('cementBags', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Sand (bags)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={resolvedSpec.sandBags}
                          onChange={(e) =>
                            handleCountOverrideChange('sandBags', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Gravel (bags)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={resolvedSpec.gravelBags}
                          onChange={(e) =>
                            handleCountOverrideChange('gravelBags', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Main Rebar (pcs)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={resolvedSpec.rebarM02Count}
                          onChange={(e) =>
                            handleCountOverrideChange('rebarM02Count', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Chair Bar (pcs)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={resolvedSpec.rebarM26Count}
                          onChange={(e) =>
                            handleCountOverrideChange('rebarM26Count', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Phenolic (pcs)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={resolvedSpec.phenolicBoards}
                          onChange={(e) =>
                            handleCountOverrideChange('phenolicBoards', e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Report Text Labels (auto-derived from dimensions above, or customize) */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Report Submittal Labels
                    </div>
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-600">
                        Size Label
                      </span>
                      <input
                        type="text"
                        value={report.specDetails.size}
                        onChange={(e) =>
                          updateFoundationCustomSpecs(selectedFoundation.id, {
                            size: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  {/* Volume */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-600">
                        Foundation Volume Label
                      </span>
                      <input
                        type="text"
                        value={report.specDetails.foundationVolume}
                        onChange={(e) =>
                          updateFoundationCustomSpecs(selectedFoundation.id, {
                            foundationVolume: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-600">
                        Lean Concrete Label
                      </span>
                      <input
                        type="text"
                        value={report.specDetails.leanConcreteVolume}
                        onChange={(e) =>
                          updateFoundationCustomSpecs(selectedFoundation.id, {
                            leanConcreteVolume: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  {/* Excavation Depth & Cover Labels */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-600">
                        Excavation Depth Label
                      </span>
                      <input
                        type="text"
                        value={report.specDetails.excavationDepth}
                        onChange={(e) =>
                          updateFoundationCustomSpecs(selectedFoundation.id, {
                            excavationDepth: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-600">
                        Cover Label
                      </span>
                      <input
                        type="text"
                        value={report.specDetails.cover}
                        onChange={(e) =>
                          updateFoundationCustomSpecs(selectedFoundation.id, {
                            cover: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  {/* Rebars */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Rebars
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Main Rebar
                        </span>
                        <input
                          type="text"
                          value={report.specDetails.mainRebar}
                          onChange={(e) =>
                            updateFoundationCustomSpecs(selectedFoundation.id, {
                              mainRebar: e.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">
                          Chair Bar
                        </span>
                        <input
                          type="text"
                          value={report.specDetails.chairBar}
                          onChange={(e) =>
                            updateFoundationCustomSpecs(selectedFoundation.id, {
                              chairBar: e.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Tower Accessories */}
                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Tower Accessories
                    </div>
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-600">
                        {report.specDetails.towerAccessoriesLabel}
                      </span>
                      <input
                        type="text"
                        value={report.specDetails.towerAccessories}
                        onChange={(e) =>
                          updateFoundationCustomSpecs(selectedFoundation.id, {
                            towerAccessories: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
