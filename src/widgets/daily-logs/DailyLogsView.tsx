import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Cloud,
  CloudFog,
  CloudRain,
  CloudLightning,
  Copy,
  Pencil,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  UserCheck,
  Wrench,
} from 'lucide-react';
import {
  computeDailyLogMaterialRemaining,
  createDefaultDailyLogMaterials,
  findPreviousDailyLogForDraft,
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
import { todayLocalIso } from '@/shared/lib/dateUtils';
import { DailyLogBatchPrintModal } from './DailyLogBatchPrintModal';
import { DailyLogsHistoryFeed } from './sections/DailyLogsHistoryFeed';
import { DailyLogActivitiesSection } from './sections/DailyLogActivitiesSection';
import { DailyLogDocumentationSection } from './sections/DailyLogDocumentationSection';
import { DailyLogManpowerSection } from './sections/DailyLogManpowerSection';
import { DailyLogMaterialsSection } from './sections/DailyLogMaterialsSection';
import { DailyLogSafetySection } from './sections/DailyLogSafetySection';
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
  const updateProjectMeta = useProjectStore((s) => s.updateProjectMeta);
  const showAlert = useFeedbackStore((s) => s.showAlert);

  const project = projectProp ?? storeProject;
  const isVerticalMast = project.projectType === 'vertical_mast';
  const verticalMastSections = project.verticalMast?.sections ?? [];
  const verticalMastGuyLayers = project.verticalMast?.guyLayers ?? [];

  const [mobilePane, setMobilePane] = useState<'form' | 'history'>('form');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);

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
  const [metaTouched, setMetaTouched] = useState(false);
  const [date, setDate] = useState(todayLocalIso());
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
        todayLocalIso(),
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

  const materialsSeedProject = useMemo(
    () => ({
      projectType: project.projectType,
      centralMaterials: project.centralMaterials,
      haulingLogs: project.haulingLogs,
      dailyLogs: project.dailyLogs,
    }),
    [
      project.projectType,
      project.centralMaterials,
      project.haulingLogs,
      project.dailyLogs,
    ]
  );

  useEffect(() => {
    if (editingLogId || metaTouched) return;
    setProjectName(project.projectName);
    setLocation(project.location);
    setPreparedBy(project.preparedBy);
  }, [
    editingLogId,
    metaTouched,
    project.projectName,
    project.location,
    project.preparedBy,
  ]);

  useEffect(() => {
    if (editingLogId || dayNumberTouched) return;
    setDayNumber(nextDayNum);
  }, [editingLogId, dayNumberTouched, nextDayNum]);

  useEffect(() => {
    if (editingLogId || materialsTouched) return;
    setMaterialsOnSite(
      buildCentralizedDailyLogMaterials(
        materialsSeedProject,
        prevLogForDraft,
        date,
        computeDailyLogMaterialRemaining
      )
    );
  }, [editingLogId, materialsTouched, prevLogForDraft, materialsSeedProject, date]);

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
    const todayIso = todayLocalIso();
    setEditingLogId(null);
    setDayNumberTouched(false);
    setMaterialsTouched(false);
    setMetaTouched(false);
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
    setMetaTouched(true);
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
                    onChange={(e) => {
                      setMetaTouched(true);
                      setProjectName(e.target.value);
                    }}
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
                    onChange={(e) => {
                      setMetaTouched(true);
                      setLocation(e.target.value);
                    }}
                    placeholder="e.g. Mt. Labo, Camarines Norte"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 sm:py-1.5 text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-700">Prepared By / Lead</span>
                  <input
                    type="text"
                    value={preparedBy}
                    onChange={(e) => {
                      setMetaTouched(true);
                      setPreparedBy(e.target.value);
                    }}
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

            <DailyLogManpowerSection
              workers={workers}
              roles={ROLES}
              totalWorkers={totalPreviewWorkers}
              onAddWorkerRow={addWorkerRow}
              onOpenAddModal={() => openAddModal('worker')}
              onOpenEditModal={(w, idx) =>
                setModalTarget({ kind: 'worker', index: idx, item: { ...w } })
              }
              onRemoveWorkerRow={removeWorkerRow}
              onUpdateWorkerRow={updateWorkerRow}
            />

            <DailyLogMaterialsSection
              isVerticalMast={isVerticalMast}
              materialsOnSite={materialsOnSite}
              hauledItemsOnDateCount={hauledItemsOnDate.length}
              date={date}
              hasPrevLog={Boolean(prevLogForDraft)}
              prevLogDayNumber={prevLogForDraft?.dayNumber}
              editingLogId={editingLogId}
              onSyncHauling={() => {
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
              onAutoFillPrev={() => {
                if (!prevLogForDraft) return;
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
              onAddMaterialRow={addMaterialRow}
              onOpenAddModal={() => openAddModal('material')}
              onOpenEditModal={(item, idx) =>
                setModalTarget({ kind: 'material', index: idx, item: { ...item } })
              }
              onRemoveMaterialRow={removeMaterialRow}
              onUpdateMaterialRow={updateMaterialRow}
            />

            <DailyLogActivitiesSection
              isVerticalMast={isVerticalMast}
              activities={activities}
              activitiesSummary={activitiesSummary}
              onActivitiesSummaryChange={setActivitiesSummary}
              selectedFoundations={selectedFoundations}
              onToggleFoundation={toggleFoundation}
              foundations={foundations}
              verticalMastSections={verticalMastSections}
              verticalMastGuyLayers={verticalMastGuyLayers}
              activityStatuses={ACTIVITY_STATUS_OPTIONS}
              onAddActivityRow={addActivityRow}
              onOpenAddModal={() => openAddModal('activity')}
              onOpenEditModal={(act, idx) =>
                setModalTarget({ kind: 'activity', index: idx, item: { ...act } })
              }
              onRemoveActivityRow={removeActivityRow}
              onUpdateActivityRow={updateActivityRow}
            />

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

            <DailyLogSafetySection
              safetyOfficer={safetyOfficer}
              onSafetyOfficerChange={setSafetyOfficer}
              safetyLogs={safetyLogs}
              onAddRow={addSafetyRow}
              onOpenModal={(item, idx) =>
                setModalTarget({ kind: 'safety', index: idx, item: { ...item } })
              }
              onRemoveRow={removeSafetyRow}
              onUpdateRow={updateSafetyRow}
            />

            <DailyLogDocumentationSection
              documentationItems={documentationItems}
              onAddRow={addDocumentationRow}
              onOpenModal={(doc, idx) =>
                setModalTarget({
                  kind: 'documentation',
                  index: idx,
                  item: { ...doc },
                })
              }
              onRemoveRow={removeDocumentationRow}
              onUpdateRow={updateDocumentationRow}
              onUploadPhoto={handleUploadDocPhoto}
            />

            <button
              type="submit"
              className="w-full min-h-12 md:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl md:rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm md:text-xs font-bold py-3 md:py-2.5 px-4 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              {editingLogId ? 'Update Daily Log' : 'Save Daily Log'}
            </button>
          </div>
        </form>

        <DailyLogsHistoryFeed
          project={project}
          sortedDailyLogs={sortedDailyLogs}
          mobilePane={mobilePane}
          onLoadLogForEdit={handleLoadLogForEdit}
          onBatchPrint={() => setBatchPrintOpen(true)}
        />
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

      {batchPrintOpen && (
        <DailyLogBatchPrintModal
          project={project}
          onClose={() => setBatchPrintOpen(false)}
        />
      )}
    </div>
  );
}
