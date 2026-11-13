import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardEdit,
  Eye,
  FileText,
  Layers,
  Pencil,
  Printer,
  Ruler,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import type {
  GuyLayerRecord,
  GuyLayerStatus,
  TowerSectionRecord,
  TowerSectionStatus,
} from '@/entities/project/types';
import {
  GUY_LAYER_STATUS_META,
  SIMPLIFIED_TOWER_SECTION_STATUSES,
  TOWER_SECTION_STATUS_META,
  VERTICAL_MAST_DESIGN_SPECS,
} from '@/entities/project/verticalMastBaseline';
import { buildVerticalMastOverviewData } from '@/entities/project/verticalMastCalculations';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore, type MastSelectionTarget } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { OverallVerticalMastStatusSheet } from './OverallVerticalMastStatusSheet';
import { VerticalMastElevation2D } from './VerticalMastElevation2D';

export function VerticalMastStatusView() {
  const project = useProjectStore((s) => s.project);
  const updateTowerSectionStatus = useProjectStore((s) => s.updateTowerSectionStatus);
  const updateTowerSectionDetails = useProjectStore((s) => s.updateTowerSectionDetails);
  const batchUpdateTowerSectionRange = useProjectStore(
    (s) => s.batchUpdateTowerSectionRange
  );
  const updateGuyLayerStatus = useProjectStore((s) => s.updateGuyLayerStatus);
  const updateGuyLayerDetails = useProjectStore((s) => s.updateGuyLayerDetails);

  const setActiveAppTab = useUiStore((s) => s.setActiveAppTab);
  const selectedMastTarget = useUiStore((s) => s.selectedMastTarget);
  const setSelectedMastTarget = useUiStore((s) => s.setSelectedMastTarget);
  const setOverallReportOpen = useUiStore((s) => s.setOverallReportOpen);

  const [viewMode, setViewMode] = useState<'dashboard' | 'preview'>('dashboard');
  const [tableTab, setTableTab] = useState<'guy_layers' | 'sections'>('guy_layers');

  // Bulk section range updater
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(10);
  const [rangeStatus, setRangeStatus] = useState<TowerSectionStatus>('plumbed_verified');

  // Edit modals
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [secForm, setSecForm] = useState({
    installedDate: '',
    verifiedDate: '',
    verticalityMm: '',
    notes: '',
  });

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerForm, setLayerForm] = useState({
    installedDate: '',
    verifiedDate: '',
    notes: '',
  });

  const {
    vm,
    metrics,
    sectionStageCounts,
    guyStageCounts,
    anchorRingSummaries,
    projectedAnchorStatuses,
    anchorGuyStates,
  } = useMemo(() => buildVerticalMastOverviewData(project), [project]);

  const mappedFoundations = useMemo(
    () =>
      project.foundations.map((f) => ({
        ...f,
        status: projectedAnchorStatuses.get(f.id) ?? 'completed',
      })),
    [project.foundations, projectedAnchorStatuses]
  );

  const highlightedAnchorIds = useMemo(() => {
    if (selectedMastTarget.kind === 'guy_layer') {
      const layer = vm.guyLayers.find((g) => g.id === selectedMastTarget.id);
      if (layer) return Object.values(layer.anchorIds);
    }
    const sec = vm.sections.find((s) => s.id === selectedMastTarget.id);
    if (sec?.guyLayerIds[0]) {
      const layer = vm.guyLayers.find((g) => g.id === sec.guyLayerIds[0]);
      if (layer) return Object.values(layer.anchorIds);
    }
    return ['PF-0'];
  }, [selectedMastTarget, vm.guyLayers, vm.sections]);

  const handleOpenSectionEdit = (sec: TowerSectionRecord) => {
    setEditingSectionId(sec.id);
    setSecForm({
      installedDate: sec.installedDate ?? '',
      verifiedDate: sec.verifiedDate ?? '',
      verticalityMm: sec.verticalityMm ?? '',
      notes: sec.notes ?? '',
    });
  };

  const handleSaveSectionEdit = () => {
    if (!editingSectionId) return;
    updateTowerSectionDetails(editingSectionId, {
      installedDate: secForm.installedDate,
      verifiedDate: secForm.verifiedDate,
      verticalityMm: secForm.verticalityMm,
      notes: secForm.notes,
    });
    setEditingSectionId(null);
  };

  const handleOpenLayerEdit = (layer: GuyLayerRecord) => {
    setEditingLayerId(layer.id);
    setLayerForm({
      installedDate: layer.installedDate ?? '',
      verifiedDate: layer.verifiedDate ?? '',
      notes: layer.notes ?? '',
    });
  };

  const handleSaveLayerEdit = () => {
    if (!editingLayerId) return;
    updateGuyLayerDetails(editingLayerId, {
      installedDate: layerForm.installedDate,
      verifiedDate: layerForm.verifiedDate,
      notes: layerForm.notes,
    });
    setEditingLayerId(null);
  };

  const handleJumpToActivity = (target: MastSelectionTarget) => {
    setSelectedMastTarget(target);
    setActiveAppTab('activity');
  };

  const handleSelectAnchorNode = (foundationId: string) => {
    if (foundationId === 'PF-0') {
      setSelectedMastTarget({ kind: 'section', id: 'S01' });
      return;
    }
    const matching = vm.guyLayers.find((g) =>
      Object.values(g.anchorIds).includes(foundationId)
    );
    if (matching) {
      setSelectedMastTarget({ kind: 'guy_layer', id: matching.id });
    }
  };

  const editingSection = editingSectionId
    ? vm.sections.find((s) => s.id === editingSectionId)
    : null;
  const editingLayer = editingLayerId
    ? vm.guyLayers.find((g) => g.id === editingLayerId)
    : null;

  return (
    <div className="p-2.5 sm:p-4 max-w-7xl w-full mx-auto space-y-3 sm:space-y-4">
      {/* Top Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Overall Vertical Mast Erection Status
          </h2>
          <p className="text-xs text-slate-500">
            120m Guyed Lattice Tower ({VERTICAL_MAST_DESIGN_SPECS.drawingNo}) · 41 Sections (S01–S41, 123m + 6m Rod) · 16 Guy Layers (L01–L16) across 4 Anchor Rings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className={`inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'dashboard'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardEdit className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="sm:hidden">Dashboard</span>
              <span className="hidden sm:inline">Status Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span>Report Preview</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOverallReportOpen(true)}
            title="Print / Save PDF"
            aria-label="Print / Save PDF"
            className="inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
        </div>
      </div>

      {viewMode === 'preview' ? (
        <div className="bg-white border border-slate-300 shadow-xs overflow-x-auto rounded-xl">
          <OverallVerticalMastStatusSheet
            project={project}
            onSelectTarget={handleJumpToActivity}
          />
        </div>
      ) : (
        <>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Overall Tower Erection</span>
                <Ruler className="w-4 h-4 text-sky-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {metrics.overallProgressPct}%
                </span>
                <span className="text-xs text-slate-500">weighted progress</span>
              </div>
              <div className="mt-2.5 w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-sky-600 rounded-full transition-all"
                  style={{ width: `${metrics.overallProgressPct}%` }}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Tower Height &amp; Sections</span>
                <Layers className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {metrics.erectedHeightM} m
                </span>
                <span className="text-xs text-slate-500">/ {metrics.totalHeightM} m</span>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                <span className="font-semibold text-emerald-700">
                  {metrics.erectedSections}/{metrics.totalSections}
                </span>{' '}
                bolted+ · {metrics.verifiedSections} plumbed &amp; verified
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Guy Cable Strands</span>
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {metrics.tensionedStrands} / {metrics.totalStrands}
                </span>
                <span className="text-xs text-slate-500">tensioned</span>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                <span className="font-semibold text-teal-700">
                  {metrics.tensionedGuyLayers}/{metrics.totalGuyLayers}
                </span>{' '}
                guy layers fully tensioned (3 sectors)
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Daily Erection Logs</span>
                <FileText className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {project.dailyLogs.length}
                </span>
                <span className="text-xs text-slate-500">field reports</span>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                {metrics.totalManDays} man-days · {metrics.totalManHours} total hrs
              </div>
            </div>
          </div>

          {/* Dual Diagrams: Vertical Elevation + 2D Anchor Plan */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-6 flex flex-col">
              <VerticalMastElevation2D
                verticalMast={vm}
                selectedTarget={selectedMastTarget}
                onSelectTarget={(target) => setSelectedMastTarget(target)}
                fillParent
              />
            </div>

            <div className="xl:col-span-6 flex flex-col">
              <GroundAnchorPlan2D
                foundations={mappedFoundations}
                anchorGuyStates={anchorGuyStates}
                selectedId={highlightedAnchorIds[0] ?? 'PF-0'}
                highlightedIds={highlightedAnchorIds}
                calloutTitle="ACTIVE GUY ANCHORS"
                title="2D Ground Anchor Plan — Guying Ring Mapping (18m / 36m / 54m / 72m)"
                subtitle="Color reflects guy cable anchorage count per anchor block (Sectors I 30°, II 150°, III 270°)"
                onSelect={handleSelectAnchorNode}
                fillParent
              />
            </div>
          </div>

          {/* Stage Breakdown & Bulk Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Section & Guy Stage Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tower Section Erection Breakdown (S01–S41)
                </h3>
                <div className="mt-2.5 space-y-2">
                  {sectionStageCounts.map((row) => (
                    <div key={row.status} className="flex items-center gap-2.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="w-28 sm:w-40 font-medium text-slate-700 truncate">
                        {row.label}
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${row.pct}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right font-semibold text-slate-800">
                        {row.count}/{vm.sections.length}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Guy Layer Tensioning Breakdown (L01–L16)
                </h3>
                <div className="mt-2.5 space-y-2">
                  {guyStageCounts.map((row) => (
                    <div key={row.status} className="flex items-center gap-2.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="w-28 sm:w-40 font-medium text-slate-700 truncate">
                        {row.label}
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${row.pct}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right font-semibold text-slate-800">
                        {row.count}/16
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Anchor Ring Summary + Quick Bulk Section Range Updater */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Anchor Ring Guy Cable Rollup
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any ring to highlight its 3 sector anchors on the 2D layout
                </p>
                <div className="mt-3 space-y-2.5">
                  {anchorRingSummaries.map((ring) => (
                    <button
                      key={ring.ringKey}
                      type="button"
                      onClick={() => {
                        if (ring.layerIds[0]) {
                          setSelectedMastTarget({
                            kind: 'guy_layer',
                            id: ring.layerIds[0],
                          });
                        }
                      }}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          {ring.ringLabel}
                        </span>
                        <span className="font-semibold text-sky-700">
                          {ring.tensionedStrands}/{ring.totalStrands} strands ·{' '}
                          {ring.avgProgressPct}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Layers {ring.layerIds[0]}–{ring.layerIds[ring.layerIds.length - 1]}{' '}
                        ({ring.elevationsLabel})
                      </div>
                      <div className="mt-1.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-600 rounded-full"
                          style={{ width: `${ring.avgProgressPct}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600" />
                  Batch Update Section Range (S01–S41)
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-1 text-slate-600">
                    From
                    <select
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(Number(e.target.value))}
                      className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 font-medium"
                    >
                      {vm.sections.map((s) => (
                        <option key={s.id} value={s.sectionNo}>
                          {s.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-1 text-slate-600">
                    To
                    <select
                      value={rangeTo}
                      onChange={(e) => setRangeTo(Number(e.target.value))}
                      className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 font-medium"
                    >
                      {vm.sections.map((s) => (
                        <option key={s.id} value={s.sectionNo}>
                          {s.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <select
                    value={rangeStatus}
                    onChange={(e) =>
                      setRangeStatus(e.target.value as TowerSectionStatus)
                    }
                    className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 font-medium"
                  >
                    {SIMPLIFIED_TOWER_SECTION_STATUSES.map(
                      (st) => (
                        <option key={st} value={st}>
                          {TOWER_SECTION_STATUS_META[st].label}
                        </option>
                      )
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      batchUpdateTowerSectionRange(rangeFrom, rangeTo, rangeStatus)
                    }
                    className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer"
                  >
                    Apply Range
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Registry Table: Guy Layers vs Tower Sections */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {tableTab === 'guy_layers'
                    ? '16 Guying Layers (L01–L16 · Sectors I, II, III)'
                    : '41 Modular Tower Sections (S01–S41 · 0.0m to 123.0m)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Update status inline, edit erection dates/notes, or open 2D Erection details
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setTableTab('guy_layers')}
                  className={`px-3 py-1.5 rounded-md cursor-pointer ${
                    tableTab === 'guy_layers'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Guy Layers (16)
                </button>
                <button
                  type="button"
                  onClick={() => setTableTab('sections')}
                  className={`px-3 py-1.5 rounded-md cursor-pointer ${
                    tableTab === 'sections'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tower Sections ({vm.sections.length})
                </button>
              </div>
            </div>

            {tableTab === 'guy_layers' ? (
              <>
              {/* Mobile Guy Layer Cards */}
              <div className="md:hidden divide-y divide-slate-200">
                {vm.guyLayers.map((layer) => {
                  const meta = GUY_LAYER_STATUS_META[layer.status];
                  const isSelected =
                    selectedMastTarget.kind === 'guy_layer' &&
                    selectedMastTarget.id === layer.id;
                  return (
                    <div
                      key={layer.id}
                      className={`p-3.5 space-y-2.5 ${
                        isSelected ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900">
                              {layer.id}
                            </span>
                            <span className="text-xs font-semibold text-sky-700">
                              +{layer.elevationM.toFixed(1)} m
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              · {layer.sectionId}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {layer.anchorRingLabel} · {layer.cableSpec}
                          </div>
                        </div>

                        <select
                          aria-label={`Status for ${layer.id}`}
                          value={layer.status}
                          onChange={(e) =>
                            updateGuyLayerStatus(
                              layer.id,
                              e.target.value as GuyLayerStatus
                            )
                          }
                          className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 shrink-0"
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: meta.color,
                          }}
                        >
                          {(Object.keys(GUY_LAYER_STATUS_META) as GuyLayerStatus[]).map(
                            (st) => (
                              <option key={st} value={st}>
                                {GUY_LAYER_STATUS_META[st].label}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(['I', 'II', 'III'] as const).map((secKey) => {
                          const sec = layer.sectors[secKey];
                          const badgeCls = sec.tensioned
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : sec.terminated
                              ? 'bg-sky-100 text-sky-800 border-sky-300'
                              : sec.pulled
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-slate-100 text-slate-500 border-slate-200';
                          return (
                            <span
                              key={secKey}
                              className={`px-2 py-0.5 rounded border text-[10px] font-bold ${badgeCls}`}
                            >
                              Sector {secKey}:{' '}
                              {sec.tensioned
                                ? `Tensioned${sec.tensionKn ? ` (${sec.tensionKn} kN)` : ''}`
                                : sec.terminated
                                  ? 'Terminated'
                                  : sec.pulled
                                    ? 'Pulled'
                                    : 'Pending'}
                            </span>
                          );
                        })}
                      </div>

                      {(layer.installedDate || layer.verifiedDate || layer.notes) && (
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-[11px] text-slate-600 space-y-0.5">
                          {layer.installedDate && (
                            <div className="font-medium text-slate-700">
                              Installed: {formatDateWithWeekday(layer.installedDate)}
                            </div>
                          )}
                          {layer.verifiedDate && (
                            <div className="font-medium text-emerald-700">
                              Verified: {formatDateWithWeekday(layer.verifiedDate)}
                            </div>
                          )}
                          {layer.notes && (
                            <div className="text-slate-500 line-clamp-2">{layer.notes}</div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleOpenLayerEdit(layer)}
                          className="flex-1 min-h-10 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit Dates &amp; Notes
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleJumpToActivity({
                              kind: 'section',
                              id: layer.sectionId,
                            })
                          }
                          title={`Open ${layer.sectionId} details`}
                          aria-label={`Open ${layer.sectionId} details`}
                          className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 cursor-pointer shrink-0"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Layer</th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Elevation &amp; Anchor Ring
                      </th>
                      <th className="text-left px-3 py-2 font-semibold">Section</th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Cable &amp; Hardware
                      </th>
                      <th className="text-center px-3 py-2 font-semibold">
                        Sectors (I / II / III)
                      </th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Dates / Notes
                      </th>
                      <th className="text-right px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vm.guyLayers.map((layer) => {
                      const meta = GUY_LAYER_STATUS_META[layer.status];
                      const isSelected =
                        selectedMastTarget.kind === 'guy_layer' &&
                        selectedMastTarget.id === layer.id;
                      return (
                        <tr
                          key={layer.id}
                          className={`hover:bg-slate-50 ${
                            isSelected ? 'bg-sky-50/50' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                            {layer.id}
                          </td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                            <span className="font-semibold text-sky-700">
                              +{layer.elevationM.toFixed(1)} m
                            </span>{' '}
                            · {layer.anchorRingLabel}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                            {layer.sectionId}
                          </td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                            {layer.cableSpec}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {(['I', 'II', 'III'] as const).map((secKey) => {
                                const sec = layer.sectors[secKey];
                                const badgeCls = sec.tensioned
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : sec.terminated
                                    ? 'bg-sky-100 text-sky-800 border-sky-300'
                                    : sec.pulled
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-slate-100 text-slate-500 border-slate-200';
                                return (
                                  <span
                                    key={secKey}
                                    className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${badgeCls}`}
                                    title={`Sector ${secKey}: ${
                                      sec.tensioned
                                        ? `Tensioned${sec.tensionKn ? ` (${sec.tensionKn} kN)` : ''}`
                                        : sec.terminated
                                          ? 'Terminated'
                                          : sec.pulled
                                            ? 'Pulled'
                                            : 'Pending'
                                    }`}
                                  >
                                    {secKey}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <select
                              value={layer.status}
                              onChange={(e) =>
                                updateGuyLayerStatus(
                                  layer.id,
                                  e.target.value as GuyLayerStatus
                                )
                              }
                              className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-800"
                              style={{
                                borderLeftWidth: 3,
                                borderLeftColor: meta.color,
                              }}
                            >
                              {(Object.keys(GUY_LAYER_STATUS_META) as GuyLayerStatus[]).map(
                                (st) => (
                                  <option key={st} value={st}>
                                    {GUY_LAYER_STATUS_META[st].label}
                                  </option>
                                )
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-xs">
                            <div className="space-y-0.5">
                              {layer.installedDate && (
                                <div className="text-[11px] font-medium text-slate-700">
                                  Installed: {formatDateWithWeekday(layer.installedDate)}
                                </div>
                              )}
                              {layer.verifiedDate && (
                                <div className="text-[11px] font-medium text-emerald-700">
                                  Verified: {formatDateWithWeekday(layer.verifiedDate)}
                                </div>
                              )}
                              {layer.notes ? (
                                <div className="text-[11px] text-slate-500 truncate">
                                  {layer.notes}
                                </div>
                              ) : (
                                !layer.installedDate &&
                                !layer.verifiedDate && (
                                  <span className="text-slate-400">—</span>
                                )
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenLayerEdit(layer)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleJumpToActivity({
                                    kind: 'section',
                                    id: layer.sectionId,
                                  })
                                }
                                className="px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold border border-sky-200 cursor-pointer"
                              >
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            ) : (
              <>
              {/* Mobile Tower Section Cards */}
              <div className="md:hidden divide-y divide-slate-200">
                {vm.sections.map((sec) => {
                  const meta = TOWER_SECTION_STATUS_META[sec.status];
                  const isSelected =
                    selectedMastTarget.kind === 'section' &&
                    selectedMastTarget.id === sec.id;
                  return (
                    <div
                      key={sec.id}
                      className={`p-3.5 space-y-2.5 ${
                        isSelected ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {sec.id}
                            </span>
                            <span className="text-xs font-semibold text-sky-700">
                              {sec.elevationFromM.toFixed(1)}–{sec.elevationToM.toFixed(1)} m
                            </span>
                            <span className="text-[11px] font-bold text-slate-700">
                              ({meta.pct}%)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {sec.legSpec} · {sec.boltSpec}
                          </div>
                        </div>

                        <select
                          aria-label={`Status for ${sec.id}`}
                          value={sec.status}
                          onChange={(e) =>
                            updateTowerSectionStatus(
                              sec.id,
                              e.target.value as TowerSectionStatus
                            )
                          }
                          className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 shrink-0"
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: meta.color,
                          }}
                        >
                          {SIMPLIFIED_TOWER_SECTION_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {TOWER_SECTION_STATUS_META[st].label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(sec.hasPlatform || sec.hasLightningRod || sec.guyLayerIds.length > 0) && (
                        <div className="flex flex-wrap gap-1">
                          {sec.hasPlatform && (
                            <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200 text-[10px] font-semibold">
                              Platform +7m
                            </span>
                          )}
                          {sec.hasLightningRod && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                              Lightning Rod 6m
                            </span>
                          )}
                          {sec.guyLayerIds.map((gid) => (
                            <span
                              key={gid}
                              className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-semibold"
                            >
                              {gid}
                            </span>
                          ))}
                        </div>
                      )}

                      {(sec.installedDate || sec.verticalityMm || sec.notes) && (
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-[11px] text-slate-600 space-y-0.5">
                          {sec.installedDate && (
                            <div className="font-medium text-slate-700">
                              Erected: {formatDateWithWeekday(sec.installedDate)}
                            </div>
                          )}
                          {sec.verticalityMm && (
                            <div className="text-sky-700 font-medium">
                              Verticality: {sec.verticalityMm}
                            </div>
                          )}
                          {sec.notes && (
                            <div className="text-slate-500 line-clamp-2">{sec.notes}</div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleOpenSectionEdit(sec)}
                          className="flex-1 min-h-10 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit Dates &amp; Verticality
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleJumpToActivity({ kind: 'section', id: sec.id })
                          }
                          title={`Open ${sec.id} details`}
                          aria-label={`Open ${sec.id} details`}
                          className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 cursor-pointer shrink-0"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto max-h-[540px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Section</th>
                      <th className="text-left px-3 py-2 font-semibold">Elevation</th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Main Leg &amp; Bolting
                      </th>
                      <th className="text-left px-3 py-2 font-semibold">Features</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                      <th className="text-right px-3 py-2 font-semibold">%</th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Dates / Verticality / Notes
                      </th>
                      <th className="text-right px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vm.sections.map((sec) => {
                      const meta = TOWER_SECTION_STATUS_META[sec.status];
                      const isSelected =
                        selectedMastTarget.kind === 'section' &&
                        selectedMastTarget.id === sec.id;
                      return (
                        <tr
                          key={sec.id}
                          className={`hover:bg-slate-50 ${
                            isSelected ? 'bg-sky-50/50' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                            {sec.id}
                          </td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                            {sec.elevationFromM.toFixed(1)}–{sec.elevationToM.toFixed(1)} m
                          </td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                            {sec.legSpec} · {sec.boltSpec}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {sec.hasPlatform && (
                                <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200 text-[10px] font-semibold">
                                  Platform +7m
                                </span>
                              )}
                              {sec.hasLightningRod && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                                  Lightning Rod 6m
                                </span>
                              )}
                              {sec.guyLayerIds.map((gid) => (
                                <span
                                  key={gid}
                                  className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-semibold"
                                >
                                  {gid}
                                </span>
                              ))}
                              {!sec.hasPlatform &&
                                !sec.hasLightningRod &&
                                sec.guyLayerIds.length === 0 && (
                                  <span className="text-slate-400">Standard</span>
                                )}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <select
                              value={sec.status}
                              onChange={(e) =>
                                updateTowerSectionStatus(
                                  sec.id,
                                  e.target.value as TowerSectionStatus
                                )
                              }
                              className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-800"
                              style={{
                                borderLeftWidth: 3,
                                borderLeftColor: meta.color,
                              }}
                            >
                              {SIMPLIFIED_TOWER_SECTION_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {TOWER_SECTION_STATUS_META[st].label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800 whitespace-nowrap">
                            {meta.pct}%
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-xs">
                            <div className="space-y-0.5">
                              {sec.installedDate && (
                                <div className="text-[11px] font-medium text-slate-700">
                                  Erected: {formatDateWithWeekday(sec.installedDate)}
                                </div>
                              )}
                              {sec.verticalityMm && (
                                <div className="text-[11px] text-sky-700 font-medium">
                                  Verticality: {sec.verticalityMm}
                                </div>
                              )}
                              {sec.notes ? (
                                <div className="text-[11px] text-slate-500 truncate">
                                  {sec.notes}
                                </div>
                              ) : (
                                !sec.installedDate &&
                                !sec.verticalityMm && (
                                  <span className="text-slate-400">—</span>
                                )
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenSectionEdit(sec)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleJumpToActivity({ kind: 'section', id: sec.id })
                                }
                                className="px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold border border-sky-200 cursor-pointer"
                              >
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Edit Tower Section Modal */}
      {editingSection && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Edit Section {editingSection.id} ({editingSection.elevationFromM}–
                  {editingSection.elevationToM} m)
                </h3>
                <p className="text-xs text-slate-500">{editingSection.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSectionId(null)}
                aria-label="Close edit section modal"
                className="h-10 w-10 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Installed Date
                  </label>
                  <input
                    type="date"
                    value={secForm.installedDate}
                    onChange={(e) =>
                      setSecForm((p) => ({ ...p, installedDate: e.target.value }))
                    }
                    className="w-full h-11 sm:h-9 px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Verified Date
                  </label>
                  <input
                    type="date"
                    value={secForm.verifiedDate}
                    onChange={(e) =>
                      setSecForm((p) => ({ ...p, verifiedDate: e.target.value }))
                    }
                    className="w-full h-11 sm:h-9 px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Verticality Reading
                </label>
                <input
                  type="text"
                  value={secForm.verticalityMm}
                  onChange={(e) =>
                    setSecForm((p) => ({ ...p, verticalityMm: e.target.value }))
                  }
                  placeholder="e.g. 0.4 mm/m (<=1/1000)"
                  className="w-full h-11 sm:h-9 px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Field Notes / Observations
                </label>
                <textarea
                  rows={3}
                  value={secForm.notes}
                  onChange={(e) => setSecForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  placeholder="Enter flange alignment, platform hatch, or safety notes..."
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSectionId(null)}
                className="min-h-11 sm:min-h-0 px-4 sm:px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSectionEdit}
                className="min-h-11 sm:min-h-0 px-5 sm:px-4 py-2 sm:py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Guy Layer Modal */}
      {editingLayer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Edit Guy Layer {editingLayer.id} (+{editingLayer.elevationM} m ·{' '}
                  {editingLayer.anchorRingLabel})
                </h3>
                <p className="text-xs text-slate-500">
                  {editingLayer.cableSpec} · Attached to {editingLayer.sectionId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLayerId(null)}
                aria-label="Close edit guy layer modal"
                className="h-10 w-10 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Installed Date
                  </label>
                  <input
                    type="date"
                    value={layerForm.installedDate}
                    onChange={(e) =>
                      setLayerForm((p) => ({ ...p, installedDate: e.target.value }))
                    }
                    className="w-full h-11 sm:h-9 px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Verified Date
                  </label>
                  <input
                    type="date"
                    value={layerForm.verifiedDate}
                    onChange={(e) =>
                      setLayerForm((p) => ({ ...p, verifiedDate: e.target.value }))
                    }
                    className="w-full h-11 sm:h-9 px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Field Notes / Turnbuckle Observations
                </label>
                <textarea
                  rows={3}
                  value={layerForm.notes}
                  onChange={(e) =>
                    setLayerForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  placeholder="Enter wire rope clamp torque, NUT-3 locking, or plumb notes..."
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingLayerId(null)}
                className="min-h-11 sm:min-h-0 px-4 sm:px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLayerEdit}
                className="min-h-11 sm:min-h-0 px-5 sm:px-4 py-2 sm:py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
