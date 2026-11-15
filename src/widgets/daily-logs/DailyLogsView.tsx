import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cloud,
  CloudFog,
  CloudRain,
  CloudLightning,
  Copy,
  Edit3,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  Truck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  computeDailyLogMaterialRemaining,
  createDefaultDailyLogMaterials,
  findPreviousDailyLogForDraft,
  formatDailyLogPlainText,
  formatDateWithWeekday,
  getDailyLogActivityRows,
  getDailyLogDelayRows,
  getDailyLogEquipmentRows,
  getDailyLogMaterialRows,
  getDailyLogSafetyRows,
  getDailyLogVisitorRows,
  getWeekdayName,
  sortDailyLogsNewestFirst,
} from '@/entities/project/calculations';
import {
  buildCentralizedDailyLogMaterials,
  syncDailyLogMaterialsWithHauling,
} from '@/entities/project/haulingInventory';
import type {
  DailyActivityLogEntry,
  DailyLogActivityItem,
  DailyLogActivityStatus,
  DailyLogDelayItem,
  DailyLogDocumentationItem,
  DailyLogEquipmentItem,
  DailyLogMaterialItem,
  DailyLogSafetyItem,
  DailyLogVisitorItem,
  DailyLogWeather,
  FoundationRecord,
  MastProjectState,
  WorkerAttendanceEntry,
  WorkerRole,
} from '@/entities/project/types';
import { uploadOrStageProjectImage } from '@/shared/lib/imageUpload';
import { MANPOWER_POSITIONS } from '@/entities/project/manpowerPayroll';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import {
  DailyLogRowEditorModal,
  type DailyLogModalTarget,
} from './DailyLogRowEditorModal';

const ROLES: WorkerRole[] = MANPOWER_POSITIONS;

const WEATHER_OPTIONS: {
  value: DailyLogWeather;
  label: string;
  Icon: typeof Sun;
}[] = [
  { value: 'Sunny', label: 'Sunny', Icon: Sun },
  { value: 'Cloudy', label: 'Cloudy', Icon: Cloud },
  { value: 'Light Rain', label: 'Light Rain', Icon: CloudRain },
  { value: 'Heavy Rain', label: 'Heavy Rain', Icon: CloudLightning },
  { value: 'Foggy / Windy', label: 'Foggy / Windy', Icon: CloudFog },
];

const ACTIVITY_STATUS_OPTIONS: DailyLogActivityStatus[] = [
  'Ongoing',
  'Completed',
  'Pending',
  'Delayed',
];

const ACTIVITY_STATUS_BADGE: Record<DailyLogActivityStatus, string> = {
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ongoing: 'bg-sky-50 text-sky-700 border-sky-200',
  Pending: 'bg-slate-100 text-slate-700 border-slate-200',
  Delayed: 'bg-amber-50 text-amber-800 border-amber-200',
};

function createEmptyActivity(foundationId = ''): DailyLogActivityItem {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: '',
    foundationId,
    status: 'Ongoing',
    remarks: '',
  };
}

function createEmptyEquipment(): DailyLogEquipmentItem {
  return {
    id: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    qty: 1,
    status: 'Operational',
    remarks: '',
  };
}

function createEmptyDelay(): DailyLogDelayItem {
  return {
    id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: '',
    impact: '',
    remarks: '',
  };
}

function createEmptyVisitor(): DailyLogVisitorItem {
  return {
    id: `vis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    roleOrCompany: '',
    purpose: '',
    remarks: '',
  };
}

function createEmptySafetyLog(): DailyLogSafetyItem {
  return {
    id: `saf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timeOrActivity: '',
    hazardOrFinding: '',
    actionTaken: '',
    status: 'Compliant',
  };
}

function createEmptyDocumentation(): DailyLogDocumentationItem {
  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: '',
    remarks: '',
  };
}

function createDefaultWorkers(isVerticalMast = false): WorkerAttendanceEntry[] {
  if (isVerticalMast) {
    return [
      { role: 'Foreman', count: 1, names: '', hours: 0 },
      { role: 'Skilled', count: 0, names: '', hours: 0 },
      { role: 'Safety Officer', count: 0, names: '', hours: 0 },
      { role: 'Operator', count: 0, names: '', hours: 0 },
    ];
  }
  return [
    { role: 'Foreman', count: 1, names: '', hours: 0 },
    { role: 'Mason', count: 0, names: '', hours: 0 },
    { role: 'Steelman', count: 0, names: '', hours: 0 },
    { role: 'Laborer', count: 0, names: '', hours: 0 },
  ];
}

