import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PenLine, RotateCcw, Upload, X } from 'lucide-react';
import type {
  FoundationInspectionMeta,
  MastProjectState,
  ReportDetailsSpec,
} from '@/entities/project/types';
import { resizeLogoFileToDataUrl } from '@/shared/lib/imageUpload';

export interface SignatoryOverrideSlot {
  name?: string;
  title?: string;
  /** `null` explicitly blanks the signature for this report; `string` sets an override image; `undefined` uses default rules. */
  signatureUrl?: string | null;
}

export interface ReportSignoffOverrideState {
  prepared?: SignatoryOverrideSlot;
  verified?: SignatoryOverrideSlot;
  checked?: SignatoryOverrideSlot;
  approved?: SignatoryOverrideSlot;
}

export interface ReportSignoffDefaults {
  preparedBy?: string;
  preparedTitle?: string;
  preparedSignatureUrl?: string;
  verifiedBy?: string;
  verifiedSignatureUrl?: string;
  checkedBy?: string;
  checkedTitle?: string;
  checkedSignatureUrl?: string;
  approvedBy?: string;
  approvedTitle?: string;
  approvedSignatureUrl?: string;
}

interface ReportSignoffOverrideContextValue {
  overrides: ReportSignoffOverrideState;
  defaults: ReportSignoffDefaults;
  includeVerified: boolean;
  setRoleOverride: (
    role: keyof ReportSignoffOverrideState,
    patch: Partial<SignatoryOverrideSlot>
  ) => void;
  resetRole: (role: keyof ReportSignoffOverrideState) => void;
  resetAll: () => void;
  hasActiveOverrides: boolean;
}

const ReportSignoffOverrideContext =
  createContext<ReportSignoffOverrideContextValue | null>(null);

export function resolveOverriddenSignatureUrl({
  overrideName,
  overrideSignature,
  baseName,
  baseSignature,
}: {
  overrideName?: string;
  overrideSignature?: string | null;
  baseName?: string;
  baseSignature?: string;
}): string | undefined {
  if (overrideSignature === null || overrideSignature === '') {
    return undefined;
  }
  if (typeof overrideSignature === 'string') {
    return overrideSignature.trim() || undefined;
  }
  const cleanBaseName = baseName?.trim() || '';
  if (overrideName !== undefined) {
    const nextName = overrideName.trim();
    if (!nextName) return undefined;
    if (!cleanBaseName || nextName.toLowerCase() !== cleanBaseName.toLowerCase()) {
      return undefined;
    }
  }
  return baseSignature?.trim() || undefined;
}

function resolveRoleFields(
  baseName: string | undefined,
  baseTitle: string | undefined,
  baseSignature: string | undefined,
  slot: SignatoryOverrideSlot | undefined
) {
  const cleanBaseName = baseName?.trim() || '';
  const name = slot?.name !== undefined ? slot.name.trim() : cleanBaseName;
  const title =
    slot?.title !== undefined ? slot.title.trim() : baseTitle?.trim() || '';
  const signatureUrl = resolveOverriddenSignatureUrl({
    overrideName: slot?.name,
    overrideSignature: slot?.signatureUrl,
    baseName: cleanBaseName,
    baseSignature,
  });
  return { name, title, signatureUrl };
}

export function applySignoffOverridesToDetails(
  details: ReportDetailsSpec | undefined,
  overrides: ReportSignoffOverrideState | null | undefined,
  fallbackPreparedBy?: string
): ReportDetailsSpec | undefined {
  if (!overrides) return details;

  const hasAny =
    overrides.prepared !== undefined ||
    overrides.checked !== undefined ||
    overrides.approved !== undefined;
  if (!hasAny) return details;

  const prep = resolveRoleFields(
    details?.preparedBy?.trim() || fallbackPreparedBy?.trim(),
    details?.preparedTitle,
    details?.preparedSignatureUrl,
    overrides.prepared
  );
  const chk = resolveRoleFields(
    details?.checkedBy,
    details?.checkedTitle,
    details?.checkedSignatureUrl,
    overrides.checked
  );
  const app = resolveRoleFields(
    details?.approvedBy,
    details?.approvedTitle,
    details?.approvedSignatureUrl,
    overrides.approved
  );

  return {
    ...details,
    preparedBy: prep.name,
    preparedTitle: prep.title,
    preparedSignatureUrl: prep.signatureUrl,
    checkedBy: chk.name,
    checkedTitle: chk.title,
    checkedSignatureUrl: chk.signatureUrl,
    approvedBy: app.name,
    approvedTitle: app.title,
    approvedSignatureUrl: app.signatureUrl,
  };
}

