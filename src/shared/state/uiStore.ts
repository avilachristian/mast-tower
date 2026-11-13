import { create } from 'zustand';

export type ActiveAppTab =
  | 'project_status'
  | 'activity'
  | 'inspection'
  | 'daily_logs'
  | 'project_details';

interface UiState {
  activeAppTab: ActiveAppTab;
  projectBrowserOpen: boolean;
  dailyLogPrintId: string | null;
  reportOpen: boolean;
  inspectionReportOpen: boolean;
  overallReportOpen: boolean;

  setActiveAppTab: (tab: ActiveAppTab) => void;
  setProjectBrowserOpen: (open: boolean) => void;
  setDailyLogPrintId: (id: string | null) => void;
  setReportOpen: (open: boolean) => void;
  setInspectionReportOpen: (open: boolean) => void;
  setOverallReportOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeAppTab: 'activity',
  projectBrowserOpen: false,
  dailyLogPrintId: null,
  reportOpen: false,
  inspectionReportOpen: false,
  overallReportOpen: false,

  setActiveAppTab: (tab) => set({ activeAppTab: tab }),
  setProjectBrowserOpen: (open) => set({ projectBrowserOpen: open }),
  setDailyLogPrintId: (id) => set({ dailyLogPrintId: id }),
  setReportOpen: (open) => set({ reportOpen: open }),
  setInspectionReportOpen: (open) => set({ inspectionReportOpen: open }),
  setOverallReportOpen: (open) => set({ overallReportOpen: open }),
}));

