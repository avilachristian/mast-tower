import { memo } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type {
  DailyLogActivityItem,
  DailyLogActivityStatus,
  FoundationRecord,
  GuyLayerRecord,
  TowerSectionRecord,
} from '@/entities/project/types';

const ACTIVITY_STATUS_BADGE: Record<DailyLogActivityStatus, string> = {
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ongoing: 'bg-sky-50 text-sky-700 border-sky-200',
  Pending: 'bg-slate-100 text-slate-700 border-slate-200',
  Delayed: 'bg-amber-50 text-amber-800 border-amber-200',
};

export interface DailyLogActivitiesSectionProps {
  isVerticalMast: boolean;
  activities: DailyLogActivityItem[];
  activitiesSummary: string;
  onActivitiesSummaryChange: (val: string) => void;
  selectedFoundations: string[];
  onToggleFoundation: (id: string) => void;
  foundations: FoundationRecord[];
  verticalMastSections: TowerSectionRecord[];
  verticalMastGuyLayers: GuyLayerRecord[];
  activityStatuses: readonly DailyLogActivityStatus[];
  onAddActivityRow: () => void;
  onOpenAddModal: () => void;
  onOpenEditModal: (act: DailyLogActivityItem, index: number) => void;
  onRemoveActivityRow: (index: number) => void;
  onUpdateActivityRow: (index: number, patch: Partial<DailyLogActivityItem>) => void;
}

export const DailyLogActivitiesSection = memo(function DailyLogActivitiesSection({
  isVerticalMast,
  activities,
  activitiesSummary,
  onActivitiesSummaryChange,
  selectedFoundations,
  onToggleFoundation,
  foundations,
  verticalMastSections,
  verticalMastGuyLayers,
  activityStatuses,
  onAddActivityRow,
  onOpenAddModal,
  onOpenEditModal,
  onRemoveActivityRow,
  onUpdateActivityRow,
}: DailyLogActivitiesSectionProps) {
  return (
    <section className="space-y-2.5 pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          5. Activities &amp; Status
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddActivityRow}
            className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
          >
            + Add Activity
          </button>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Activity
          </button>
        </div>
      </div>

      <div>
        <span className="text-[11px] font-medium text-slate-600 block mb-1">
          {isVerticalMast
            ? 'Tower Sections & Guy Layers Worked On'
            : 'Foundations Worked On'}
        </span>
        {isVerticalMast ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">
                Guy Layers:
              </span>
              {verticalMastGuyLayers.map((g) => {
                const active = selectedFoundations.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onToggleFoundation(g.id)}
                    className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded border text-xs sm:text-[10px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {g.id}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1 max-h-24 overflow-y-auto p-1.5 rounded border border-slate-200 bg-slate-50/50">
              <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">
                Sections:
              </span>
              {verticalMastSections.map((s) => {
                const active = selectedFoundations.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onToggleFoundation(s.id)}
                    className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded border text-xs sm:text-[10px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {s.id}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 sm:gap-1">
            {foundations.map((f) => {
              const active = selectedFoundations.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onToggleFoundation(f.id)}
                  className={`px-2.5 py-1.5 sm:px-2 sm:py-1 rounded border text-xs sm:text-[11px] font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {f.id}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile Compact Cards + Modal Trigger */}
      <div className="md:hidden space-y-2">
        {activities.map((act, idx) => (
          <div
            key={act.id}
            className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-start justify-between gap-2.5"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-bold text-slate-800">
                  {act.foundationId || 'Site'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                    ACTIVITY_STATUS_BADGE[act.status]
                  }`}
                >
                  {act.status}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-900">
                {act.description.trim() || (
                  <span className="text-slate-400 italic">
                    Tap Edit to describe activity...
                  </span>
                )}
              </div>
              {act.remarks && (
                <div className="text-[11px] text-slate-500">
                  Remarks: {act.remarks}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onOpenEditModal(act, idx)}
                aria-label="Edit activity"
                title="Edit Activity"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveActivityRow(idx)}
                aria-label="Remove activity"
                title="Remove Activity"
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
              <th className="px-2 py-1.5 font-semibold w-24">Location</th>
              <th className="px-2 py-1.5 font-semibold">Activity Description</th>
              <th className="px-2 py-1.5 font-semibold w-28">Status</th>
              <th className="px-2 py-1.5 font-semibold">Remarks</th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activities.map((act, idx) => (
              <tr key={act.id}>
                <td className="px-1.5 py-1">
                  <select
                    value={act.foundationId ?? ''}
                    onChange={(e) =>
                      onUpdateActivityRow(idx, { foundationId: e.target.value })
                    }
                    aria-label="Activity foundation"
                    className="w-full min-w-[78px] rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    <option value="">Site</option>
                    {isVerticalMast ? (
                      <>
                        <optgroup label="Guy Layers">
                          {verticalMastGuyLayers.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.id} (+{g.elevationM}m)
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Tower Sections">
                          {verticalMastSections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.id} ({s.elevationFromM}–{s.elevationToM}m)
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Ground Anchors">
                          {foundations.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.id}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    ) : (
                      foundations.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id}
                        </option>
                      ))
                    )}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={act.description}
                    onChange={(e) =>
                      onUpdateActivityRow(idx, { description: e.target.value })
                    }
                    placeholder="Activity description"
                    className="w-full min-w-[140px] rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={act.status}
                    onChange={(e) =>
                      onUpdateActivityRow(idx, {
                        status: e.target.value as DailyLogActivityStatus,
                      })
                    }
                    aria-label="Activity status"
                    className="w-full min-w-[92px] rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-800"
                  >
                    {activityStatuses.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={act.remarks ?? ''}
                    onChange={(e) =>
                      onUpdateActivityRow(idx, { remarks: e.target.value })
                    }
                    placeholder="Remarks"
                    className="w-full min-w-[85px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                  />
                </td>
                <td className="pr-1.5 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => onRemoveActivityRow(idx)}
                    aria-label="Remove activity"
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

      <label className="block text-xs">
        <span className="font-semibold text-slate-700">
          Overall Activity Summary (optional if listed above)
        </span>
        <textarea
          rows={2}
          value={activitiesSummary}
          onChange={(e) => onActivitiesSummaryChange(e.target.value)}
          placeholder="Brief daily accomplishment summary..."
          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
        />
      </label>
    </section>
  );
});
