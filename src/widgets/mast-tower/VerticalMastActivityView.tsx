import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ClipboardEdit,
  Eye,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import type { TowerSectionStatus } from '@/entities/project/types';
import {
  SIMPLIFIED_TOWER_SECTION_STATUSES,
  TOWER_SECTION_STATUS_META,
  VERTICAL_MAST_DESIGN_SPECS,
  getSectionGuyChecklistItems,
  getTowerSectionChecklistSteps,
} from '@/entities/project/verticalMastBaseline';
import { buildVerticalMastOverviewData } from '@/entities/project/verticalMastCalculations';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { VerticalMastActivitySheet } from './VerticalMastActivitySheet';
import { VerticalMastElevation2D } from './VerticalMastElevation2D';

export function VerticalMastActivityView() {
  const project = useProjectStore((s) => s.project);
  const updateTowerSectionStatus = useProjectStore((s) => s.updateTowerSectionStatus);
  const toggleTowerSectionChecklistItem = useProjectStore(
    (s) => s.toggleTowerSectionChecklistItem
  );
  const updateTowerSectionDetails = useProjectStore((s) => s.updateTowerSectionDetails);
  const toggleGuyLayerSectorInstalled = useProjectStore(
    (s) => s.toggleGuyLayerSectorInstalled
  );
  const toggleGuyLayerAllTensioned = useProjectStore(
    (s) => s.toggleGuyLayerAllTensioned
  );

  const selectedMastTarget = useUiStore((s) => s.selectedMastTarget);
  const setSelectedMastTarget = useUiStore((s) => s.setSelectedMastTarget);
  const setActiveAppTab = useUiStore((s) => s.setActiveAppTab);
  const setReportOpen = useUiStore((s) => s.setReportOpen);

  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  const { vm, projectedAnchorStatuses, anchorGuyStates } = useMemo(
    () => buildVerticalMastOverviewData(project),
    [project]
  );

  const activeSection = useMemo(() => {
    if (selectedMastTarget.kind === 'section') {
      return (
        vm.sections.find((s) => s.id === selectedMastTarget.id) ?? vm.sections[0]
      );
    }
    const layer = vm.guyLayers.find((g) => g.id === selectedMastTarget.id);
    return vm.sections.find((s) => s.id === layer?.sectionId) ?? vm.sections[0];
  }, [selectedMastTarget, vm]);

  const attachedGuyLayer = useMemo(() => {
    const layerId = activeSection.guyLayerIds[0];
    if (layerId) {
      return vm.guyLayers.find((g) => g.id === layerId);
    }
    if (selectedMastTarget.kind === 'guy_layer') {
      return vm.guyLayers.find((g) => g.id === selectedMastTarget.id);
    }
    return undefined;
  }, [activeSection, selectedMastTarget, vm.guyLayers]);

  const sectionTarget = useMemo(
    () => ({ kind: 'section' as const, id: activeSection.id }),
    [activeSection.id]
  );

  const mappedFoundations = useMemo(
    () =>
      project.foundations.map((f) => ({
        ...f,
        status: projectedAnchorStatuses.get(f.id) ?? 'completed',
      })),
    [project.foundations, projectedAnchorStatuses]
  );

  const highlightedAnchors = useMemo(
    () =>
      attachedGuyLayer ? Object.values(attachedGuyLayer.anchorIds) : ['PF-0'],
    [attachedGuyLayer]
  );

  const sectionSteps = useMemo(
    () => getTowerSectionChecklistSteps(activeSection),
    [activeSection]
  );

  const guySteps = useMemo(
    () => getSectionGuyChecklistItems(attachedGuyLayer),
    [attachedGuyLayer]
  );

  const handleSelectElevationTarget = (target: {
    kind: 'section' | 'guy_layer';
    id: string;
  }) => {
    if (target.kind === 'guy_layer') {
      const layer = vm.guyLayers.find((g) => g.id === target.id);
      if (layer) {
        setSelectedMastTarget({ kind: 'section', id: layer.sectionId });
        return;
      }
    }
    setSelectedMastTarget({ kind: 'section', id: target.id });
  };

  return (
    <div className="p-2.5 sm:p-4 max-w-7xl w-full mx-auto space-y-3 sm:space-y-4">
      {/* Top Selection & Mode Bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 shrink-0">
            Tower Section
          </span>

          <select
            value={activeSection.id}
            onChange={(e) =>
              setSelectedMastTarget({ kind: 'section', id: e.target.value })
            }
            className="w-full sm:w-auto max-w-full min-w-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900"
          >
            {vm.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.elevationFromM.toFixed(0)}–{s.elevationToM.toFixed(0)}m
                {s.guyLayerIds.length > 0 ? ` · ${s.guyLayerIds.join(', ')}` : ''} (
                {TOWER_SECTION_STATUS_META[s.status].label})
              </option>
            ))}
          </select>

          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            {activeSection.legSpec} · {activeSection.boltSpec}
            {attachedGuyLayer ? ` · ${attachedGuyLayer.cableSpec}` : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md cursor-pointer ${
                viewMode === 'edit'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardEdit className="w-3.5 h-3.5" />
              Edit Erection
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Report Preview
            </button>
          </div>

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {viewMode === 'preview' ? (
        <div className="bg-white border border-slate-300 shadow-xs overflow-x-auto rounded-xl">
          <VerticalMastActivitySheet
            project={project}
            target={sectionTarget}
            onSelectTarget={handleSelectElevationTarget}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left Column: Both Vertical Elevation Diagram + 2D Ground Anchor Plan */}
          <div className="xl:col-span-6 space-y-4">
            <VerticalMastElevation2D
              verticalMast={vm}
              selectedTarget={sectionTarget}
              onSelectTarget={handleSelectElevationTarget}
            />

            <GroundAnchorPlan2D
              foundations={mappedFoundations}
              anchorGuyStates={anchorGuyStates}
              selectedId={highlightedAnchors[0] ?? 'PF-0'}
              highlightedIds={highlightedAnchors}
              calloutTitle={
                attachedGuyLayer
                  ? `SECTION ${activeSection.id} · ${attachedGuyLayer.id}`
                  : `SECTION ${activeSection.id}`
              }
              title="2D Ground Anchor Plan — Active Guy Anchor Mapping"
              subtitle={
                attachedGuyLayer
                  ? `Highlighting 3 anchors for ${activeSection.id} -> ${attachedGuyLayer.id} (+${attachedGuyLayer.elevationM}m · ${attachedGuyLayer.anchorRingLabel})`
                  : 'Base Pedestal PF-0 and 4 Guy Rings (C1, B1, A1, B2)'
              }
              onSelect={(fid) => {
                if (fid === 'PF-0') {
                  setSelectedMastTarget({ kind: 'section', id: 'S01' });
                  return;
                }
                const matches = vm.guyLayers.filter((g) =>
                  Object.values(g.anchorIds).includes(fid)
                );
                if (matches.length > 0) {
                  const curIdx = matches.findIndex(
                    (g) => g.sectionId === activeSection.id
                  );
                  const nextLayer =
                    curIdx >= 0
                      ? matches[(curIdx + 1) % matches.length]
                      : matches[0];
                  setSelectedMastTarget({
                    kind: 'section',
                    id: nextLayer.sectionId,
                  });
                }
              }}
              compact
            />
          </div>

          {/* Right Column: Activity Controls & Details */}
          <div className="xl:col-span-6 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeSection.id} — {activeSection.label}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Elevation +{activeSection.elevationFromM.toFixed(1)}m to +
                    {activeSection.elevationToM.toFixed(1)}m · {activeSection.legSpec}
                    {attachedGuyLayer
                      ? ` · Guy ${attachedGuyLayer.id} (${attachedGuyLayer.anchorRingLabel})`
                      : ''}
                  </p>
                </div>
                <select
                  value={activeSection.status}
                  onChange={(e) =>
                    updateTowerSectionStatus(
                      activeSection.id,
                      e.target.value as TowerSectionStatus
                    )
                  }
                  className="w-full sm:w-auto max-w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  {SIMPLIFIED_TOWER_SECTION_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {TOWER_SECTION_STATUS_META[st].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unified Section + Guy Cable Activity Checklist */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">
                  {attachedGuyLayer
                    ? `Activity Checklist (Tower Leg & ${attachedGuyLayer.id} Guy Cables):`
                    : 'Activity Checklist:'}
                </div>

                {sectionSteps.map((step, idx) => {
                  const done = Boolean(activeSection.checklist[step.key]);
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() =>
                        toggleTowerSectionChecklistItem(activeSection.id, step.key)
                      }
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition cursor-pointer ${
                        done
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold">
                          {idx + 1}. {step.label}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                          done
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {done ? 'Installed' : 'Pending'}
                      </span>
                    </button>
                  );
                })}

                {attachedGuyLayer &&
                  guySteps.map((item) => {
                    const sec = item.sectorKey
                      ? attachedGuyLayer.sectors[item.sectorKey]
                      : undefined;
                    const allTensioned = (['I', 'II', 'III'] as const).every(
                      (k) => attachedGuyLayer.sectors[k].tensioned
                    );
                    const done = item.sectorKey
                      ? Boolean(sec?.terminated || sec?.tensioned)
                      : allTensioned;
                    const badgeLabel = item.sectorKey
                      ? sec?.tensioned
                        ? 'Tensioned'
                        : done
                          ? 'Installed'
                          : 'Pending'
                      : allTensioned
                        ? 'Tensioned'
                        : 'Pending';

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (item.sectorKey) {
                            toggleGuyLayerSectorInstalled(
                              attachedGuyLayer.id,
                              item.sectorKey
                            );
                          } else {
                            toggleGuyLayerAllTensioned(attachedGuyLayer.id);
                          }
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition cursor-pointer ${
                          done
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className="text-xs font-semibold">
                            {item.stepNumber}. {item.label}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                            done
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {badgeLabel}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {/* Field Dates / Verticality / Notes */}
              <div className="border-t border-slate-200 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Installed Date
                  </label>
                  <input
                    type="date"
                    value={activeSection.installedDate ?? ''}
                    onChange={(e) =>
                      updateTowerSectionDetails(activeSection.id, {
                        installedDate: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Verified Date
                  </label>
                  <input
                    type="date"
                    value={activeSection.verifiedDate ?? ''}
                    onChange={(e) =>
                      updateTowerSectionDetails(activeSection.id, {
                        verifiedDate: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Verticality Reading
                  </label>
                  <input
                    type="text"
                    value={activeSection.verticalityMm ?? ''}
                    onChange={(e) =>
                      updateTowerSectionDetails(activeSection.id, {
                        verticalityMm: e.target.value,
                      })
                    }
                    placeholder="<= 1/1000"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div className="text-xs">
                <label className="block font-semibold text-slate-600 mb-1">
                  Field Notes &amp; Alignment Remarks
                </label>
                <textarea
                  rows={2}
                  value={activeSection.notes ?? ''}
                  onChange={(e) =>
                    updateTowerSectionDetails(activeSection.id, {
                      notes: e.target.value,
                    })
                  }
                  placeholder="Record gin pole lift notes, flange fitment, guy cable anchoring, or platform/lightning rod remarks..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            {/* ZT-120-01 Reference Specs + Inspection Shortcut */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">
                  {VERTICAL_MAST_DESIGN_SPECS.drawingNo} Erection Standards
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveAppTab('inspection')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold border border-sky-200 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Open Tower Inspection
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <span className="font-semibold text-slate-800 block">
                    Tower Structure &amp; Tolerance
                  </span>
                  {VERTICAL_MAST_DESIGN_SPECS.faceWidthMm}×
                  {VERTICAL_MAST_DESIGN_SPECS.faceWidthMm} mm triangular lattice ·{' '}
                  {VERTICAL_MAST_DESIGN_SPECS.verticalityTolerance}
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <span className="font-semibold text-slate-800 block">
                    Guy Hardware &amp; Finish
                  </span>
                  {VERTICAL_MAST_DESIGN_SPECS.guyCableSpec} ·{' '}
                  {VERTICAL_MAST_DESIGN_SPECS.galvanizingSpec}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
