import { create } from 'zustand';

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

interface UiState {
  activeAppTab: ActiveAppTab;
  projectBrowserOpen: boolean;
  dailyLogPrintId: string | null;
  reportOpen: boolean;
  inspectionReportOpen: boolean;
  overallReportOpen: boolean;
  selectedMastTarget: MastSelectionTarget;
  printPaperSize: PrintPaperSize;
  printOrientation: PrintOrientation;

  setActiveAppTab: (tab: ActiveAppTab) => void;
  setProjectBrowserOpen: (open: boolean) => void;
  setDailyLogPrintId: (id: string | null) => void;
  setReportOpen: (open: boolean) => void;
  setInspectionReportOpen: (open: boolean) => void;
  setOverallReportOpen: (open: boolean) => void;
  setSelectedMastTarget: (target: MastSelectionTarget) => void;
  setPrintPaperSize: (size: PrintPaperSize) => void;
  setPrintOrientation: (orientation: PrintOrientation) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeAppTab: 'activity',
  projectBrowserOpen: false,
  dailyLogPrintId: null,
  reportOpen: false,
  inspectionReportOpen: false,
  overallReportOpen: false,
  selectedMastTarget: { kind: 'section', id: 'S01' },
  printPaperSize: 'A4',
  printOrientation: 'portrait',

  setActiveAppTab: (tab) => set({ activeAppTab: tab }),
  setProjectBrowserOpen: (open) => set({ projectBrowserOpen: open }),
  setDailyLogPrintId: (id) => set({ dailyLogPrintId: id }),
  setReportOpen: (open) => set({ reportOpen: open }),
  setInspectionReportOpen: (open) => set({ inspectionReportOpen: open }),
  setOverallReportOpen: (open) => set({ overallReportOpen: open }),
  setSelectedMastTarget: (target) => set({ selectedMastTarget: target }),
  setPrintPaperSize: (printPaperSize) => set({ printPaperSize }),
  setPrintOrientation: (printOrientation) => set({ printOrientation }),
}));

