import { useState } from 'react';
import {
  CheckCheck,
  ClipboardCheck,
  ImagePlus,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  buildFoundationActivityReportData,
  getReportableInspections,
  getWeekdayName,
} from '@/entities/project/calculations';
import {
  FOUNDATION_SPECS,
  STATUS_META,
  getFoundationInspectionChecklistItems,
} from '@/entities/project/mast2Baseline';
import type {
  FoundationInspectionItemKey,
  FoundationInspectionStatus,
  FoundationRecord,
  MastProjectState,
} from '@/entities/project/types';
import { uploadOrStageProjectImage } from '@/shared/lib/imageUpload';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { resolveMatchingPreparedSignature } from '@/widgets/report/ReportLetterhead';
import { SignatureUploadControl } from '@/widgets/report/SignatureUploadControl';
import { InspectionReportSheet } from './InspectionReportSheet';

const INSPECTION_STATUS_OPTIONS: FoundationInspectionStatus[] = [
  'Pending',
  'Passed',
  'For Rectification',
  'N/A',
];

export function FoundationInspectionView({
  project,
  selectedFoundation,
}: {
  project: MastProjectState;
  selectedFoundation: FoundationRecord;
}) {
  const [viewMode, setViewMode] = useState<'workspace' | 'report'>('workspace');
  const [addingItem, setAddingItem] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newPlanMeasurement, setNewPlanMeasurement] = useState('');

  const selectFoundation = useProjectStore((s) => s.selectFoundation);
  const updateFoundationInspectionItem = useProjectStore(
    (s) => s.updateFoundationInspectionItem
  );
  const addFoundationInspectionItem = useProjectStore(
    (s) => s.addFoundationInspectionItem
  );
  const removeFoundationInspectionItem = useProjectStore(
    (s) => s.removeFoundationInspectionItem
  );
  const resetFoundationInspectionChecklist = useProjectStore(
    (s) => s.resetFoundationInspectionChecklist
  );
  const updateFoundationInspectionMeta = useProjectStore(
    (s) => s.updateFoundationInspectionMeta
  );
  const setInspectionReportOpen = useUiStore((s) => s.setInspectionReportOpen);

  const report = buildFoundationActivityReportData(project, null, selectedFoundation);
  const defaultItemByKey = new Map(
    getFoundationInspectionChecklistItems(selectedFoundation.type).map((i) => [
      i.key,
      i,
    ])
  );
  const hasChecklistChanges = Boolean(
    (selectedFoundation.customInspectionItems?.length ?? 0) > 0 ||
      (selectedFoundation.removedInspectionKeys?.length ?? 0) > 0 ||
      (selectedFoundation.inspectionChecklist &&
        Object.keys(selectedFoundation.inspectionChecklist).length > 0)
  );
  const reportableInspections = getReportableInspections(report.inspections);
  const spec = FOUNDATION_SPECS[selectedFoundation.type];
  const meta = selectedFoundation.inspectionMeta ?? {};
  const inspectionDate = meta.inspectionDate ?? project.lastUpdated;
  const weekdayLabel = getWeekdayName(inspectionDate);
  const passedCount = reportableInspections.filter((i) => i.status === 'Passed').length;
  const photosCount = reportableInspections.filter((i) => Boolean(i.photoDataUrl)).length;
  const inheritedInspectorSignature = resolveMatchingPreparedSignature(
    project,
    meta.inspectorName
  );

  const handleUploadInspectionPhoto = (
    key: FoundationInspectionItemKey,
    photoDataUrl: string,
    photoName: string
  ) => {
    updateFoundationInspectionItem(selectedFoundation.id, key, {
      photoDataUrl,
      photoName,
    });
  };

  const handleMarkAllPassed = () => {
    for (const item of reportableInspections) {
      updateFoundationInspectionItem(selectedFoundation.id, item.key, {
        status: 'Passed',
      });
    }
    updateFoundationInspectionMeta(selectedFoundation.id, { overallStatus: 'Passed' });
  };

  const handleAddChecklistItem = () => {
    const trimmedDesc = newDescription.trim();
    if (!trimmedDesc) return;
    addFoundationInspectionItem(selectedFoundation.id, {
      description: trimmedDesc,
      planMeasurement: newPlanMeasurement.trim(),
    });
    setNewDescription('');
    setNewPlanMeasurement('');
    setAddingItem(false);
  };

  return (
    <div className="flex flex-col bg-slate-50 min-h-full">
      {/* Top Foundation Inspection Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-white border-b border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
          <select
            aria-label="Select Foundation to Inspect"
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
              className={`min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer ${
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
            onClick={() => setInspectionReportOpen(true)}
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
            <InspectionReportSheet
              project={project}
              foundation={selectedFoundation}
              onSelectFoundation={selectFoundation}
              onUploadInspectionPhoto={handleUploadInspectionPhoto}
            />
          </div>
        </div>
      ) : (
        <div className="p-3 sm:p-4 max-w-7xl w-full mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column: 2D Layout + Inspection Details & Design Specs */}
            <div className="lg:col-span-5 space-y-4">
              <GroundAnchorPlan2D
                foundations={project.foundations}
                selectedId={selectedFoundation.id}
                onSelect={selectFoundation}
                calloutTitle="INSPECTING"
                title={`2D Inspection Layout — ${project.reportDetails?.projectName?.trim() || project.projectName}${
                  project.reportDetails?.referenceNo?.trim()
                    ? ` (${project.reportDetails.referenceNo.trim()})`
                    : ''
                }`}
                subtitle="Select any foundation pad on the plan to record civil QA/QC inspection measurements"
                compact
              />

              {/* Inspection Details & Specs */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <ClipboardCheck className="w-4 h-4 text-sky-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Inspection Details — {selectedFoundation.id}
                  </h2>
                </div>

                <div className="p-3.5 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="font-semibold text-slate-700 flex items-center justify-between gap-1">
                        <span>Inspection Date</span>
                        {weekdayLabel && (
                          <span className="text-[11px] font-bold text-sky-700">
                            {weekdayLabel}
                          </span>
                        )}
                      </span>
                      <input
                        type="date"
                        value={inspectionDate}
                        onChange={(e) =>
                          updateFoundationInspectionMeta(selectedFoundation.id, {
                            inspectionDate: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="font-semibold text-slate-700">Overall QA/QC Result</span>
                      <select
                        value={meta.overallStatus ?? ''}
                        onChange={(e) =>
                          updateFoundationInspectionMeta(selectedFoundation.id, {
                            overallStatus:
                              (e.target.value as FoundationInspectionStatus) || undefined,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                      >
                        <option value="">Auto (from checklist items)</option>
                        {INSPECTION_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="font-semibold text-slate-700">Inspected By (Engineer)</span>
                      <input
                        type="text"
                        value={meta.inspectorName ?? project.preparedBy}
                        onChange={(e) =>
                          updateFoundationInspectionMeta(selectedFoundation.id, {
                            inspectorName: e.target.value,
                          })
                        }
                        placeholder={project.preparedBy}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-sky-500 focus:outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="font-semibold text-slate-700">Verified by</span>
                      <input
                        type="text"
                        value={meta.contractorRep ?? ''}
                        onChange={(e) =>
                          updateFoundationInspectionMeta(selectedFoundation.id, {
                            contractorRep: e.target.value,
                          })
                        }
                        placeholder="Optional verifier name"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <SignatureUploadControl
                      label="Inspector Signature"
                      value={meta.inspectorSignatureUrl}
                      inheritedValue={inheritedInspectorSignature}
                      emptyHint="No signature — left blank"
                      defaultSignerName={meta.inspectorName || project.preparedBy}
                      onChange={(nextUrl) =>
                        updateFoundationInspectionMeta(selectedFoundation.id, {
                          inspectorSignatureUrl: nextUrl,
                        })
                      }
                    />
                    <SignatureUploadControl
                      label="Verified by Signature"
                      value={meta.verifiedSignatureUrl}
                      defaultSignerName={meta.contractorRep}
                      emptyHint={
                        meta.contractorRep?.trim()
                          ? 'No signature — left blank'
                          : 'Enter "Verified by" to include'
                      }
                      onChange={(nextUrl) =>
                        updateFoundationInspectionMeta(selectedFoundation.id, {
                          verifiedSignatureUrl: nextUrl,
                        })
                      }
                    />
                  </div>

                  <label className="block">
                    <span className="font-semibold text-slate-700">
                      General Observations / Pour Clearance Notes
                    </span>
                    <textarea
                      rows={2}
                      value={meta.generalNotes ?? ''}
                      onChange={(e) =>
                        updateFoundationInspectionMeta(selectedFoundation.id, {
                          generalNotes: e.target.value,
                        })
                      }
                      placeholder="e.g. Approved for Class AA concrete pour; rebar spacing & 50mm cover spacers verified."
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-sky-500 focus:outline-none"
                    />
                  </label>

                  {/* Technical Reference Box */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1 text-[11px] text-slate-700">
                    <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                      Design Specs Reference ({spec.label})
                    </div>
                    <div>
                      Size: <strong>{report.sizeLabel}</strong> · Volume:{' '}
                      <strong>{report.volumeLabel}</strong>
                    </div>
                    <div>• Civil Hardware: {spec.anchorSummary}</div>
                    {report.rebarDetails.map((line) => (
                      <div key={line}>• {line}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Foundation Inspection Checklist Items */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Foundation Inspection Checklist — {selectedFoundation.id}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Add, remove, edit items, insert site photos, and record field measurements
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAddingItem((v) => !v)}
                      className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-lg sm:rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-200 text-xs sm:text-[11px] font-semibold text-sky-700 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      Add Item
                    </button>
                    <button
                      type="button"
                      onClick={() => resetFoundationInspectionChecklist(selectedFoundation.id)}
                      disabled={!hasChecklistChanges}
                      title="Restore default checklist items and clear recorded entries for this foundation"
                      className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-lg sm:rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed text-xs sm:text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 sm:w-3 sm:h-3" />
                      <span className="sm:hidden">Reset</span>
                      <span className="hidden sm:inline">Reset Checklist</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleMarkAllPassed}
                      disabled={reportableInspections.length === 0}
                      className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-lg sm:rounded-md bg-emerald-50 hover:bg-emerald-100 disabled:opacity-45 disabled:cursor-not-allowed border border-emerald-200 text-xs sm:text-[11px] font-semibold text-emerald-700 cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      <span className="sm:hidden">All Passed</span>
                      <span className="hidden sm:inline">Mark All Passed</span>
                    </button>
                  </div>
                </div>

                {addingItem && (
                  <div className="px-4 py-3 bg-sky-50/70 border-b border-sky-200 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">
                        Add Custom Inspection Item
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Saved to {selectedFoundation.id} checklist
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-0.5">
                          Inspection Item Name *
                        </span>
                        <input
                          type="text"
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddChecklistItem();
                            }
                          }}
                          placeholder="e.g. Slump Test & Concrete Temperature"
                          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-0.5">
                          Plan Measurement / Acceptance Spec
                        </span>
                        <input
                          type="text"
                          value={newPlanMeasurement}
                          onChange={(e) => setNewPlanMeasurement(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddChecklistItem();
                            }
                          }}
                          placeholder="e.g. 100 ± 25 mm slump; < 32 °C before pour"
                          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingItem(false);
                          setNewDescription('');
                          setNewPlanMeasurement('');
                        }}
                        className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddChecklistItem}
                        disabled={!newDescription.trim()}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-45 disabled:cursor-not-allowed text-[11px] font-semibold text-white cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Save Item
                      </button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-slate-100">
                  {report.inspections.length === 0 ? (
                    <div className="p-6 text-center space-y-2.5">
                      <p className="text-xs text-slate-500">
                        All inspection items were removed for {selectedFoundation.id}.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAddingItem(true)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-xs font-semibold text-white cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Checklist Item
                        </button>
                        <button
                          type="button"
                          onClick={() => resetFoundationInspectionChecklist(selectedFoundation.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore Default Checklist
                        </button>
                      </div>
                    </div>
                  ) : (
                    report.inspections.map((item, idx) => {
                      const defaultItem = defaultItemByKey.get(item.key);
                      const isModifiedFromDefault = Boolean(
                        defaultItem &&
                          (item.description !== defaultItem.description ||
                            item.planMeasurement !== defaultItem.planMeasurement)
                      );
                      return (
                    <div
                      key={item.key}
                      className="p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start"
                    >
                      <div className="sm:col-span-4">
                        {item.photoDataUrl ? (
                          <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <img
                              src={item.photoDataUrl}
                              alt={item.description}
                              className="w-full h-28 object-cover rounded"
                            />
                            <div className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
                              <label className="text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer">
                                Replace
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const uploaded = await uploadOrStageProjectImage({
                                      file,
                                      projectId: useProjectStore.getState().activeProjectId,
                                      category: 'inspection',
                                    });
                                    if (uploaded) {
                                      handleUploadInspectionPhoto(
                                        item.key,
                                        uploaded.url,
                                        uploaded.name
                                      );
                                    }
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  updateFoundationInspectionItem(
                                    selectedFoundation.id,
                                    item.key,
                                    { photoDataUrl: undefined, photoName: undefined }
                                  )
                                }
                                title="Remove photo"
                                className="inline-flex items-center gap-0.5 text-[11px] text-rose-600 hover:text-rose-700 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center h-28 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 hover:border-sky-500 hover:bg-sky-50/40 text-center px-2 cursor-pointer transition">
                            <ImagePlus className="w-5 h-5 text-slate-400 mb-1" />
                            <span className="text-[11px] font-semibold text-slate-600">
                              Insert Photo
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Camera / Gallery
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const uploaded = await uploadOrStageProjectImage({
                                  file,
                                  projectId: useProjectStore.getState().activeProjectId,
                                  category: 'inspection',
                                });
                                if (uploaded) {
                                  handleUploadInspectionPhoto(
                                    item.key,
                                    uploaded.url,
                                    uploaded.name
                                  );
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>

                      <div className="sm:col-span-8 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500 shrink-0">
                            {idx + 1}.
                          </span>
                          <input
                            type="text"
                            aria-label={`Inspection item ${idx + 1} title`}
                            value={item.description}
                            onChange={(e) =>
                              updateFoundationInspectionItem(
                                selectedFoundation.id,
                                item.key,
                                { description: e.target.value }
                              )
                            }
                            placeholder="Checklist item title..."
                            className="flex-1 min-w-0 rounded-md border border-slate-200 hover:border-slate-300 focus:border-sky-500 bg-white px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          {item.isCustom && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10px] font-semibold text-sky-700 shrink-0">
                              Custom
                            </span>
                          )}
                          <select
                            aria-label={`Status for ${item.description}`}
                            value={item.status}
                            onChange={(e) =>
                              updateFoundationInspectionItem(
                                selectedFoundation.id,
                                item.key,
                                {
                                  status: e.target.value as FoundationInspectionStatus,
                                }
                              )
                            }
                            className={`rounded-md border px-2 py-1 text-xs font-semibold focus:outline-none shrink-0 ${
                              item.status === 'Passed'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : item.status === 'For Rectification'
                                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                                  : 'bg-white border-slate-300 text-slate-700'
                            }`}
                          >
                            {INSPECTION_STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              removeFoundationInspectionItem(selectedFoundation.id, item.key)
                            }
                            title={`Remove checklist item: ${item.description}`}
                            aria-label={`Remove checklist item ${item.description}`}
                            className="p-1.5 rounded-md border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Plan Measurement
                            </span>
                            <div className="flex items-center gap-2">
                              {item.planMeasurement.trim() === '' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700">
                                  Blank — omitted from report
                                </span>
                              )}
                              {isModifiedFromDefault && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateFoundationInspectionItem(
                                      selectedFoundation.id,
                                      item.key,
                                      {
                                        description: undefined,
                                        planMeasurement: undefined,
                                      }
                                    )
                                  }
                                  className="text-[10px] font-semibold text-sky-700 hover:underline cursor-pointer"
                                >
                                  Reset default
                                </button>
                              )}
                            </div>
                          </div>
                          <input
                            type="text"
                            aria-label={`Plan Measurement for ${item.description}`}
                            value={item.planMeasurement}
                            placeholder="Leave blank to exclude from report..."
                            onChange={(e) =>
                              updateFoundationInspectionItem(
                                selectedFoundation.id,
                                item.key,
                                { planMeasurement: e.target.value }
                              )
                            }
                            className={`w-full rounded-md border px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none ${
                              item.planMeasurement.trim() === ''
                                ? 'border-amber-300 bg-amber-50/40 text-slate-500 placeholder:text-amber-600/70'
                                : 'border-slate-300 bg-slate-50 text-slate-800'
                            }`}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">
                              Actual Measurement
                            </span>
                            <input
                              type="text"
                              value={item.actualMeasurement}
                              placeholder="Enter actual field reading..."
                              onChange={(e) =>
                                updateFoundationInspectionItem(
                                  selectedFoundation.id,
                                  item.key,
                                  { actualMeasurement: e.target.value }
                                )
                              }
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                            />
                          </label>

                          <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">
                              Remarks
                            </span>
                            <input
                              type="text"
                              value={item.remarks}
                              placeholder="Verification notes / deviations..."
                              onChange={(e) =>
                                updateFoundationInspectionItem(
                                  selectedFoundation.id,
                                  item.key,
                                  { remarks: e.target.value }
                                )
                              }
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