export function isSlotOverridden(slot?: SignatoryOverrideSlot): boolean {
  if (!slot) return false;
  return (
    slot.name !== undefined ||
    slot.title !== undefined ||
    slot.signatureUrl !== undefined
  );
}

export function ReportSignoffOverrideProvider({
  project,
  enabled = true,
  includeVerified = false,
  defaults: customDefaults,
  children,
}: {
  project: Pick<MastProjectState, 'preparedBy' | 'reportDetails'>;
  enabled?: boolean;
  includeVerified?: boolean;
  defaults?: Partial<ReportSignoffDefaults>;
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<ReportSignoffOverrideState>({});

  const defaults = useMemo<ReportSignoffDefaults>(() => {
    const rd = project.reportDetails ?? {};
    return {
      preparedBy:
        customDefaults?.preparedBy !== undefined
          ? customDefaults.preparedBy
          : rd.preparedBy?.trim() || project.preparedBy?.trim() || '',
      preparedTitle:
        customDefaults?.preparedTitle ?? rd.preparedTitle?.trim() ?? '',
      preparedSignatureUrl:
        customDefaults?.preparedSignatureUrl !== undefined
          ? customDefaults.preparedSignatureUrl
          : rd.preparedSignatureUrl?.trim() || undefined,
      verifiedBy: customDefaults?.verifiedBy ?? '',
      verifiedSignatureUrl: customDefaults?.verifiedSignatureUrl,
      checkedBy: customDefaults?.checkedBy ?? rd.checkedBy?.trim() ?? '',
      checkedTitle:
        customDefaults?.checkedTitle ?? rd.checkedTitle?.trim() ?? '',
      checkedSignatureUrl:
        customDefaults?.checkedSignatureUrl ??
        (rd.checkedSignatureUrl?.trim() || undefined),
      approvedBy: customDefaults?.approvedBy ?? rd.approvedBy?.trim() ?? '',
      approvedTitle:
        customDefaults?.approvedTitle ?? rd.approvedTitle?.trim() ?? '',
      approvedSignatureUrl:
        customDefaults?.approvedSignatureUrl ??
        (rd.approvedSignatureUrl?.trim() || undefined),
    };
  }, [project, customDefaults]);

  const contextValue = useMemo<ReportSignoffOverrideContextValue | null>(() => {
    if (!enabled) return null;

    const setRoleOverride = (
      role: keyof ReportSignoffOverrideState,
      patch: Partial<SignatoryOverrideSlot>
    ) => {
      setOverrides((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          ...patch,
        },
      }));
    };

    const resetRole = (role: keyof ReportSignoffOverrideState) => {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
    };

    const resetAll = () => setOverrides({});

    const hasActiveOverrides =
      isSlotOverridden(overrides.prepared) ||
      isSlotOverridden(overrides.verified) ||
      isSlotOverridden(overrides.checked) ||
      isSlotOverridden(overrides.approved);

    return {
      overrides,
      defaults,
      includeVerified,
      setRoleOverride,
      resetRole,
      resetAll,
      hasActiveOverrides,
    };
  }, [enabled, overrides, defaults, includeVerified]);

  return (
    <ReportSignoffOverrideContext.Provider value={contextValue}>
      {children}
    </ReportSignoffOverrideContext.Provider>
  );
}

