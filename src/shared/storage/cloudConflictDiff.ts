import type { FoundationRecord, SavedProjectRecord } from '@/entities/project/types';

export interface ConflictDiffItem {
  label: string;
  localVal: string;
  cloudVal: string;
  isDifferent: boolean;
}

export interface ConflictDiffSection {
  title: string;
  diffs: ConflictDiffItem[];
}

export interface ConflictDiffReport {
  hasDifferences: boolean;
  totalDifferenceCount: number;
  localVersion?: number;
  cloudVersion?: number;
  localUpdatedAt?: string;
  cloudUpdatedAt?: string;
  sections: ConflictDiffSection[];
}

/**
 * Computes human-readable side-by-side differences between local project state
 * and conflicting cloud state received from the server.
 */
export function computeProjectConflictDiff(
  localRecord: SavedProjectRecord,
  cloudRecord: SavedProjectRecord
): ConflictDiffReport {
  const sections: ConflictDiffSection[] = [];
  let totalDifferenceCount = 0;

  const addDiff = (
    section: ConflictDiffSection,
    label: string,
    localVal: string,
    cloudVal: string
  ) => {
    const isDifferent = localVal.trim() !== cloudVal.trim();
    if (isDifferent) totalDifferenceCount++;
    section.diffs.push({ label, localVal, cloudVal, isDifferent });
  };

  // 1. Metadata Section
  const metaSection: ConflictDiffSection = {
    title: 'Version & Metadata',
    diffs: [],
  };
  addDiff(
    metaSection,
    'Version',
    `v${localRecord.version ?? 1}`,
    `v${cloudRecord.version ?? 1}`
  );
  addDiff(
    metaSection,
    'Last Saved',
    localRecord.updatedAt ? new Date(localRecord.updatedAt).toLocaleString() : '—',
    cloudRecord.updatedAt ? new Date(cloudRecord.updatedAt).toLocaleString() : '—'
  );

  const localState = localRecord.state;
  const cloudState = cloudRecord.state;

  const localName = localState.reportDetails?.projectName?.trim() || localState.projectName;
  const cloudName = cloudState.reportDetails?.projectName?.trim() || cloudState.projectName;
  addDiff(metaSection, 'Project Name', localName, cloudName);

  const localContractor = localState.contractor ?? '—';
  const cloudContractor = cloudState.contractor ?? '—';
  addDiff(metaSection, 'Contractor', localContractor, cloudContractor);

  const localLocation = localState.reportDetails?.projectLocation?.trim() || localState.location;
  const cloudLocation = cloudState.reportDetails?.projectLocation?.trim() || cloudState.location;
  addDiff(metaSection, 'Location', localLocation, cloudLocation);

  const localType = localState.projectType ?? 'guyed_mast';
  const cloudType = cloudState.projectType ?? 'guyed_mast';
  addDiff(metaSection, 'Project Type', localType, cloudType);

  sections.push(metaSection);

  // 2. Foundations Progress Section
  const foundationSection: ConflictDiffSection = {
    title: 'Foundations & Progress',
    diffs: [],
  };

  const formatFoundationSummary = (f: FoundationRecord) => {
    const checklist = f.checklist ?? {};
    const completed = Object.values(checklist).filter(Boolean).length;
    const label = f.status.replace(/_/g, ' ');
    return `${label} (${completed} steps checked)`;
  };

  const localFoundations = localState.foundations ?? [];
  const cloudFoundations = cloudState.foundations ?? [];
  const cloudFoundationsById = new Map(cloudFoundations.map((f) => [f.id, f]));

  let foundationsDiffer = false;
  for (const lf of localFoundations) {
    const cf = cloudFoundationsById.get(lf.id);
    const localDesc = formatFoundationSummary(lf);
    const cloudDesc = cf ? formatFoundationSummary(cf) : 'Missing in Cloud';
    if (localDesc !== cloudDesc) {
      foundationsDiffer = true;
      addDiff(foundationSection, `Foundation ${lf.id} (${lf.name})`, localDesc, cloudDesc);
    }
  }

  // Check for foundations present in cloud but not local
  const localFoundationsById = new Map(localFoundations.map((f) => [f.id, f]));
  for (const cf of cloudFoundations) {
    if (!localFoundationsById.has(cf.id)) {
      foundationsDiffer = true;
      addDiff(
        foundationSection,
        `Foundation ${cf.id} (${cf.name})`,
        'Missing Locally',
        formatFoundationSummary(cf)
      );
    }
  }

  if (!foundationsDiffer) {
    foundationSection.diffs.push({
      label: 'All Foundations (13)',
      localVal: 'Identical milestones & checklists',
      cloudVal: 'Identical milestones & checklists',
      isDifferent: false,
    });
  }
  sections.push(foundationSection);

  // 3. Daily Logs Section
  const dailyLogsSection: ConflictDiffSection = {
    title: 'Daily Construction Logs',
    diffs: [],
  };

  const localLogs = localState.dailyLogs ?? [];
  const cloudLogs = cloudState.dailyLogs ?? [];

  addDiff(
    dailyLogsSection,
    'Total Logs Count',
    `${localLogs.length} logs recorded`,
    `${cloudLogs.length} logs recorded`
  );

  const localLogsById = new Map(localLogs.map((l) => [l.id, l]));
  const cloudLogsById = new Map(cloudLogs.map((l) => [l.id, l]));

  // Compare logs
  const allLogIds = Array.from(new Set([...localLogsById.keys(), ...cloudLogsById.keys()]));
  let logsDiffer = false;

  for (const id of allLogIds) {
    const localLog = localLogsById.get(id);
    const cloudLog = cloudLogsById.get(id);

    if (localLog && !cloudLog) {
      logsDiffer = true;
      addDiff(
        dailyLogsSection,
        `Day #${localLog.dayNumber} (${localLog.date})`,
        `Present locally (Workers: ${localLog.totalWorkers}, Weather: ${localLog.weather})`,
        'Missing in cloud'
      );
    } else if (!localLog && cloudLog) {
      logsDiffer = true;
      addDiff(
        dailyLogsSection,
        `Day #${cloudLog.dayNumber} (${cloudLog.date})`,
        'Missing locally',
        `Present in cloud (Workers: ${cloudLog.totalWorkers}, Weather: ${cloudLog.weather})`
      );
    } else if (localLog && cloudLog) {
      const localSummary = `Day #${localLog.dayNumber} · ${localLog.weather} · ${localLog.totalWorkers}w`;
      const cloudSummary = `Day #${cloudLog.dayNumber} · ${cloudLog.weather} · ${cloudLog.totalWorkers}w`;
      if (
        localLog.date !== cloudLog.date ||
        localLog.weather !== cloudLog.weather ||
        localLog.totalWorkers !== cloudLog.totalWorkers ||
        (localLog.activities?.length ?? 0) !== (cloudLog.activities?.length ?? 0)
      ) {
        logsDiffer = true;
        addDiff(
          dailyLogsSection,
          `Day #${localLog.dayNumber} (${localLog.date})`,
          localSummary,
          cloudSummary
        );
      }
    }
  }

  if (!logsDiffer && localLogs.length > 0) {
    dailyLogsSection.diffs.push({
      label: 'Log Entries Content',
      localVal: 'All entries identical',
      cloudVal: 'All entries identical',
      isDifferent: false,
    });
  }
  sections.push(dailyLogsSection);

  // 4. Manpower, Hauling & Payroll Section
  const manpowerSection: ConflictDiffSection = {
    title: 'Manpower, Hauling & Payroll',
    diffs: [],
  };

  const localCivilDays = localState.civilAttendance?.length ?? 0;
  const cloudCivilDays = cloudState.civilAttendance?.length ?? 0;
  addDiff(
    manpowerSection,
    'Civil Attendance Days',
    `${localCivilDays} days logged`,
    `${cloudCivilDays} days logged`
  );

  const localHaulingLogs = localState.haulingLogs?.length ?? 0;
  const cloudHaulingLogs = cloudState.haulingLogs?.length ?? 0;
  addDiff(
    manpowerSection,
    'Hauling Logs',
    `${localHaulingLogs} hauling logs`,
    `${cloudHaulingLogs} hauling logs`
  );

  const localPayrollSnapshots =
    (localState.civilPayrollHistory?.length ?? 0) +
    (localState.haulerPayrollHistory?.length ?? 0);
  const cloudPayrollSnapshots =
    (cloudState.civilPayrollHistory?.length ?? 0) +
    (cloudState.haulerPayrollHistory?.length ?? 0);
  addDiff(
    manpowerSection,
    'Payroll Snapshots',
    `${localPayrollSnapshots} snapshots saved`,
    `${cloudPayrollSnapshots} snapshots saved`
  );

  sections.push(manpowerSection);

  return {
    hasDifferences: totalDifferenceCount > 0,
    totalDifferenceCount,
    localVersion: localRecord.version,
    cloudVersion: cloudRecord.version,
    localUpdatedAt: localRecord.updatedAt,
    cloudUpdatedAt: cloudRecord.updatedAt,
    sections,
  };
}
