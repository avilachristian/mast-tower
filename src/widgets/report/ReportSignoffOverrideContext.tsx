import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PenLine, PenTool, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react';
import { DEFAULT_SAFETY_OFFICER_NAME } from '@/entities/project/materialConstants';
import type {
  FoundationInspectionMeta,
  MastProjectState,
  ReportDetailsSpec,
} from '@/entities/project/types';
import { resizeLogoFileToDataUrl } from '@/shared/lib/imageUpload';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { SignaturePadModal } from './SignaturePadModal';

export interface SignatoryOverrideSlot {
  name?: string;
  title?: string;
  /** `null` explicitly blanks the signature for this report; `string` sets an override image; `undefined` uses default rules. */
  signatureUrl?: string | null;
}

export type SignatoryOverrideRole =
  | 'prepared'
  | 'verified'
  | 'checked'
  | 'approved'
  | 'safetyOfficer';

export interface ReportSignoffOverrideState {
  prepared?: SignatoryOverrideSlot;
  verified?: SignatoryOverrideSlot;
  checked?: SignatoryOverrideSlot;
  approved?: SignatoryOverrideSlot;
  safetyOfficer?: SignatoryOverrideSlot;
  /** `true` includes Safety Officer on this report; `false` omits it; `undefined` uses the report's default rule. */
  includeSafetyOfficer?: boolean;
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
  safetyOfficerBy?: string;
  safetyOfficerSignatureUrl?: string;
}

