import { create } from 'zustand';
import type { FoundationChecklistViolation } from '@/entities/project/foundationValidation';
import type { VerticalMastOrderViolation } from '@/entities/project/verticalMastValidation';
import {
  createCoalescedIdbWriter,
  FIRST_LAUNCH_COMPLETED_KEY,
  idbGet,
  isIndexedDbAvailable,
  LEGACY_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
} from '@/shared/storage/indexedDb';

export type ActiveAppTab =
  | 'project_status'
  | 'activity'
  | 'inspection'
  | 'hauling_inventory'
  | 'daily_logs'
  | 'manpower'
  | 'project_details';

export type ManpowerSubTab = 'roster' | 'payment';
export type ManpowerPaymentMode = 'civil_works' | 'hauler';

export type PayrollPrintTarget =
  | { kind: 'civil'; snapshotId?: string }
  | { kind: 'hauler'; snapshotId?: string };

export type MastSelectionTarget = {
  kind: 'section' | 'guy_layer';
  id: string;
};

export type PrintPaperSize = 'A4' | 'A3' | 'letter' | 'legal';
export type PrintOrientation = 'portrait' | 'landscape';
export type MastVerticalScale = 1 | 1.5 | 2 | 3;
export type AdminUiStyle = 'classic' | 'swiss';

export const ADMIN_UI_STYLE_STORAGE_KEY = 'mast2-admin-ui-style-v1';
export const PAYROLL_SHOW_SIGNATURE_STORAGE_KEY = 'mast2-payroll-show-signature-v1';
export const PAYROLL_SHOW_STATUS_STORAGE_KEY = 'mast2-payroll-show-status-v1';

export function readSavedAdminUiStyle(
  storage?: Pick<Storage, 'getItem'> | null
): AdminUiStyle {
  if (!storage) return 'classic';
  try {
    return storage.getItem(ADMIN_UI_STYLE_STORAGE_KEY) === 'swiss'
      ? 'swiss'
      : 'classic';
  } catch {
    return 'classic';
  }
}

