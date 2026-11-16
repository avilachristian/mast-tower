import { memo } from 'react';
import { Package, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { computeDailyLogMaterialRemaining } from '@/entities/project/calculations';
import type { DailyLogMaterialItem } from '@/entities/project/types';

export interface DailyLogMaterialsSectionProps {
  isVerticalMast: boolean;
  materialsOnSite: DailyLogMaterialItem[];
  hauledItemsOnDateCount: number;
  date: string;
  hasPrevLog: boolean;
  prevLogDayNumber?: number;
  editingLogId: string | null;
  onSyncHauling: () => void;
  onAutoFillPrev: () => void;
  onAddMaterialRow: () => void;
  onOpenAddModal: () => void;
  onOpenEditModal: (item: DailyLogMaterialItem, index: number) => void;
  onRemoveMaterialRow: (index: number) => void;
  onUpdateMaterialRow: (index: number, patch: Partial<DailyLogMaterialItem>) => void;
}

export const DailyLogMaterialsSection = memo(function DailyLogMaterialsSection({
  isVerticalMast,
  materialsOnSite,
  hauledItemsOnDateCount,
  date,
  hasPrevLog,
  prevLogDayNumber,
  editingLogId,
  onSyncHauling,
  onAutoFillPrev,
  onAddMaterialRow,
  onOpenAddModal,
  onOpenEditModal,
  onRemoveMaterialRow,
  onUpdateMaterialRow,
}: DailyLogMaterialsSectionProps) {
  return (
    <section className="space-y-2 pt-2 border-t border-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <Package className="w-3.5 h-3.5 text-sky-600" />
          {isVerticalMast ? '4. Tower Parts on Site' : '4. Materials on Site'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hauledItemsOnDateCount > 0 && (
            <button
              type="button"
              onClick={onSyncHauling}
              title={`Pull delivered quantities from ${hauledItemsOnDateCount} hauled item(s) on ${date} (you can still override manually)`}
              className="inline-flex items-center gap-1 min-h-9 sm:min-h-0 px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-lg sm:rounded-full bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-[11px] sm:text-[10px] font-semibold cursor-pointer"
            >
              <Truck className="w-3 h-3" />
              Sync Hauling ({hauledItemsOnDateCount})
            </button>
          )}
          {hasPrevLog && !editingLogId && (
            <button
              type="button"
              onClick={onAutoFillPrev}
              title="Fill On Site from previous day's Remaining quantities and Hauling deliveries"
              className="min-h-9 sm:min-h-0 px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-lg sm:rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-[11px] sm:text-[10px] font-semibold cursor-pointer"
            >
              Auto-fill from Day {prevLogDayNumber}
            </button>
          )}
          <button
            type="button"
            onClick={onAddMaterialRow}
            className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
          >
            + {isVerticalMast ? 'Add Tower Part' : 'Add Material'}
          </button>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {isVerticalMast ? 'Add Part' : 'Add Material'}
          </button>
        </div>
      </div>

      {/* Mobile Compact Cards + Modal Trigger */}
      <div className="md:hidden space-y-2">
        {materialsOnSite.map((m, idx) => {
          const remaining = computeDailyLogMaterialRemaining(m);
          return (
            <div
              key={m.id}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {m.name.trim() || (isVerticalMast ? 'Unnamed Part' : 'Unnamed Material')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-semibold shrink-0">
                      {m.unit || 'pcs'}
                    </span>
                  </div>
                  {m.remarks && (
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {m.remarks}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenEditModal(m, idx)}
                    aria-label={`Edit ${m.name || 'material'}`}
                    title="Edit Item"
                    className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveMaterialRow(idx)}
                    aria-label={`Remove ${m.name || 'material'}`}
                    title="Remove Item"
                    className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                <div className="rounded-md bg-white border border-slate-200 py-1 px-1">
                  <div className="text-[9px] text-slate-400 uppercase font-bold">On Site</div>
                  <div className="font-bold text-slate-900">{m.onSiteQty}</div>
                </div>
                <div className="rounded-md bg-emerald-50/70 border border-emerald-200 py-1 px-1">
                  <div className="text-[9px] text-emerald-700 uppercase font-bold">Deliv.</div>
                  <div className="font-bold text-emerald-900">{m.deliveredQty ?? 0}</div>
                </div>
                <div className="rounded-md bg-white border border-slate-200 py-1 px-1">
                  <div className="text-[9px] text-slate-400 uppercase font-bold">Used</div>
                  <div className="font-bold text-slate-800">{m.usedTodayQty}</div>
                </div>
                <div className="rounded-md bg-sky-50 border border-sky-200 py-1 px-1">
                  <div className="text-[9px] text-sky-700 uppercase font-bold">Rem.</div>
                  <div className="font-bold text-sky-800">{remaining}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Inline Table */}
      <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-2 py-1.5 font-semibold">
                {isVerticalMast ? 'Tower Part' : 'Material'}
              </th>
              <th className="px-2 py-1.5 font-semibold w-14 text-center">Unit</th>
              <th className="px-2 py-1.5 font-semibold text-right w-16">On Site</th>
              <th className="px-2 py-1.5 font-semibold text-right w-16">Delivered</th>
              <th className="px-2 py-1.5 font-semibold text-right w-16">Used</th>
              <th className="px-2 py-1.5 font-semibold text-right w-16">Remaining</th>
              <th className="px-2 py-1.5 font-semibold">Remarks</th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materialsOnSite.map((m, idx) => {
              const remaining = computeDailyLogMaterialRemaining(m);
              return (
                <tr key={m.id}>
                  <td className="px-1.5 py-1">
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) =>
                        onUpdateMaterialRow(idx, { name: e.target.value })
                      }
                      placeholder="Item name"
                      className="w-full min-w-[85px] rounded border border-slate-200 px-1.5 py-1 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={m.unit}
                      onChange={(e) =>
                        onUpdateMaterialRow(idx, { unit: e.target.value })
                      }
                      className="w-12 rounded border border-slate-200 px-1 py-1 text-xs text-slate-700 text-center focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={m.onSiteQty}
                      onChange={(e) =>
                        onUpdateMaterialRow(idx, {
                          onSiteQty: Math.max(0, Number(e.target.value)),
                        })
                      }
                      aria-label={`${m.name || 'Material'} on site`}
                      className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs font-semibold text-right text-slate-900 focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={m.deliveredQty ?? 0}
                      onChange={(e) =>
                        onUpdateMaterialRow(idx, {
                          deliveredQty: Math.max(0, Number(e.target.value)),
                        })
                      }
                      aria-label={`${m.name || 'Material'} delivered`}
                      className="w-14 rounded border border-emerald-300 bg-emerald-50/40 px-1.5 py-1 text-xs font-semibold text-right text-emerald-900 focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={m.usedTodayQty}
                      onChange={(e) =>
                        onUpdateMaterialRow(idx, {
                          usedTodayQty: Math.max(0, Number(e.target.value)),
                        })
                      }
                      aria-label={`${m.name || 'Material'} used`}
                      className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs text-right text-slate-800 focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    <span className="inline-block min-w-[36px] rounded bg-sky-50 border border-sky-200 px-1.5 py-1 text-xs font-bold text-sky-800">
                      {remaining}
                    </span>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={m.remarks ?? ''}
                      onChange={(e) =>
                        onUpdateMaterialRow(idx, { remarks: e.target.value })
                      }
                      placeholder="Note"
                      className="w-full min-w-[70px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="pr-1.5 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => onRemoveMaterialRow(idx)}
                      aria-label={`Remove ${m.name || 'material'}`}
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});