export function useReportSignoffOverrides(): ReportSignoffOverrideState | null {
  return useContext(ReportSignoffOverrideContext)?.overrides ?? null;
}

export function useReportSignoffOverrideControls(): ReportSignoffOverrideContextValue | null {
  return useContext(ReportSignoffOverrideContext);
}

export function resolveInspectionSignoffs({
  project,
  meta,
  baseDetails,
  overrides,
}: {
  project: Pick<MastProjectState, 'lastUpdated' | 'preparedBy' | 'reportDetails'>;
  meta?: FoundationInspectionMeta;
  baseDetails: ReportDetailsSpec;
  overrides?: ReportSignoffOverrideState | null;
}) {
  const inspectionDate = meta?.inspectionDate?.trim() || project.lastUpdated;
  const mergedDetails = applySignoffOverridesToDetails(
    baseDetails,
    overrides,
    meta?.inspectorName?.trim() || project.preparedBy
  );
  const inspectorName =
    mergedDetails?.preparedBy?.trim() ||
    meta?.inspectorName?.trim() ||
    project.preparedBy?.trim() ||
    '';
  const inspectorSignatureUrl = mergedDetails?.preparedSignatureUrl;

  const baseVerifiedBy = meta?.contractorRep?.trim() || '';
  const baseVerifiedSig = meta?.verifiedSignatureUrl?.trim() || undefined;
  const verOv = overrides?.verified;
  const verifiedBy =
    verOv?.name !== undefined ? verOv.name.trim() : baseVerifiedBy;
  const verifiedSignatureUrl = resolveOverriddenSignatureUrl({
    overrideName: verOv?.name,
    overrideSignature: verOv?.signatureUrl,
    baseName: baseVerifiedBy,
    baseSignature: baseVerifiedSig,
  });

  return {
    inspectionDate,
    reportDetails: mergedDetails ?? baseDetails,
    inspectorName,
    inspectorSignatureUrl,
    verifiedBy,
    verifiedSignatureUrl,
  };
}

