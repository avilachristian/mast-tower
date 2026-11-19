import { memo } from 'react';
import { Pencil, Plus, Trash2, UserCheck, Users } from 'lucide-react';
import type { WorkerAttendanceEntry, WorkerRole } from '@/entities/project/types';

export interface DailyLogManpowerSectionProps {
  workers: WorkerAttendanceEntry[];
  roles: readonly WorkerRole[];
  totalWorkers: number;
  date: string;
  presentAttendanceCount: number;
  onSyncAttendance: () => void;
  onAddWorkerRow: () => void;
  onOpenAddModal: () => void;
  onOpenEditModal: (worker: WorkerAttendanceEntry, index: number) => void;
  onRemoveWorkerRow: (index: number) => void;
  onUpdateWorkerRow: (index: number, patch: Partial<WorkerAttendanceEntry>) => void;
}

export const DailyLogManpowerSection = memo(function DailyLogManpowerSection({
  workers,
  roles,
  totalWorkers,
  date,
  presentAttendanceCount,
  onSyncAttendance,
  onAddWorkerRow,
  onOpenAddModal,
  onOpenEditModal,
  onRemoveWorkerRow,
  onUpdateWorkerRow,
}: DailyLogManpowerSectionProps) {
  return (
    <section className="space-y-2 pt-2 border-t border-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <Users className="w-3.5 h-3.5 text-sky-600" />
          3. Manpower
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
            {totalWorkers} crew
          </span>
          {presentAttendanceCount > 0 && (
            <button
              type="button"
              onClick={onSyncAttendance}
              title={`Prefill Manpower from ${presentAttendanceCount} Civil Works worker(s) present on ${date} plus Site Engineer & Safety Officer`}
              className="inline-flex items-center gap-1 min-h-9 sm:min-h-0 px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-lg sm:rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-[11px] sm:text-[10px] font-semibold cursor-pointer"
            >
              <UserCheck className="w-3 h-3" />
              Sync Attendance ({presentAttendanceCount})
            </button>
          )}
          <button
            type="button"
            onClick={onAddWorkerRow}
            className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
          >
            + Add Role
          </button>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Role
          </button>
        </div>
      </div>

      {/* Mobile Compact Cards + Modal Trigger */}
      <div className="md:hidden space-y-2">
        {workers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            No manpower roles added yet. Tap Add Role above.
          </div>
        ) : (
          workers.map((w, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between gap-2.5"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {w.role}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold">
                    {w.count} pax
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {w.names.trim() || 'No worker names recorded'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenEditModal(w, idx)}
                  aria-label={`Edit ${w.role}`}
                  title="Edit Role"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveWorkerRow(idx)}
                  aria-label={`Remove ${w.role}`}
                  title="Remove Role"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Inline Editor */}
      <div className="hidden md:block space-y-2">
        {workers.map((w, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1.5"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={w.role}
                onChange={(e) =>
                  onUpdateWorkerRow(idx, { role: e.target.value as WorkerRole })
                }
                className="flex-1 min-w-[120px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {/* Headcount stepper */}
              <div className="inline-flex items-center rounded-md border border-slate-300 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateWorkerRow(idx, { count: Math.max(0, w.count - 1) })
                  }
                  className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={w.count}
                  onChange={(e) =>
                    onUpdateWorkerRow(idx, {
                      count: Math.max(0, Number(e.target.value)),
                    })
                  }
                  aria-label={`${w.role} count`}
                  className="w-10 text-center text-xs font-bold text-slate-900 border-x border-slate-200 py-1 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onUpdateWorkerRow(idx, { count: w.count + 1 })}
                  className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => onRemoveWorkerRow(idx)}
                aria-label={`Remove ${w.role}`}
                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              type="text"
              value={w.names}
              onChange={(e) => onUpdateWorkerRow(idx, { names: e.target.value })}
              placeholder="Worker names / assignment notes..."
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
            />
          </div>
        ))}
      </div>
    </section>
  );
});
