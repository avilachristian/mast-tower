import React, { memo } from 'react';
import { Camera, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DailyLogDocumentationItem } from '@/entities/project/types';

export interface DailyLogDocumentationSectionProps {
  documentationItems: DailyLogDocumentationItem[];
  onAddRow: () => void;
  onOpenModal: (doc: DailyLogDocumentationItem, index: number) => void;
  onRemoveRow: (index: number) => void;
  onUpdateRow: (index: number, patch: Partial<DailyLogDocumentationItem>) => void;
  onUploadPhoto: (index: number, e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const DailyLogDocumentationSection = memo(function DailyLogDocumentationSection({
  documentationItems,
  onAddRow,
  onOpenModal,
  onRemoveRow,
  onUpdateRow,
  onUploadPhoto,
}: DailyLogDocumentationSectionProps) {
  return (
    <section className="space-y-2 pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <Camera className="w-3.5 h-3.5 text-sky-600" />
          10. Documentation
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddRow}
            className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
          >
            + Add Documentation
          </button>
          <button
            type="button"
            onClick={onAddRow}
            className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Photo
          </button>
        </div>
      </div>

      {/* Mobile Compact Cards */}
      <div className="md:hidden space-y-2">
        {documentationItems.map((doc, idx) => (
          <div
            key={doc.id}
            className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {doc.photoDataUrl ? (
                <img
                  src={doc.photoDataUrl}
                  alt={doc.description || doc.photoName || 'Documentation'}
                  className="w-14 h-14 object-cover rounded-lg border border-slate-200 bg-white shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {doc.description.trim() || (
                    <span className="text-slate-400 italic font-normal">
                      Tap Edit to add photo/caption
                    </span>
                  )}
                </div>
                {doc.remarks && (
                  <div className="text-[11px] text-slate-500 truncate">
                    {doc.remarks}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onOpenModal(doc, idx)}
                aria-label="Edit documentation"
                title="Edit Documentation"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveRow(idx)}
                aria-label="Remove documentation row"
                title="Remove Documentation"
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
              <th className="px-2 py-1.5 font-semibold w-5/12">Image</th>
              <th className="px-2 py-1.5 font-semibold w-7/12">
                Description / Remarks
              </th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {documentationItems.map((doc, idx) => (
              <tr key={doc.id}>
                <td className="p-2 align-middle">
                  <div className="space-y-1.5">
                    {doc.photoDataUrl ? (
                      <div className="space-y-1.5">
                        <img
                          src={doc.photoDataUrl}
                          alt={doc.description || doc.photoName || 'Documentation'}
                          className="w-full max-h-36 object-contain rounded border border-slate-200 bg-slate-50"
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[10px] font-semibold text-slate-700 cursor-pointer">
                            <ImagePlus className="w-3 h-3 text-sky-600" />
                            Replace
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => onUploadPhoto(idx, e)}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateRow(idx, {
                                photoDataUrl: undefined,
                                photoName: undefined,
                              })
                            }
                            className="px-2 py-0.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[10px] font-semibold text-rose-700 cursor-pointer"
                          >
                            Clear Photo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-sky-50/60 hover:border-sky-300 p-4 text-center cursor-pointer transition">
                        <ImagePlus className="w-4 h-4 text-sky-600" />
                        <span className="text-[11px] font-semibold text-sky-700">
                          Upload Photo
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => onUploadPhoto(idx, e)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </td>
                <td className="p-2 align-top space-y-1.5">
                  <textarea
                    rows={2}
                    value={doc.description}
                    onChange={(e) =>
                      onUpdateRow(idx, {
                        description: e.target.value,
                      })
                    }
                    placeholder="Photo description (e.g. I-A1 excavation & rebar spacing check)"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={doc.remarks ?? ''}
                    onChange={(e) =>
                      onUpdateRow(idx, {
                        remarks: e.target.value,
                      })
                    }
                    placeholder="Remarks / location / notes"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                  />
                </td>
                <td className="pr-1.5 py-2 align-top text-center">
                  <button
                    type="button"
                    onClick={() => onRemoveRow(idx)}
                    aria-label="Remove documentation row"
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