export function persistAdminUiStyle(
  style: AdminUiStyle,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  if (!storage) return;
  try {
    storage.setItem(ADMIN_UI_STYLE_STORAGE_KEY, style);
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

function readSavedBooleanPref(
  key: string,
  defaultValue: boolean,
  storage?: Pick<Storage, 'getItem'> | null
): boolean {
  if (!storage) return defaultValue;
  try {
    const val = storage.getItem(key);
    if (val === '0' || val === 'false') return false;
    if (val === '1' || val === 'true') return true;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

function persistBooleanPref(
  key: string,
  value: boolean,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  if (!storage) return;
  try {
    storage.setItem(key, value ? '1' : '0');
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function readSavedPayrollShowSignature(
  storage?: Pick<Storage, 'getItem'> | null
): boolean {
  return readSavedBooleanPref(PAYROLL_SHOW_SIGNATURE_STORAGE_KEY, true, storage);
}

export function persistPayrollShowSignature(
  show: boolean,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  persistBooleanPref(PAYROLL_SHOW_SIGNATURE_STORAGE_KEY, show, storage);
}

export function readSavedPayrollShowStatus(
  storage?: Pick<Storage, 'getItem'> | null
): boolean {
  return readSavedBooleanPref(PAYROLL_SHOW_STATUS_STORAGE_KEY, true, storage);
}

export function persistPayrollShowStatus(
  show: boolean,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  persistBooleanPref(PAYROLL_SHOW_STATUS_STORAGE_KEY, show, storage);
}

const firstLaunchIdbWriter = createCoalescedIdbWriter<string>(FIRST_LAUNCH_COMPLETED_KEY);
let uiHydrationPromise: Promise<void> | null = null;

/**
 * Returns true only on the user's very first launch (no saved projects or prior
 * workspace entry), so the Project Launcher appears first on initial startup
 * and subsequent visits go directly to the active project workspace.
 */
export function shouldOpenLauncherOnStartup(
  storage?: Pick<Storage, 'getItem'> | null
): boolean {
  if (!storage) return false;
  try {
    if (
      storage.getItem(FIRST_LAUNCH_COMPLETED_KEY) ||
      storage.getItem(WORKSPACE_STORAGE_KEY) ||
      storage.getItem(LEGACY_STORAGE_KEY)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface UiState {
  activeAppTab: ActiveAppTab;
  manpowerSubTab: ManpowerSubTab;
  manpowerPaymentMode: ManpowerPaymentMode;
  payrollPrintTarget: PayrollPrintTarget | null;
  projectBrowserOpen: boolean;
  dailyLogPrintId: string | null;
  reportOpen: boolean;
  inspectionReportOpen: boolean;
  overallReportOpen: boolean;
  selectedMastTarget: MastSelectionTarget;
  mastVerticalScale: MastVerticalScale;
  printPaperSize: PrintPaperSize;
  printOrientation: PrintOrientation;
  mastOrderViolation: VerticalMastOrderViolation | null;
  foundationOrderViolation: FoundationChecklistViolation | null;
  adminUiStyle: AdminUiStyle;
  payrollShowSignature: boolean;
  payrollShowStatus: boolean;

  setActiveAppTab: (tab: ActiveAppTab) => void;
  setManpowerSubTab: (subTab: ManpowerSubTab) => void;
  setManpowerPaymentMode: (mode: ManpowerPaymentMode) => void;
  setPayrollPrintTarget: (target: PayrollPrintTarget | null) => void;
  hydrateUiStorage: () => Promise<void>;
  setProjectBrowserOpen: (open: boolean) => void;
  setDailyLogPrintId: (id: string | null) => void;
  setReportOpen: (open: boolean) => void;
  setInspectionReportOpen: (open: boolean) => void;
  setOverallReportOpen: (open: boolean) => void;
  setSelectedMastTarget: (target: MastSelectionTarget) => void;
  setMastVerticalScale: (scale: MastVerticalScale) => void;
  setPrintPaperSize: (size: PrintPaperSize) => void;
  setPrintOrientation: (orientation: PrintOrientation) => void;
  setMastOrderViolation: (violation: VerticalMastOrderViolation | null) => void;
  setFoundationOrderViolation: (
    violation: FoundationChecklistViolation | null
  ) => void;
  setAdminUiStyle: (style: AdminUiStyle) => void;
  setPayrollShowSignature: (show: boolean) => void;
  setPayrollShowStatus: (show: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeAppTab: 'activity',
  manpowerSubTab: 'roster',
  manpowerPaymentMode: 'civil_works',
  payrollPrintTarget: null,
  projectBrowserOpen: shouldOpenLauncherOnStartup(
    typeof window !== 'undefined' ? window.localStorage : null
  ),
  dailyLogPrintId: null,
  reportOpen: false,
  inspectionReportOpen: false,
  overallReportOpen: false,
  selectedMastTarget: { kind: 'section', id: 'S01' },
  mastVerticalScale: 1,
  printPaperSize: 'A4',
  printOrientation: 'portrait',
  mastOrderViolation: null,
  foundationOrderViolation: null,
  adminUiStyle: readSavedAdminUiStyle(
    typeof window !== 'undefined' ? window.localStorage : null
  ),
  payrollShowSignature: readSavedPayrollShowSignature(
    typeof window !== 'undefined' ? window.localStorage : null
  ),
  payrollShowStatus: readSavedPayrollShowStatus(
    typeof window !== 'undefined' ? window.localStorage : null
  ),

  setActiveAppTab: (tab) => set({ activeAppTab: tab }),
  setManpowerSubTab: (manpowerSubTab) => set({ manpowerSubTab }),
  setManpowerPaymentMode: (manpowerPaymentMode) => set({ manpowerPaymentMode }),
  setPayrollPrintTarget: (payrollPrintTarget) => set({ payrollPrintTarget }),
  hydrateUiStorage: () => {
    if (uiHydrationPromise) return uiHydrationPromise;
    uiHydrationPromise = (async () => {
      if (typeof window === 'undefined') return;
      try {
        let hasPriorEntry = false;

        if (isIndexedDbAvailable()) {
          const [completed, workspace] = await Promise.all([
            idbGet<string>(FIRST_LAUNCH_COMPLETED_KEY),
            idbGet<unknown>(WORKSPACE_STORAGE_KEY),
          ]);
          if (completed || workspace) {
            hasPriorEntry = true;
          }
        }

        const lsCompleted = window.localStorage.getItem(FIRST_LAUNCH_COMPLETED_KEY);
        const lsWorkspace = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
        const lsLegacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);

        if (lsCompleted || lsWorkspace || lsLegacy) {
          hasPriorEntry = true;
          if (lsCompleted && isIndexedDbAvailable()) {
            firstLaunchIdbWriter.enqueue(lsCompleted);
            await firstLaunchIdbWriter.flush();
            try {
              window.localStorage.removeItem(FIRST_LAUNCH_COMPLETED_KEY);
            } catch {
              // Ignore cleanup errors
            }
          }
        }

        set({ projectBrowserOpen: !hasPriorEntry });
      } catch {
        // Ignore storage errors
      }
    })();
    return uiHydrationPromise;
  },
  setProjectBrowserOpen: (open) => {
    if (!open && typeof window !== 'undefined') {
      if (isIndexedDbAvailable()) {
        firstLaunchIdbWriter.enqueue('1');
      } else {
        try {
          window.localStorage.setItem(FIRST_LAUNCH_COMPLETED_KEY, '1');
        } catch {
          // Ignore storage errors
        }
      }
    }
    set({ projectBrowserOpen: open });
  },
  setDailyLogPrintId: (id) => set({ dailyLogPrintId: id }),
  setReportOpen: (open) => set({ reportOpen: open }),
  setInspectionReportOpen: (open) => set({ inspectionReportOpen: open }),
  setOverallReportOpen: (open) => set({ overallReportOpen: open }),
  setSelectedMastTarget: (target) => set({ selectedMastTarget: target }),
  setMastVerticalScale: (mastVerticalScale) => set({ mastVerticalScale }),
  setPrintPaperSize: (printPaperSize) => set({ printPaperSize }),
  setPrintOrientation: (printOrientation) => set({ printOrientation }),
  setMastOrderViolation: (mastOrderViolation) => set({ mastOrderViolation }),
  setFoundationOrderViolation: (foundationOrderViolation) =>
    set({ foundationOrderViolation }),
  setAdminUiStyle: (adminUiStyle) => {
    persistAdminUiStyle(
      adminUiStyle,
      typeof window !== 'undefined' ? window.localStorage : null
    );
    set({ adminUiStyle });
  },
  setPayrollShowSignature: (payrollShowSignature) => {
    persistPayrollShowSignature(
      payrollShowSignature,
      typeof window !== 'undefined' ? window.localStorage : null
    );
    set({ payrollShowSignature });
  },
  setPayrollShowStatus: (payrollShowStatus) => {
    persistPayrollShowStatus(
      payrollShowStatus,
      typeof window !== 'undefined' ? window.localStorage : null
    );
    set({ payrollShowStatus });
  },
}));

