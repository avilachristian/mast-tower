import { useMemo, useState } from 'react';
import {
  CheckCheck,
  ImagePlus,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  getReportableInspections,
  getWeekdayName,
} from '@/entities/project/calculations';
import type { FoundationInspectionStatus } from '@/entities/project/types';
import {
  GUY_LAYER_STATUS_META,
  TOWER_SECTION_STATUS_META,
  getVerticalMastInspectionChecklistItems,
} from '@/entities/project/verticalMastBaseline';
import {
  buildVerticalMastInspectionRows,
  buildVerticalMastOverviewData,
} from '@/entities/project/verticalMastCalculations';
import { readAndResizeImageFile } from '@/shared/lib/imageUpload';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { VerticalMastElevation2D } from './VerticalMastElevation2D';
import { VerticalMastInspectionSheet } from './VerticalMastInspectionSheet';

const INSPECTION_STATUS_OPTIONS: FoundationInspectionStatus[] = [
  'Pending',
  'Passed',
  'For Rectification',
  'N/A',
];

export function VerticalMastInspectionView() {
  const project = useProjectStore((s) => s.project);
  const updateMastInspectionItem = useProjectStore(
    (s) => s.updateMastInspectionItem
  );
  const addMastInspectionItem = useProjectStore((s) => s.addMastInspectionItem);
  const removeMastInspectionItem = useProjectStore(
    (s) => s.removeMastInspectionItem
  );
  const resetMastInspectionChecklist = useProjectStore(
    (s) => s.resetMastInspectionChecklist
  );
  const updateMastInspectionMeta = useProjectStore(
    (s) => s.updateMastInspectionMeta
  );

  const selectedMastTarget = useUiStore((s) => s.selectedMastTarget);
  const setSelectedMastTarget = useUiStore((s) => s.setSelectedMastTarget);
  const setInspectionReportOpen = useUiStore((s) => s.setInspectionReportOpen);

  const [viewMode, setViewMode] = useState<'workspace' | 'report'>('workspace');
  const [addingItem, setAddingItem] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newPlanMeasurement, setNewPlanMeasurement] = useState('');

  const { vm } = useMemo(() => buildVerticalMastOverviewData(project), [project]);

  const isSection = selectedMastTarget.kind === 'section';
  const section = isSection
    ? vm.sections.find((s) => s.id === selectedMastTarget.id) ?? vm.sections[0]
    : undefined;
  const guyLayer = !isSection
    ? vm.guyLayers.find((g) => g.id === selectedMastTarget.id) ?? vm.guyLayers[0]
    : undefined;

  const holder = isSection ? section : guyLayer;
  const activeId = holder?.id ?? selectedMastTarget.id;

  const allRows = useMemo(
    () => buildVerticalMastInspectionRows(selectedMastTarget.kind, section, guyLayer),
    [selectedMastTarget.kind, section, guyLayer]
  );

  const reportableInspections = useMemo(
    () => getReportableInspections(allRows),
    [allRows]
  );

  const defaultItemByKey = useMemo(
    () =>
      new Map(
        getVerticalMastInspectionChecklistItems(
          selectedMastTarget.kind,
          section,
          guyLayer
        ).map((i) => [i.key, i])
      ),
    [selectedMastTarget.kind, section, guyLayer]
  );

  const hasChecklistChanges = Boolean(
    (holder?.customInspectionItems?.length ?? 0) > 0 ||
      (holder?.removedInspectionKeys?.length ?? 0) > 0 ||
      (holder?.inspectionChecklist &&
        Object.keys(holder.inspectionChecklist).length > 0)
  );

  const meta = holder?.inspectionMeta ?? {};
  const inspectionDate = meta.inspectionDate ?? project.lastUpdated;
  const weekdayLabel = getWeekdayName(inspectionDate);
  const passedCount = reportableInspections.filter((i) => i.status === 'Passed').length;
  const photosCount = reportableInspections.filter((i) => Boolean(i.photoDataUrl)).length;

  const handleMarkAllPassed = () => {
    for (const item of reportableInspections) {
      updateMastInspectionItem(selectedMastTarget.kind, activeId, item.key, {
        status: 'Passed',
      });
    }
    updateMastInspectionMeta(selectedMastTarget.kind, activeId, {
      overallStatus: 'Passed',
    });
  };

  const handleAddChecklistItem = () => {
    const trimmed = newDescription.trim();
    if (!trimmed) return;
    addMastInspectionItem(selectedMastTarget.kind, activeId, {
      description: trimmed,
      planMeasurement: newPlanMeasurement.trim(),
    });
    setNewDescription('');
    setNewPlanMeasurement('');
    setAddingItem(false);
  };

  return (
    <div className="p-2.5 sm:p-4 max-w-7xl w-full mx-auto space-y-3 sm:space-y-4">
      {/* Top Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() =>
                setSelectedMastTarget({
                  kind: 'section',
                  id: section?.id ?? vm.sections[0].id,
                })
              }
              className={`min-h-10 sm:min-h-0 px-2.5 py-1.5 rounded-md cursor-pointer ${
                isSection
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tower Section
            </button>
            <button
              type="button"
              onClick={() =>
                setSelectedMastTarget({
                  kind: 'guy_layer',
                  id: guyLayer?.id ?? vm.guyLayers[0].id,
                })
              }
              className={`min-h-10 sm:min-h-0 px-2.5 py-1.5 rounded-md cursor-pointer ${
                !isSection
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Guy Layer
            </button>
          </div>

          {isSection ? (
            <select
              value={activeId}
              onChange={(e) =>
                setSelectedMastTarget({ kind: 'section', id: e.target.value })
              }
              className="w-full sm:w-auto max-w-full min-w-0 min-h-10 sm:min-h-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
            >
              {vm.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.elevationFromM.toFixed(0)}–{s.elevationToM.toFixed(0)}m (
                  {TOWER_SECTION_STATUS_META[s.status].label})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={activeId}
              onChange={(e) =>
                setSelectedMastTarget({ kind: 'guy_layer', id: e.target.value })
              }
              className="w-full sm:w-auto max-w-full min-w-0 min-h-10 sm:min-h-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
            >
              {vm.guyLayers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id} — +{g.elevationM.toFixed(1)}m ({g.anchorRingLabel} ·{' '}
                  {GUY_LAYER_STATUS_META[g.status].label})
                </option>
              ))}
            </select>
          )}

          <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
            {passedCount}/{reportableInspections.length} Passed
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-medium">
            {photosCount}/{reportableInspections.length} Photos
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('workspace')}
              className={`min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md font-medium cursor-pointer ${
                viewMode === 'workspace'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inspection Form
            </button>
            <button
              type="button"
              onClick={() => setViewMode('report')}
              className={`min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md font-medium cursor-pointer ${
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
            onClick={() => setInspectionReportOpen(true)}
            title="Print / Save PDF"
            aria-label="Print / Save PDF"
            className="inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
        </div>
      </div>

      {viewMode === 'report' ? (
        <div className="bg-white border border-slate-300 shadow-xs overflow-x-auto rounded-xl">
          <VerticalMastInspectionSheet
            project={project}
            target={selectedMastTarget}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left Column: Elevation Diagram + Metadata */}
          <div className="xl:col-span-5 space-y-4">
            <VerticalMastElevation2D
              verticalMast={vm}
              selectedTarget={selectedMastTarget}
              onSelectTarget={(t) => setSelectedMastTarget(t)}
              compact
            />

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900">
                Inspection Session &amp; Verdict ({activeId})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Inspection Date{' '}
                    {weekdayLabel ? (
                      <span className="text-sky-700 font-medium">
                        ({weekdayLabel})
                      </span>
                    ) : null}
                  </label>
                  <input
                    type="date"
                    value={inspectionDate}
                    onChange={(e) =>
                      updateMastInspectionMeta(selectedMastTarget.kind, activeId, {
                        inspectionDate: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Overall Verdict
                  </label>
                  <select
                    value={meta.overallStatus ?? 'Pending'}
                    onChange={(e) =>
                      updateMastInspectionMeta(selectedMastTarget.kind, activeId, {
                        overallStatus: e.target.value as FoundationInspectionStatus,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    {INSPECTION_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    QA/QC Inspector
                  </label>
                  <input
                    type="text"
                    value={meta.inspectorName ?? ''}
                    onChange={(e) =>
                      updateMastInspectionMeta(selectedMastTarget.kind, activeId, {
                        inspectorName: e.target.value,
                      })
                    }
                    placeholder="Engineer name"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Contractor Representative
                  </label>
                  <input
                    type="text"
                    value={meta.contractorRep ?? ''}
                    onChange={(e) =>
                      updateMastInspectionMeta(selectedMastTarget.kind, activeId, {
                        contractorRep: e.target.value,
                      })
                    }
                    placeholder="Site lead / Foreman"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Overall Inspection Remarks
                </label>
                <textarea
                  rows={2}
                  value={meta.generalNotes ?? ''}
                  onChange={(e) =>
                    updateMastInspectionMeta(selectedMastTarget.kind, activeId, {
                      generalNotes: e.target.value,
                    })
                  }
                  placeholder="Summary notes for plumbness, bolt torque, wire rope clips, or punch items..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Flexible Checklist Items */}
          <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {activeId} Inspection Checklist ({reportableInspections.length} items)
                </h3>
                <p className="text-xs text-slate-500">
                  Edit descriptions or tolerances inline, add custom checks, remove, or reset to baseline
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMarkAllPassed}
                  className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="sm:hidden">All Passed</span>
                  <span className="hidden sm:inline">Mark All Passed</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddingItem((v) => !v)}
                  className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  Add Check
                </button>
                {hasChecklistChanges && (
                  <button
                    type="button"
                    onClick={() =>
                      resetMastInspectionChecklist(selectedMastTarget.kind, activeId)
                    }
                    className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
                    title="Reset checklist to default ZT-120-01 checks"
                  >
                    <RotateCcw className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {addingItem && (
              <div className="p-3 bg-sky-50/60 border-b border-sky-200 flex flex-wrap items-end gap-2 text-xs">
                <div className="flex-1 min-w-0 sm:min-w-48">
                  <label className="block font-semibold text-slate-700 mb-1">
                    New Inspection Requirement
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="e.g. Anemometer boom orientation at +118m"
                    className="w-full h-10 sm:h-auto px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Plan / Tolerance
                  </label>
                  <input
                    type="text"
                    value={newPlanMeasurement}
                    onChange={(e) => setNewPlanMeasurement(e.target.value)}
                    placeholder="e.g. True North ±2°"
                    className="w-full h-10 sm:h-auto px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="min-h-10 sm:min-h-0 px-4 sm:px-3 py-2 sm:py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>
            )}

            <div className="divide-y divide-slate-200">
              {reportableInspections.map((item, idx) => {
                const defaultItem = defaultItemByKey.get(item.key);
                return (
                  <div key={item.key} className="p-3.5 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 sm:w-5 sm:h-5 shrink-0 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) =>
                              updateMastInspectionItem(
                                selectedMastTarget.kind,
                                activeId,
                                item.key,
                                { description: e.target.value }
                              )
                            }
                            placeholder={defaultItem?.description ?? 'Description'}
                            className="flex-1 min-w-0 px-2 py-1.5 sm:py-1 rounded border border-transparent hover:border-slate-300 focus:border-sky-500 font-semibold text-slate-900 bg-transparent focus:bg-white focus:outline-none"
                          />
                        </div>
                        <div className="pl-0 sm:pl-7 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-500">Plan:</span>
                          <input
                            type="text"
                            value={item.planMeasurement}
                            onChange={(e) =>
                              updateMastInspectionItem(
                                selectedMastTarget.kind,
                                activeId,
                                item.key,
                                { planMeasurement: e.target.value }
                              )
                            }
                            className="flex-1 min-w-0 px-2 py-1 sm:py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-sky-500 bg-transparent focus:bg-white focus:outline-none text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={item.status}
                          onChange={(e) =>
                            updateMastInspectionItem(
                              selectedMastTarget.kind,
                              activeId,
                              item.key,
                              {
                                status: e.target
                                  .value as FoundationInspectionStatus,
                              }
                            )
                          }
                          className={`min-h-10 sm:min-h-0 px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-lg border text-xs font-bold cursor-pointer ${
                            item.status === 'Passed'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : item.status === 'For Rectification'
                                ? 'bg-rose-50 border-rose-300 text-rose-800'
                                : item.status === 'N/A'
                                  ? 'bg-slate-100 border-slate-300 text-slate-600'
                                  : 'bg-amber-50 border-amber-300 text-amber-800'
                          }`}
                        >
                          {INSPECTION_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            removeMastInspectionItem(
                              selectedMastTarget.kind,
                              activeId,
                              item.key
                            )
                          }
                          className="min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center p-2 sm:p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Remove checklist item"
                          aria-label="Remove checklist item"
                        >
                          <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="pl-0 sm:pl-7 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={item.actualMeasurement}
                        onChange={(e) =>
                          updateMastInspectionItem(
                            selectedMastTarget.kind,
                            activeId,
                            item.key,
                            { actualMeasurement: e.target.value }
                          )
                        }
                        placeholder="Actual measurement / reading..."
                        className="sm:col-span-5 px-2.5 py-2 sm:py-1.5 rounded-lg border border-slate-300 text-xs"
                      />
                      <input
                        type="text"
                        value={item.remarks}
                        onChange={(e) =>
                          updateMastInspectionItem(
                            selectedMastTarget.kind,
                            activeId,
                            item.key,
                            { remarks: e.target.value }
                          )
                        }
                        placeholder="Field remarks..."
                        className="sm:col-span-5 px-2.5 py-2 sm:py-1.5 rounded-lg border border-slate-300 text-xs"
                      />
                      <label className="sm:col-span-2 min-h-10 sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 sm:px-2 py-2 sm:py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer text-xs sm:text-[11px]">
                        <ImagePlus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        <span>{item.photoDataUrl ? 'Replace' : 'Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const dataUrl = await readAndResizeImageFile(file);
                            updateMastInspectionItem(
                              selectedMastTarget.kind,
                              activeId,
                              item.key,
                              {
                                photoDataUrl: dataUrl,
                                photoName: file.name,
                              }
                            );
                          }}
                        />
                      </label>
                    </div>

                    {item.photoDataUrl && (
                      <div className="pl-0 sm:pl-7 flex items-center gap-3">
                        <img
                          src={item.photoDataUrl}
                          alt={item.description}
                          className="w-24 h-16 object-cover rounded border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateMastInspectionItem(
                              selectedMastTarget.kind,
                              activeId,
                              item.key,
                              { photoDataUrl: undefined, photoName: undefined }
                            )
                          }
                          className="min-h-9 sm:min-h-0 px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-xs sm:text-[11px] font-semibold text-rose-600 hover:bg-rose-100 cursor-pointer"
                        >
                          Remove Photo
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
