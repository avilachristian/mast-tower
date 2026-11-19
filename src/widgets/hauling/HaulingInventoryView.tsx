import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import {
  computeCentralMaterialStatuses,
  computeHaulerCreditLedgers,
  resolveCentralMaterials,
  resolveHaulingRateConfig,
  suggestHaulingMaterialCategory,
  type HaulingTripSummary,
} from '@/entities/project/haulingInventory';
import { resolveKnownHaulerNames } from '@/entities/project/manpowerPayroll';
import type { CentralMaterialItem } from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore, type HaulingTripInput } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { HaulingRateConfigControl } from './HaulingRateConfigControl';
import { HaulingTripModal } from './HaulingTripModal';

type SubTab = 'inventory' | 'hauling_log';
type PhaseFilter = 'active' | 'all';

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function HaulingInventoryView() {
  const project = useProjectStore((s) => s.project);
  const addHaulingTrip = useProjectStore((s) => s.addHaulingTrip);
  const replaceHaulingTrip = useProjectStore((s) => s.replaceHaulingTrip);
  const deleteHaulingLogs = useProjectStore((s) => s.deleteHaulingLogs);
  const updateCentralMaterial = useProjectStore((s) => s.updateCentralMaterial);
  const addCentralMaterial = useProjectStore((s) => s.addCentralMaterial);
  const deleteCentralMaterial = useProjectStore((s) => s.deleteCentralMaterial);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);
  const setActiveAppTab = useUiStore((s) => s.setActiveAppTab);
  const setManpowerSubTab = useUiStore((s) => s.setManpowerSubTab);
  const setManpowerPaymentMode = useUiStore((s) => s.setManpowerPaymentMode);

  const activePhase = project.projectType ?? 'foundation';

  const [subTab, setSubTab] = useState<SubTab>('inventory');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Trip modal state
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<HaulingTripSummary | null>(null);

  // Add custom material modal/panel
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [newMatUnit, setNewMatUnit] = useState('pcs');
  const [newMatTarget, setNewMatTarget] = useState('0');
  const [newMatYardStock, setNewMatYardStock] = useState('0');
  const [newMatCategory, setNewMatCategory] = useState<'foundation' | 'vertical_mast' | 'shared'>(
    activePhase
  );

  const centralMaterials = useMemo(
    () => resolveCentralMaterials(project),
    [project]
  );

  const inventoryRows = useMemo(
    () => computeCentralMaterialStatuses(project),
    [project]
  );

  const filteredInventoryRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventoryRows.filter((row) => {
      if (
        phaseFilter === 'active' &&
        row.item.category !== activePhase &&
        row.item.category !== 'shared'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        row.item.name.toLowerCase().includes(q) ||
        row.item.unit.toLowerCase().includes(q)
      );
    });
  }, [inventoryRows, phaseFilter, activePhase, searchQuery]);

  const rateConfig = useMemo(
    () => resolveHaulingRateConfig(project),
    [project]
  );

  const {
    tripsNewestFirst,
    ledgers,
    totalHauledKg,
    totalCredits,
    totalEarnedPhp,
    totalBalanceDuePhp,
    totalActiveExcessKg,
  } = useMemo(
    () =>
      computeHaulerCreditLedgers(
        project.haulingLogs,
        project.haulerPayouts ?? [],
        centralMaterials,
        rateConfig
      ),
    [project.haulingLogs, project.haulerPayouts, centralMaterials, rateConfig]
  );

  const knownHaulers = useMemo(
    () => resolveKnownHaulerNames(project),
    [project]
  );

  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tripsNewestFirst;
    return tripsNewestFirst.filter(
      (trip) =>
        trip.haulerName.toLowerCase().includes(q) ||
        trip.date.includes(q) ||
        trip.items.some((i) => (i.itemLabel ?? i.material).toLowerCase().includes(q))
    );
  }, [tripsNewestFirst, searchQuery]);

  const materialsWithYardStockCount = useMemo(
    () => filteredInventoryRows.filter((r) => r.stockYardRemainingQty > 0).length,
    [filteredInventoryRows]
  );
  const materialsStillNeededCount = useMemo(
    () => filteredInventoryRows.filter((r) => r.stillNeededOnSiteQty > 0).length,
    [filteredInventoryRows]
  );

  const handleOpenNewTrip = () => {
    setEditingTrip(null);
    setTripModalOpen(true);
  };

  const handleEditTrip = (trip: HaulingTripSummary) => {
    setEditingTrip(trip);
    setTripModalOpen(true);
  };

  const handleSaveTrip = (trip: HaulingTripInput, editingItemIds?: string[]) => {
    if (editingItemIds && editingItemIds.length > 0) {
      replaceHaulingTrip(editingItemIds, trip);
    } else {
      addHaulingTrip(trip);
    }
  };

  const handleCreateCustomMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMatName.trim();
    if (!trimmed) return;
    addCentralMaterial({
      name: trimmed,
      category: newMatCategory,
      unit: newMatUnit.trim() || 'pcs',
      haulingMaterialKey: suggestHaulingMaterialCategory(trimmed),
      targetQty: Math.max(0, Number(newMatTarget) || 0),
      stockYardTotalQty: Math.max(0, Number(newMatYardStock) || 0),
      onSiteOpeningQty: 0,
    });
    setNewMatName('');
    setNewMatUnit('pcs');
    setNewMatTarget('0');
    setNewMatYardStock('0');
    setAddMaterialOpen(false);
  };

  const handleDeleteTrip = async (trip: HaulingTripSummary) => {
    const ok = await requestConfirm({
      tone: 'danger',
      title: 'Delete Hauling Trip?',
      message: `Delete ${trip.haulerName} — Trip ${trip.tripNumber} (${formatDateWithWeekday(trip.date)})?`,
      detail: `${formatNum(trip.totalKg)} kg across ${trip.items.length} material item${trip.items.length === 1 ? '' : 's'} will be removed and hauler ${formatNum(rateConfig.creditBlockKg)} kg credits/carried excess will recalculate automatically.`,
      confirmLabel: 'Delete Trip',
    });
    if (ok) {
      deleteHaulingLogs(trip.items.map((i) => i.id));
    }
  };

  const handleDeleteMaterial = async (
    item: CentralMaterialItem,
    hauledQty = 0,
    usedOnSiteQty = 0
  ) => {
    const hasActivity = hauledQty > 0 || usedOnSiteQty > 0;
    const ok = await requestConfirm({
      tone: 'danger',
      title: 'Delete Material Item?',
      message: `Remove "${item.name}" from Centralized Inventory?`,
      detail: hasActivity
        ? 'Existing hauling trips and daily log records for this item will remain in history, while the item is removed from the centralized inventory list.'
        : 'This material will be removed from the centralized inventory list.',
      confirmLabel: 'Delete Material',
    });
    if (ok) {
      deleteCentralMaterial(item.id);
    }
  };

  const handleOpenHaulerPayroll = () => {
    setActiveAppTab('manpower');
    setManpowerSubTab('payment');
    setManpowerPaymentMode('hauler');
  };

  const handleYardCuMChange = (item: CentralMaterialItem, cuMStr: string) => {
    const factor = item.unitsPerPurchaseUnit ?? 36;
    const cuM = Math.max(0, Number(cuMStr) || 0);
    updateCentralMaterial(item.id, {
      stockYardTotalQty: Number((cuM * factor).toFixed(2)),
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
      {/* Top Action Header & KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-sky-600" />
            <span>Stock Yard, On-Site Inventory &amp; Horse Hauling</span>
          </h2>
          <p className="text-xs text-slate-500">
            Centralized material stock linked to Daily Logs · Rate: ₱{rateConfig.ratePerBlockPhp.toLocaleString()} per completed {formatNum(rateConfig.creditBlockKg)} kg (excess carries over)
          </p>
          <div className="mt-1.5">
            <HaulingRateConfigControl project={project} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenHaulerPayroll}
            className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <Users className="w-4 h-4 text-sky-600" />
            <span>Hauler Payroll</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={handleOpenNewTrip}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-10 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Log Hauling Trip</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Hauled
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-0.5">
            {formatNum(totalHauledKg)} kg
          </div>
          <div className="text-[11px] text-slate-500">
            {tripsNewestFirst.length} trip{tripsNewestFirst.length === 1 ? '' : 's'} logged
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Hauler Credits Earned
          </div>
          <div className="text-lg font-extrabold text-emerald-900 mt-0.5">
            ₱{totalEarnedPhp.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-700">
            {totalCredits} × {formatNum(rateConfig.creditBlockKg)}kg · Due:{' '}
            {totalBalanceDuePhp < 0 ? '-' : ''}₱
            {Math.abs(totalBalanceDuePhp).toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Carried Excess Pool
          </div>
          <div className="text-lg font-extrabold text-amber-900 mt-0.5">
            {formatNum(totalActiveExcessKg)} kg
          </div>
          <div className="text-[11px] text-amber-700">
            Across {ledgers.length} active hauler{ledgers.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Site Material Status
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-0.5">
            {materialsStillNeededCount} item{materialsStillNeededCount === 1 ? '' : 's'} needed
          </div>
          <div className="text-[11px] text-slate-500">
            {materialsWithYardStockCount} stocked at yard
          </div>
        </div>
      </div>

      {/* Sub-Navigation + Search/Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
        <div className="grid grid-cols-2 sm:inline-flex rounded-lg bg-slate-100 p-1 gap-1">
          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              subTab === 'inventory'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Inventory</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('hauling_log')}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              subTab === 'hauling_log'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Hauling ({tripsNewestFirst.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'inventory' && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setPhaseFilter('active')}
                className={`px-2.5 py-1 rounded-md cursor-pointer ${
                  phaseFilter === 'active'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {activePhase === 'vertical_mast' ? 'Vertical Mast' : 'Foundation'}
              </button>
              <button
                type="button"
                onClick={() => setPhaseFilter('all')}
                className={`px-2.5 py-1 rounded-md cursor-pointer ${
                  phaseFilter === 'all'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Items
              </button>
            </div>
          )}

          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                subTab === 'inventory'
                  ? 'Filter materials...'
                  : 'Search hauler, date, item...'
              }
              className="w-full min-h-9 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ================= SUB-TAB 1: CENTRALIZED INVENTORY ================= */}
      {subTab === 'inventory' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              Edit <strong>Yard Purchased</strong> stock directly (Sand/Gravel accept{' '}
              <span className="font-semibold text-sky-700">cu.m or bags</span> at{' '}
              <span className="font-semibold">1 cu.m = 36 bags</span>). Used quantities auto-sync from Daily Logs.
            </div>
            <button
              type="button"
              onClick={() => {
                setNewMatCategory(activePhase);
                setAddMaterialOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Material Item</span>
            </button>
          </div>

          {addMaterialOpen && (
            <form
              onSubmit={handleCreateCustomMaterial}
              className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 grid grid-cols-1 sm:grid-cols-6 gap-2 items-end"
            >
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                  Material / Accessory Name
                </label>
                <input
                  type="text"
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  placeholder="e.g. 16mm Rebar or Guy Clip"
                  required
                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                  Unit
                </label>
                <input
                  type="text"
                  value={newMatUnit}
                  onChange={(e) => setNewMatUnit(e.target.value)}
                  placeholder="pcs / bags"
                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                  Site Target
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={newMatTarget}
                  onChange={(e) => setNewMatTarget(e.target.value)}
                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                  Yard Stock
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={newMatYardStock}
                  onChange={(e) => setNewMatYardStock(e.target.value)}
                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={newMatCategory}
                  onChange={(e) =>
                    setNewMatCategory(
                      e.target.value as 'foundation' | 'vertical_mast' | 'shared'
                    )
                  }
                  aria-label="Material phase"
                  className="flex-1 min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                >
                  <option value="foundation">Foundation</option>
                  <option value="vertical_mast">Mast</option>
                  <option value="shared">Both</option>
                </select>
                <button
                  type="submit"
                  className="min-h-9 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>
          )}

          {/* Mobile Cards (Inventory) */}
          <div className="md:hidden space-y-2.5">
            {filteredInventoryRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-2">
                <Package className="w-7 h-7 text-slate-300 mx-auto" />
                <div className="text-sm font-bold text-slate-700">
                  No materials in this view
                </div>
                <p className="text-xs text-slate-500">
                  Adjust the search filter or add a new material item.
                </p>
              </div>
            ) : (
              filteredInventoryRows.map((row) => {
                const { item } = row;
                const hasCuM = Boolean(item.unitsPerPurchaseUnit);
                const yardWarning = row.stockYardRemainingQty < 0;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            {item.unit}
                          </span>
                        </div>
                        {item.remarks && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {item.remarks}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {row.stillNeededOnSiteQty > 0 ? (
                          <span className="px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                            Need {formatNum(row.stillNeededOnSiteQty)} {item.unit}
                            {row.stillNeededCuM !== null ? ` (${row.stillNeededCuM} cu.m)` : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            Site Complete
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteMaterial(item, row.hauledQty, row.usedOnSiteQty)
                          }
                          aria-label={`Delete ${item.name}`}
                          title={`Delete ${item.name}`}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  {/* Editable Yard Stock & Target */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Yard Stock ({hasCuM ? 'cu.m / bags' : item.unit})
                      </label>
                      {hasCuM ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.stockYardTotalCuM ?? 0}
                              onChange={(e) => handleYardCuMChange(item, e.target.value)}
                              aria-label={`${item.name} yard cubic meters`}
                              className="w-full rounded border border-sky-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                            />
                            <span className="text-[9px] text-slate-500">cu.m</span>
                          </div>
                          <div>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={item.stockYardTotalQty}
                              onChange={(e) =>
                                updateCentralMaterial(item.id, {
                                  stockYardTotalQty: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              aria-label={`${item.name} yard bags`}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                            />
                            <span className="text-[9px] text-slate-500">bags</span>
                          </div>
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.stockYardTotalQty}
                          onChange={(e) =>
                            updateCentralMaterial(item.id, {
                              stockYardTotalQty: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          aria-label={`${item.name} yard stock`}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                        />
                      )}
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Project Target ({item.unit})
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.targetQty}
                        onChange={(e) =>
                          updateCentralMaterial(item.id, {
                            targetQty: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        aria-label={`${item.name} target`}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  {/* 4-column balance readout */}
                  <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                    <div
                      className={`rounded-md border py-1.5 px-1 ${
                        yardWarning
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    >
                      <div className="text-[9px] font-bold uppercase text-slate-400">At Yard</div>
                      <div className="font-bold">{formatNum(row.stockYardRemainingQty)}</div>
                    </div>
                    <div className="rounded-md bg-sky-50 border border-sky-200 py-1.5 px-1 text-sky-900">
                      <div className="text-[9px] font-bold uppercase text-sky-600">Hauled</div>
                      <div className="font-bold">{formatNum(row.hauledQty)}</div>
                      {row.hauledKg > 0 && (
                        <div className="text-[9px] text-sky-700">{formatNum(row.hauledKg)} kg</div>
                      )}
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 py-1.5 px-1 text-slate-800">
                      <div className="text-[9px] font-bold uppercase text-slate-400">Used</div>
                      <div className="font-bold">{formatNum(row.usedOnSiteQty)}</div>
                    </div>
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 py-1.5 px-1 text-emerald-900">
                      <div className="text-[9px] font-bold uppercase text-emerald-700">On Site</div>
                      <div className="font-bold">{formatNum(row.onSiteRemainingQty)}</div>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (Inventory) */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-2xs overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Material / Item</th>
                  <th className="px-2 py-2.5 font-bold text-center w-14">Unit</th>
                  <th className="px-2 py-2.5 font-bold text-right w-24">Target</th>
                  <th className="px-2 py-2.5 font-bold text-right w-40">
                    Stock Yard Purchased
                  </th>
                  <th className="px-2 py-2.5 font-bold text-right w-28">Hauled to Site</th>
                  <th className="px-2 py-2.5 font-bold text-right w-24">At Yard</th>
                  <th className="px-2 py-2.5 font-bold text-right w-20">Used</th>
                  <th className="px-2 py-2.5 font-bold text-right w-24">On Site Now</th>
                  <th className="px-3 py-2.5 font-bold text-right w-36">Still Needed</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInventoryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      No materials match the current filter. Adjust search or add a new material item.
                    </td>
                  </tr>
                ) : (
                  filteredInventoryRows.map((row) => {
                    const { item } = row;
                    const hasCuM = Boolean(item.unitsPerPurchaseUnit);
                    const yardWarning = row.stockYardRemainingQty < 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        {item.remarks && (
                          <div className="text-[10px] text-slate-500">{item.remarks}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {item.unit}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.targetQty}
                          onChange={(e) =>
                            updateCentralMaterial(item.id, {
                              targetQty: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          aria-label={`${item.name} target`}
                          className="w-20 rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-right text-slate-900 focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {hasCuM ? (
                          <div className="inline-flex items-center justify-end gap-1">
                            <div className="flex flex-col items-end">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.stockYardTotalCuM ?? 0}
                                onChange={(e) => handleYardCuMChange(item, e.target.value)}
                                aria-label={`${item.name} yard cu.m`}
                                className="w-16 rounded border border-sky-300 bg-sky-50/40 px-1.5 py-1 text-xs font-bold text-right text-sky-950 focus:border-sky-500 focus:outline-none"
                              />
                              <span className="text-[9px] text-sky-700 font-semibold">cu.m</span>
                            </div>
                            <span className="text-slate-300">/</span>
                            <div className="flex flex-col items-end">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.stockYardTotalQty}
                                onChange={(e) =>
                                  updateCentralMaterial(item.id, {
                                    stockYardTotalQty: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                aria-label={`${item.name} yard bags`}
                                className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs font-semibold text-right text-slate-900 focus:border-sky-500 focus:outline-none"
                              />
                              <span className="text-[9px] text-slate-500">bags</span>
                            </div>
                          </div>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={item.stockYardTotalQty}
                            onChange={(e) =>
                              updateCentralMaterial(item.id, {
                                stockYardTotalQty: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label={`${item.name} yard stock`}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-xs font-bold text-right text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="font-bold text-sky-800">
                          {formatNum(row.hauledQty)} {item.unit}
                        </div>
                        {row.hauledKg > 0 && (
                          <div className="text-[10px] text-slate-500">
                            {formatNum(row.hauledKg)} kg
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 font-bold ${
                            yardWarning
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'text-slate-800'
                          }`}
                        >
                          {formatNum(row.stockYardRemainingQty)} {item.unit}
                        </span>
                        {row.stockYardRemainingCuM !== null && (
                          <div className="text-[10px] text-slate-500">
                            {row.stockYardRemainingCuM} cu.m
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-700 font-semibold">
                        {formatNum(row.usedOnSiteQty)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="inline-block rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-bold text-emerald-800">
                          {formatNum(row.onSiteRemainingQty)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.stillNeededOnSiteQty > 0 ? (
                          <div>
                            <span className="inline-block rounded bg-amber-50 border border-amber-200 px-2 py-0.5 font-bold text-amber-800">
                              {formatNum(row.stillNeededOnSiteQty)} {item.unit}
                            </span>
                            {row.stillNeededCuM !== null && (
                              <div className="text-[10px] text-amber-700 mt-0.5">
                                ({row.stillNeededCuM} cu.m)
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-bold text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Complete
                          </span>
                        )}
                      </td>
                      <td className="pr-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteMaterial(item, row.hauledQty, row.usedOnSiteQty)
                          }
                          aria-label={`Delete ${item.name}`}
                          title={`Delete ${item.name}`}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= SUB-TAB 2: HORSE HAULING LOG ================= */}
      {subTab === 'hauling_log' && (
        <div className="space-y-3">
          {filteredTrips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2">
              <Truck className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                No hauling trips logged yet
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Log each horse hauler&apos;s Trip 1 or Trip 2 with material weight (kg) and quantity (pcs/bags). Credits of ₱{rateConfig.ratePerBlockPhp.toLocaleString()} unlock automatically per completed {formatNum(rateConfig.creditBlockKg)} kg, carrying any excess forward.
              </p>
              <button
                type="button"
                onClick={handleOpenNewTrip}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Log First Hauling Trip
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Cards (Hauling Trips) */}
              <div className="md:hidden space-y-2.5">
                {filteredTrips.map((trip) => (
                  <div
                    key={trip.tripKey}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">
                            {trip.haulerName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold">
                            Trip {trip.tripNumber}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {formatDateWithWeekday(trip.date)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditTrip(trip)}
                          aria-label={`Edit ${trip.haulerName} Trip ${trip.tripNumber}`}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTrip(trip)}
                          aria-label={`Delete ${trip.haulerName} Trip ${trip.tripNumber}`}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Clean Mixed-Materials List */}
                    <div className="rounded-lg bg-slate-50 border border-slate-200 divide-y divide-slate-200/70">
                      {trip.items.map((item) => (
                        <div
                          key={item.id}
                          className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-semibold text-slate-800 truncate">
                            {item.itemLabel || item.material}
                          </span>
                          <span className="text-slate-600 shrink-0 font-medium">
                            {formatNum(item.quantity)} {item.unitLabel} ·{' '}
                            <strong className="text-slate-900">{formatNum(item.totalKg)} kg</strong>
                          </span>
                        </div>
                      ))}
                    </div>

                    {trip.remarks && (
                      <div className="text-[11px] text-slate-500">{trip.remarks}</div>
                    )}

                    {/* Trip Weight / Credit / Excess Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[11px]">
                      <span className="font-bold text-slate-800">
                        Total: {formatNum(trip.totalKg)} kg
                        {trip.priorExcessKg > 0 && (
                          <span className="font-normal text-slate-500">
                            {' '}
                            (+{formatNum(trip.priorExcessKg)} prior)
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {trip.creditsEarned > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                            +{trip.creditsEarned} credit (₱{trip.payoutEarnedPhp.toLocaleString()})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                            ₱0 (below {formatNum(rateConfig.creditBlockKg)} kg)
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                          {formatNum(trip.excessAfterKg)} kg excess
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (Hauling Trips) */}
              <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-2xs overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-bold w-32">Date</th>
                      <th className="px-3 py-2.5 font-bold w-40">Hauler</th>
                      <th className="px-2 py-2.5 font-bold text-center w-20">Trip</th>
                      <th className="px-3 py-2.5 font-bold">Materials Hauled (Qty &amp; kg)</th>
                      <th className="px-2 py-2.5 font-bold text-right w-24">Trip kg</th>
                      <th className="px-2 py-2.5 font-bold text-right w-24">Prior Excess</th>
                      <th className="px-2 py-2.5 font-bold text-right w-32">Credit ({formatNum(rateConfig.creditBlockKg)}kg)</th>
                      <th className="px-2 py-2.5 font-bold text-right w-28">New Excess</th>
                      <th className="px-2 py-2.5 text-right w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTrips.map((trip) => (
                      <tr key={trip.tripKey} className="hover:bg-slate-50/70 align-top">
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          {formatDateWithWeekday(trip.date)}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-900">
                          {trip.haulerName}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold">
                            Trip {trip.tripNumber}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {trip.items.map((item) => (
                              <span
                                key={item.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] text-slate-800"
                              >
                                <strong className="text-slate-900">
                                  {item.itemLabel || item.material}:
                                </strong>
                                <span>
                                  {formatNum(item.quantity)} {item.unitLabel}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="font-semibold text-sky-800">
                                  {formatNum(item.totalKg)} kg
                                </span>
                              </span>
                            ))}
                          </div>
                          {trip.remarks && (
                            <div className="text-[10px] text-slate-500 mt-1">
                              {trip.remarks}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatNum(trip.totalKg)} kg
                        </td>
                        <td className="px-2 py-2.5 text-right text-slate-500 whitespace-nowrap">
                          {formatNum(trip.priorExcessKg)} kg
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {trip.creditsEarned > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                              {trip.creditsEarned} × ₱{rateConfig.ratePerBlockPhp.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                            {formatNum(trip.excessAfterKg)} kg
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditTrip(trip)}
                              aria-label={`Edit ${trip.haulerName} Trip ${trip.tripNumber}`}
                              className="p-1.5 rounded text-slate-500 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteTrip(trip)}
                              aria-label={`Delete ${trip.haulerName} Trip ${trip.tripNumber}`}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <HaulingTripModal
        open={tripModalOpen}
        project={project}
        editingTrip={editingTrip}
        knownHaulers={knownHaulers}
        onClose={() => setTripModalOpen(false)}
        onSave={handleSaveTrip}
      />
    </div>
  );
}