interface ReportSignoffOverrideContextValue {
  overrides: ReportSignoffOverrideState;
  defaults: ReportSignoffDefaults;
  includeVerified: boolean;
  includeSafetyOfficer: boolean;
  defaultIncludeSafetyOfficer: boolean;
  setIncludeSafetyOfficer: (include: boolean) => void;
  setRoleOverride: (
    role: SignatoryOverrideRole,
    patch: Partial<SignatoryOverrideSlot>
  ) => void;
  resetRole: (role: SignatoryOverrideRole) => void;
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
    overrides.approved !== undefined ||
    overrides.safetyOfficer !== undefined;
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
  const so = resolveRoleFields(
    details?.safetyOfficerBy,
    undefined,
    details?.safetyOfficerSignatureUrl,
    overrides.safetyOfficer
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
    safetyOfficerBy: so.name,
    safetyOfficerSignatureUrl: so.signatureUrl,
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
  defaultIncludeSafetyOfficer = false,
  defaults: customDefaults,
  children,
}: {
  project: Pick<MastProjectState, 'preparedBy' | 'reportDetails'>;
  enabled?: boolean;
  includeVerified?: boolean;
  defaultIncludeSafetyOfficer?: boolean;
  defaults?: Partial<ReportSignoffDefaults>;
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<ReportSignoffOverrideState>({});

  const customPreparedBy = customDefaults?.preparedBy;
  const customPreparedTitle = customDefaults?.preparedTitle;
  const customPreparedSig = customDefaults?.preparedSignatureUrl;
  const customVerifiedBy = customDefaults?.verifiedBy;
  const customVerifiedSig = customDefaults?.verifiedSignatureUrl;
  const customCheckedBy = customDefaults?.checkedBy;
  const customCheckedTitle = customDefaults?.checkedTitle;
  const customCheckedSig = customDefaults?.checkedSignatureUrl;
  const customApprovedBy = customDefaults?.approvedBy;
  const customApprovedTitle = customDefaults?.approvedTitle;
  const customApprovedSig = customDefaults?.approvedSignatureUrl;
  const customSafetyOfficerBy = customDefaults?.safetyOfficerBy;
  const customSafetyOfficerSig = customDefaults?.safetyOfficerSignatureUrl;

  const defaults = useMemo<ReportSignoffDefaults>(() => {
    const rd = project.reportDetails ?? {};
    const rdSafetyName =
      rd.safetyOfficerBy !== undefined
        ? rd.safetyOfficerBy.trim()
        : DEFAULT_SAFETY_OFFICER_NAME;
    const baseSafetyBy =
      customSafetyOfficerBy !== undefined ? customSafetyOfficerBy : rdSafetyName;
    const rdSafetySig = rd.safetyOfficerSignatureUrl?.trim() || undefined;
    const resolvedSafetySig =
      customSafetyOfficerSig !== undefined
        ? customSafetyOfficerSig
        : rdSafetySig &&
            baseSafetyBy &&
            rdSafetyName &&
            baseSafetyBy.toLowerCase() === rdSafetyName.toLowerCase()
          ? rdSafetySig
          : undefined;

    return {
      preparedBy:
        customPreparedBy !== undefined
          ? customPreparedBy
          : rd.preparedBy?.trim() || project.preparedBy?.trim() || '',
      preparedTitle: customPreparedTitle ?? rd.preparedTitle?.trim() ?? '',
      preparedSignatureUrl:
        customPreparedSig !== undefined
          ? customPreparedSig
          : rd.preparedSignatureUrl?.trim() || undefined,
      verifiedBy: customVerifiedBy ?? '',
      verifiedSignatureUrl: customVerifiedSig,
      checkedBy: customCheckedBy ?? rd.checkedBy?.trim() ?? '',
      checkedTitle: customCheckedTitle ?? rd.checkedTitle?.trim() ?? '',
      checkedSignatureUrl:
        customCheckedSig ?? (rd.checkedSignatureUrl?.trim() || undefined),
      approvedBy: customApprovedBy ?? rd.approvedBy?.trim() ?? '',
      approvedTitle: customApprovedTitle ?? rd.approvedTitle?.trim() ?? '',
      approvedSignatureUrl:
        customApprovedSig ?? (rd.approvedSignatureUrl?.trim() || undefined),
      safetyOfficerBy: baseSafetyBy,
      safetyOfficerSignatureUrl: resolvedSafetySig,
    };
  }, [
    project.preparedBy,
    project.reportDetails,
    customPreparedBy,
    customPreparedTitle,
    customPreparedSig,
    customVerifiedBy,
    customVerifiedSig,
    customCheckedBy,
    customCheckedTitle,
    customCheckedSig,
    customApprovedBy,
    customApprovedTitle,
    customApprovedSig,
    customSafetyOfficerBy,
    customSafetyOfficerSig,
  ]);

  const contextValue = useMemo<ReportSignoffOverrideContextValue | null>(() => {
    if (!enabled) return null;

    const includeSafetyOfficer =
      overrides.includeSafetyOfficer !== undefined
        ? overrides.includeSafetyOfficer
        : defaultIncludeSafetyOfficer;

    const setIncludeSafetyOfficer = (include: boolean) => {
      setOverrides((prev) => ({
        ...prev,
        includeSafetyOfficer:
          include === defaultIncludeSafetyOfficer ? undefined : include,
      }));
    };

    const setRoleOverride = (
      role: SignatoryOverrideRole,
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

    const resetRole = (role: SignatoryOverrideRole) => {
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
      isSlotOverridden(overrides.approved) ||
      isSlotOverridden(overrides.safetyOfficer) ||
      (overrides.includeSafetyOfficer !== undefined &&
        overrides.includeSafetyOfficer !== defaultIncludeSafetyOfficer);

    return {
      overrides,
      defaults,
      includeVerified,
      includeSafetyOfficer,
      defaultIncludeSafetyOfficer,
      setIncludeSafetyOfficer,
      setRoleOverride,
      resetRole,
      resetAll,
      hasActiveOverrides,
    };
  }, [enabled, overrides, defaults, includeVerified, defaultIncludeSafetyOfficer]);

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
  const [drawTarget, setDrawTarget] = useState<{
    role: SignatoryOverrideRole;
    label: string;
    defaultName: string;
  } | null>(null);
  const ctrl = useReportSignoffOverrideControls();
  if (!ctrl) return null;

  const {
    overrides,
    defaults,
    includeVerified,
    includeSafetyOfficer,
    setIncludeSafetyOfficer,
    setRoleOverride,
    resetRole,
    resetAll,
    hasActiveOverrides,
  } = ctrl;

  const handleUploadOverrideSignature = async (
    role: SignatoryOverrideRole,
    file?: File | null
  ) => {
    if (!file) return;
    try {
      const dataUrl = await resizeLogoFileToDataUrl(file);
      setRoleOverride(role, { signatureUrl: dataUrl });
    } catch (err) {
      useFeedbackStore.getState().pushToast({
        tone: 'warning',
        title: 'Unable to Read Signature',
        message:
          err instanceof Error
            ? err.message
            : 'Selected file could not be loaded as an image.',
      });
    }
  };

  const roles: {
    key: SignatoryOverrideRole;
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
    ...(includeSafetyOfficer
      ? [
          {
            key: 'safetyOfficer' as const,
            label: 'Safety Officer',
            namePlaceholder:
              defaults.safetyOfficerBy || DEFAULT_SAFETY_OFFICER_NAME,
            showTitle: false,
            baseName: defaults.safetyOfficerBy,
            baseSignature: defaults.safetyOfficerSignatureUrl,
          },
        ]
      : []),
  ];

  const gridColsClass =
    roles.length >= 5
      ? 'lg:grid-cols-3 xl:grid-cols-5'
      : roles.length === 4
        ? 'lg:grid-cols-4'
        : 'lg:grid-cols-3';

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <PenLine className="w-3.5 h-3.5 text-sky-600" />
            <span>Override Signatories for This Report</span>
          </div>
          <p className="text-[10.5px] text-slate-500">
            Temporarily change signatories or toggle Safety Officer for this printout without changing saved Project Report Details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={includeSafetyOfficer}
            onClick={() => setIncludeSafetyOfficer(!includeSafetyOfficer)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer transition-colors ${
              includeSafetyOfficer
                ? 'border-sky-400 bg-sky-50 text-sky-800 hover:bg-sky-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Include Safety Officer</span>
            <span
              className={`ml-0.5 text-[10px] font-bold uppercase ${
                includeSafetyOfficer ? 'text-sky-700' : 'text-slate-400'
              }`}
            >
              {includeSafetyOfficer ? 'On' : 'Off'}
            </span>
          </button>
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

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridColsClass} gap-2.5`}>
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

                <button
                  type="button"
                  onClick={() =>
                    setDrawTarget({
                      role: r.key,
                      label: r.label,
                      defaultName: effectiveName,
                    })
                  }
                  className="inline-flex items-center gap-1 h-8 px-2 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-[10px] font-semibold text-sky-700 cursor-pointer shrink-0"
                >
                  <PenTool className="w-3 h-3" />
                  <span>Draw</span>
                </button>

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

      <SignaturePadModal
        open={Boolean(drawTarget)}
        title={drawTarget ? `Create ${drawTarget.label} Signature` : 'Create Signature'}
        defaultTypedName={drawTarget?.defaultName ?? ''}
        onClose={() => setDrawTarget(null)}
        onSave={async (file) => {
          if (!drawTarget) return;
          await handleUploadOverrideSignature(drawTarget.role, file);
        }}
      />
    </div>
  );
}
