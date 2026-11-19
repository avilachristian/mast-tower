import { memo } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { DEFAULT_SAFETY_OFFICER_NAME } from '@/entities/project/materialConstants';
import type { DailyLogSafetyItem } from '@/entities/project/types';

export interface DailyLogSafetySectionProps {
  safetyOfficer: string;
  onSafetyOfficerChange: (name: string) => void;
  safetyLogs: DailyLogSafetyItem[];
  onAddRow: () => void;
  onOpenModal: (item: DailyLogSafetyItem, index: number) => void;
  onRemoveRow: (index: number) => void;
  onUpdateRow: (index: number, patch: Partial<DailyLogSafetyItem>) => void;
}

export const DailyLogSafetySection = memo(function DailyLogSafetySection({
  safetyOfficer,
  onSafetyOfficerChange,
  safetyLogs,
  onAddRow,
  onOpenModal,
  onRemoveRow,
  onUpdateRow,
}: DailyLogSafetySectionProps) {
  return (
    <section className="space-y-2 pt-2 border-t border-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          9. Safety Logs (Safety Officer)
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddRow}
            className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
          >
            + Add Safety Log
          </button>
          <button
            type="button"
            onClick={onAddRow}
            className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Safety
          </button>
        </div>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">
          Safety Officer
        </span>
        <input
          type="text"
          value={safetyOfficer}
          onChange={(e) => onSafetyOfficerChange(e.target.value)}
          placeholder={DEFAULT_SAFETY_OFFICER_NAME}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 sm:py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
        />
      </label>

      {/* Mobile Compact Cards */}
      <div className="md:hidden space-y-2">
        {safetyLogs.map((s, idx) => (
          <div
            key={s.id}
            className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-start justify-between gap-2.5"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">
                  {s.timeOrActivity.trim() || (
                    <span className="text-slate-400 italic font-normal">
                      Safety entry (tap Edit)
                    </span>
                  )}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                  {s.status}
                </span>
              </div>
              {s.hazardOrFinding && (
                <div className="text-[11px] text-slate-700">
                  Obs: {s.hazardOrFinding}
                </div>
              )}
              {s.actionTaken && (
                <div className="text-[11px] text-slate-500">
                  Action: {s.actionTaken}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onOpenModal(s, idx)}
                aria-label="Edit safety log"
                title="Edit Safety Log"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveRow(idx)}
                aria-label="Remove safety log"
                title="Remove Safety Log"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Time / Activity</th>
              <th className="px-2 py-1.5 font-semibold">Safety Observation / Hazard</th>
              <th className="px-2 py-1.5 font-semibold">Action Taken / Control</th>
              <th className="px-2 py-1.5 font-semibold">Status</th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safetyLogs.map((s, idx) => (
              <tr key={s.id}>
                <td className="px-1.5 py-1">
                  <input
                    type="text"
                    value={s.timeOrActivity}
                    onChange={(e) =>
                      onUpdateRow(idx, { timeOrActivity: e.target.value })
                    }
                    placeholder="07:30 Toolbox Talk"
                    className="w-full min-w-[95px] rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={s.hazardOrFinding}
                    onChange={(e) =>
                      onUpdateRow(idx, { hazardOrFinding: e.target.value })
                    }
                    placeholder="PPE, shoring, housekeeping..."
                    className="w-full min-w-[110px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={s.actionTaken}
                    onChange={(e) =>
                      onUpdateRow(idx, { actionTaken: e.target.value })
                    }
                    placeholder="Briefing / barricading / PPE check"
                    className="w-full min-w-[110px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={s.status}
                    onChange={(e) =>
                      onUpdateRow(idx, { status: e.target.value })
                    }
                    className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-800 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="Compliant">Compliant</option>
                    <option value="Action Taken">Action Taken</option>
                    <option value="Open">Open</option>
                    <option value="N/A">N/A</option>
                  </select>
                </td>
                <td className="pr-1.5 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => onRemoveRow(idx)}
                    aria-label="Remove safety log"
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});
