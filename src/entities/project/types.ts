export type FoundationType = 'principal' | 'anchor_a' | 'anchor_b' | 'anchor_c';

export type SectorId = 'CENTER' | 'I' | 'II' | 'III';

export type FoundationStatus =
  | 'not_started'
  | 'excavated'
  | 'lean_concrete'
  | 'rebar_and_anchor'
  | 'formwork'
  | 'concreted'
  | 'curing'
  | 'completed';

export interface FoundationStageChecklist {
  excavationVerified: boolean;
  excavationInspectionDone?: boolean;
  leanConcretePoured: boolean;
  rebarCageInstalled: boolean;
  anchorHardwareAligned: boolean;
  formworkBraced: boolean;
  concretePoured: boolean;
  curingStarted?: boolean;
  curingAndBackfillDone: boolean;
}

export interface FoundationSpec {
  type: FoundationType;
  label: string;
  lengthM: number;
  widthM: number;
  thicknessM: number;
  overburdenDepthM: number; // soil depth above concrete top
  leanThicknessM: number;
  structuralConcreteCuM: number;
  leanConcreteCuM: number;
  cementBags: number; // incl lean + extra
  sandCuM: number;
  sandBags: number;
  gravelCuM: number;
  gravelBags: number;
  rebarM02Count: number;
  rebarM02CutM: number;
  rebarM26Count: number;
  rebarM26CutM: number;
  anchorSummary: string;
  guyElevationsM: number[];
}

export type BuiltInFoundationInspectionItemKey =
  | 'excavation_size_depth'
  | 'lean_concrete_50mm'
  | 'concrete_covers_50mm'
  | 'bars_spacing_200mm'
  | 'rebar_lap_length'
  | 'anchor_rod_alignment';

export type FoundationInspectionItemKey =
  | BuiltInFoundationInspectionItemKey
  | (string & {});

export type FoundationInspectionStatus =
  | 'Pending'
  | 'Passed'
  | 'For Rectification'
  | 'N/A';

export interface FoundationInspectionEntry {
  status: FoundationInspectionStatus;
  description?: string;
  planMeasurement?: string;
  actualMeasurement?: string;
  remarks: string;
  photoDataUrl?: string;
  photoName?: string;
}

export interface CustomFoundationInspectionItem {
  key: string;
  description: string;
  planMeasurement: string;
}

export interface FoundationInspectionMeta {
  inspectionDate?: string; // YYYY-MM-DD
  inspectorName?: string;
  contractorRep?: string;
  overallStatus?: FoundationInspectionStatus;
  generalNotes?: string;
}

export type FoundationManualMaterialKey =
  | 'cement'
  | 'sand'
  | 'gravel'
  | 'main_rebar'
  | 'chair_bar'
  | 'phenolic';

export interface FoundationManualMaterialEntry {
  onSite: number;
  remarks: string;
}

export interface FoundationCustomSpecs {
  size?: string;
  foundationVolume?: string;
  leanConcreteVolume?: string;
  excavationDepth?: string;
  cover?: string;
  mainRebar?: string;
  chairBar?: string;
  towerAccessories?: string;
}

export interface FoundationRecord {
  id: string; // e.g., 'PF-0', 'I-C1', 'I-B1', 'I-A1', 'I-B2'
  code: string;
  name: string;
  type: FoundationType;
  sector: SectorId;
  radiusM: number;
  angleDeg: number; // Plan orientation angle in degrees (0 = East, 90 = North, 270 = South)
  xM: number;
  zM: number;
  status: FoundationStatus;
  checklist: FoundationStageChecklist;
  inspectionChecklist?: Partial<
    Record<FoundationInspectionItemKey, FoundationInspectionEntry>
  >;
  customInspectionItems?: CustomFoundationInspectionItem[];
  removedInspectionKeys?: string[];
  inspectionMeta?: FoundationInspectionMeta;
  manualMaterials?: Partial<
    Record<FoundationManualMaterialKey, FoundationManualMaterialEntry>
  >;
  customSpecs?: FoundationCustomSpecs;
  pourDate?: string;
  completedDate?: string;
  actualCementBagsUsed: number;
  actualSandBagsUsed: number;
  actualGravelBagsUsed: number;
  notes: string;
}

export type HaulingMaterialCategory =
  | 'cement'
  | 'sand'
  | 'gravel'
  | 'main_bar_a'
  | 'chair_bar_a'
  | 'main_bar_b'
  | 'chair_bar_b'
  | 'main_bar_c'
  | 'chair_bar_c'
  | 'rebar_20mm'
  | 'anchor_rod'
  | 'phenolic_board'
  | 'other';

export interface HaulingLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  haulerName: string;
  tripNumber?: number; // e.g., 1 for Trip 1, 2 for Trip 2
  itemLabel?: string; // Display name e.g. 'Cement', 'Chair Bar A', 'Main Bar A'
  horsesUsed: number;
  tripsCount: number;
  material: HaulingMaterialCategory;
  unitLabel: string; // 'bags', 'sacks', 'pcs', 'sets'
  quantity: number; // number of bags/sacks (40kg = 1 bag) or pcs
  kgPerUnit: number; // e.g. 40 kg/bag for cement/sand/gravel sacks
  totalKg: number;
  equivalentCuM: number; // 0 for non-bulk items; quantity / 36 for sand/gravel
  destinationFoundationId: string; // 'STOCKPILE' or FoundationRecord.id
  weather: string;
  remarks: string;
}

