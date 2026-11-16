import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Scale, Trash2, Truck, X } from 'lucide-react';
import {
  computeHaulerCreditLedgers,
  resolveCentralMaterials,
  resolveHaulingRateConfig,
  suggestHaulingMaterialCategory,
  type HaulingTripSummary,
} from '@/entities/project/haulingInventory';
import type { CentralMaterialItem, HaulingMaterialCategory, MastProjectState } from '@/entities/project/types';
import type { HaulingTripInput } from '@/shared/state/projectStore';

interface DraftTripLineItem {
  key: string;
  materialId: string; // CentralMaterialItem.id or '__custom__'
  itemLabel: string;
  material: HaulingMaterialCategory;
  unitLabel: string;
  quantity: string;
  totalKg: string;
  kgManuallyEdited: boolean;
}

interface HaulingTripModalProps {
  open: boolean;
  project: MastProjectState;
  editingTrip: HaulingTripSummary | null;
  knownHaulers: string[];
  onClose: () => void;
  onSave: (trip: HaulingTripInput, editingItemIds?: string[]) => void;
}

function createLineItemFromMaterial(
  mat?: CentralMaterialItem
): DraftTripLineItem {
  return {
    key: `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    materialId: mat ? mat.id : '__custom__',
    itemLabel: mat ? mat.name : '',
    material: mat ? mat.haulingMaterialKey : 'other',
    unitLabel: mat ? mat.unit : 'pcs',
    quantity: '',
    totalKg: '',
    kgManuallyEdited: false,
  };
}

export function HaulingTripModal({
  open,
  project,
  editingTrip,
  knownHaulers,
  onClose,
  onSave,
}: HaulingTripModalProps) {
  const centralMaterials = useMemo(
    () => resolveCentralMaterials(project),
    [project]
  );

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [haulerName, setHaulerName] = useState('');
  const [tripNumber, setTripNumber] = useState<1 | 2>(1);
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState<DraftTripLineItem[]>([]);

  useEffect(() => {
    if (!open) return;
    if (editingTrip) {
      setDate(editingTrip.date);
      setHaulerName(editingTrip.haulerName);
      setTripNumber(editingTrip.tripNumber);
      setRemarks(editingTrip.remarks);
      setItems(
        editingTrip.items.map((entry, idx) => ({
          key: `${entry.id}-${idx}`,
          materialId:
            entry.materialId && centralMaterials.some((m) => m.id === entry.materialId)
              ? entry.materialId
              : centralMaterials.find(
                    (m) =>
                      m.name.trim().toLowerCase() ===
                      (entry.itemLabel ?? '').trim().toLowerCase()
                  )?.id ?? '__custom__',
          itemLabel: entry.itemLabel || entry.material,
          material: entry.material,
          unitLabel: entry.unitLabel || 'pcs',
          quantity: String(entry.quantity || ''),
          totalKg: String(entry.totalKg || ''),
          kgManuallyEdited: true,
        }))
      );
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
      setHaulerName(knownHaulers[0] ?? '');
      setTripNumber(1);
      setRemarks('');
      const defaultMat =
        project.projectType === 'vertical_mast'
          ? centralMaterials.find((m) => m.category === 'vertical_mast') ?? centralMaterials[0]
          : centralMaterials[0];
      setItems([createLineItemFromMaterial(defaultMat)]);
    }
  }, [open, editingTrip, centralMaterials, knownHaulers, project.projectType]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const editingIds = useMemo(
    () => new Set(editingTrip ? editingTrip.items.map((i) => i.id) : []),
    [editingTrip]
  );

  // Check existing trips for same hauler on selected date (excluding currently edited trip)
  const sameDayTripSlots = useMemo(() => {
    const trimmed = haulerName.trim().toLowerCase();
    const slots = new Set<1 | 2>();
    if (!trimmed) return slots;
    for (const log of project.haulingLogs) {
      if (editingIds.has(log.id)) continue;
      if (log.date !== date) continue;
      if (log.haulerName.trim().toLowerCase() !== trimmed) continue;
      slots.add(log.tripNumber === 2 ? 2 : 1);
    }
    return slots;
  }, [project.haulingLogs, date, haulerName, editingIds]);

  const hasBothTripsLogged =
    sameDayTripSlots.has(1) && sameDayTripSlots.has(2);
  const slotAlreadyUsed = sameDayTripSlots.has(tripNumber);

  const rateConfig = useMemo(
    () => resolveHaulingRateConfig(project),
    [project]
  );

  // Compute live prior excess for this hauler (excluding edited trip)
  const priorExcessKg = useMemo(() => {
    const trimmed = haulerName.trim().toLowerCase();
    if (!trimmed) return 0;
    const remainingLogs = project.haulingLogs.filter((l) => !editingIds.has(l.id));
    const { ledgers } = computeHaulerCreditLedgers(
      remainingLogs,
      project.haulerPayouts ?? [],
      centralMaterials,
      rateConfig
    );
    const match = ledgers.find(
      (r) => r.haulerName.trim().toLowerCase() === trimmed
    );
    return match?.currentExcessKg ?? 0;
  }, [
    haulerName,
    project.haulingLogs,
    project.haulerPayouts,
    editingIds,
    centralMaterials,
    rateConfig,
  ]);

  const tripTotalKg = useMemo(
    () =>
      Number(
        items
          .reduce((sum, item) => sum + Math.max(0, Number(item.totalKg) || 0), 0)
          .toFixed(2)
      ),
    [items]
  );

  const previewEffectiveKg = Number((priorExcessKg + tripTotalKg).toFixed(2));
  const previewCredits = Math.floor(
    previewEffectiveKg / rateConfig.creditBlockKg
  );
  const previewPayoutPhp = Number(
    (previewCredits * rateConfig.ratePerBlockPhp).toFixed(2)
  );
  const previewExcessAfter = Number(
    (previewEffectiveKg - previewCredits * rateConfig.creditBlockKg).toFixed(2)
  );

  if (!open) return null;

  const handleSelectMaterial = (idx: number, matId: string) => {
    const selected = centralMaterials.find((m) => m.id === matId);
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (!selected) {
          return {
            ...row,
            materialId: '__custom__',
            itemLabel: '',
            material: 'other',
            unitLabel: 'pcs',
            kgManuallyEdited: false,
          };
        }
        const qtyNum = Math.max(0, Number(row.quantity) || 0);
        const autoKg =
          !row.kgManuallyEdited && selected.defaultKgPerUnit && qtyNum > 0
            ? String(Number((qtyNum * selected.defaultKgPerUnit).toFixed(2)))
            : row.kgManuallyEdited
              ? row.totalKg
              : selected.defaultKgPerUnit && qtyNum > 0
                ? String(Number((qtyNum * selected.defaultKgPerUnit).toFixed(2)))
                : '';
        return {
          ...row,
          materialId: selected.id,
          itemLabel: selected.name,
          material: selected.haulingMaterialKey,
          unitLabel: selected.unit,
          totalKg: autoKg,
        };
      })
    );
  };

  const handleQuantityChange = (idx: number, val: string) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const mat = centralMaterials.find((m) => m.id === row.materialId);
        const qtyNum = Math.max(0, Number(val) || 0);
        const nextTotalKg =
          !row.kgManuallyEdited && mat?.defaultKgPerUnit
            ? qtyNum > 0
              ? String(Number((qtyNum * mat.defaultKgPerUnit).toFixed(2)))
              : ''
            : row.totalKg;
        return {
          ...row,
          quantity: val,
          totalKg: nextTotalKg,
        };
      })
    );
  };

  const handleWeightChange = (idx: number, val: string) => {
    setItems((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, totalKg: val, kgManuallyEdited: true } : row
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedHauler = haulerName.trim();
    if (!cleanedHauler) return;

    const validItems = items
      .map((row) => ({
        materialId: row.materialId !== '__custom__' ? row.materialId : undefined,
        itemLabel: row.itemLabel.trim() || 'Material',
        material:
          row.materialId !== '__custom__'
            ? row.material
            : suggestHaulingMaterialCategory(row.itemLabel),
        unitLabel: row.unitLabel.trim() || 'pcs',
        quantity: Math.max(0, Number(row.quantity) || 0),
        totalKg: Math.max(0, Number(row.totalKg) || 0),
      }))
      .filter((item) => item.quantity > 0 || item.totalKg > 0);

    if (validItems.length === 0) return;

    onSave(
      {
        date,
        haulerName: cleanedHauler,
        tripNumber,
        items: validItems,
        remarks: remarks.trim() || undefined,
      },
      editingTrip ? editingTrip.items.map((i) => i.id) : undefined
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editingTrip ? 'Edit Hauling Trip' : 'Log Horse Hauling Trip'}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {editingTrip ? 'Edit Hauling Trip' : 'Log Horse Hauling Trip'}
              </h2>
              <p className="text-[11px] text-slate-500">
                ₱{rateConfig.ratePerBlockPhp.toLocaleString()} per completed {rateConfig.creditBlockKg} kg · mixed materials supported
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trip modal"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Date, Hauler, Trip 1/2 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Trip Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full min-h-10 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Hauler Name
              </label>
              <input
                type="text"
                value={haulerName}
                onChange={(e) => setHaulerName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                required
                className="w-full min-h-10 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Trip Slot (Max 2/Day)
              </label>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
                {([1, 2] as const).map((slot) => {
                  const used = sameDayTripSlots.has(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTripNumber(slot)}
                      className={`min-h-8 rounded-md text-xs font-bold transition cursor-pointer ${
                        tripNumber === slot
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      Trip {slot}
                      {used ? ' •' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Hauler Roster Chips */}
          {knownHaulers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Haulers:
              </span>
              {knownHaulers.map((name) => {
                const active =
                  name.trim().toLowerCase() === haulerName.trim().toLowerCase();
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setHaulerName(name)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {(hasBothTripsLogged || slotAlreadyUsed) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {hasBothTripsLogged
                  ? `${haulerName.trim()} already has both Trip 1 and Trip 2 logged on ${date}.`
                  : `${haulerName.trim()} already has a Trip ${tripNumber} entry on ${date}. You can switch to Trip ${tripNumber === 1 ? 2 : 1} or merge items into that trip.`}
              </span>
            </div>
          )}

          {/* Materials in this Trip (Mixed Materials Supported) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Materials Hauled in This Trip
              </div>
              <button
                type="button"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    createLineItemFromMaterial(centralMaterials[0]),
                  ])
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Material
              </button>
            </div>

            <div className="space-y-2">
              {items.map((row, idx) => {
                const isCustom = row.materialId === '__custom__';
                const selectedMat = centralMaterials.find(
                  (m) => m.id === row.materialId
                );
                return (
                  <div
                    key={row.key}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                              Material
                            </label>
                            <select
                              value={row.materialId}
                              onChange={(e) =>
                                handleSelectMaterial(idx, e.target.value)
                              }
                              className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                            >
                              {centralMaterials.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.unit})
                                </option>
                              ))}
                              <option value="__custom__">
                                + Custom / Other Item
                              </option>
                            </select>
                          </div>

                          {isCustom ? (
                            <div className="grid grid-cols-3 gap-1.5">
                              <div className="col-span-2">
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                  Custom Name
                                </label>
                                <input
                                  type="text"
                                  value={row.itemLabel}
                                  onChange={(e) =>
                                    setItems((prev) =>
                                      prev.map((r, i) =>
                                        i === idx
                                          ? { ...r, itemLabel: e.target.value }
                                          : r
                                      )
                                    )
                                  }
                                  placeholder="e.g. Tie Wire"
                                  required
                                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                  Unit
                                </label>
                                <input
                                  type="text"
                                  value={row.unitLabel}
                                  onChange={(e) =>
                                    setItems((prev) =>
                                      prev.map((r, i) =>
                                        i === idx
                                          ? { ...r, unitLabel: e.target.value }
                                          : r
                                      )
                                    )
                                  }
                                  placeholder="pcs"
                                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 text-center focus:border-sky-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                  Qty ({row.unitLabel})
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={row.quantity}
                                  onChange={(e) =>
                                    handleQuantityChange(idx, e.target.value)
                                  }
                                  placeholder="0"
                                  className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                  Weight (kg)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={row.totalKg}
                                  onChange={(e) =>
                                    handleWeightChange(idx, e.target.value)
                                  }
                                  placeholder="0 kg"
                                  required
                                  className="w-full min-h-9 rounded-lg border border-emerald-300 bg-emerald-50/40 px-2.5 py-1.5 text-xs font-bold text-emerald-950 focus:border-sky-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {isCustom && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                Qty ({row.unitLabel || 'pcs'})
                              </label>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.quantity}
                                onChange={(e) =>
                                  handleQuantityChange(idx, e.target.value)
                                }
                                placeholder="0"
                                className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                Weight (kg)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.totalKg}
                                onChange={(e) =>
                                  handleWeightChange(idx, e.target.value)
                                }
                                placeholder="0 kg"
                                required
                                className="w-full min-h-9 rounded-lg border border-emerald-300 bg-emerald-50/40 px-2.5 py-1.5 text-xs font-bold text-emerald-950 focus:border-sky-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {selectedMat?.defaultKgPerUnit && !row.kgManuallyEdited && (
                          <div className="text-[10px] text-slate-500">
                            Auto-filled at {selectedMat.defaultKgPerUnit} kg/{selectedMat.unit} (editable for actual scale weight)
                          </div>
                        )}
                      </div>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Remove material item"
                          className="mt-5 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Trip Remarks (Optional)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Mixed cement + 20mm rebar for Anchor A1"
              className="w-full min-h-9 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Live Hauler Credit & Excess Calculation */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-900">
              <Scale className="w-4 h-4 text-sky-600" />
              <span>
                Live Credit Preview (₱{rateConfig.ratePerBlockPhp.toLocaleString()} /{' '}
                {rateConfig.creditBlockKg} kg)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-white border border-sky-100 p-2">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  Prior Excess
                </div>
                <div className="text-sm font-bold text-slate-800">
                  {priorExcessKg} kg
                </div>
              </div>
              <div className="rounded-lg bg-white border border-sky-100 p-2">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  This Trip
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {tripTotalKg} kg
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
                <div className="text-[10px] uppercase font-bold text-emerald-700">
                  Trip Credit
                </div>
                <div className="text-sm font-bold text-emerald-900">
                  {previewCredits} × ₱{rateConfig.ratePerBlockPhp.toLocaleString()}
                </div>
                <div className="text-[10px] font-semibold text-emerald-700">
                  = ₱{previewPayoutPhp.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                <div className="text-[10px] uppercase font-bold text-amber-700">
                  Carried Excess
                </div>
                <div className="text-sm font-bold text-amber-900">
                  {previewExcessAfter} kg
                </div>
                <div className="text-[10px] text-amber-700">
                  {Number(Math.max(0, rateConfig.creditBlockKg - previewExcessAfter).toFixed(2))} kg to next
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!haulerName.trim() || tripTotalKg <= 0}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
            >
              {editingTrip ? 'Save Trip Changes' : 'Save Hauling Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

