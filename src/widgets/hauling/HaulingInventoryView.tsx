import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Package,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import {
  HAULING_CREDIT_BLOCK_KG,
  HAULING_RATE_PER_BLOCK_PHP,
  computeCentralMaterialStatuses,
  computeHaulerCreditLedgers,
  resolveCentralMaterials,
  suggestHaulingMaterialCategory,
  type HaulingTripSummary,
} from '@/entities/project/haulingInventory';
import type { CentralMaterialItem } from '@/entities/project/types';
import { useProjectStore, type HaulingTripInput } from '@/shared/state/projectStore';
import { HaulingTripModal } from './HaulingTripModal';

type SubTab = 'inventory' | 'hauling_log' | 'payouts';
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
  const addHaulerRosterMember = useProjectStore((s) => s.addHaulerRosterMember);
  const addHaulerPayout = useProjectStore((s) => s.addHaulerPayout);
  const deleteHaulerPayout = useProjectStore((s) => s.deleteHaulerPayout);

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

  // Add hauler & payout forms
  const [newHaulerName, setNewHaulerName] = useState('');
  const [payoutHauler, setPayoutHauler] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutDate, setPayoutDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payoutNotes, setPayoutNotes] = useState('');

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
        centralMaterials
      ),
    [project.haulingLogs, project.haulerPayouts, centralMaterials]
  );

  const knownHaulers = useMemo(() => {
    const map = new Map<string, string>();
    for (const name of project.haulerRoster ?? []) {
      const t = name.trim();
      if (t) map.set(t.toLowerCase(), t);
    }
    for (const log of project.haulingLogs) {
      const t = log.haulerName.trim();
      if (t && !map.has(t.toLowerCase())) map.set(t.toLowerCase(), t);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [project.haulerRoster, project.haulingLogs]);

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

  const handleRecordPayout = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(payoutAmount) || 0);
    if (!payoutHauler.trim() || amt <= 0) return;
    addHaulerPayout({
      date: payoutDate,
      haulerName: payoutHauler.trim(),
      amountPhp: amt,
      notes: payoutNotes.trim() || undefined,
    });
    setPayoutAmount('');
    setPayoutNotes('');
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
            Centralized material stock linked to Daily Logs · Rate: ₱{HAULING_RATE_PER_BLOCK_PHP.toLocaleString()} per completed {HAULING_CREDIT_BLOCK_KG} kg (excess carries over)
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            Team Credits Earned
          </div>
          <div className="text-lg font-extrabold text-emerald-900 mt-0.5">
            ₱{totalEarnedPhp.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-700">
            {totalCredits} × 120kg · Due: ₱{totalBalanceDuePhp.toLocaleString()}
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
        <div className="grid grid-cols-3 sm:inline-flex rounded-lg bg-slate-100 p-1 gap-1">
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

          <button
            type="button"
            onClick={() => setSubTab('payouts')}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              subTab === 'payouts'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team ({ledgers.length})</span>
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

          {subTab !== 'payouts' && (
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
          )}
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
            {filteredInventoryRows.map((row) => {
              const { item } = row;
              const isCustom = item.id.startsWith('cmat-');
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
                      {isCustom && (
                        <button
                          type="button"
                          onClick={() => deleteCentralMaterial(item.id)}
                          aria-label={`Delete ${item.name}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
            })}
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
                {filteredInventoryRows.map((row) => {
                  const { item } = row;
                  const isCustom = item.id.startsWith('cmat-');
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
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => deleteCentralMaterial(item.id)}
                            aria-label={`Delete ${item.name}`}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
                Log each horse hauler&apos;s Trip 1 or Trip 2 with material weight (kg) and quantity (pcs/bags). Credits of ₱1,100 unlock automatically per completed 120 kg, carrying any excess forward.
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
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete ${trip.haulerName} Trip ${trip.tripNumber} (${trip.date})?`
                              )
                            ) {
                              deleteHaulingLogs(trip.items.map((i) => i.id));
                            }
                          }}
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
                            ₱0 (below 120 kg)
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
                      <th className="px-2 py-2.5 font-bold text-right w-32">Credit (120kg)</th>
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
                              {trip.creditsEarned} × ₱1,100
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
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete ${trip.haulerName} Trip ${trip.tripNumber} (${trip.date})?`
                                  )
                                ) {
                                  deleteHaulingLogs(trip.items.map((i) => i.id));
                                }
                              }}
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

      {/* ================= SUB-TAB 3: HAULER TEAM & PAYOUT LEDGER ================= */}
      {subTab === 'payouts' && (
        <div className="space-y-4">
          {/* Quick Roster Add & Record Payout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newHaulerName.trim()) return;
                addHaulerRosterMember(newHaulerName.trim());
                setNewHaulerName('');
              }}
              className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-end gap-2 shadow-2xs"
            >
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Add Contracted Hauler to Roster
                </label>
                <input
                  type="text"
                  value={newHaulerName}
                  onChange={(e) => setNewHaulerName(e.target.value)}
                  placeholder="Hauler full name"
                  className="w-full min-h-9 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="min-h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Add Hauler
              </button>
            </form>

            <form
              onSubmit={handleRecordPayout}
              className="rounded-xl border border-slate-200 bg-white p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end shadow-2xs"
            >
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Record Payout To
                </label>
                <select
                  value={payoutHauler}
                  onChange={(e) => setPayoutHauler(e.target.value)}
                  required
                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900"
                >
                  <option value="">Select hauler...</option>
                  {knownHaulers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Amount (₱)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="1100"
                  required
                  className="w-full min-h-9 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={payoutDate}
                  onChange={(e) => setPayoutDate(e.target.value)}
                  required
                  className="w-full min-h-9 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
                />
              </div>
              <button
                type="submit"
                className="min-h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1"
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Pay</span>
              </button>
            </form>
          </div>

          {ledgers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
              <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
              Log hauling trips to see per-hauler 120 kg credits, carried excess, and balances due.
            </div>
          ) : (
            <>
              {/* Mobile Cards (Hauler Ledgers) */}
              <div className="md:hidden space-y-2.5">
                {ledgers.map((row) => {
                  const pct = Math.min(
                    100,
                    Math.round((row.currentExcessKg / HAULING_CREDIT_BLOCK_KG) * 100)
                  );
                  return (
                    <div
                      key={row.haulerName}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-slate-900">
                            {row.haulerName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.tripsCompleted} trip{row.tripsCompleted === 1 ? '' : 's'} ·{' '}
                            {row.activeDays} day{row.activeDays === 1 ? '' : 's'} ·{' '}
                            {formatNum(row.totalHauledKg)} kg total
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-emerald-700">
                            ₱{row.grossEarnedPhp.toLocaleString()}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-500">
                            Due: ₱{row.balanceDuePhp.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Excess Progress toward next 120 kg credit */}
                      <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-2 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-amber-900 flex items-center gap-1">
                            <Scale className="w-3.5 h-3.5 text-amber-600" />
                            Excess: {formatNum(row.currentExcessKg)} / 120 kg
                          </span>
                          <span className="text-amber-700 font-semibold">
                            {formatNum(row.kgToNextCredit)} kg to next ₱1,100
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-amber-200/70 overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {row.materialTotals.map((m) => (
                          <span
                            key={m.materialId}
                            className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-700"
                          >
                            {m.name}: {formatNum(m.qty)} {m.unit} ({formatNum(m.kg)} kg)
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (Hauler Ledgers) */}
              <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-2xs overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">Hauler Name</th>
                      <th className="px-2 py-2.5 font-bold text-center w-16">Days</th>
                      <th className="px-2 py-2.5 font-bold text-center w-16">Trips</th>
                      <th className="px-2 py-2.5 font-bold text-right w-28">Total kg</th>
                      <th className="px-2 py-2.5 font-bold text-center w-28">
                        120kg Credits
                      </th>
                      <th className="px-3 py-2.5 font-bold w-48">Excess Toward Next ₱1,100</th>
                      <th className="px-2 py-2.5 font-bold text-right w-28">Earned (₱)</th>
                      <th className="px-2 py-2.5 font-bold text-right w-24">Paid (₱)</th>
                      <th className="px-3 py-2.5 font-bold text-right w-28">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgers.map((row) => {
                      const pct = Math.min(
                        100,
                        Math.round((row.currentExcessKg / HAULING_CREDIT_BLOCK_KG) * 100)
                      );
                      return (
                        <tr key={row.haulerName} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-slate-900">{row.haulerName}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {row.materialTotals
                                .map((m) => `${m.name}: ${formatNum(m.qty)} ${m.unit}`)
                                .join(' · ')}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center font-semibold text-slate-700">
                            {row.activeDays}
                          </td>
                          <td className="px-2 py-2.5 text-center font-semibold text-slate-700">
                            {row.tripsCompleted}
                          </td>
                          <td className="px-2 py-2.5 text-right font-bold text-slate-900">
                            {formatNum(row.totalHauledKg)} kg
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                              {row.totalCredits}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="font-bold text-amber-800">
                                {formatNum(row.currentExcessKg)} / 120 kg
                              </span>
                              <span className="text-slate-500">
                                {formatNum(row.kgToNextCredit)} left
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right font-bold text-emerald-800">
                            ₱{row.grossEarnedPhp.toLocaleString()}
                          </td>
                          <td className="px-2 py-2.5 text-right text-slate-600">
                            ₱{row.totalPaidPhp.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                            ₱{row.balanceDuePhp.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Recorded Payouts History */}
          {(project.haulerPayouts ?? []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Payout History
              </div>
              <div className="divide-y divide-slate-100">
                {(project.haulerPayouts ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="py-1.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{p.haulerName}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-500">{formatDateWithWeekday(p.date)}</span>
                      {p.notes && (
                        <span className="text-slate-400 ml-2 text-[11px]">({p.notes})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-700">
                        ₱{p.amountPhp.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteHaulerPayout(p.id)}
                        aria-label="Delete payout record"
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