export function SignatoriesOverridePanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const ctrl = useReportSignoffOverrideControls();
  if (!ctrl) return null;

  const {
    overrides,
    defaults,
    includeVerified,
    setRoleOverride,
    resetRole,
    resetAll,
    hasActiveOverrides,
  } = ctrl;

  const handleUploadOverrideSignature = async (
    role: keyof ReportSignoffOverrideState,
    file?: File | null
  ) => {
    if (!file) return;
    const dataUrl = await resizeLogoFileToDataUrl(file);
    setRoleOverride(role, { signatureUrl: dataUrl });
  };

  const roles: {
    key: keyof ReportSignoffOverrideState;
    label: string;
    namePlaceholder: string;
    showTitle: boolean;
    titlePlaceholder?: string;
    baseName?: string;
    baseTitle?: string;
    baseSignature?: string;
  }[] = [
    {
      key: 'prepared',
      label: includeVerified ? 'Prepared / Inspected By' : 'Prepared By',
      namePlaceholder: defaults.preparedBy || 'Name',
      showTitle: true,
      titlePlaceholder: defaults.preparedTitle || 'Designation / License',
      baseName: defaults.preparedBy,
      baseTitle: defaults.preparedTitle,
      baseSignature: defaults.preparedSignatureUrl,
    },
    ...(includeVerified
      ? [
          {
            key: 'verified' as const,
            label: 'Verified By',
            namePlaceholder: defaults.verifiedBy || 'Optional verifier name',
            showTitle: false,
            baseName: defaults.verifiedBy,
            baseSignature: defaults.verifiedSignatureUrl,
          },
        ]
      : []),
    {
      key: 'checked',
      label: 'Checked / Reviewed By',
      namePlaceholder: defaults.checkedBy || 'Leave blank to omit',
      showTitle: true,
      titlePlaceholder: defaults.checkedTitle || 'Checker Title',
      baseName: defaults.checkedBy,
      baseTitle: defaults.checkedTitle,
      baseSignature: defaults.checkedSignatureUrl,
    },
    {
      key: 'approved',
      label: 'Approved By',
      namePlaceholder: defaults.approvedBy || 'Leave blank to omit',
      showTitle: true,
      titlePlaceholder: defaults.approvedTitle || 'Approver Title',
      baseName: defaults.approvedBy,
      baseTitle: defaults.approvedTitle,
      baseSignature: defaults.approvedSignatureUrl,
    },
  ];

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <PenLine className="w-3.5 h-3.5 text-sky-600" />
            <span>Override Signatories for This Report</span>
          </div>
          <p className="text-[10.5px] text-slate-500">
            Temporarily change who prepared, verified, checked, or approved this printout without changing saved Project Report Details.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {hasActiveOverrides && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>Hide</span>
          </button>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          includeVerified ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        } gap-2.5`}
      >
        {roles.map((r) => {
          const slot = overrides[r.key];
          const overridden = isSlotOverridden(slot);
          const effectiveName =
            slot?.name !== undefined ? slot.name : r.baseName ?? '';
          const effectiveTitle =
            slot?.title !== undefined ? slot.title : r.baseTitle ?? '';
          const effectiveSig = resolveOverriddenSignatureUrl({
            overrideName: slot?.name,
            overrideSignature: slot?.signatureUrl,
            baseName: r.baseName,
            baseSignature: r.baseSignature,
          });
          const forcedBlank = slot?.signatureUrl === null || slot?.signatureUrl === '';

          return (
            <div
              key={r.key}
              className={`rounded-lg border p-2.5 space-y-1.5 bg-white ${
                overridden ? 'border-sky-400 ring-1 ring-sky-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-slate-800">
                  {r.label}
                </span>
                {overridden && (
                  <button
                    type="button"
                    onClick={() => resetRole(r.key)}
                    className="text-[10px] font-semibold text-sky-700 hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              <input
                type="text"
                aria-label={`${r.label} Name`}
                placeholder={r.namePlaceholder}
                value={effectiveName}
                onChange={(e) =>
                  setRoleOverride(r.key, { name: e.target.value })
                }
                className="w-full h-7 px-2 text-xs rounded border border-slate-300 bg-white text-slate-900 focus:border-sky-500 focus:outline-none"
              />

              {r.showTitle && (
                <input
                  type="text"
                  aria-label={`${r.label} Title`}
                  placeholder={r.titlePlaceholder}
                  value={effectiveTitle}
                  onChange={(e) =>
                    setRoleOverride(r.key, { title: e.target.value })
                  }
                  className="w-full h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 focus:border-sky-500 focus:outline-none"
                />
              )}

              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <div className="h-8 flex-1 rounded border border-slate-200 bg-slate-50 px-1.5 flex items-center justify-start overflow-hidden">
                  {effectiveSig ? (
                    <img
                      src={effectiveSig}
                      alt={`${r.label} override preview`}
                      className="max-h-7 max-w-[100px] w-auto object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400 italic truncate">
                      {forcedBlank ? 'Blank (this report)' : 'No signature (blank)'}
                    </span>
                  )}
                </div>

                <label className="inline-flex items-center gap-1 h-8 px-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-700 cursor-pointer shrink-0">
                  <Upload className="w-3 h-3" />
                  <span>{effectiveSig ? 'Replace' : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleUploadOverrideSignature(
                        r.key,
                        e.target.files?.[0]
                      );
                      e.target.value = '';
                    }}
                  />
                </label>

                {effectiveSig ? (
                  <button
                    type="button"
                    onClick={() => setRoleOverride(r.key, { signatureUrl: null })}
                    title="Leave signature blank on this report"
                    className="h-8 px-2 rounded border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 text-[10px] font-semibold text-slate-600 cursor-pointer shrink-0"
                  >
                    Blank
                  </button>
                ) : forcedBlank ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRoleOverride(r.key, { signatureUrl: undefined })
                    }
                    className="h-8 px-2 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-600 cursor-pointer shrink-0"
                  >
                    Default
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
