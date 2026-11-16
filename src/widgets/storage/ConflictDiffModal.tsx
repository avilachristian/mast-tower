import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Cloud,
  FileText,
  HardDrive,
  X,
} from 'lucide-react';
import type { SavedProjectRecord } from '@/entities/project/types';
import { computeProjectConflictDiff } from '@/shared/storage/cloudConflictDiff';

export interface ConflictDiffModalProps {
  localRecord: SavedProjectRecord;
  cloudRecord: SavedProjectRecord;
  onUseCloud: () => void | Promise<void>;
  onKeepLocal: () => void | Promise<void>;
  onClose: () => void;
}

export function ConflictDiffModal({
  localRecord,
  cloudRecord,
  onUseCloud,
  onKeepLocal,
  onClose,
}: ConflictDiffModalProps) {
  const diffReport = useMemo(() => {
    return computeProjectConflictDiff(localRecord, cloudRecord);
  }, [localRecord, cloudRecord]);

  const projectName =
    localRecord.state.reportDetails?.projectName?.trim() ||
    localRecord.state.projectName ||
    'Mast Tower Project';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 p-4 sm:px-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-100 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Cloud Sync Conflict Comparison
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              Project: <strong className="text-slate-800">{projectName}</strong> ·{' '}
              {diffReport.totalDifferenceCount} differing field
              {diffReport.totalDifferenceCount === 1 ? '' : 's'} detected
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors"
            aria-label="Close conflict modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Versions summary ribbon */}
        <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200 bg-amber-50/40 text-xs">
          <div className="p-3 sm:px-6 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>My Local Device Copy</span>
                <span className="px-1.5 py-0.2 rounded bg-slate-200 text-[10px] font-semibold text-slate-700">
                  v{localRecord.version ?? 1}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Saved:{' '}
                {localRecord.updatedAt
                  ? new Date(localRecord.updatedAt).toLocaleTimeString()
                  : '—'}
              </div>
            </div>
          </div>

          <div className="p-3 sm:px-6 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>Cloud Server Copy</span>
                <span className="px-1.5 py-0.2 rounded bg-sky-100 text-[10px] font-semibold text-sky-800">
                  v{cloudRecord.version ?? 1}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Saved:{' '}
                {cloudRecord.updatedAt
                  ? new Date(cloudRecord.updatedAt).toLocaleTimeString()
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Diff Sections Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {diffReport.sections.map((section) => (
            <div
              key={section.title}
              className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs bg-white"
            >
              <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  {section.title}
                </h3>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {section.diffs.map((diff, idx) => (
                  <div
                    key={idx}
                    className={`grid grid-cols-12 p-3 gap-2 items-center ${
                      diff.isDifferent
                        ? 'bg-amber-50/50 hover:bg-amber-50 transition-colors'
                        : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="col-span-12 sm:col-span-4 font-semibold text-slate-700 flex items-center gap-1.5">
                      {diff.isDifferent ? (
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                      <span>{diff.label}</span>
                    </div>

                    <div className="col-span-6 sm:col-span-4 text-slate-800 font-mono text-[11px] break-words p-1.5 rounded bg-white/80 border border-slate-200/80">
                      <div className="text-[9px] uppercase font-sans font-bold text-slate-400 mb-0.5">
                        Local
                      </div>
                      {diff.localVal}
                    </div>

                    <div className="col-span-6 sm:col-span-4 text-slate-800 font-mono text-[11px] break-words p-1.5 rounded bg-white/80 border border-slate-200/80">
                      <div className="text-[9px] uppercase font-sans font-bold text-sky-600 mb-0.5">
                        Cloud
                      </div>
                      {diff.cloudVal}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
          >
            Decide Later
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onUseCloud}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold cursor-pointer transition shadow-2xs"
            >
              <Cloud className="w-3.5 h-3.5 text-sky-600" />
              <span>Use Cloud Copy</span>
            </button>
            <button
              type="button"
              onClick={onKeepLocal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer transition shadow-2xs"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Keep My Local Copy (Overwrite Cloud)</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
