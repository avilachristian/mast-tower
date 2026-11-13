import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { computeDailyLogMaterialRemaining } from '@/entities/project/calculations';
import type {
  DailyLogActivityItem,
  DailyLogActivityStatus,
  DailyLogDelayItem,
  DailyLogDocumentationItem,
  DailyLogEquipmentItem,
  DailyLogMaterialItem,
  DailyLogSafetyItem,
  DailyLogVisitorItem,
  FoundationRecord,
  TowerSectionRecord,
  GuyLayerRecord,
  WorkerAttendanceEntry,
  WorkerRole,
} from '@/entities/project/types';
import { readAndResizeImageFile } from '@/shared/lib/imageUpload';

export type DailyLogModalTarget =
  | { kind: 'worker'; index: number | null; item: WorkerAttendanceEntry }
  | { kind: 'material'; index: number | null; item: DailyLogMaterialItem }
  | { kind: 'activity'; index: number | null; item: DailyLogActivityItem }
  | { kind: 'equipment'; index: number | null; item: DailyLogEquipmentItem }
  | { kind: 'delay'; index: number | null; item: DailyLogDelayItem }
  | { kind: 'visitor'; index: number | null; item: DailyLogVisitorItem }
  | { kind: 'safety'; index: number | null; item: DailyLogSafetyItem }
  | { kind: 'documentation'; index: number | null; item: DailyLogDocumentationItem };

interface DailyLogRowEditorModalProps {
  target: DailyLogModalTarget | null;
  isVerticalMast: boolean;
  roles: WorkerRole[];
  activityStatuses: DailyLogActivityStatus[];
  foundations: FoundationRecord[];
  verticalMastSections: TowerSectionRecord[];
  verticalMastGuyLayers: GuyLayerRecord[];
  onClose: () => void;
  onSave: (target: DailyLogModalTarget) => void;
  onDelete?: (target: DailyLogModalTarget) => void;
}

const MODAL_TITLES: Record<DailyLogModalTarget['kind'], { add: string; edit: string }> = {
  worker: { add: 'Add Manpower Role', edit: 'Edit Manpower Role' },
  material: { add: 'Add Material / Item', edit: 'Edit Material / Item' },
  activity: { add: 'Add Site Activity', edit: 'Edit Site Activity' },
  equipment: { add: 'Add Equipment / Tool', edit: 'Edit Equipment / Tool' },
  delay: { add: 'Add Delay / Issue', edit: 'Edit Delay / Issue' },
  visitor: { add: 'Add Site Visitor', edit: 'Edit Site Visitor' },
  safety: { add: 'Add Safety Log Entry', edit: 'Edit Safety Log Entry' },
  documentation: { add: 'Add Documentation', edit: 'Edit Documentation' },
};

/**
 * Full-screen/bottom-sheet-friendly modal editor used on mobile devices so table rows
 * (Manpower, Materials/Tower Parts, Activities, Equipments, Delays, Visitors, Safety, Docs)
 * can be entered comfortably without cramped horizontal scrolling.
 */