export function DailyLogsView({
  project: projectProp,
  foundations,
}: {
  project?: MastProjectState;
  foundations: FoundationRecord[];
}) {
  const storeProject = useProjectStore((s) => s.project);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addDailyLog = useProjectStore((s) => s.addDailyLog);
  const updateDailyLog = useProjectStore((s) => s.updateDailyLog);
  const deleteDailyLog = useProjectStore((s) => s.deleteDailyLog);
  const updateProjectMeta = useProjectStore((s) => s.updateProjectMeta);
  const setDailyLogPrintId = useUiStore((s) => s.setDailyLogPrintId);
  const showAlert = useFeedbackStore((s) => s.showAlert);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);

  const project = projectProp ?? storeProject;
  const isVerticalMast = project.projectType === 'vertical_mast';
  const verticalMastSections = project.verticalMast?.sections ?? [];
  const verticalMastGuyLayers = project.verticalMast?.guyLayers ?? [];

  const [mobilePane, setMobilePane] = useState<'form' | 'history'>('form');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const sortedDailyLogs = useMemo(
    () => sortDailyLogsNewestFirst(project.dailyLogs),
    [project.dailyLogs]
  );

  const latestLog = sortedDailyLogs[0] ?? null;

  const nextDayNum = useMemo(
    () => (latestLog ? latestLog.dayNumber + 1 : 1),
    [latestLog]
  );

  // Form state
  const [projectName, setProjectName] = useState(project.projectName);
  const [location, setLocation] = useState(project.location);
  const [preparedBy, setPreparedBy] = useState(project.preparedBy);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dayNumber, setDayNumber] = useState(nextDayNum);
  const [dayNumberTouched, setDayNumberTouched] = useState(false);
  const [workersTouched, setWorkersTouched] = useState(false);
  const [materialsTouched, setMaterialsTouched] = useState(false);
  const [weather, setWeather] = useState<DailyLogWeather>('Sunny');
  const [weatherNotes, setWeatherNotes] = useState('');
  const [selectedFoundations, setSelectedFoundations] = useState<string[]>([]);
  const [workers, setWorkers] = useState<WorkerAttendanceEntry[]>(
    () => createDefaultWorkers(isVerticalMast)
  );
  const [materialsOnSite, setMaterialsOnSite] = useState<DailyLogMaterialItem[]>(
    () =>
      buildCentralizedDailyLogMaterials(
        project,
        latestLog,
        new Date().toISOString().slice(0, 10),
        computeDailyLogMaterialRemaining
      )
  );
  const [activities, setActivities] = useState<DailyLogActivityItem[]>([
    createEmptyActivity(),
  ]);
  const [equipmentItems, setEquipmentItems] = useState<DailyLogEquipmentItem[]>([
    createEmptyEquipment(),
  ]);
  const [delayItems, setDelayItems] = useState<DailyLogDelayItem[]>([
    createEmptyDelay(),
  ]);
  const [visitorItems, setVisitorItems] = useState<DailyLogVisitorItem[]>([
    createEmptyVisitor(),
  ]);
  const [safetyOfficer, setSafetyOfficer] = useState(
    () => latestLog?.safetyOfficer ?? ''
  );
  const [safetyLogs, setSafetyLogs] = useState<DailyLogSafetyItem[]>([
    createEmptySafetyLog(),
  ]);
  const [documentationItems, setDocumentationItems] = useState<DailyLogDocumentationItem[]>([
    createEmptyDocumentation(),
  ]);
  const [activitiesSummary, setActivitiesSummary] = useState('');

  const prevLogForDraft = useMemo(
    () => findPreviousDailyLogForDraft(project.dailyLogs, date, dayNumber),
    [project.dailyLogs, date, dayNumber]
  );

  const hauledItemsOnDate = useMemo(
    () => project.haulingLogs.filter((h) => h.date === date && (Number(h.quantity) || 0) > 0),
    [project.haulingLogs, date]
  );

  useEffect(() => {
    if (editingLogId || dayNumberTouched) return;
    setDayNumber(nextDayNum);
  }, [editingLogId, dayNumberTouched, nextDayNum]);

  useEffect(() => {
    if (editingLogId || materialsTouched) return;
    setMaterialsOnSite(
      buildCentralizedDailyLogMaterials(
        project,
        prevLogForDraft,
        date,
        computeDailyLogMaterialRemaining
      )
    );
  }, [editingLogId, materialsTouched, prevLogForDraft, project, date]);

  useEffect(() => {
    if (editingLogId || workersTouched) return;
    setWorkers(createDefaultWorkers(isVerticalMast));
  }, [editingLogId, workersTouched, isVerticalMast]);

  useEffect(() => {
    if (editingLogId) return;
    setSelectedFoundations([]);
  }, [editingLogId, isVerticalMast]);

  const totalPreviewWorkers = workers.reduce(
    (sum, w) => sum + Math.max(0, w.count),
    0
  );

  const resetFormForNewEntry = (
    overrideDayNumber?: number,
    carryOverSource?: DailyActivityLogEntry | null
  ) => {
    const sourceLog = carryOverSource !== undefined ? carryOverSource : latestLog;
    const todayIso = new Date().toISOString().slice(0, 10);
    setEditingLogId(null);
    setDayNumberTouched(false);
    setMaterialsTouched(false);
    setProjectName(project.projectName);
    setLocation(project.location);
    setPreparedBy(project.preparedBy);
    setDate(todayIso);
    setDayNumber(overrideDayNumber ?? nextDayNum);
    setWeather('Sunny');
    setWeatherNotes('');
    setSelectedFoundations([]);
    setWorkersTouched(false);
    setWorkers(createDefaultWorkers(isVerticalMast));
    setMaterialsOnSite(
      buildCentralizedDailyLogMaterials(
        project,
        sourceLog,
        todayIso,
        computeDailyLogMaterialRemaining
      )
    );
    setActivities([createEmptyActivity()]);
    setEquipmentItems([createEmptyEquipment()]);
    setDelayItems([createEmptyDelay()]);
    setVisitorItems([createEmptyVisitor()]);
    setSafetyOfficer(sourceLog?.safetyOfficer ?? '');
    setSafetyLogs([createEmptySafetyLog()]);
    setDocumentationItems([createEmptyDocumentation()]);
    setActivitiesSummary('');
  };

  const handleLoadLogForEdit = (log: DailyActivityLogEntry) => {
    setEditingLogId(log.id);
    setDayNumberTouched(true);
    setMaterialsTouched(true);
    setProjectName(log.projectName ?? project.projectName);
    setLocation(log.location ?? project.location);
    setPreparedBy(log.preparedBy ?? project.preparedBy);
    setDate(log.date);
    setDayNumber(log.dayNumber);
    setWeather(log.weather);
    setWeatherNotes(log.weatherNotes ?? '');
    setSelectedFoundations([...log.foundationsWorked]);
    setWorkersTouched(true);
    setWorkers(
      log.workers.length > 0
        ? log.workers.map((w) => ({ ...w }))
        : createDefaultWorkers(isVerticalMast)
    );
    const resolvedMats = getDailyLogMaterialRows(log);
    setMaterialsOnSite(
      resolvedMats.length > 0
        ? resolvedMats.map((m) => ({ ...m }))
        : createDefaultDailyLogMaterials(project.projectType ?? 'foundation')
    );
    const resolvedActs = getDailyLogActivityRows(log);
    setActivities(
      resolvedActs.length > 0
        ? resolvedActs.map((a) => ({ ...a }))
        : [createEmptyActivity()]
    );
    const resolvedEq = getDailyLogEquipmentRows(log);
    setEquipmentItems(
      resolvedEq.length > 0
        ? resolvedEq.map((eq) => ({ ...eq }))
        : [createEmptyEquipment()]
    );
    const resolvedDelays = getDailyLogDelayRows(log);
    setDelayItems(
      resolvedDelays.length > 0
        ? resolvedDelays.map((d) => ({ ...d }))
        : [createEmptyDelay()]
    );
    const resolvedVisitors = getDailyLogVisitorRows(log);
    setVisitorItems(
      resolvedVisitors.length > 0
        ? resolvedVisitors.map((v) => ({ ...v }))
        : [createEmptyVisitor()]
    );
    setSafetyOfficer(log.safetyOfficer ?? '');
    const resolvedSafety = getDailyLogSafetyRows(log);
    setSafetyLogs(
      resolvedSafety.length > 0
        ? resolvedSafety.map((s) => ({ ...s }))
        : [createEmptySafetyLog()]
    );
    const resolvedDocs = log.documentationItems ?? [];
    setDocumentationItems(
      resolvedDocs.length > 0
        ? resolvedDocs.map((doc) => ({ ...doc }))
        : [createEmptyDocumentation()]
    );
    setActivitiesSummary(log.activitiesSummary);
    setMobilePane('form');
  };

  const handleCopyPreviousCrewAndMaterials = () => {
    const latest = latestLog;
    if (!latest) return;
    if (latest.workers.length > 0) {
      setWorkersTouched(true);
      setWorkers(latest.workers.map((w) => ({ ...w })));
    }
    setMaterialsTouched(false);
    setMaterialsOnSite(
      buildCentralizedDailyLogMaterials(
        project,
        latest,
        date,
        computeDailyLogMaterialRemaining
      )
    );
    const prevEq = getDailyLogEquipmentRows(latest);
    if (prevEq.length > 0) {
      setEquipmentItems(prevEq.map((eq) => ({ ...eq })));
    }
  };

  const toggleFoundation = (id: string) => {
    setSelectedFoundations((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Manpower helpers
  const updateWorkerRow = (idx: number, patch: Partial<WorkerAttendanceEntry>) => {
    setWorkersTouched(true);
    setWorkers((prev) => prev.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  };

  const addWorkerRow = () => {
    setWorkersTouched(true);
    setWorkers((prev) => [
      ...prev,
      { role: isVerticalMast ? 'Skilled' : 'Carpenter', count: 1, names: '', hours: 0 },
    ]);
  };

  const removeWorkerRow = (idx: number) => {
    setWorkersTouched(true);
    setWorkers((prev) => prev.filter((_, i) => i !== idx));
  };

  // Materials helpers
  const updateMaterialRow = (idx: number, patch: Partial<DailyLogMaterialItem>) => {
    setMaterialsTouched(true);
    setMaterialsOnSite((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const merged = { ...m, ...patch };
        return {
          ...merged,
          remainingQty: computeDailyLogMaterialRemaining(merged),
        };
      })
    );
  };

  const addMaterialRow = () => {
    setMaterialsTouched(true);
    setMaterialsOnSite((prev) => [
      ...prev,
      {
        id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        unit: 'pcs',
        onSiteQty: 0,
        deliveredQty: 0,
        usedTodayQty: 0,
        remainingQty: 0,
        remarks: '',
      },
    ]);
  };

  const removeMaterialRow = (idx: number) => {
    setMaterialsTouched(true);
    setMaterialsOnSite((prev) => prev.filter((_, i) => i !== idx));
  };

  // Activity helpers
  const updateActivityRow = (idx: number, patch: Partial<DailyLogActivityItem>) => {
    setActivities((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, ...patch } : a))
    );
  };

  const addActivityRow = () => {
    setActivities((prev) => [
      ...prev,
      createEmptyActivity(selectedFoundations[0] ?? ''),
    ]);
  };

  const removeActivityRow = (idx: number) => {
    setActivities((prev) => prev.filter((_, i) => i !== idx));
  };

  // Equipment helpers
  const updateEquipmentRow = (idx: number, patch: Partial<DailyLogEquipmentItem>) => {
    setEquipmentItems((prev) =>
      prev.map((eq, i) => (i === idx ? { ...eq, ...patch } : eq))
    );
  };

  const addEquipmentRow = () => {
    setEquipmentItems((prev) => [...prev, createEmptyEquipment()]);
  };

  const removeEquipmentRow = (idx: number) => {
    setEquipmentItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Delay helpers
  const updateDelayRow = (idx: number, patch: Partial<DailyLogDelayItem>) => {
    setDelayItems((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
  };

  const addDelayRow = () => {
    setDelayItems((prev) => [...prev, createEmptyDelay()]);
  };

  const removeDelayRow = (idx: number) => {
    setDelayItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Visitor helpers
  const updateVisitorRow = (idx: number, patch: Partial<DailyLogVisitorItem>) => {
    setVisitorItems((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, ...patch } : v))
    );
  };

  const addVisitorRow = () => {
    setVisitorItems((prev) => [...prev, createEmptyVisitor()]);
  };

  const removeVisitorRow = (idx: number) => {
    setVisitorItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Safety log helpers
  const updateSafetyRow = (idx: number, patch: Partial<DailyLogSafetyItem>) => {
    setSafetyLogs((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    );
  };

  const addSafetyRow = () => {
    setSafetyLogs((prev) => [...prev, createEmptySafetyLog()]);
  };

  const removeSafetyRow = (idx: number) => {
    setSafetyLogs((prev) => prev.filter((_, i) => i !== idx));
  };

  // Documentation helpers
  const updateDocumentationRow = (
    idx: number,
    patch: Partial<DailyLogDocumentationItem>
  ) => {
    setDocumentationItems((prev) =>
      prev.map((doc, i) => (i === idx ? { ...doc, ...patch } : doc))
    );
  };

  const addDocumentationRow = () => {
    setDocumentationItems((prev) => [...prev, createEmptyDocumentation()]);
  };

  const removeDocumentationRow = (idx: number) => {
    setDocumentationItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUploadDocPhoto = async (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadOrStageProjectImage({
        file,
        projectId: activeProjectId,
        category: 'daily_log',
      });
      if (uploaded) {
        updateDocumentationRow(idx, {
          photoDataUrl: uploaded.url,
          photoName: uploaded.name,
        });
      }
    } catch (err) {
      void showAlert({
        tone: 'danger',
        title: 'Photo Upload Failed',
        message: err instanceof Error ? err.message : 'Failed to load photo.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const [modalTarget, setModalTarget] = useState<DailyLogModalTarget | null>(null);

  const openAddModal = (kind: DailyLogModalTarget['kind']) => {
    switch (kind) {
      case 'worker':
        setModalTarget({
          kind: 'worker',
          index: null,
          item: {
            role: isVerticalMast ? 'Skilled' : 'Carpenter',
            count: 1,
            names: '',
            hours: 0,
          },
        });
        break;
      case 'material':
        setModalTarget({
          kind: 'material',
          index: null,
          item: {
            id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: '',
            unit: 'pcs',
            onSiteQty: 0,
            deliveredQty: 0,
            usedTodayQty: 0,
            remainingQty: 0,
            remarks: '',
          },
        });
        break;
      case 'activity':
        setModalTarget({
          kind: 'activity',
          index: null,
          item: createEmptyActivity(selectedFoundations[0] ?? ''),
        });
        break;
      case 'equipment':
        setModalTarget({
          kind: 'equipment',
          index: null,
          item: createEmptyEquipment(),
        });
        break;
      case 'delay':
        setModalTarget({
          kind: 'delay',
          index: null,
          item: createEmptyDelay(),
        });
        break;
      case 'visitor':
        setModalTarget({
          kind: 'visitor',
          index: null,
          item: createEmptyVisitor(),
        });
        break;
      case 'safety':
        setModalTarget({
          kind: 'safety',
          index: null,
          item: createEmptySafetyLog(),
        });
        break;
      case 'documentation':
        setModalTarget({
          kind: 'documentation',
          index: null,
          item: createEmptyDocumentation(),
        });
        break;
    }
  };

  const handleSaveModalTarget = (saved: DailyLogModalTarget) => {
    switch (saved.kind) {
      case 'worker':
        setWorkersTouched(true);
        if (saved.index === null) {
          setWorkers((prev) => [...prev, saved.item]);
        } else {
          setWorkers((prev) =>
            prev.map((w, i) => (i === saved.index ? saved.item : w))
          );
        }
        break;
      case 'material': {
        setMaterialsTouched(true);
        const nextItem = {
          ...saved.item,
          remainingQty: computeDailyLogMaterialRemaining(saved.item),
        };
        if (saved.index === null) {
          setMaterialsOnSite((prev) => [...prev, nextItem]);
        } else {
          setMaterialsOnSite((prev) =>
            prev.map((m, i) => (i === saved.index ? nextItem : m))
          );
        }
        break;
      }
      case 'activity':
        if (saved.index === null) {
          setActivities((prev) => [...prev, saved.item]);
        } else {
          setActivities((prev) =>
            prev.map((a, i) => (i === saved.index ? saved.item : a))
          );
        }
        break;
      case 'equipment':
        if (saved.index === null) {
          setEquipmentItems((prev) => [...prev, saved.item]);
        } else {
          setEquipmentItems((prev) =>
            prev.map((eq, i) => (i === saved.index ? saved.item : eq))
          );
        }
        break;
      case 'delay':
        if (saved.index === null) {
          setDelayItems((prev) => [...prev, saved.item]);
        } else {
          setDelayItems((prev) =>
            prev.map((d, i) => (i === saved.index ? saved.item : d))
          );
        }
        break;
      case 'visitor':
        if (saved.index === null) {
          setVisitorItems((prev) => [...prev, saved.item]);
        } else {
          setVisitorItems((prev) =>
            prev.map((v, i) => (i === saved.index ? saved.item : v))
          );
        }
        break;
      case 'safety':
        if (saved.index === null) {
          setSafetyLogs((prev) => [...prev, saved.item]);
        } else {
          setSafetyLogs((prev) =>
            prev.map((s, i) => (i === saved.index ? saved.item : s))
          );
        }
        break;
      case 'documentation':
        if (saved.index === null) {
          setDocumentationItems((prev) => [...prev, saved.item]);
        } else {
          setDocumentationItems((prev) =>
            prev.map((doc, i) => (i === saved.index ? saved.item : doc))
          );
        }
        break;
    }
    setModalTarget(null);
  };

  const handleDeleteModalTarget = (target: DailyLogModalTarget) => {
    if (target.index === null) return;
    const idx = target.index;
    switch (target.kind) {
      case 'worker':
        removeWorkerRow(idx);
        break;
      case 'material':
        removeMaterialRow(idx);
        break;
      case 'activity':
        removeActivityRow(idx);
        break;
      case 'equipment':
        removeEquipmentRow(idx);
        break;
      case 'delay':
        removeDelayRow(idx);
        break;
      case 'visitor':
        removeVisitorRow(idx);
        break;
      case 'safety':
        removeSafetyRow(idx);
        break;
      case 'documentation':
        removeDocumentationRow(idx);
        break;
    }
    setModalTarget(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanActivities = activities
      .map((a) => ({
        ...a,
        description: a.description.trim(),
        remarks: a.remarks?.trim() || '',
      }))
      .filter((a) => a.description.length > 0);

    const derivedSummary =
      activitiesSummary.trim() ||
      cleanActivities
        .map(
          (a) =>
            `${a.foundationId ? `[${a.foundationId}] ` : ''}${a.description} (${a.status})`
        )
        .join('; ') ||
      'Site monitoring & routine daily check.';

    const cleanMaterials = materialsOnSite
      .map((m) => {
        const deliveredQty = Math.max(0, Number(m.deliveredQty) || 0);
        const onSiteQty = Math.max(0, Number(m.onSiteQty) || 0);
        const usedTodayQty = Math.max(0, Number(m.usedTodayQty) || 0);
        return {
          ...m,
          name: m.name.trim(),
          unit: m.unit.trim() || 'pcs',
          onSiteQty,
          deliveredQty,
          usedTodayQty,
          remainingQty: computeDailyLogMaterialRemaining({
            onSiteQty,
            deliveredQty,
            usedTodayQty,
          }),
          remarks: m.remarks?.trim() || '',
        };
      })
      .filter((m) => m.name.length > 0);

    const cleanEquipments = equipmentItems
      .map((eq) => ({
        ...eq,
        name: eq.name.trim(),
        status: eq.status.trim() || 'Operational',
        remarks: eq.remarks?.trim() || '',
      }))
      .filter((eq) => eq.name.length > 0);

    const cleanDelays = delayItems
      .map((d) => ({
        ...d,
        description: d.description.trim(),
        impact: d.impact.trim(),
        remarks: d.remarks?.trim() || '',
      }))
      .filter((d) => d.description.length > 0);

    const cleanVisitors = visitorItems
      .map((v) => ({
        ...v,
        name: v.name.trim(),
        roleOrCompany: v.roleOrCompany.trim(),
        purpose: v.purpose.trim(),
        remarks: v.remarks?.trim() || '',
      }))
      .filter((v) => v.name.length > 0);

    const cleanSafetyLogs = safetyLogs
      .map((s) => ({
        ...s,
        timeOrActivity: s.timeOrActivity.trim(),
        hazardOrFinding: s.hazardOrFinding.trim(),
        actionTaken: s.actionTaken.trim(),
        status: s.status.trim() || 'Compliant',
      }))
      .filter(
        (s) =>
          s.timeOrActivity.length > 0 ||
          s.hazardOrFinding.length > 0 ||
          s.actionTaken.length > 0
      );

    const cleanDocumentation = documentationItems
      .map((doc) => ({
        ...doc,
        description: doc.description.trim(),
        remarks: doc.remarks?.trim() || '',
      }))
      .filter((doc) => doc.photoDataUrl || doc.description.length > 0 || doc.remarks.length > 0);

    const activeWorkers = workers.filter((w) => w.count > 0);

    const trimmedProject = projectName.trim() || project.projectName;
    const trimmedLocation = location.trim() || project.location;
    const trimmedPreparedBy = preparedBy.trim() || project.preparedBy;
    if (
      trimmedProject !== project.projectName ||
      trimmedLocation !== project.location ||
      trimmedPreparedBy !== project.preparedBy
    ) {
      updateProjectMeta({
        projectName: trimmedProject,
        location: trimmedLocation,
        preparedBy: trimmedPreparedBy,
      });
    }

    const payload: Omit<DailyActivityLogEntry, 'id' | 'totalWorkers' | 'totalManHours'> = {
      projectName: trimmedProject,
      location: trimmedLocation,
      preparedBy: trimmedPreparedBy,
      date,
      dayNumber,
      weather,
      weatherNotes: weatherNotes.trim(),
      schedulePhaseId: '',
      activitiesSummary: derivedSummary,
      activities: cleanActivities,
      foundationsWorked: selectedFoundations,
      workers: activeWorkers,
      materialsOnSite: cleanMaterials,
      cementUsedBags: 0,
      sandUsedBags: 0,
      gravelUsedBags: 0,
      equipmentItems: cleanEquipments,
      delayItems: cleanDelays,
      visitorItems: cleanVisitors,
      safetyOfficer: safetyOfficer.trim() || undefined,
      safetyLogs: cleanSafetyLogs,
      documentationItems: cleanDocumentation,
      equipmentOnSite: cleanEquipments.map((eq) => `${eq.qty}x ${eq.name}`).join(', '),
      safetyAndVisitors: [
        safetyOfficer.trim() ? `Safety Officer: ${safetyOfficer.trim()}` : '',
        cleanVisitors.map((v) => v.name).join(', '),
      ]
        .filter(Boolean)
        .join(' | '),
      nextDayPlan: '',
      issuesOrDelays:
        cleanDelays.map((d) => d.description).join('; ') || 'None.',
    };

    if (editingLogId) {
      updateDailyLog(editingLogId, payload);
      const updatedCarryOverSource =
        latestLog && editingLogId === latestLog.id
          ? { ...latestLog, ...payload }
          : latestLog;
      const nextNumAfterEdit =
        latestLog && editingLogId === latestLog.id
          ? Math.max(1, dayNumber + 1)
          : nextDayNum;
      resetFormForNewEntry(nextNumAfterEdit, updatedCarryOverSource);
    } else {
      addDailyLog(payload);
      // Immediately carry over today's Remaining materials into tomorrow's On Site column
      resetFormForNewEntry(dayNumber + 1, {
        ...payload,
        id: 'pending-carryover',
        totalWorkers: totalPreviewWorkers,
        totalManHours: 0,
      });
    }
    setMobilePane('history');
  };

  const handleCopyText = async (log: DailyActivityLogEntry) => {
    try {
      await navigator.clipboard.writeText(formatDailyLogPlainText(log, project));
      setCopiedLogId(log.id);
      window.setTimeout(() => setCopiedLogId(null), 1800);
    } catch {
      // Ignore if clipboard permission blocked
    }
  };

  return (
    <div className="p-3 sm:p-4 max-w-7xl w-full mx-auto space-y-3">
      {/* Mobile Sub-Pane Switcher */}
      <div className="lg:hidden flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-1.5 shadow-2xs">
        <button
          type="button"
          onClick={() => setMobilePane('form')}
          className={`flex-1 min-h-11 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
            mobilePane === 'form'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {editingLogId ? 'Edit Daily Log' : '+ New Daily Log'}
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('history')}
          className={`flex-1 min-h-11 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
            mobilePane === 'history'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Saved Logs ({project.dailyLogs.length})
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Daily Log Form */}
        <form
          onSubmit={handleSubmit}
          className={`lg:col-span-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden ${
            mobilePane === 'form' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Form Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/80">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-sky-600" />
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                {editingLogId ? 'Edit Daily Site Log' : 'New Daily Site Log'}
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              {project.dailyLogs.length > 0 && !editingLogId && (
                <button
                  type="button"
                  onClick={handleCopyPreviousCrewAndMaterials}
                  title="Copy Last Crew & Materials"
                  className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-2.5 sm:px-2 py-2 sm:py-1 rounded-lg sm:rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-xs sm:text-[11px] font-semibold text-slate-700 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-sky-600" />
                  <span className="sm:hidden">Copy Previous</span>
                  <span className="hidden sm:inline">Copy Last Crew/Materials</span>
                </button>
              )}
              {editingLogId && (
                <button
                  type="button"
                  onClick={() => resetFormForNewEntry()}
                  className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-2.5 sm:px-2 py-2 sm:py-1 rounded-lg sm:rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-xs sm:text-[11px] font-semibold text-slate-600 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                  Cancel Edit
                </button>
              )}
            </div>
          </div>

          <div className="p-3 sm:p-4 space-y-4">
            {/* 1. Project Name & Log Header Info */}
            <section className="space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                1. Project &amp; Log Info
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                <label className="sm:col-span-7 block">
                  <span className="font-semibold text-slate-700">Project Name</span>
                  <input
                    type="text"
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Guyed Mast Tower – Mast 2"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 sm:py-1.5 font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="sm:col-span-3 block">
                  <span className="font-semibold text-slate-700 flex items-center justify-between gap-1">
                    <span>Date</span>
                    {getWeekdayName(date) && (
                      <span className="text-[11px] font-bold text-sky-700">
                        {getWeekdayName(date)}
                      </span>
                    )}
                  </span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 sm:py-1.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="sm:col-span-2 block">
                  <span className="font-semibold text-slate-700">Day #</span>
                  <input
                    type="number"
                    min={1}
                    value={dayNumber}
                    onChange={(e) => {
                      setDayNumberTouched(true);
                      setDayNumber(Math.max(1, Number(e.target.value) || 1));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 sm:py-1.5 text-center font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <label className="block">
                  <span className="font-semibold text-slate-700">Site Location</span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Mt. Labo, Camarines Norte"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 sm:py-1.5 text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-700">Prepared By / Lead</span>
                  <input
                    type="text"
                    value={preparedBy}
                    onChange={(e) => setPreparedBy(e.target.value)}
                    placeholder="Site Engineer / Foreman"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 sm:py-1.5 text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>
            </section>

            {/* 2. Weather */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                2. Weather Condition
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {WEATHER_OPTIONS.map(({ value, label, Icon }) => {
                  const active = weather === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setWeather(value)}
                      className={`flex items-center justify-center gap-1.5 min-h-10 sm:min-h-0 px-2 py-2 rounded-lg border text-xs sm:text-[11px] font-semibold transition cursor-pointer ${
                        active
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={weatherNotes}
                onChange={(e) => setWeatherNotes(e.target.value)}
                placeholder="Optional weather notes (e.g. Clear AM, dense fog/drizzle afternoon)"
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 sm:py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
              />
            </section>

            {/* 3. Manpower */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Users className="w-3.5 h-3.5 text-sky-600" />
                  3. Manpower
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
                    {totalPreviewWorkers} crew
                  </span>
                  <button
                    type="button"
                    onClick={addWorkerRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + Add Role
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('worker')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Role
                  </button>
                </div>
              </div>

              {/* Mobile Compact Cards + Modal Trigger */}
              <div className="md:hidden space-y-2">
                {workers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                    No manpower roles added yet. Tap Add Role above.
                  </div>
                ) : (
                  workers.map((w, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {w.role}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold">
                            {w.count} pax
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {w.names.trim() || 'No worker names recorded'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setModalTarget({ kind: 'worker', index: idx, item: { ...w } })
                          }
                          aria-label={`Edit ${w.role}`}
                          title="Edit Role"
                          className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeWorkerRow(idx)}
                          aria-label={`Remove ${w.role}`}
                          title="Remove Role"
                          className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Inline Editor */}
              <div className="hidden md:block space-y-2">
                {workers.map((w, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={w.role}
                        onChange={(e) =>
                          updateWorkerRow(idx, { role: e.target.value as WorkerRole })
                        }
                        className="flex-1 min-w-[120px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>

                      {/* Tap-friendly headcount stepper */}
                      <div className="inline-flex items-center rounded-md border border-slate-300 bg-white overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            updateWorkerRow(idx, { count: Math.max(0, w.count - 1) })
                          }
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={w.count}
                          onChange={(e) =>
                            updateWorkerRow(idx, {
                              count: Math.max(0, Number(e.target.value)),
                            })
                          }
                          aria-label={`${w.role} count`}
                          className="w-10 text-center text-xs font-bold text-slate-900 border-x border-slate-200 py-1 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateWorkerRow(idx, { count: w.count + 1 })}
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeWorkerRow(idx)}
                        aria-label={`Remove ${w.role}`}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={w.names}
                      onChange={(e) => updateWorkerRow(idx, { names: e.target.value })}
                      placeholder="Worker names / assignment notes..."
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 4. Materials on Site (Table Format: On Site, Delivered, Used, Remaining) */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Package className="w-3.5 h-3.5 text-sky-600" />
                  {isVerticalMast ? '4. Tower Parts on Site' : '4. Materials on Site'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hauledItemsOnDate.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMaterialsTouched(true);
                        setMaterialsOnSite((prev) =>
                          syncDailyLogMaterialsWithHauling(
                            project,
                            date,
                            prev,
                            computeDailyLogMaterialRemaining
                          )
                        );
                      }}
                      title={`Pull delivered quantities from ${hauledItemsOnDate.length} hauled item(s) on ${date} (you can still override manually)`}
                      className="inline-flex items-center gap-1 min-h-9 sm:min-h-0 px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-lg sm:rounded-full bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-[11px] sm:text-[10px] font-semibold cursor-pointer"
                    >
                      <Truck className="w-3 h-3" />
                      Sync Hauling ({hauledItemsOnDate.length})
                    </button>
                  )}
                  {prevLogForDraft && !editingLogId && (
                    <button
                      type="button"
                      onClick={() => {
                        setMaterialsTouched(false);
                        setMaterialsOnSite(
                          buildCentralizedDailyLogMaterials(
                            project,
                            prevLogForDraft,
                            date,
                            computeDailyLogMaterialRemaining
                          )
                        );
                      }}
                      title="Fill On Site from previous day's Remaining quantities and Hauling deliveries"
                      className="min-h-9 sm:min-h-0 px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-lg sm:rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-[11px] sm:text-[10px] font-semibold cursor-pointer"
                    >
                      Auto-fill from Day {prevLogForDraft.dayNumber}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addMaterialRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + {isVerticalMast ? 'Add Tower Part' : 'Add Material'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('material')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isVerticalMast ? 'Add Part' : 'Add Material'}
                  </button>
                </div>
              </div>

              {/* Mobile Compact Cards + Modal Trigger */}
              <div className="md:hidden space-y-2">
                {materialsOnSite.map((m, idx) => {
                  const remaining = computeDailyLogMaterialRemaining(m);
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {m.name.trim() || (isVerticalMast ? 'Unnamed Part' : 'Unnamed Material')}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-semibold shrink-0">
                              {m.unit || 'pcs'}
                            </span>
                          </div>
                          {m.remarks && (
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {m.remarks}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setModalTarget({ kind: 'material', index: idx, item: { ...m } })
                            }
                            aria-label={`Edit ${m.name || 'material'}`}
                            title="Edit Item"
                            className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMaterialRow(idx)}
                            aria-label={`Remove ${m.name || 'material'}`}
                            title="Remove Item"
                            className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                        <div className="rounded-md bg-white border border-slate-200 py-1 px-1">
                          <div className="text-[9px] text-slate-400 uppercase font-bold">On Site</div>
                          <div className="font-bold text-slate-900">{m.onSiteQty}</div>
                        </div>
                        <div className="rounded-md bg-emerald-50/70 border border-emerald-200 py-1 px-1">
                          <div className="text-[9px] text-emerald-700 uppercase font-bold">Deliv.</div>
                          <div className="font-bold text-emerald-900">{m.deliveredQty ?? 0}</div>
                        </div>
                        <div className="rounded-md bg-white border border-slate-200 py-1 px-1">
                          <div className="text-[9px] text-slate-400 uppercase font-bold">Used</div>
                          <div className="font-bold text-slate-800">{m.usedTodayQty}</div>
                        </div>
                        <div className="rounded-md bg-sky-50 border border-sky-200 py-1 px-1">
                          <div className="text-[9px] text-sky-700 uppercase font-bold">Rem.</div>
                          <div className="font-bold text-sky-800">{remaining}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Inline Table */}
              <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">
                        {isVerticalMast ? 'Tower Part' : 'Material'}
                      </th>
                      <th className="px-2 py-1.5 font-semibold w-14 text-center">Unit</th>
                      <th className="px-2 py-1.5 font-semibold text-right w-16">On Site</th>
                      <th className="px-2 py-1.5 font-semibold text-right w-16">Delivered</th>
                      <th className="px-2 py-1.5 font-semibold text-right w-16">Used</th>
                      <th className="px-2 py-1.5 font-semibold text-right w-16">Remaining</th>
                      <th className="px-2 py-1.5 font-semibold">Remarks</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {materialsOnSite.map((m, idx) => {
                      const remaining = computeDailyLogMaterialRemaining(m);
                      return (
                        <tr key={m.id}>
                          <td className="px-1.5 py-1">
                            <input
                              type="text"
                              value={m.name}
                              onChange={(e) =>
                                updateMaterialRow(idx, { name: e.target.value })
                              }
                              placeholder="Item name"
                              className="w-full min-w-[85px] rounded border border-slate-200 px-1.5 py-1 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="text"
                              value={m.unit}
                              onChange={(e) =>
                                updateMaterialRow(idx, { unit: e.target.value })
                              }
                              className="w-12 rounded border border-slate-200 px-1 py-1 text-xs text-slate-700 text-center focus:border-sky-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.onSiteQty}
                              onChange={(e) =>
                                updateMaterialRow(idx, {
                                  onSiteQty: Math.max(0, Number(e.target.value)),
                                })
                              }
                              aria-label={`${m.name || 'Material'} on site`}
                              className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs font-semibold text-right text-slate-900 focus:border-sky-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.deliveredQty ?? 0}
                              onChange={(e) =>
                                updateMaterialRow(idx, {
                                  deliveredQty: Math.max(0, Number(e.target.value)),
                                })
                              }
                              aria-label={`${m.name || 'Material'} delivered`}
                              className="w-14 rounded border border-emerald-300 bg-emerald-50/40 px-1.5 py-1 text-xs font-semibold text-right text-emerald-900 focus:border-sky-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.usedTodayQty}
                              onChange={(e) =>
                                updateMaterialRow(idx, {
                                  usedTodayQty: Math.max(0, Number(e.target.value)),
                                })
                              }
                              aria-label={`${m.name || 'Material'} used`}
                              className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs text-right text-slate-800 focus:border-sky-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-1.5 py-1 text-right">
                            <span className="inline-block min-w-[36px] rounded bg-sky-50 border border-sky-200 px-1.5 py-1 text-xs font-bold text-sky-800">
                              {remaining}
                            </span>
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="text"
                              value={m.remarks ?? ''}
                              onChange={(e) =>
                                updateMaterialRow(idx, { remarks: e.target.value })
                              }
                              placeholder="Note"
                              className="w-full min-w-[70px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                            />
                          </td>
                          <td className="pr-1.5 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => removeMaterialRow(idx)}
                              aria-label={`Remove ${m.name || 'material'}`}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 5. Activities & Status (Table Format) */}
            <section className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  5. Activities &amp; Status
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addActivityRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + Add Activity
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('activity')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Activity
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-600 block mb-1">
                  {isVerticalMast
                    ? 'Tower Sections & Guy Layers Worked On'
                    : 'Foundations Worked On'}
                </span>
                {isVerticalMast ? (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">
                        Guy Layers:
                      </span>
                      {verticalMastGuyLayers.map((g) => {
                        const active = selectedFoundations.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleFoundation(g.id)}
                            className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded border text-xs sm:text-[10px] font-semibold transition cursor-pointer ${
                              active
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {g.id}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 max-h-24 overflow-y-auto p-1.5 rounded border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">
                        Sections:
                      </span>
                      {verticalMastSections.map((s) => {
                        const active = selectedFoundations.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleFoundation(s.id)}
                            className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded border text-xs sm:text-[10px] font-semibold transition cursor-pointer ${
                              active
                                ? 'bg-sky-600 text-white border-sky-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {s.id}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 sm:gap-1">
                    {foundations.map((f) => {
                      const active = selectedFoundations.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleFoundation(f.id)}
                          className={`px-2.5 py-1.5 sm:px-2 sm:py-1 rounded border text-xs sm:text-[11px] font-semibold transition cursor-pointer ${
                            active
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {f.id}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mobile Compact Cards + Modal Trigger */}
              <div className="md:hidden space-y-2">
                {activities.map((act, idx) => (
                  <div
                    key={act.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-bold text-slate-800">
                          {act.foundationId || 'Site'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                            ACTIVITY_STATUS_BADGE[act.status]
                          }`}
                        >
                          {act.status}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-900">
                        {act.description.trim() || (
                          <span className="text-slate-400 italic">
                            Tap Edit to describe activity...
                          </span>
                        )}
                      </div>
                      {act.remarks && (
                        <div className="text-[11px] text-slate-500">
                          Remarks: {act.remarks}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setModalTarget({ kind: 'activity', index: idx, item: { ...act } })
                        }
                        aria-label="Edit activity"
                        title="Edit Activity"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeActivityRow(idx)}
                        aria-label="Remove activity"
                        title="Remove Activity"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold w-24">Location</th>
                      <th className="px-2 py-1.5 font-semibold">Activity Description</th>
                      <th className="px-2 py-1.5 font-semibold w-28">Status</th>
                      <th className="px-2 py-1.5 font-semibold">Remarks</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activities.map((act, idx) => (
                      <tr key={act.id}>
                        <td className="px-1.5 py-1">
                          <select
                            value={act.foundationId ?? ''}
                            onChange={(e) =>
                              updateActivityRow(idx, { foundationId: e.target.value })
                            }
                            aria-label="Activity foundation"
                            className="w-full min-w-[78px] rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            <option value="">Site</option>
                            {isVerticalMast ? (
                              <>
                                <optgroup label="Guy Layers">
                                  {verticalMastGuyLayers.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.id} (+{g.elevationM}m)
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Tower Sections">
                                  {verticalMastSections.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.id} ({s.elevationFromM}–{s.elevationToM}m)
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Ground Anchors">
                                  {foundations.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.id}
                                    </option>
                                  ))}
                                </optgroup>
                              </>
                            ) : (
                              foundations.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.id}
                                </option>
                              ))
                            )}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={act.description}
                            onChange={(e) =>
                              updateActivityRow(idx, { description: e.target.value })
                            }
                            placeholder="Activity description"
                            className="w-full min-w-[140px] rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={act.status}
                            onChange={(e) =>
                              updateActivityRow(idx, {
                                status: e.target.value as DailyLogActivityStatus,
                              })
                            }
                            aria-label="Activity status"
                            className="w-full min-w-[92px] rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-800"
                          >
                            {ACTIVITY_STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={act.remarks ?? ''}
                            onChange={(e) =>
                              updateActivityRow(idx, { remarks: e.target.value })
                            }
                            placeholder="Remarks"
                            className="w-full min-w-[85px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="pr-1.5 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeActivityRow(idx)}
                            aria-label="Remove activity"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="block text-xs">
                <span className="font-semibold text-slate-700">
                  Overall Activity Summary (optional if listed above)
                </span>
                <textarea
                  rows={2}
                  value={activitiesSummary}
                  onChange={(e) => setActivitiesSummary(e.target.value)}
                  placeholder="Brief daily accomplishment summary..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </section>

            {/* 6. Equipments (Table Format) */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Wrench className="w-3.5 h-3.5 text-sky-600" />
                  6. Equipments
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addEquipmentRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + Add Equipment
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('equipment')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Equipment
                  </button>
                </div>
              </div>

              {/* Mobile Compact Cards */}
              <div className="md:hidden space-y-2">
                {equipmentItems.map((eq, idx) => (
                  <div
                    key={eq.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {eq.name.trim() || (
                            <span className="text-slate-400 italic font-normal">
                              Unnamed equipment
                            </span>
                          )}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                          {eq.qty}x
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-[10px] font-semibold text-slate-700">
                          {eq.status || 'Operational'}
                        </span>
                      </div>
                      {eq.remarks && (
                        <div className="text-[11px] text-slate-500 truncate">
                          {eq.remarks}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setModalTarget({ kind: 'equipment', index: idx, item: { ...eq } })
                        }
                        aria-label="Edit equipment"
                        title="Edit Equipment"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEquipmentRow(idx)}
                        aria-label="Remove equipment"
                        title="Remove Equipment"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Equipment / Tool</th>
                      <th className="px-2 py-1.5 font-semibold w-16 text-center">Qty</th>
                      <th className="px-2 py-1.5 font-semibold w-28">Status</th>
                      <th className="px-2 py-1.5 font-semibold">Remarks</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {equipmentItems.map((eq, idx) => (
                      <tr key={eq.id}>
                        <td className="px-1.5 py-1">
                          <input
                            type="text"
                            value={eq.name}
                            onChange={(e) =>
                              updateEquipmentRow(idx, { name: e.target.value })
                            }
                            placeholder="e.g. Concrete Mixer"
                            className="w-full min-w-[115px] rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            min={0}
                            value={eq.qty}
                            onChange={(e) =>
                              updateEquipmentRow(idx, {
                                qty: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs font-semibold text-center text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={eq.status}
                            onChange={(e) =>
                              updateEquipmentRow(idx, { status: e.target.value })
                            }
                            placeholder="Operational"
                            className="w-full min-w-[85px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={eq.remarks ?? ''}
                            onChange={(e) =>
                              updateEquipmentRow(idx, { remarks: e.target.value })
                            }
                            placeholder="Remarks"
                            className="w-full min-w-[80px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="pr-1.5 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeEquipmentRow(idx)}
                            aria-label="Remove equipment"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 7. Delays (Table Format) */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  7. Delays / Issues
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addDelayRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + Add Delay
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('delay')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Delay
                  </button>
                </div>
              </div>

              {/* Mobile Compact Cards */}
              <div className="md:hidden space-y-2">
                {delayItems.map((d, idx) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-xs font-semibold text-slate-900">
                        {d.description.trim() || (
                          <span className="text-slate-400 italic font-normal">
                            No delay recorded (tap Edit to enter)
                          </span>
                        )}
                      </div>
                      {(d.impact || d.remarks) && (
                        <div className="text-[11px] text-slate-600">
                          {d.impact && (
                            <span className="font-medium text-amber-800">
                              Impact: {d.impact}
                            </span>
                          )}
                          {d.impact && d.remarks && ' · '}
                          {d.remarks && <span>{d.remarks}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setModalTarget({ kind: 'delay', index: idx, item: { ...d } })
                        }
                        aria-label="Edit delay"
                        title="Edit Delay"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDelayRow(idx)}
                        aria-label="Remove delay"
                        title="Remove Delay"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Delay / Issue Description</th>
                      <th className="px-2 py-1.5 font-semibold w-28">Impact</th>
                      <th className="px-2 py-1.5 font-semibold">Action / Remarks</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {delayItems.map((d, idx) => (
                      <tr key={d.id}>
                        <td className="px-1.5 py-1">
                          <input
                            type="text"
                            value={d.description}
                            onChange={(e) =>
                              updateDelayRow(idx, { description: e.target.value })
                            }
                            placeholder="e.g. Heavy fog & slippery haul trail"
                            className="w-full min-w-[130px] rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={d.impact}
                            onChange={(e) =>
                              updateDelayRow(idx, { impact: e.target.value })
                            }
                            placeholder="e.g. Hauling slowed"
                            className="w-full min-w-[85px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={d.remarks ?? ''}
                            onChange={(e) =>
                              updateDelayRow(idx, { remarks: e.target.value })
                            }
                            placeholder="Action taken"
                            className="w-full min-w-[85px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="pr-1.5 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeDelayRow(idx)}
                            aria-label="Remove delay"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 8. Visitors (Table Format) */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                  8. Visitors
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addVisitorRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + Add Visitor
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('visitor')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Visitor
                  </button>
                </div>
              </div>

              {/* Mobile Compact Cards */}
              <div className="md:hidden space-y-2">
                {visitorItems.map((v, idx) => (
                  <div
                    key={v.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-xs font-bold text-slate-900">
                        {v.name.trim() || (
                          <span className="text-slate-400 italic font-normal">
                            No visitor entered (tap Edit)
                          </span>
                        )}
                      </div>
                      {(v.roleOrCompany || v.purpose) && (
                        <div className="text-[11px] text-slate-600">
                          {[v.roleOrCompany, v.purpose].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {v.remarks && (
                        <div className="text-[11px] text-slate-500">{v.remarks}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setModalTarget({ kind: 'visitor', index: idx, item: { ...v } })
                        }
                        aria-label="Edit visitor"
                        title="Edit Visitor"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeVisitorRow(idx)}
                        aria-label="Remove visitor"
                        title="Remove Visitor"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Visitor Name</th>
                      <th className="px-2 py-1.5 font-semibold">Company / Role</th>
                      <th className="px-2 py-1.5 font-semibold">Purpose</th>
                      <th className="px-2 py-1.5 font-semibold">Remarks</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visitorItems.map((v, idx) => (
                      <tr key={v.id}>
                        <td className="px-1.5 py-1">
                          <input
                            type="text"
                            value={v.name}
                            onChange={(e) =>
                              updateVisitorRow(idx, { name: e.target.value })
                            }
                            placeholder="Name"
                            className="w-full min-w-[95px] rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={v.roleOrCompany}
                            onChange={(e) =>
                              updateVisitorRow(idx, { roleOrCompany: e.target.value })
                            }
                            placeholder="Company / Role"
                            className="w-full min-w-[90px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={v.purpose}
                            onChange={(e) =>
                              updateVisitorRow(idx, { purpose: e.target.value })
                            }
                            placeholder="Inspection / Visit"
                            className="w-full min-w-[90px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={v.remarks ?? ''}
                            onChange={(e) =>
                              updateVisitorRow(idx, { remarks: e.target.value })
                            }
                            placeholder="Notes"
                            className="w-full min-w-[75px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="pr-1.5 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeVisitorRow(idx)}
                            aria-label="Remove visitor"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 9. Safety Logs (Safety Officer) */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  9. Safety Logs (Safety Officer)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addSafetyRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + Add Safety Log
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('safety')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Safety
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">
                  Safety Officer
                </span>
                <input
                  type="text"
                  value={safetyOfficer}
                  onChange={(e) => setSafetyOfficer(e.target.value)}
                  placeholder="Name of Safety Officer"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 sm:py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              {/* Mobile Compact Cards */}
              <div className="md:hidden space-y-2">
                {safetyLogs.map((s, idx) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">
                          {s.timeOrActivity.trim() || (
                            <span className="text-slate-400 italic font-normal">
                              Safety entry (tap Edit)
                            </span>
                          )}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                          {s.status}
                        </span>
                      </div>
                      {s.hazardOrFinding && (
                        <div className="text-[11px] text-slate-700">
                          Obs: {s.hazardOrFinding}
                        </div>
                      )}
                      {s.actionTaken && (
                        <div className="text-[11px] text-slate-500">
                          Action: {s.actionTaken}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setModalTarget({ kind: 'safety', index: idx, item: { ...s } })
                        }
                        aria-label="Edit safety log"
                        title="Edit Safety Log"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSafetyRow(idx)}
                        aria-label="Remove safety log"
                        title="Remove Safety Log"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Time / Activity</th>
                      <th className="px-2 py-1.5 font-semibold">Safety Observation / Hazard</th>
                      <th className="px-2 py-1.5 font-semibold">Action Taken / Control</th>
                      <th className="px-2 py-1.5 font-semibold">Status</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {safetyLogs.map((s, idx) => (
                      <tr key={s.id}>
                        <td className="px-1.5 py-1">
                          <input
                            type="text"
                            value={s.timeOrActivity}
                            onChange={(e) =>
                              updateSafetyRow(idx, { timeOrActivity: e.target.value })
                            }
                            placeholder="07:30 Toolbox Talk"
                            className="w-full min-w-[95px] rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={s.hazardOrFinding}
                            onChange={(e) =>
                              updateSafetyRow(idx, { hazardOrFinding: e.target.value })
                            }
                            placeholder="PPE, shoring, housekeeping..."
                            className="w-full min-w-[110px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={s.actionTaken}
                            onChange={(e) =>
                              updateSafetyRow(idx, { actionTaken: e.target.value })
                            }
                            placeholder="Briefing / barricading / PPE check"
                            className="w-full min-w-[110px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={s.status}
                            onChange={(e) =>
                              updateSafetyRow(idx, { status: e.target.value })
                            }
                            className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-800 focus:border-sky-500 focus:outline-none"
                          >
                            <option value="Compliant">Compliant</option>
                            <option value="Action Taken">Action Taken</option>
                            <option value="Open">Open</option>
                            <option value="N/A">N/A</option>
                          </select>
                        </td>
                        <td className="pr-1.5 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeSafetyRow(idx)}
                            aria-label="Remove safety log"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 10. Documentation (Image left, Description / Remarks right) */}
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Camera className="w-3.5 h-3.5 text-sky-600" />
                  10. Documentation
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addDocumentationRow}
                    className="hidden md:inline text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer"
                  >
                    + Add Documentation
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal('documentation')}
                    className="md:hidden inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Photo
                  </button>
                </div>
              </div>

              {/* Mobile Compact Cards */}
              <div className="md:hidden space-y-2">
                {documentationItems.map((doc, idx) => (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {doc.photoDataUrl ? (
                        <img
                          src={doc.photoDataUrl}
                          alt={doc.description || doc.photoName || 'Documentation'}
                          className="w-14 h-14 object-cover rounded-lg border border-slate-200 bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {doc.description.trim() || (
                            <span className="text-slate-400 italic font-normal">
                              Tap Edit to add photo/caption
                            </span>
                          )}
                        </div>
                        {doc.remarks && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {doc.remarks}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setModalTarget({
                            kind: 'documentation',
                            index: idx,
                            item: { ...doc },
                          })
                        }
                        aria-label="Edit documentation"
                        title="Edit Documentation"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDocumentationRow(idx)}
                        aria-label="Remove documentation row"
                        title="Remove Documentation"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold w-5/12">Image</th>
                      <th className="px-2 py-1.5 font-semibold w-7/12">
                        Description / Remarks
                      </th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {documentationItems.map((doc, idx) => (
                      <tr key={doc.id}>
                        <td className="p-2 align-middle">
                          <div className="space-y-1.5">
                            {doc.photoDataUrl ? (
                              <div className="space-y-1.5">
                                <img
                                  src={doc.photoDataUrl}
                                  alt={doc.description || doc.photoName || 'Documentation'}
                                  className="w-full max-h-36 object-contain rounded border border-slate-200 bg-slate-50"
                                />
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[10px] font-semibold text-slate-700 cursor-pointer">
                                    <ImagePlus className="w-3 h-3 text-sky-600" />
                                    Replace
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => handleUploadDocPhoto(idx, e)}
                                      className="hidden"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDocumentationRow(idx, {
                                        photoDataUrl: undefined,
                                        photoName: undefined,
                                      })
                                    }
                                    className="px-2 py-0.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[10px] font-semibold text-rose-700 cursor-pointer"
                                  >
                                    Clear Photo
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-sky-50/60 hover:border-sky-300 p-4 text-center cursor-pointer transition">
                                <ImagePlus className="w-4 h-4 text-sky-600" />
                                <span className="text-[11px] font-semibold text-sky-700">
                                  Upload Photo
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleUploadDocPhoto(idx, e)}
                                  className="hidden"
                                />
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="p-2 align-top space-y-1.5">
                          <textarea
                            rows={2}
                            value={doc.description}
                            onChange={(e) =>
                              updateDocumentationRow(idx, {
                                description: e.target.value,
                              })
                            }
                            placeholder="Photo description (e.g. I-A1 excavation & rebar spacing check)"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                          />
                          <input
                            type="text"
                            value={doc.remarks ?? ''}
                            onChange={(e) =>
                              updateDocumentationRow(idx, {
                                remarks: e.target.value,
                              })
                            }
                            placeholder="Remarks / location / notes"
                            className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 focus:border-sky-500 focus:outline-none"
                          />
                        </td>
                        <td className="pr-1.5 py-2 align-top text-center">
                          <button
                            type="button"
                            onClick={() => removeDocumentationRow(idx)}
                            aria-label="Remove documentation row"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>


            <button
              type="submit"
              className="w-full min-h-12 md:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl md:rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm md:text-xs font-bold py-3 md:py-2.5 px-4 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              {editingLogId ? 'Update Daily Log' : 'Save Daily Log'}
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN: Saved Daily Logs Feed */}
        <div
          className={`lg:col-span-6 space-y-3 ${
            mobilePane === 'history' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Saved Daily Logs ({project.dailyLogs.length})
            </h2>
            <div className="flex items-center gap-2">
              {sortedDailyLogs.length > 0 && (
                <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      sortedDailyLogs.forEach((l) => {
                        next[l.id] = true;
                      });
                      setExpandedLogs(next);
                    }}
                    className="px-2 py-0.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-r border-slate-200 cursor-pointer"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      sortedDailyLogs.forEach((l) => {
                        next[l.id] = false;
                      });
                      setExpandedLogs(next);
                    }}
                    className="px-2 py-0.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                  >
                    Collapse All
                  </button>
                </div>
              )}
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Stored offline on device
              </span>
            </div>
          </div>

          {sortedDailyLogs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
              No daily logs recorded yet. Fill out the form to log today&apos;s site report.
            </div>
          ) : (
            sortedDailyLogs.map((log, index) => {
              const isExpanded = expandedLogs[log.id] ?? index === 0;
              const activityRows = getDailyLogActivityRows(log);
              const mats = getDailyLogMaterialRows(log).filter(
                (m) =>
                  m.onSiteQty > 0 ||
                  (m.deliveredQty ?? 0) > 0 ||
                  m.usedTodayQty > 0 ||
                  (m.remainingQty ?? 0) > 0 ||
                  Boolean(m.remarks?.trim())
              );
              const equips = getDailyLogEquipmentRows(log);
              const delays = getDailyLogDelayRows(log);
              const visitors = getDailyLogVisitorRows(log);
              const safetyRows = getDailyLogSafetyRows(log);
              const docs = log.documentationItems ?? [];

              const logProjectName = log.projectName?.trim() || project.projectName;
              const logLocation = log.location?.trim() || project.location;
              const logAuthor = log.preparedBy?.trim() || project.preparedBy;

              return (
                <article
                  key={log.id}
                  className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  {/* Collapsible Card Top Bar */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedLogs((prev) => ({ ...prev, [log.id]: !isExpanded }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedLogs((prev) => ({ ...prev, [log.id]: !isExpanded }));
                      }
                    }}
                    className={`flex flex-wrap items-start justify-between gap-2 p-3 sm:p-3.5 cursor-pointer hover:bg-slate-50/80 transition ${
                      isExpanded ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="mt-0.5 text-slate-400 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </span>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
                            Day {log.dayNumber}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-slate-900">
                            {formatDateWithWeekday(log.date)}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                            {log.weather}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {logProjectName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {logLocation} · By {logAuthor}
                          {log.weatherNotes ? ` · ${log.weatherNotes}` : ''}
                        </div>
                        {!isExpanded && (
                          <div className="text-[11px] text-slate-600 pt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                            <span>{log.totalWorkers} workers</span>
                            <span>· {activityRows.length} activities</span>
                            {safetyRows.length > 0 && (
                              <span>· {safetyRows.length} safety</span>
                            )}
                            {log.foundationsWorked.length > 0 && (
                              <span className="font-semibold text-sky-700">
                                · {log.foundationsWorked.join(', ')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleCopyText(log)}
                        title="Copy plain text summary"
                        aria-label="Copy plain text summary"
                        className="inline-flex items-center justify-center gap-1 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-2.5 sm:px-2 py-2 sm:py-1 rounded-lg sm:rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                      >
                        {copiedLogId === log.id ? (
                          <Check className="w-4 h-4 sm:w-3 sm:h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4 sm:w-3 sm:h-3" />
                        )}
                        <span className="hidden sm:inline">
                          {copiedLogId === log.id ? 'Copied' : 'Copy'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDailyLogPrintId(log.id)}
                        title="Print / Save PDF"
                        aria-label="Print / Save PDF"
                        className="inline-flex items-center justify-center gap-1 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-2.5 sm:px-2 py-2 sm:py-1 rounded-lg sm:rounded border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-200 text-[11px] font-semibold text-slate-700 hover:text-sky-700 cursor-pointer"
                      >
                        <Printer className="w-4 h-4 sm:w-3 sm:h-3" />
                        <span className="hidden sm:inline">Print</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLoadLogForEdit(log)}
                        title="Edit daily log"
                        aria-label="Edit daily log"
                        className="min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center p-2 sm:p-1.5 rounded-lg sm:rounded border border-slate-200 text-slate-500 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await requestConfirm({
                            tone: 'danger',
                            title: 'Delete Daily Log?',
                            message: `Delete Day ${log.dayNumber} (${log.date}) log?`,
                            detail:
                              'This removes the daily log entry and recalculates carried-over material balances for subsequent logs.',
                            confirmLabel: 'Delete Log',
                          });
                          if (ok) {
                            deleteDailyLog(log.id);
                          }
                        }}
                        title="Delete daily log"
                        aria-label="Delete daily log"
                        className="min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center p-2 sm:p-1.5 rounded-lg sm:rounded border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-3.5 sm:p-4 space-y-3">
                  {/* Manpower Summary & Tags */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span className="font-bold uppercase tracking-wider text-slate-500">
                        Manpower: {log.totalWorkers} workers
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      {log.foundationsWorked.map((fid) => (
                        <span
                          key={fid}
                          className="px-2 py-0.5 rounded bg-sky-600 text-white font-semibold"
                        >
                          {fid}
                        </span>
                      ))}
                      {log.workers.map((w, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700"
                        >
                          {w.count}× {w.role}
                          {w.names ? ` (${w.names})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Activities & Status Table */}
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Activities &amp; Status
                    </div>
                    <div className="rounded-lg border border-slate-200 overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-2 py-1 font-semibold w-16">Loc.</th>
                            <th className="px-2 py-1 font-semibold">Activity</th>
                            <th className="px-2 py-1 font-semibold text-center w-24">Status</th>
                            <th className="px-2 py-1 font-semibold">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activityRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-2 py-1.5 text-center text-slate-400 italic">
                                No activities recorded
                              </td>
                            </tr>
                          ) : (
                            activityRows.map((act) => (
                              <tr key={act.id}>
                                <td className="px-2 py-1 font-bold text-sky-700">
                                  {act.foundationId || 'Site'}
                                </td>
                                <td className="px-2 py-1 text-slate-900 font-medium">
                                  {act.description}
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                                      ACTIVITY_STATUS_BADGE[act.status]
                                    }`}
                                  >
                                    {act.status}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {act.remarks || '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {log.activitiesSummary && log.activities && log.activities.length > 0 && (
                      <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                        {log.activitiesSummary}
                      </p>
                    )}
                  </div>

                  {/* Safety Logs Table (Safety Officer) */}
                  {(safetyRows.length > 0 || Boolean(log.safetyOfficer?.trim())) && (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold uppercase tracking-wider text-slate-500">
                          Safety Logs
                        </span>
                        {log.safetyOfficer?.trim() && (
                          <span className="font-semibold text-emerald-700">
                            Safety Officer: {log.safetyOfficer}
                          </span>
                        )}
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Time / Activity</th>
                              <th className="px-2 py-1 font-semibold">Observation / Hazard</th>
                              <th className="px-2 py-1 font-semibold">Action Taken</th>
                              <th className="px-2 py-1 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {safetyRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-2 py-1.5 text-center text-slate-400 italic"
                                >
                                  No safety log entries recorded
                                </td>
                              </tr>
                            ) : (
                              safetyRows.map((s) => (
                                <tr key={s.id}>
                                  <td className="px-2 py-1 font-semibold text-slate-800">
                                    {s.timeOrActivity || '—'}
                                  </td>
                                  <td className="px-2 py-1 text-slate-700">
                                    {s.hazardOrFinding || '—'}
                                  </td>
                                  <td className="px-2 py-1 text-slate-700">
                                    {s.actionTaken || '—'}
                                  </td>
                                  <td className="px-2 py-1 font-semibold text-emerald-700">
                                    {s.status || 'Compliant'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Materials on Site Table */}
                  {mats.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Materials on Site
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Item</th>
                              <th className="px-2 py-1 font-semibold text-right">On Site</th>
                              <th className="px-2 py-1 font-semibold text-right">Delivered</th>
                              <th className="px-2 py-1 font-semibold text-right">Used</th>
                              <th className="px-2 py-1 font-semibold text-right">Remaining</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mats.map((m) => {
                              const delivered = m.deliveredQty ?? 0;
                              const remaining =
                                m.remainingQty ?? computeDailyLogMaterialRemaining(m);
                              return (
                                <tr key={m.id}>
                                  <td className="px-2 py-1 font-semibold text-slate-800">
                                    {m.name} ({m.unit})
                                  </td>
                                  <td className="px-2 py-1 text-right font-semibold text-slate-900">
                                    {m.onSiteQty}
                                  </td>
                                  <td className="px-2 py-1 text-right font-semibold text-emerald-700">
                                    {delivered}
                                  </td>
                                  <td className="px-2 py-1 text-right text-slate-700">
                                    {m.usedTodayQty}
                                  </td>
                                  <td className="px-2 py-1 text-right font-bold text-sky-700">
                                    {remaining}
                                  </td>
                                  <td className="px-2 py-1 text-slate-500">
                                    {m.remarks || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Equipments Table */}
                  {equips.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Equipments
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Equipment / Tool</th>
                              <th className="px-2 py-1 font-semibold text-center w-14">Qty</th>
                              <th className="px-2 py-1 font-semibold text-center w-24">Status</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {equips.map((eq) => (
                              <tr key={eq.id}>
                                <td className="px-2 py-1 font-semibold text-slate-800">
                                  {eq.name}
                                </td>
                                <td className="px-2 py-1 text-center text-slate-900">
                                  {eq.qty}
                                </td>
                                <td className="px-2 py-1 text-center text-slate-700">
                                  {eq.status}
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {eq.remarks || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Delays Table */}
                  {delays.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                        Delays
                      </div>
                      <div className="rounded-lg border border-amber-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-amber-50 text-amber-900 border-b border-amber-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Delay / Issue</th>
                              <th className="px-2 py-1 font-semibold w-28">Impact</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100">
                            {delays.map((d) => (
                              <tr key={d.id}>
                                <td className="px-2 py-1 font-medium text-amber-950">
                                  {d.description}
                                </td>
                                <td className="px-2 py-1 text-amber-900">
                                  {d.impact || '—'}
                                </td>
                                <td className="px-2 py-1 text-amber-800">
                                  {d.remarks || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Visitors Table */}
                  {visitors.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Visitors
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Name</th>
                              <th className="px-2 py-1 font-semibold">Company / Role</th>
                              <th className="px-2 py-1 font-semibold">Purpose</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {visitors.map((v) => (
                              <tr key={v.id}>
                                <td className="px-2 py-1 font-semibold text-slate-800">
                                  {v.name}
                                </td>
                                <td className="px-2 py-1 text-slate-700">
                                  {v.roleOrCompany || '—'}
                                </td>
                                <td className="px-2 py-1 text-slate-700">
                                  {v.purpose || '—'}
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {v.remarks || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Documentation Table (Image left, Description / Remarks right) */}
                  {docs.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Documentation
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold w-5/12">Image</th>
                              <th className="px-2 py-1 font-semibold w-7/12">
                                Description / Remarks
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {docs.map((doc) => (
                              <tr key={doc.id}>
                                <td className="p-1.5 align-middle">
                                  {doc.photoDataUrl ? (
                                    <img
                                      src={doc.photoDataUrl}
                                      alt={doc.description || doc.photoName || 'Documentation'}
                                      className="max-h-28 w-auto mx-auto rounded border border-slate-200 object-contain"
                                    />
                                  ) : (
                                    <span className="text-slate-400 italic block text-center">
                                      No photo
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 align-top space-y-1">
                                  <div className="font-semibold text-slate-900">
                                    {doc.description || '—'}
                                  </div>
                                  {doc.remarks && (
                                    <div className="text-slate-600">
                                      <span className="font-semibold">Remarks:</span> {doc.remarks}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>

      <DailyLogRowEditorModal
        target={modalTarget}
        isVerticalMast={isVerticalMast}
        roles={ROLES}
        activityStatuses={ACTIVITY_STATUS_OPTIONS}
        foundations={foundations}
        verticalMastSections={verticalMastSections}
        verticalMastGuyLayers={verticalMastGuyLayers}
        onClose={() => setModalTarget(null)}
        onSave={handleSaveModalTarget}
        onDelete={handleDeleteModalTarget}
      />
    </div>
  );
}
