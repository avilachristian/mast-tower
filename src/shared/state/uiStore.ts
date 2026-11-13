import { create } from 'zustand';
import type { FoundationChecklistViolation } from '@/entities/project/foundationValidation';
import type { VerticalMastOrderViolation } from '@/entities/project/verticalMastValidation';

export type ActiveAppTab =
  | 'project_status'
  | 'activity'
  | 'inspection'
  | 'daily_logs'
  | 'project_details';

export type MastSelectionTarget = {
  kind: 'section' | 'guy_layer';
  id: string;
};

export type PrintPaperSize = 'A4' | 'A3' | 'letter' | 'legal';
export type PrintOrientation = 'portrait' | 'landscape';
export type MastVerticalScale = 1 | 1.5 | 2 | 3;

const WORKSPACE_STORAGE_KEY = 'mast2-tower-projects-workspace-v1';
const LEGACY_STORAGE_KEY = 'mast2-tower-report-generator-v1';
const FIRST_LAUNCH_COMPLETED_KEY = 'mast2-launcher-completed-v1';

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

  setActiveAppTab: (tab: ActiveAppTab) => void;
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
}

export const useUiStore = create<UiState>((set) => ({
  activeAppTab: 'activity',
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

  setActiveAppTab: (tab) => set({ activeAppTab: tab }),
  setProjectBrowserOpen: (open) => {
    if (!open && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(FIRST_LAUNCH_COMPLETED_KEY, '1');
      } catch {
        // Ignore storage errors
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
}));