export type WorkerRole =
  | 'Site Engineer'
  | 'Foreman'
  | 'Safety Officer'
  | 'First Aider'
  | 'Skilled'
  | 'Mason'
  | 'Steelman'
  | 'Carpenter'
  | 'Laborer'
  | 'Horse Hauler'
  | 'Operator';

export interface WorkerAttendanceEntry {
  role: WorkerRole;
  count: number;
  names: string;
  hours: number;
}

export type DailyLogWeather =
  | 'Sunny'
  | 'Cloudy'
  | 'Light Rain'
  | 'Heavy Rain'
  | 'Foggy / Windy';

export type DailyLogActivityStatus =
  | 'Pending'
  | 'Ongoing'
  | 'Completed'
  | 'Delayed';

export interface DailyLogActivityItem {
  id: string;
  description: string;
  foundationId?: string;
  status: DailyLogActivityStatus;
  remarks?: string;
}

export interface DailyLogMaterialItem {
  id: string;
  name: string;
  unit: string;
  onSiteQty: number;
  deliveredQty?: number;
  usedTodayQty: number;
  remainingQty?: number;
  remarks?: string;
}

export interface DailyLogDocumentationItem {
  id: string;
  photoDataUrl?: string;
  photoName?: string;
  description: string;
  remarks?: string;
}

export interface DailyLogEquipmentItem {
  id: string;
  name: string;
  qty: number;
  status: string;
  remarks?: string;
}

export interface DailyLogDelayItem {
  id: string;
  description: string;
  impact: string;
  remarks?: string;
}

export interface DailyLogVisitorItem {
  id: string;
  name: string;
  roleOrCompany: string;
  purpose: string;
  remarks?: string;
}

export interface DailyLogSafetyItem {
  id: string;
  timeOrActivity: string;
  hazardOrFinding: string;
  actionTaken: string;
  status: string;
}

export interface DailyActivityLogEntry {
  id: string;
  date: string;
  dayNumber: number;
  projectName?: string;
  location?: string;
  preparedBy?: string;
  weather: DailyLogWeather;
  weatherNotes?: string;
  schedulePhaseId: string;
  activitiesSummary: string;
  activities?: DailyLogActivityItem[];
  foundationsWorked: string[]; // Foundation IDs
  workers: WorkerAttendanceEntry[];
  totalWorkers: number;
  totalManHours: number;
  materialsOnSite?: DailyLogMaterialItem[];
  cementUsedBags: number;
  sandUsedBags: number;
  gravelUsedBags: number;
  equipmentItems?: DailyLogEquipmentItem[];
  delayItems?: DailyLogDelayItem[];
  visitorItems?: DailyLogVisitorItem[];
  safetyOfficer?: string;
  safetyLogs?: DailyLogSafetyItem[];
  documentationItems?: DailyLogDocumentationItem[];
  equipmentOnSite?: string;
  safetyAndVisitors?: string;
  nextDayPlan?: string;
  issuesOrDelays: string;
}

export interface ScheduleActivityItem {
  id: string;
  stepNo: number;
  title: string;
  plannedDurationDays: string;
  indicativeTiming: string;
  workDetails: string;
  status: 'pending' | 'in_progress' | 'completed';
  progressPct: number;
}

export interface SiteEquipmentItem {
  id: string;
  category: 'Tools & Equipment' | 'PPE' | 'Barracks & Warehouse' | 'Consumables';
  name: string;
  unit: string;
  requiredQty: number | null;
  onHandQty: number;
  deliveredQty: number;
  remarks: string;
}

export interface ReportLogoItem {
  dataUrl: string;
  caption?: string;
}

export interface ReportDetailsSpec {
  projectName?: string;
  projectLocation?: string;
  clientName?: string;
  contractor?: string;
  documentTitle?: string;
  referenceNo?: string;
  revision?: string;
  reportDate?: string;
  preparedBy?: string;
  preparedTitle?: string;
  checkedBy?: string;
  checkedTitle?: string;
  approvedBy?: string;
  approvedTitle?: string;
  logoHeightPx?: number;
  logos?: {
    left?: ReportLogoItem;
    center?: ReportLogoItem;
    right?: ReportLogoItem;
  };
  notes?: string;
}

export interface MastProjectState {
  projectName: string;
  location: string;
  preparedBy: string;
  contractor: string;
  towerHeightM: number;
  lastUpdated: string;
  reportDetails?: ReportDetailsSpec;
  foundations: FoundationRecord[];
  haulingLogs: HaulingLogEntry[];
  dailyLogs: DailyActivityLogEntry[];
  schedule: ScheduleActivityItem[];
  inventory: SiteEquipmentItem[];
}

export interface SavedProjectRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: MastProjectState;
}

