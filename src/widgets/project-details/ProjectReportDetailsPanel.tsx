import { ImagePlus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import type { MastProjectState, ReportDetailsSpec } from '@/entities/project/types';
import { createDefaultReportLogos, resolveReportLogos } from '@/shared/assets/defaultLogos';
import { ReportLetterhead } from '@/widgets/report/ReportLetterhead';

type LogoPosition = 'left' | 'center' | 'right';

function readAndOptimizeLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      if (!rawUrl.startsWith('data:image/')) {
        resolve(rawUrl);
        return;
      }
      // Preserve SVGs directly without rasterization
      if (file.type === 'image/svg+xml') {
        resolve(rawUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 420;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const targetW = Math.max(1, Math.round((img.width || 1) * scale));
        const targetH = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const keepPng = file.type === 'image/png' || file.type === 'image/webp';
        resolve(canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.88));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ProjectReportDetailsPanel({
  project,
  defaultReportTitle = 'CURRENT FOUNDATION ACTIVITY REPORT',
  reportKicker = 'Civil Works & Foundation Report',
  onChange,
  onOpenReport,
}: {
  project: MastProjectState;
  defaultReportTitle?: string;
  reportKicker?: string;
  onChange: (patch: Partial<ReportDetailsSpec>) => void;
  onOpenReport?: () => void;
}) {
  const details: ReportDetailsSpec = project.reportDetails ?? {};
  const resolvedLogos = resolveReportLogos(details.logos);

  const update = (patch: Partial<ReportDetailsSpec>) => {
    onChange(patch);
  };

  const handleUploadLogo = async (slot: LogoPosition, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readAndOptimizeLogoFile(file);
    update({
      logos: {
        ...resolvedLogos,
        [slot]: {
          dataUrl,
          caption: resolvedLogos[slot]?.caption ?? '',
        },
      },
    });
  };

  const handleUpdateLogoCaption = (slot: LogoPosition, caption: string) => {
    const current = resolvedLogos[slot];
    if (!current?.dataUrl) return;
    update({
      logos: {
        ...resolvedLogos,
        [slot]: { ...current, caption },
      },
    });
  };

  const handleRemoveLogo = (slot: LogoPosition) => {
    update({
      logos: {
        ...resolvedLogos,
        [slot]: { dataUrl: '', caption: '' },
      },
    });
  };

  const handleResetDefaultLogos = () => {
    update({
      logos: createDefaultReportLogos(),
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-2xs">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Project &amp; Report Submittal Details
            </h2>
            <p className="text-[11px] text-slate-500">
              Configure header logos, project metadata, and engineering signatories included across Activity, Inspection, and Daily Log PDF reports.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => update({ reportDate: getTodayIsoDate() })}
              className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> Set Today&apos;s Date
            </button>
            {onOpenReport && (
              <button
                type="button"
                onClick={onOpenReport}
                title="Preview / Print Report"
                className="inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-3 py-2 sm:py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Preview / Print Report</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Letterhead Preview */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs overflow-x-auto">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
            Live Report Header Preview
          </div>
          <ReportLetterhead
            details={details}
            kicker={reportKicker}
            defaultTitle={defaultReportTitle}
            fallbackProjectName={project.projectName}
            fallbackLocation={project.location}
            fallbackContractor={project.contractor}
            fallbackDate={project.lastUpdated}
          />
        </div>

        {/* 3-Logo Letterhead Uploader */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Report Header Logos (Up to 3: Left · Center · Right)
              </h3>
              <p className="text-[11px] text-slate-500">
                Upload company, client, consultant, or project stamps (PNG, JPG, WebP, SVG).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleResetDefaultLogos}
                className="inline-flex items-center gap-1.5 min-h-9 sm:min-h-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                title="Restore default GSL (Left), PGPC (Center), and GEDI (Right) logos"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore Default Logos
              </button>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <span className="font-medium">Logo Height:</span>
                <input
                  type="range"
                  min={32}
                  max={96}
                  step={4}
                  value={details.logoHeightPx ?? 52}
                  onChange={(e) =>
                    update({ logoHeightPx: parseInt(e.target.value, 10) || 52 })
                  }
                  className="w-24 accent-sky-600"
                />
                <span className="w-10 text-right font-mono text-[11px] font-semibold">
                  {details.logoHeightPx ?? 52}px
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                {
                  slot: 'left',
                  title: 'Left Logo',
                  hint: 'Default: GSL Logo',
                },
                {
                  slot: 'center',
                  title: 'Center Logo',
                  hint: 'Default: PGPC Logo',
                },
                {
                  slot: 'right',
                  title: 'Right Logo',
                  hint: 'Default: GEDI Logo',
                },
              ] as const
            ).map(({ slot, title, hint }) => {
              const logo = resolvedLogos[slot];
              return (
                <div
                  key={slot}
                  className="border border-slate-200 rounded-lg p-3 bg-slate-50/70 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{title}</div>
                      <div className="text-[10px] text-slate-500">{hint}</div>
                    </div>
                    {logo?.dataUrl && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLogo(slot)}
                        title={`Remove ${title}`}
                        aria-label={`Remove ${title}`}
                        className="h-9 w-9 sm:h-auto sm:w-auto inline-flex items-center justify-center p-1.5 sm:p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </button>
                    )}
                  </div>

                  {logo?.dataUrl ? (
                    <div className="h-20 bg-white border border-slate-200 rounded flex items-center justify-center p-2">
                      <img
                        src={logo.dataUrl}
                        alt={title}
                        className="max-h-16 max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <label className="h-24 sm:h-20 border-2 border-dashed border-slate-300 hover:border-sky-400 rounded bg-white flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-500 hover:text-sky-600 transition-colors">
                      <ImagePlus className="w-5 h-5 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-[11px] font-medium">Upload {title}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          void handleUploadLogo(slot, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Optional caption under logo..."
                      value={logo?.caption ?? ''}
                      disabled={!logo?.dataUrl}
                      onChange={(e) => handleUpdateLogoCaption(slot, e.target.value)}
                      className="flex-1 h-9 sm:h-7 px-2 text-xs sm:text-[11px] border border-slate-200 rounded bg-white disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    {logo?.dataUrl && (
                      <label className="h-9 sm:h-7 px-3 sm:px-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-xs sm:text-[10px] font-semibold text-slate-700 inline-flex items-center cursor-pointer">
                        Replace
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void handleUploadLogo(slot, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Metadata & Signatories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
              Project &amp; Document Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="sm:col-span-2 block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Project Name
                </span>
                <input
                  type="text"
                  placeholder={project.projectName}
                  value={details.projectName ?? project.projectName}
                  onChange={(e) => update({ projectName: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="sm:col-span-2 block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Report Title Override (Optional)
                </span>
                <input
                  type="text"
                  placeholder={`Default per tab (e.g. ${defaultReportTitle})`}
                  value={details.documentTitle ?? ''}
                  onChange={(e) => update({ documentTitle: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Client / Owner
                </span>
                <input
                  type="text"
                  placeholder="e.g. TowerCo / Telecom Client"
                  value={details.clientName ?? ''}
                  onChange={(e) => update({ clientName: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Contractor
                </span>
                <input
                  type="text"
                  placeholder={project.contractor}
                  value={details.contractor ?? project.contractor}
                  onChange={(e) => update({ contractor: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Location / Site
                </span>
                <input
                  type="text"
                  placeholder={project.location}
                  value={details.projectLocation ?? project.location}
                  onChange={(e) => update({ projectLocation: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reference / Drawing No.
                </span>
                <input
                  type="text"
                  placeholder="e.g. ZT-120-01 / MAST-2"
                  value={details.referenceNo ?? ''}
                  onChange={(e) => update({ referenceNo: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Revision
                </span>
                <input
                  type="text"
                  placeholder="Rev 0"
                  value={details.revision ?? ''}
                  onChange={(e) => update({ revision: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Report Date
                </span>
                <input
                  type="date"
                  value={details.reportDate ?? getTodayIsoDate()}
                  onChange={(e) => update({ reportDate: e.target.value })}
                  className="w-full h-8 px-2 border border-slate-300 rounded bg-white"
                />
              </label>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
              Signatories &amp; Report Notes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prepared By
                </span>
                <input
                  type="text"
                  placeholder={project.preparedBy}
                  value={details.preparedBy ?? project.preparedBy}
                  onChange={(e) => update({ preparedBy: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Designation / License
                </span>
                <input
                  type="text"
                  placeholder="e.g. Site Civil Engineer"
                  value={details.preparedTitle ?? ''}
                  onChange={(e) => update({ preparedTitle: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Checked / Reviewed By
                </span>
                <input
                  type="text"
                  placeholder="Name / Engr."
                  value={details.checkedBy ?? ''}
                  onChange={(e) => update({ checkedBy: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Checker Title
                </span>
                <input
                  type="text"
                  placeholder="e.g. QA/QC Engineer"
                  value={details.checkedTitle ?? ''}
                  onChange={(e) => update({ checkedTitle: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Approved By
                </span>
                <input
                  type="text"
                  placeholder="Project Manager / Client Rep"
                  value={details.approvedBy ?? ''}
                  onChange={(e) => update({ approvedBy: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Approver Title
                </span>
                <input
                  type="text"
                  placeholder="e.g. Project Director"
                  value={details.approvedTitle ?? ''}
                  onChange={(e) => update({ approvedTitle: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                />
              </label>

              <label className="sm:col-span-2 block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  General Notes / Civil Remarks
                </span>
                <textarea
                  rows={2}
                  placeholder="e.g. All civil works and anchor installations per approved foundation drawings."
                  value={details.notes ?? ''}
                  onChange={(e) => update({ notes: e.target.value })}
                  className="w-full p-2 text-xs border border-slate-300 rounded bg-white"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