export function DailyLogRowEditorModal({
  target,
  isVerticalMast,
  roles,
  activityStatuses,
  foundations,
  verticalMastSections,
  verticalMastGuyLayers,
  onClose,
  onSave,
  onDelete,
}: DailyLogRowEditorModalProps) {
  const [draft, setDraft] = useState<DailyLogModalTarget | null>(target);

  useEffect(() => {
    setDraft(target);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  if (!draft) return null;

  const isAdding = draft.index === null;
  const titlePair =
    draft.kind === 'material' && isVerticalMast
      ? { add: 'Add Tower Part', edit: 'Edit Tower Part' }
      : MODAL_TITLES[draft.kind];
  const modalTitle = isAdding ? titlePair.add : titlePair.edit;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-slate-200 bg-slate-50 shrink-0">
          <h3 className="text-sm font-bold text-slate-900">{modalTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3.5 text-sm">
          {draft.kind === 'worker' && (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Role / Trade
                </span>
                <select
                  value={draft.item.role}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, role: e.target.value as WorkerRole },
                    })
                  }
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600 block">
                  Headcount
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        item: {
                          ...draft.item,
                          count: Math.max(0, draft.item.count - 1),
                        },
                      })
                    }
                    className="h-11 w-14 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-lg font-bold text-slate-700 cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={draft.item.count}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: {
                          ...draft.item,
                          count: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                    className="flex-1 h-11 rounded-xl border border-slate-300 text-center text-base font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        item: { ...draft.item, count: draft.item.count + 1 },
                      })
                    }
                    className="h-11 w-14 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-lg font-bold text-slate-700 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Worker Names / Assignment Notes
                </span>
                <textarea
                  rows={2}
                  value={draft.item.names}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, names: e.target.value },
                    })
                  }
                  placeholder="Optional crew names or task assignment..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          {draft.kind === 'material' && (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <label className="col-span-2 block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    {isVerticalMast ? 'Tower Part Name' : 'Material Name'}
                  </span>
                  <input
                    type="text"
                    required
                    value={draft.item.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: { ...draft.item, name: e.target.value },
                      })
                    }
                    placeholder="Item name"
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>

                <label className="col-span-1 block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Unit
                  </span>
                  <input
                    type="text"
                    value={draft.item.unit}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: { ...draft.item, unit: e.target.value },
                      })
                    }
                    placeholder="pcs / bags"
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-center text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    On Site
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={draft.item.onSiteQty}
                    onChange={(e) => {
                      const nextItem = {
                        ...draft.item,
                        onSiteQty: Math.max(0, Number(e.target.value) || 0),
                      };
                      setDraft({
                        ...draft,
                        item: {
                          ...nextItem,
                          remainingQty: computeDailyLogMaterialRemaining(nextItem),
                        },
                      });
                    }}
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-bold text-right text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    Delivered
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={draft.item.deliveredQty ?? 0}
                    onChange={(e) => {
                      const nextItem = {
                        ...draft.item,
                        deliveredQty: Math.max(0, Number(e.target.value) || 0),
                      };
                      setDraft({
                        ...draft,
                        item: {
                          ...nextItem,
                          remainingQty: computeDailyLogMaterialRemaining(nextItem),
                        },
                      });
                    }}
                    className="w-full h-11 rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 text-sm font-bold text-right text-emerald-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Used
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={draft.item.usedTodayQty}
                    onChange={(e) => {
                      const nextItem = {
                        ...draft.item,
                        usedTodayQty: Math.max(0, Number(e.target.value) || 0),
                      };
                      setDraft({
                        ...draft,
                        item: {
                          ...nextItem,
                          remainingQty: computeDailyLogMaterialRemaining(nextItem),
                        },
                      });
                    }}
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-bold text-right text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 flex items-center justify-between text-sm">
                <span className="font-semibold text-sky-900">Computed Remaining Balance</span>
                <span className="font-bold text-sky-700 text-base tabular-nums">
                  {computeDailyLogMaterialRemaining(draft.item)} {draft.item.unit}
                </span>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Remarks
                </span>
                <input
                  type="text"
                  value={draft.item.remarks ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, remarks: e.target.value },
                    })
                  }
                  placeholder="Optional remarks..."
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          {draft.kind === 'activity' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Location
                  </span>
                  <select
                    value={draft.item.foundationId ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: { ...draft.item, foundationId: e.target.value },
                      })
                    }
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
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
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Status
                  </span>
                  <select
                    value={draft.item.status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: {
                          ...draft.item,
                          status: e.target.value as DailyLogActivityStatus,
                        },
                      })
                    }
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
                  >
                    {activityStatuses.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Activity Description
                </span>
                <textarea
                  rows={3}
                  required
                  value={draft.item.description}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, description: e.target.value },
                    })
                  }
                  placeholder="Describe work accomplished..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Remarks
                </span>
                <input
                  type="text"
                  value={draft.item.remarks ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, remarks: e.target.value },
                    })
                  }
                  placeholder="Optional remarks..."
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          {draft.kind === 'equipment' && (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Equipment / Tool
                </span>
                <input
                  type="text"
                  required
                  value={draft.item.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, name: e.target.value },
                    })
                  }
                  placeholder="e.g. Gin Pole / Torque Wrench"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                <label className="col-span-1 block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Qty
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={draft.item.qty}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: {
                          ...draft.item,
                          qty: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-bold text-center text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>

                <label className="col-span-2 block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Status
                  </span>
                  <input
                    type="text"
                    value={draft.item.status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: { ...draft.item, status: e.target.value },
                      })
                    }
                    placeholder="Operational"
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Remarks
                </span>
                <input
                  type="text"
                  value={draft.item.remarks ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, remarks: e.target.value },
                    })
                  }
                  placeholder="Optional remarks..."
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          {draft.kind === 'delay' && (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Delay / Issue Description
                </span>
                <textarea
                  rows={2}
                  required
                  value={draft.item.description}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, description: e.target.value },
                    })
                  }
                  placeholder="e.g. Strong gusts > 15 m/s"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Impact / Duration
                </span>
                <input
                  type="text"
                  value={draft.item.impact}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, impact: e.target.value },
                    })
                  }
                  placeholder="e.g. Erection paused 2 hrs"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Action / Remarks
                </span>
                <input
                  type="text"
                  value={draft.item.remarks ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, remarks: e.target.value },
                    })
                  }
                  placeholder="Mitigation or action taken"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          {draft.kind === 'visitor' && (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Visitor Name
                </span>
                <input
                  type="text"
                  required
                  value={draft.item.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, name: e.target.value },
                    })
                  }
                  placeholder="Full name"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Company / Role
                </span>
                <input
                  type="text"
                  value={draft.item.roleOrCompany}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, roleOrCompany: e.target.value },
                    })
                  }
                  placeholder="Client / Inspector / QA"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Purpose
                </span>
                <input
                  type="text"
                  value={draft.item.purpose}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, purpose: e.target.value },
                    })
                  }
                  placeholder="Site inspection / audit"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Remarks
                </span>
                <input
                  type="text"
                  value={draft.item.remarks ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, remarks: e.target.value },
                    })
                  }
                  placeholder="Optional notes"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          {draft.kind === 'safety' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Time / Activity
                  </span>
                  <input
                    type="text"
                    required
                    value={draft.item.timeOrActivity}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: { ...draft.item, timeOrActivity: e.target.value },
                      })
                    }
                    placeholder="07:30 Toolbox Talk"
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Status
                  </span>
                  <select
                    value={draft.item.status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item: { ...draft.item, status: e.target.value },
                      })
                    }
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
                  >
                    <option value="Compliant">Compliant</option>
                    <option value="Action Taken">Action Taken</option>
                    <option value="Open">Open</option>
                    <option value="N/A">N/A</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Safety Observation / Hazard
                </span>
                <textarea
                  rows={2}
                  value={draft.item.hazardOrFinding}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, hazardOrFinding: e.target.value },
                    })
                  }
                  placeholder="Harness check, PPE, wind speed..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Action Taken / Control
                </span>
                <input
                  type="text"
                  value={draft.item.actionTaken}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, actionTaken: e.target.value },
                    })
                  }
                  placeholder="Briefing / barricading / harness check"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          {draft.kind === 'documentation' && (
            <>
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600 block">
                  Site Photo
                </span>
                {draft.item.photoDataUrl ? (
                  <div className="space-y-2">
                    <img
                      src={draft.item.photoDataUrl}
                      alt={draft.item.description || draft.item.photoName || 'Documentation'}
                      className="w-full max-h-48 object-contain rounded-xl border border-slate-200 bg-slate-50"
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                        <ImagePlus className="w-4 h-4 text-sky-600" />
                        Replace Photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const dataUrl = await readAndResizeImageFile(file, 1100, 0.8);
                            setDraft((prev) =>
                              prev && prev.kind === 'documentation'
                                ? {
                                    ...prev,
                                    item: {
                                      ...prev.item,
                                      photoDataUrl: dataUrl,
                                      photoName: file.name,
                                    },
                                  }
                                : prev
                            );
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            item: {
                              ...draft.item,
                              photoDataUrl: undefined,
                              photoName: undefined,
                            },
                          })
                        }
                        className="h-11 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-sky-50/60 hover:border-sky-300 p-6 text-center cursor-pointer transition">
                    <ImagePlus className="w-6 h-6 text-sky-600" />
                    <span className="text-xs font-bold text-sky-700">
                      Capture or Upload Site Photo
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await readAndResizeImageFile(file, 1100, 0.8);
                        setDraft((prev) =>
                          prev && prev.kind === 'documentation'
                            ? {
                                ...prev,
                                item: {
                                  ...prev.item,
                                  photoDataUrl: dataUrl,
                                  photoName: file.name,
                                },
                              }
                            : prev
                        );
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Description
                </span>
                <textarea
                  rows={2}
                  value={draft.item.description}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, description: e.target.value },
                    })
                  }
                  placeholder="Photo description..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Remarks / Location
                </span>
                <input
                  type="text"
                  value={draft.item.remarks ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      item: { ...draft.item, remarks: e.target.value },
                    })
                  }
                  placeholder="Optional remarks..."
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </>
          )}

          <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
            {!isAdding && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(draft)}
                aria-label="Remove item"
                className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 h-11 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold shadow-xs cursor-pointer"
            >
              {isAdding ? 'Add Entry' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

