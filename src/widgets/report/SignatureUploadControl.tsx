import { PenLine, Trash2, Upload } from 'lucide-react';
import { uploadOrStageProjectImage } from '@/shared/lib/imageUpload';
import { useProjectStore } from '@/shared/state/projectStore';

interface SignatureUploadControlProps {
  label: string;
  value?: string;
  inheritedValue?: string;
  inheritedLabel?: string;
  emptyHint?: string;
  onChange: (nextUrl: string | undefined) => void;
}

export function SignatureUploadControl({
  label,
  value,
  inheritedValue,
  inheritedLabel = 'Using Prepared By signature',
  emptyHint = 'Optional — left blank if not uploaded',
  onChange,
}: SignatureUploadControlProps) {
  const activeUrl = value?.trim() || undefined;
  const fallbackUrl = !activeUrl ? inheritedValue?.trim() || undefined : undefined;

  const handleSelectFile = async (file?: File | null) => {
    if (!file) return;
    const uploaded = await uploadOrStageProjectImage({
      file,
      projectId: useProjectStore.getState().activeProjectId,
      category: 'signature',
    });
    if (!uploaded) return;
    onChange(uploaded.url);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-600">{label}</span>
        {activeUrl && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            title={`Remove ${label}`}
            aria-label={`Remove ${label}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Remove</span>
          </button>
        )}
      </div>

      {activeUrl ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 min-h-12">
          <div className="flex-1 flex items-center justify-start overflow-hidden h-10">
            <img
              src={activeUrl}
              alt={label}
              className="max-h-9 max-w-[160px] w-auto object-contain"
            />
          </div>
          <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[10px] font-semibold text-slate-700 cursor-pointer shrink-0">
            <Upload className="w-3 h-3" />
            <span>Replace</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleSelectFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      ) : fallbackUrl ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-sky-300 bg-sky-50/40 px-2.5 py-1.5 min-h-12">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={fallbackUrl}
              alt={inheritedLabel}
              className="max-h-8 max-w-[110px] w-auto object-contain opacity-85"
            />
            <span className="text-[10px] font-medium text-sky-700 truncate">
              {inheritedLabel}
            </span>
          </div>
          <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-sky-300 bg-white hover:bg-sky-50 text-[10px] font-semibold text-sky-700 cursor-pointer shrink-0">
            <Upload className="w-3 h-3" />
            <span>Override</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleSelectFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      ) : (
        <label className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 hover:border-sky-400 bg-slate-50/70 hover:bg-sky-50/40 px-2.5 py-1.5 min-h-11 cursor-pointer transition-colors">
          <span className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
            <PenLine className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{emptyHint}</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-700 shrink-0">
            <Upload className="w-3 h-3" />
            <span>Upload</span>
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleSelectFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}
