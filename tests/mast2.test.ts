import { describe, expect, it } from 'vitest';
import { resolveReportDetails } from '@/widgets/report/ReportLetterhead';
import {
  bagsToCuM,
  buildFoundationActivityReportData,
  buildNextDayMaterialsFromLog,
  buildOverallProjectStatusReportData,
  computeDailyLogMaterialRemaining,
  computeProjectMetrics,
  createDefaultDailyLogMaterials,
  cuMToBags,
  findPreviousDailyLogForDraft,
  formatDailyLogPlainText,
  formatDateWithWeekday,
  getDailyLogDelayRows,
  getDailyLogEquipmentRows,
  getDailyLogMaterialRows,
  getDailyLogSafetyRows,
  getDailyLogVisitorRows,
  getReportableInspections,
  getWeekdayName,
  kgToBags,
  sortDailyLogsNewestFirst,
  summarizeHaulingData,
} from '@/entities/project/calculations';
import {
  BAGS_PER_CUBIC_METER,
  DEFAULT_KG_PER_BAG,
  createCleanBaselineProject,
  createInitialFoundations,
  createSampleMast2Project,
  checklistFromStatus,
  deriveStatusFromChecklist,
  emptyChecklist,
  resolveFoundationSpec,
} from '@/entities/project/mast2Baseline';
import {
  buildSectionActivityReportData,
  buildVerticalMastInspectionRows,
  buildVerticalMastOverviewData,
  computeVerticalMastMetrics,
} from '@/entities/project/verticalMastCalculations';
import {
  GUY_LAYER_DEFINITIONS,
  VERTICAL_MAST_DESIGN_SPECS,
  createCleanVerticalMastProject,
  createSampleVerticalMastProject,
  getSectionGuyChecklistItems,
} from '@/entities/project/verticalMastBaseline';
import { shouldOpenLauncherOnStartup, useUiStore } from '@/shared/state/uiStore';
import { DEFAULT_REPORT_LOGOS, resolveReportLogos } from '@/shared/assets/defaultLogos';
import { getMastElevationGeometry } from '@/widgets/mast-tower/VerticalMastElevation2D';
import { applyPrintPageStyle } from '@/widgets/report/ReportLetterhead';
import {
  parseLegacyWorkspacePayload,
  parseWorkspacePayload,
  useProjectStore,
} from '@/shared/state/projectStore';
import { idbGet, idbSet, isIndexedDbAvailable } from '@/shared/storage/indexedDb';
import {
  HAULING_CREDIT_BLOCK_KG,
  HAULING_RATE_PER_BLOCK_PHP,
  buildCentralizedDailyLogMaterials,
  computeCentralMaterialStatuses,
  computeHaulerCreditLedgers,
  createDefaultCentralMaterials,
  syncDailyLogMaterialsWithHauling,
} from '@/entities/project/haulingInventory';
import { usePwaStore } from '@/shared/pwa/pwaManager';
import {
  computeCalloutBoxWidth,
  getSelectionLeaderLayout,
} from '@/widgets/layout-plan/GroundAnchorPlan2D';

describe('Mast 2 Baseline & Conversions', () => {
  it('creates 13 foundations (1 Principal + 12 Pull Anchors across 3 sectors)', () => {
    const foundations = createInitialFoundations();
    expect(foundations).toHaveLength(13);
    expect(foundations.filter((f) => f.type === 'principal')).toHaveLength(1);
    expect(foundations.filter((f) => f.type === 'anchor_a')).toHaveLength(3);
    expect(foundations.filter((f) => f.type === 'anchor_b')).toHaveLength(6);
    expect(foundations.filter((f) => f.type === 'anchor_c')).toHaveLength(3);
  });

  it('converts between kg, bags, and cubic meters (40kg = 1 bag, 36 bags/cu.m)', () => {
    expect(DEFAULT_KG_PER_BAG).toBe(40);
    expect(kgToBags(40)).toBe(1);
    expect(kgToBags(100)).toBe(2.5);
    expect(BAGS_PER_CUBIC_METER).toBe(36);
    expect(bagsToCuM(36)).toBe(1);
    expect(bagsToCuM(72)).toBe(2);
    expect(cuMToBags(28)).toBe(1008);
  });

  it('derives foundation status accurately from checklist progression', () => {
    const c = emptyChecklist();
    expect(deriveStatusFromChecklist(c)).toBe('not_started');
    c.excavationVerified = true;
    expect(deriveStatusFromChecklist(c)).toBe('excavated');
    c.excavationInspectionDone = true;
    expect(deriveStatusFromChecklist(c)).toBe('excavation_inspected');
    c.leanConcretePoured = true;
    expect(deriveStatusFromChecklist(c)).toBe('lean_concrete');
    c.rebarCageInstalled = true;
    expect(deriveStatusFromChecklist(c)).toBe('rebar_and_anchor');
    c.formworkBraced = true;
    expect(deriveStatusFromChecklist(c)).toBe('formwork');
    c.concretePoured = true;
    expect(deriveStatusFromChecklist(c)).toBe('concreted');
    c.curingStarted = true;
    expect(deriveStatusFromChecklist(c)).toBe('curing');
    c.curingAndBackfillDone = true;
    expect(deriveStatusFromChecklist(c)).toBe('completed');
  });

  it('maps checklist accurately from status in checklistFromStatus', () => {
    const excavatedChecklist = checklistFromStatus('excavated');
    expect(excavatedChecklist.excavationVerified).toBe(true);
    expect(excavatedChecklist.excavationInspectionDone).toBe(false);

    const inspectedChecklist = checklistFromStatus('excavation_inspected');
    expect(inspectedChecklist.excavationVerified).toBe(true);
    expect(inspectedChecklist.excavationInspectionDone).toBe(true);
    expect(inspectedChecklist.leanConcretePoured).toBe(false);
  });

  it('computes project hauling and progress metrics accurately', () => {
    const clean = createCleanBaselineProject();
    const cleanMetrics = computeProjectMetrics(clean);
    expect(cleanMetrics.completedCount).toBe(0);
    expect(cleanMetrics.cementHauledBags).toBe(0);

    const sample = createSampleMast2Project();
    const sampleMetrics = computeProjectMetrics(sample);
    expect(sampleMetrics.completedCount).toBe(2); // PF-0 and I-C1
    expect(sampleMetrics.pouredOrBeyondCount).toBe(3); // PF-0, I-C1, II-C1
    expect(sampleMetrics.cementHauledBags).toBe(164);
    expect(sampleMetrics.sandHauledBags).toBe(160);
    expect(sampleMetrics.gravelHauledBags).toBe(304);
    expect(sampleMetrics.totalManDays).toBe(46);
  });

  it('summarizes daily Trip 1 & Trip 2 hauling per individual hauler for settlement', () => {
    const { dailySheets, settlements } = summarizeHaulingData([
      {
        id: 't1-cem',
        date: '2026-11-13',
        haulerName: 'Christian Avila',
        tripNumber: 1,
        horsesUsed: 1,
        tripsCount: 1,
        material: 'cement',
        unitLabel: 'bags',
        quantity: 2,
        kgPerUnit: 40,
        totalKg: 80,
        equivalentCuM: 0,
        destinationFoundationId: 'STOCKPILE',
        weather: 'Field Log',
        remarks: '',
      },
      {
        id: 't2-sand',
        date: '2026-11-13',
        haulerName: 'Christian Avila',
        tripNumber: 2,
        horsesUsed: 1,
        tripsCount: 1,
        material: 'sand',
        unitLabel: 'sacks',
        quantity: 3,
        kgPerUnit: 40,
        totalKg: 120,
        equivalentCuM: 0.08,
        destinationFoundationId: 'STOCKPILE',
        weather: 'Field Log',
        remarks: '',
      },
      {
        id: 't2-bar',
        date: '2026-11-13',
        haulerName: 'Christian Avila',
        tripNumber: 2,
        horsesUsed: 1,
        tripsCount: 0,
        material: 'chair_bar_a',
        unitLabel: 'pcs',
        quantity: 5,
        kgPerUnit: 8,
        totalKg: 40,
        equivalentCuM: 0,
        destinationFoundationId: 'I-A1',
        weather: 'Field Log',
        remarks: '',
      },
    ]);

    expect(dailySheets).toHaveLength(1);
    expect(dailySheets[0].haulers[0].tripsCompleted).toBe(2);
    expect(dailySheets[0].haulers[0].trip1).toHaveLength(1);
    expect(dailySheets[0].haulers[0].trip2).toHaveLength(2);
    expect(dailySheets[0].haulers[0].dailyTotalBags).toBe(5); // 80kg + 120kg = 200kg -> 5 bags
    expect(settlements[0].tripsCompleted).toBe(2);
    expect(settlements[0].totalBags).toBe(5);
    expect(settlements[0].rebarAndHardwarePcs).toBe(5);
  });
});

describe('Workspace UI & Foundation Activity Report', () => {
  it('builds foundation activity report data, custom specs, and inspection items', () => {

    const project = createSampleMast2Project();
    const metrics = computeProjectMetrics(project);
    const padA = project.foundations.find((f) => f.id === 'I-A1')!;

    // Manual materials default to 0 On site until manually entered
    const emptyReport = buildFoundationActivityReportData(project, metrics, padA);
    expect(emptyReport.materials.every((m) => m.onSite === 0)).toBe(true);

    // Persisted manualMaterials on FoundationRecord are reflected in the report
    padA.manualMaterials = {
      sand: { onSite: 45, remarks: 'Counted at pad' },
    };
    const report = buildFoundationActivityReportData(project, metrics, padA, {
      cement: { onSite: 20, remarks: 'Partial warehouse draw' },
      main_rebar: { onSite: 40 },
    });
    expect(report.materials.find((m) => m.key === 'sand')?.onSite).toBe(45);
    expect(report.materials.find((m) => m.key === 'sand')?.needed).toBe(65);

    expect(report.tasks).toHaveLength(8);
    expect(report.tasks[0].done).toBe(false); // Starts clean without pre-filled excavation default
    expect(report.tasks.map((t) => t.description)).toEqual([
      'Excavated',
      'Excavation Inspected & Retrofitted',
      'Lean Concrete Poured',
      'Rebar, Ground Anchor Rod, and Formworks Installed',
      'Rebar, Ground Anchor Rod, and Formworks Inspected',
      'Concrete Poured',
      'Cured',
      'Backfilled',
    ]);
    const pf0Report = buildFoundationActivityReportData(
      project,
      metrics,
      project.foundations.find((f) => f.id === 'PF-0')!
    );
    expect(pf0Report.tasks[3].description).toBe(
      'Rebar, Bolt Frame, and Formworks Installed'
    );
    expect(pf0Report.tasks[4].description).toBe(
      'Rebar, Bolt Frame, and Formworks Inspected'
    );
    expect(pf0Report.rebarDetails[0]).toBe('Main Rebar (M_02): 40 pcs');
    expect(pf0Report.rebarDetails[1]).toBe('Chair Bar (M_26): 9 pcs');
    expect(pf0Report.specDetails).toEqual({
      size: '2.0 × 2.0 × 1.0 m',
      foundationVolume: '4.0 m³ (Class AA)',
      leanConcreteVolume: '0.20 m³ (50 mm)',
      excavationDepth: '1.05 m (1,050 mm from N.G.L.)',
      cover: '50 mm',
      mainRebar: 'M_02: 40 pcs (Ø20 mm @ 200 mm O.C.)',
      chairBar: 'M_26: 9 pcs',
      towerAccessoriesLabel: 'Bolt Frame',
      towerAccessories:
        'M27 Bolt Frame (3×M27 Embedded Bolts, 1200mm, 400×400 Locating Plate)',
    });

    useProjectStore.getState().updateFoundationCustomSpecs('PF-0', {
      cover: '75 mm',
      excavationDepth: '1.15 m (1,150 mm)',
      towerAccessories: 'M27 Bolt Frame (Verified)',
    });
    const editedPf0 = useProjectStore
      .getState()
      .project.foundations.find((f) => f.id === 'PF-0')!;
    const editedReport = buildFoundationActivityReportData(project, metrics, editedPf0);
    expect(editedReport.specDetails.cover).toBe('75 mm');
    expect(editedReport.specDetails.excavationDepth).toBe('1.15 m (1,150 mm)');
    expect(editedReport.specDetails.towerAccessories).toBe('M27 Bolt Frame (Verified)');

    useProjectStore.getState().resetFoundationCustomSpecs('PF-0');
    const resetPf0 = useProjectStore
      .getState()
      .project.foundations.find((f) => f.id === 'PF-0')!;
    expect(resetPf0.customSpecs).toBeUndefined();
    expect(report.inspections.map((i) => i.description)).toEqual([
      'Excavation Size & Depth (vs N.G.L.)',
      'Lean Concrete Bedding (Class A)',
      'Concrete Covers & Rebar Cage Height',
      'Main & Chair Rebar Size, Count, Cut & Spacing',
      'Rebar Lap Lengths (Outer / Inner)',
      'Ground Anchor Rod Installation & Alignment',
    ]);
    expect(report.inspections[0]?.planMeasurement).toContain('2000 × 2000 mm');
    expect(report.inspections[0]?.actualMeasurement).toBe('');

    // Verify PF-0 uses Bolt Frame wording & Anchor C uses 1500x1500mm + 32-bar plan specs, with no tower accessories
    expect(pf0Report.inspections.at(-1)?.description).toBe(
      'Bolt Frame (M27) Installation & Alignment'
    );
    expect(pf0Report.inspections.at(-1)?.planMeasurement).toContain('M27 Embedded Bolts');

    const padC = project.foundations.find((f) => f.id === 'I-C1')!;
    padC.inspectionChecklist = {
      ...padC.inspectionChecklist,
      excavation_size_depth: {
        status: 'Passed',
        actualMeasurement: '1505 × 1500 × 2055 mm',
        remarks: 'Verified with tape',
      },
    };
    const anchorCReport = buildFoundationActivityReportData(project, metrics, padC);
    expect(anchorCReport.inspections[0]?.planMeasurement).toContain('1500 × 1500 mm');
    expect(anchorCReport.inspections[0]?.actualMeasurement).toBe('1505 × 1500 × 2055 mm');
    expect(anchorCReport.inspections[3]?.planMeasurement).toContain('32 pcs @ 2.20 m');
    const serialized = JSON.stringify([pf0Report.inspections, anchorCReport.inspections]);
    expect(serialized).not.toMatch(/Guy Plate|U-Ring|NUT-3/i);

    padA.inspectionChecklist = {
      excavation_size_depth: {
        status: 'Passed',
        planMeasurement: '2050 × 2050 mm pad (custom field revision)',
        remarks: '2.05m verified with tape',
        photoDataUrl: 'data:image/jpeg;base64,test',
        photoName: 'pit.jpg',
      },
      lean_concrete_50mm: {
        status: 'Pending',
        planMeasurement: '   ',
        remarks: 'Cleared by engineer',
      },
    };
    const reportWithInspection = buildFoundationActivityReportData(project, metrics, padA);
    expect(reportWithInspection.inspections[0].status).toBe('Passed');
    expect(reportWithInspection.inspections[0].planMeasurement).toBe(
      '2050 × 2050 mm pad (custom field revision)'
    );
    expect(reportWithInspection.inspections[0].photoDataUrl).toBe(
      'data:image/jpeg;base64,test'
    );
    expect(reportWithInspection.inspections[1].planMeasurement).toBe('   ');
    const reportable = getReportableInspections(reportWithInspection.inspections);
    expect(reportable).toHaveLength(5);
    expect(reportable.some((r) => r.key === 'lean_concrete_50mm')).toBe(false);

    expect(report.materials.map((m) => m.description)).toEqual([
      'Cement',
      'Sand',
      'Gravel',
      'Main Rebar',
      'Chair Bar',
      'Phenolic',
    ]);
    const cementRow = report.materials.find((m) => m.key === 'cement')!;
    expect(cementRow.required).toBe(70);
    expect(cementRow.onSite).toBe(20);
    expect(cementRow.needed).toBe(50);
    expect(cementRow.remarks).toBe('Partial warehouse draw');
    const rebarRow = report.materials.find((m) => m.key === 'main_rebar')!;
    expect(rebarRow.needed).toBe(0);
    expect(rebarRow.remarks).toBe('For I-A1');
  });

  it('switches to Daily Logs tab and formats daily logs with project name, weather, manpower, materials, activities & other info', () => {
    expect(useUiStore.getState().activeAppTab).toBe('activity');
    useUiStore.getState().setActiveAppTab('daily_logs');
    expect(useUiStore.getState().activeAppTab).toBe('daily_logs');
    useUiStore.getState().setActiveAppTab('activity');

    const defaultMats = createDefaultDailyLogMaterials();
    expect(defaultMats).toHaveLength(6);
    expect(defaultMats[0].name).toBe('Cement');

    useProjectStore.getState().resetCleanBaseline();
    useProjectStore.getState().addDailyLog({
      projectName: 'Mt. Labo Relay Mast 2',
      location: 'Mt. Labo Peak',
      preparedBy: 'Engr. Christian',
      date: '2026-11-13',
      dayNumber: 1,
      weather: 'Foggy / Windy',
      weatherNotes: 'Low visibility after 3 PM',
      activitiesSummary: 'Excavated I-A1 pit and hauled rebar.',
      activities: [
        {
          id: 'act-1',
          foundationId: 'I-A1',
          description: 'Excavation to 2.0m depth',
          status: 'Ongoing',
          remarks: '1.6m reached',
        },
      ],
      foundationsWorked: ['I-A1'],
      workers: [
        { role: 'Foreman', count: 1, names: 'Emmarote', hours: 8 },
        { role: 'Laborer', count: 4, names: 'Site crew', hours: 8 },
      ],
      materialsOnSite: [
        {
          id: 'mat-cement',
          name: 'Cement',
          unit: 'bags',
          onSiteQty: 42,
          deliveredQty: 18,
          usedTodayQty: 15,
          remainingQty: computeDailyLogMaterialRemaining({
            onSiteQty: 42,
            deliveredQty: 18,
            usedTodayQty: 15,
          }),
          remarks: 'Covered with tarp',
        },
      ],
      documentationItems: [
        {
          id: 'doc-1',
          photoDataUrl: 'data:image/jpeg;base64,docphoto',
          photoName: 'pit.jpg',
          description: 'I-A1 pit excavation check',
          remarks: 'Verified depth',
        },
      ],
      cementUsedBags: 0,
      sandUsedBags: 0,
      gravelUsedBags: 0,
      equipmentOnSite: 'Shovels, dewatering pump',
      safetyAndVisitors: 'Morning PPE briefing done',
      nextDayPlan: 'Finish 2.0m depth & pour lean mix',
      issuesOrDelays: 'Muddy access trail',
    });

    const saved = useProjectStore.getState().project.dailyLogs[0];
    expect(saved.totalWorkers).toBe(5);
    const savedMats = getDailyLogMaterialRows(saved);
    expect(savedMats).toHaveLength(1);
    expect(savedMats[0].deliveredQty).toBe(18);
    expect(savedMats[0].remainingQty).toBe(45); // 42 + 18 - 15
    expect(getDailyLogEquipmentRows(saved)[0].name).toBe('Shovels, dewatering pump');
    expect(getDailyLogDelayRows(saved)[0].description).toBe('Muddy access trail');
    expect(getDailyLogVisitorRows(saved)[0].name).toBe('Morning PPE briefing done');
    expect(saved.documentationItems?.[0].description).toBe('I-A1 pit excavation check');

    // Auto-fill next day's On Site materials from Day 1 Remaining
    const nextDayMats = buildNextDayMaterialsFromLog(saved);
    const nextDayCement = nextDayMats.find((m) => m.name === 'Cement')!;
    expect(nextDayCement.onSiteQty).toBe(45);
    expect(nextDayCement.deliveredQty).toBe(0);
    expect(nextDayCement.usedTodayQty).toBe(0);
    expect(nextDayCement.remainingQty).toBe(45);

    const text = formatDailyLogPlainText(saved, useProjectStore.getState().project);
    expect(text).toContain('Mt. Labo Relay Mast 2');
    expect(text).toContain('Foggy / Windy (Low visibility after 3 PM)');
    expect(text).toContain('MANPOWER (5 workers):');
    expect(text).toContain('- 1x Foreman — Emmarote');
    expect(text).not.toContain('man-hrs');
    expect(text).toContain('[I-A1] Excavation to 2.0m depth — Ongoing');
    expect(text).toContain('Cement (bags): On Site 42, Delivered 18, Used 15, Remaining 45');
    expect(text).toContain('1x Shovels, dewatering pump — Operational');
    expect(text).toContain('[Photo attached] I-A1 pit excavation check (Verified depth)');

    useProjectStore.getState().updateDailyLog(saved.id, {
      workers: [{ role: 'Foreman', count: 2, names: 'Lead', hours: 0 }],
      equipmentItems: [{ id: 'eq-1', name: 'Concrete Mixer', qty: 2, status: 'Active', remarks: 'PF-0' }],
      delayItems: [{ id: 'del-1', description: 'Heavy fog', impact: 'Haul paused', remarks: 'Resumed 10AM' }],
      visitorItems: [{ id: 'vis-1', name: 'Engr. Reyes', roleOrCompany: 'Client QA', purpose: 'Rebar check', remarks: 'Approved' }],
    });
    const updated = useProjectStore.getState().project.dailyLogs[0];
    expect(updated.totalWorkers).toBe(2);
    expect(getDailyLogEquipmentRows(updated)[0].qty).toBe(2);
    expect(getDailyLogDelayRows(updated)[0].impact).toBe('Haul paused');
    expect(getDailyLogVisitorRows(updated)[0].roleOrCompany).toBe('Client QA');
  });

  it('cascades updated Day 1 remaining materials into Day 2 onSiteQty and remainingQty and seeds sample Day 18 balances', () => {
    const sample = createSampleMast2Project();
    const sortedSample = sortDailyLogsNewestFirst(sample.dailyLogs);
    expect(sortedSample[0].dayNumber).toBe(18);
    const day19Auto = buildNextDayMaterialsFromLog(sortedSample[0]);
    expect(day19Auto.find((m) => m.name === 'Cement')?.onSiteQty).toBe(84);

    useProjectStore.getState().resetCleanBaseline();
    useProjectStore.getState().addDailyLog({
      date: '2026-11-12',
      dayNumber: 1,
      weather: 'Sunny',
      activitiesSummary: 'Day 1 stock',
      foundationsWorked: ['PF-0'],
      workers: [{ role: 'Foreman', count: 1, names: 'Lead', hours: 0 }],
      materialsOnSite: [
        { id: 'mat-cement', name: 'Cement', unit: 'bags', onSiteQty: 10, deliveredQty: 50, usedTodayQty: 15, remainingQty: 45, remarks: '' },
      ],
      cementUsedBags: 0,
      sandUsedBags: 0,
      gravelUsedBags: 0,
      issuesOrDelays: 'None.',
    });
    const day1 = useProjectStore.getState().project.dailyLogs[0];

    useProjectStore.getState().addDailyLog({
      date: '2026-11-13',
      dayNumber: 2,
      weather: 'Sunny',
      activitiesSummary: 'Day 2 pour',
      foundationsWorked: ['PF-0'],
      workers: [{ role: 'Foreman', count: 1, names: 'Lead', hours: 0 }],
      materialsOnSite: [
        { id: 'mat-cement', name: 'Cement', unit: 'bags', onSiteQty: 45, deliveredQty: 10, usedTodayQty: 20, remainingQty: 35, remarks: '' },
      ],
      cementUsedBags: 0,
      sandUsedBags: 0,
      gravelUsedBags: 0,
      issuesOrDelays: 'None.',
    });
    const day2 = useProjectStore.getState().project.dailyLogs[0];

    expect(
      findPreviousDailyLogForDraft(useProjectStore.getState().project.dailyLogs, '2026-11-14', 3)?.id
    ).toBe(day2.id);

    // Edit Day 1 Used from 15 -> 5 (Remaining becomes 10 + 50 - 5 = 55)
    useProjectStore.getState().updateDailyLog(day1.id, {
      materialsOnSite: [
        { id: 'mat-cement', name: 'Cement', unit: 'bags', onSiteQty: 10, deliveredQty: 50, usedTodayQty: 5, remainingQty: 55, remarks: '' },
      ],
    });

    const refreshedDay2 = useProjectStore.getState().project.dailyLogs.find((l) => l.id === day2.id)!;
    const day2Cement = getDailyLogMaterialRows(refreshedDay2).find((m) => m.name === 'Cement')!;
    expect(day2Cement.onSiteQty).toBe(55);
    expect(day2Cement.remainingQty).toBe(45); // 55 + 10 - 20
  });

  it('formats weekday names on dates and supports separate Foundation Inspection tab and metadata', () => {
    expect(getWeekdayName('2026-11-10')).toBe('Tuesday');
    expect(formatDateWithWeekday('2026-11-10')).toBe('Tuesday, 2026-11-10');
    expect(getWeekdayName('2026-11-13')).toBe('Friday');

    useUiStore.getState().setActiveAppTab('inspection');
    expect(useUiStore.getState().activeAppTab).toBe('inspection');
    useUiStore.getState().setInspectionReportOpen(true);
    expect(useUiStore.getState().inspectionReportOpen).toBe(true);
    useUiStore.getState().setInspectionReportOpen(false);
    useUiStore.getState().setActiveAppTab('activity');

    useProjectStore.getState().resetCleanBaseline();
    useProjectStore.getState().updateFoundationInspectionMeta('PF-0', {
      inspectionDate: '2026-11-10',
      inspectorName: 'Engr. Christian',
      contractorRep: 'Foreman Emmarote',
      overallStatus: 'Passed',
      generalNotes: 'Ready for pour',
    });
    const pf0 = useProjectStore
      .getState()
      .project.foundations.find((f) => f.id === 'PF-0')!;
    expect(pf0.inspectionMeta?.inspectionDate).toBe('2026-11-10');
    expect(pf0.inspectionMeta?.overallStatus).toBe('Passed');
  });

  it('places all 13 multi-work layout tags without overlaps or legend collisions and persists safety logs', () => {
    const foundations = createInitialFoundations();
    const boxW = 74;
    const boxH = 18;
    const rects = foundations.map((f) => {
      const fx = 380 + f.xM * 4.2;
      const fy = 315 + f.zM * 4.2;
      const layout = getSelectionLeaderLayout(f, fx, fy, boxW, false);
      const top = layout.elbowY - boxH / 2;
      return {
        id: f.id,
        left: layout.boxX,
        right: layout.boxX + boxW,
        top,
        bottom: top + boxH,
      };
    });

    const overlaps = (
      a: { left: number; right: number; top: number; bottom: number },
      b: { left: number; right: number; top: number; bottom: number }
    ) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const legendRect = { left: 476, right: 718, top: 412, bottom: 654 };
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      expect(r.left).toBeGreaterThanOrEqual(30);
      expect(r.right).toBeLessThanOrEqual(730);
      expect(r.top).toBeGreaterThanOrEqual(8);
      expect(r.bottom).toBeLessThanOrEqual(680);
      expect(overlaps(r, legendRect)).toBe(false);
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(r, rects[j])).toBe(false);
      }
    }

    // Verify single-foundation callout pills dynamically size to fit PF-0 and anchor labels without clipping viewBox
    for (const f of foundations) {
      const fx = 380 + f.xM * 4.2;
      const fy = 315 + f.zM * 4.2;
      const label = `${f.id} · Principal Foundation (100%)`;
      const singleW = computeCalloutBoxWidth(label, true);
      expect(singleW).toBeGreaterThanOrEqual(220);
      const layout = getSelectionLeaderLayout(f, fx, fy, singleW, true);
      expect(layout.boxX).toBeGreaterThanOrEqual(30);
      expect(layout.boxX + singleW).toBeLessThanOrEqual(730);
    }

    useProjectStore.getState().resetCleanBaseline();
    useProjectStore.getState().addDailyLog({
      date: '2026-11-13',
      dayNumber: 1,
      weather: 'Light Rain',
      activitiesSummary: 'Safety check and formwork',
      foundationsWorked: ['PF-0', 'I-B1'],
      workers: [
        { role: 'Site Engineer', count: 1, names: 'Engr. Avila', hours: 8 },
        { role: 'Safety Officer', count: 1, names: 'Engr. Reyes', hours: 8 },
        { role: 'First Aider', count: 1, names: 'M. Cruz', hours: 8 },
        { role: 'Skilled', count: 3, names: 'Crew A', hours: 8 },
      ],
      cementUsedBags: 0,
      sandUsedBags: 0,
      gravelUsedBags: 0,
      safetyOfficer: 'Engr. Marco Reyes (SO2)',
      safetyLogs: [
        {
          id: 'saf-1',
          timeOrActivity: '07:30 Toolbox Talk',
          hazardOrFinding: 'Slippery footing near pit edge',
          actionTaken: 'Installed perimeter warning tape & rubber boots check',
          status: 'Action Taken',
        },
      ],
      issuesOrDelays: 'None.',
    });
    const saved = useProjectStore.getState().project.dailyLogs[0];
    expect(saved.safetyOfficer).toBe('Engr. Marco Reyes (SO2)');
    expect(getDailyLogSafetyRows(saved)).toHaveLength(1);
    const plain = formatDailyLogPlainText(saved, useProjectStore.getState().project);
    expect(plain).toContain('SAFETY LOGS (Safety Officer: Engr. Marco Reyes (SO2)):');
    expect(plain).toContain('07:30 Toolbox Talk');
    expect(plain.indexOf('ACTIVITIES & STATUS:')).toBeGreaterThan(-1);
    expect(plain.indexOf('SAFETY LOGS')).toBeGreaterThan(
      plain.indexOf('ACTIVITIES & STATUS:')
    );
    expect(plain.indexOf('MATERIALS ON SITE:')).toBeGreaterThan(
      plain.indexOf('SAFETY LOGS')
    );
  });

  it('syncs project metadata, logos, and signatories via updateReportDetails and resolveReportDetails', () => {
    useProjectStore.getState().resetCleanBaseline();
    useProjectStore.getState().updateReportDetails({
      projectName: 'Guyed Mast Tower – Mast 5',
      projectLocation: 'Daet, Camarines Norte',
      contractor: 'Apex Tower Civil Works',
      preparedBy: 'Engr. Juan Dela Cruz',
      clientName: 'PhilTower Consortium',
      referenceNo: 'REF-CIV-2026-005',
      revision: 'Rev. B',
      checkedBy: 'Engr. Maria Santos',
      approvedBy: 'Engr. Pedro Reyes',
      notes: 'All anchor rods torqued prior to concrete pour.',
      logoHeightPx: 54,
      logos: {
        left: {
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          caption: 'CLIENT',
        },
      },
    });

    const updated = useProjectStore.getState().project;
    expect(updated.projectName).toBe('Guyed Mast Tower – Mast 5');
    expect(updated.location).toBe('Daet, Camarines Norte');
    expect(updated.contractor).toBe('Apex Tower Civil Works');
    expect(updated.preparedBy).toBe('Engr. Juan Dela Cruz');
    expect(updated.reportDetails?.logos?.left?.caption).toBe('CLIENT');
    expect(updated.reportDetails?.clientName).toBe('PhilTower Consortium');

    const resolved = resolveReportDetails(updated, {
      reportDate: '2026-11-14',
      preparedBy: 'Inspector Override',
    });
    expect(resolved.projectName).toBe('Guyed Mast Tower – Mast 5');
    expect(resolved.projectLocation).toBe('Daet, Camarines Norte');
    expect(resolved.referenceNo).toBe('REF-CIV-2026-005');
    expect(resolved.revision).toBe('Rev. B');
    expect(resolved.reportDate).toBe('2026-11-14');
    expect(resolved.preparedBy).toBe('Inspector Override');
    expect(resolved.checkedBy).toBe('Engr. Maria Santos');
    expect(resolved.approvedBy).toBe('Engr. Pedro Reyes');
    expect(resolved.logoHeightPx).toBe(54);
    expect(resolved.logos?.left?.caption).toBe('CLIENT');
  });

  it('builds overall project status summary, stage distribution, sector rollups, and individual foundation rows', () => {
    useProjectStore.getState().resetCleanBaseline();
    useProjectStore.getState().updateFoundationStatus('PF-0', 'completed');
    useProjectStore.getState().updateFoundationStatus('I-C1', 'concreted');

    const project = useProjectStore.getState().project;
    const overview = buildOverallProjectStatusReportData(project);

    expect(overview.foundationRows).toHaveLength(13);
    expect(overview.metrics.completedCount).toBe(1);
    expect(overview.metrics.pouredOrBeyondCount).toBe(2);

    const pf0Row = overview.foundationRows.find((r) => r.id === 'PF-0')!;
    expect(pf0Row.status).toBe('completed');
    expect(pf0Row.progressPct).toBe(100);
    expect(pf0Row.completedSteps).toBe(8);

    const c1Row = overview.foundationRows.find((r) => r.id === 'I-C1')!;
    expect(c1Row.status).toBe('concreted');
    expect(c1Row.progressPct).toBe(80);

    const completedStage = overview.stageCounts.find((s) => s.status === 'completed')!;
    expect(completedStage.count).toBe(1);
    expect(completedStage.foundationIds).toEqual(['PF-0']);

    const sectorI = overview.sectorSummaries.find((s) => s.sector === 'I')!;
    expect(sectorI.foundationCount).toBe(4);
    expect(sectorI.pouredCount).toBe(1);

    useUiStore.getState().setActiveAppTab('project_status');
    useUiStore.getState().setOverallReportOpen(true);
    expect(useUiStore.getState().activeAppTab).toBe('project_status');
    expect(useUiStore.getState().overallReportOpen).toBe(true);
    useUiStore.getState().setOverallReportOpen(false);
    useUiStore.getState().setActiveAppTab('activity');
  });

  it('allows adding, editing, removing, and resetting foundation inspection checklist items', () => {
    useProjectStore.getState().resetCleanBaseline();

    // Add custom item
    useProjectStore.getState().addFoundationInspectionItem('I-A1', {
      description: 'Concrete Slump & Temperature Check',
      planMeasurement: '100 ± 25 mm slump; < 32 °C',
    });
    let pad = useProjectStore.getState().project.foundations.find((f) => f.id === 'I-A1')!;
    let report = buildFoundationActivityReportData(useProjectStore.getState().project, null, pad);
    expect(report.inspections).toHaveLength(7);
    const customRow = report.inspections.find((i) => i.isCustom)!;
    expect(customRow.description).toBe('Concrete Slump & Temperature Check');
    expect(customRow.planMeasurement).toBe('100 ± 25 mm slump; < 32 °C');

    // Edit built-in & custom item descriptions and plan measurements
    useProjectStore.getState().updateFoundationInspectionItem('I-A1', 'excavation_size_depth', {
      description: 'Pit Dimensions & Subgrade Level',
      planMeasurement: '2050 × 2050 mm; depth 2050 mm',
      status: 'Passed',
    });
    useProjectStore.getState().updateFoundationInspectionItem('I-A1', customRow.key, {
      description: 'Slump Cone & Mix Temp',
      actualMeasurement: '105 mm / 29 °C',
      status: 'Passed',
    });

    pad = useProjectStore.getState().project.foundations.find((f) => f.id === 'I-A1')!;
    report = buildFoundationActivityReportData(useProjectStore.getState().project, null, pad);
    expect(report.inspections[0].description).toBe('Pit Dimensions & Subgrade Level');
    expect(report.inspections[0].planMeasurement).toBe('2050 × 2050 mm; depth 2050 mm');
    const editedCustom = report.inspections.find((i) => i.key === customRow.key)!;
    expect(editedCustom.description).toBe('Slump Cone & Mix Temp');
    expect(editedCustom.actualMeasurement).toBe('105 mm / 29 °C');

    // Remove a built-in item and the custom item
    useProjectStore.getState().removeFoundationInspectionItem('I-A1', 'lean_concrete_50mm');
    useProjectStore.getState().removeFoundationInspectionItem('I-A1', customRow.key);
    pad = useProjectStore.getState().project.foundations.find((f) => f.id === 'I-A1')!;
    report = buildFoundationActivityReportData(useProjectStore.getState().project, null, pad);
    expect(report.inspections).toHaveLength(5);
    expect(report.inspections.some((i) => i.key === 'lean_concrete_50mm')).toBe(false);
    expect(report.inspections.some((i) => i.key === customRow.key)).toBe(false);

    // Reset checklist restores all 6 baseline items cleanly
    useProjectStore.getState().resetFoundationInspectionChecklist('I-A1');
    pad = useProjectStore.getState().project.foundations.find((f) => f.id === 'I-A1')!;
    report = buildFoundationActivityReportData(useProjectStore.getState().project, null, pad);
    expect(report.inspections).toHaveLength(6);
    expect(report.inspections[0].description).toBe('Excavation Size & Depth (vs N.G.L.)');
    expect(report.inspections[0].status).toBe('Pending');
    expect(report.inspections.some((i) => i.key === 'lean_concrete_50mm')).toBe(true);
  });

  it('creates, switches, duplicates, imports, and deletes multiple isolated projects cleanly', () => {
    const firstId = useProjectStore.getState().activeProjectId;
    useProjectStore.getState().resetCleanBaseline();
    useProjectStore.getState().updateReportDetails({
      projectName: 'Mast 2 — Alpha',
      referenceNo: 'REF-ALPHA',
      logos: {
        left: { dataUrl: 'data:image/png;base64,alphaLogo', caption: 'CLIENT' },
      },
    });
    useProjectStore.getState().updateFoundationStatus('PF-0', 'completed');

    // Create a second clean project inheriting letterhead logos
    const secondId = useProjectStore.getState().createProject({
      projectName: 'Mast 3 — Beta',
      location: 'Naga City Site',
      referenceNo: 'REF-BETA',
      towerHeightM: 90,
      template: 'clean',
      copyLogosFromCurrent: true,
    });
    expect(useProjectStore.getState().activeProjectId).toBe(secondId);
    expect(useProjectStore.getState().project.projectName).toBe('Mast 3 — Beta');
    expect(useProjectStore.getState().project.towerHeightM).toBe(90);
    expect(useProjectStore.getState().project.reportDetails?.logos?.left?.caption).toBe('CLIENT');
    expect(
      useProjectStore.getState().project.foundations.find((f) => f.id === 'PF-0')?.status
    ).toBe('not_started');

    // Switch back to Alpha and verify isolation
    useProjectStore.getState().switchProject(firstId);
    expect(useProjectStore.getState().project.reportDetails?.projectName).toBe('Mast 2 — Alpha');
    expect(
      useProjectStore.getState().project.foundations.find((f) => f.id === 'PF-0')?.status
    ).toBe('completed');

    // Duplicate Alpha
    const copyId = useProjectStore.getState().duplicateProject(firstId, 'Mast 2 — Alpha Backup')!;
    expect(copyId).toBeTruthy();
    expect(useProjectStore.getState().project.projectName).toBe('Mast 2 — Alpha Backup');
    useProjectStore.getState().updateFoundationStatus('PF-0', 'excavated');
    // Original Alpha remains 'completed'
    const alphaRecord = useProjectStore.getState().projects.find((p) => p.id === firstId)!;
    expect(alphaRecord.state.foundations.find((f) => f.id === 'PF-0')?.status).toBe('completed');

    // Import JSON as new project
    const exported = useProjectStore.getState().exportProjectJson();
    const importedId = useProjectStore.getState().importProjectAsNew(exported);
    expect(useProjectStore.getState().projects.some((p) => p.id === importedId)).toBe(true);

    // UI browser toggle
    expect(useUiStore.getState().projectBrowserOpen).toBe(false);
    useUiStore.getState().setProjectBrowserOpen(true);
    expect(useUiStore.getState().projectBrowserOpen).toBe(true);
    useUiStore.getState().setProjectBrowserOpen(false);

    // Delete created extra projects
    useProjectStore.getState().deleteProject(importedId);
    useProjectStore.getState().deleteProject(copyId);
    useProjectStore.getState().deleteProject(secondId);
    expect(useProjectStore.getState().activeProjectId).toBe(firstId);
  });

  it('creates a Vertical Mast Tower project with ZT-120-01 specs, 41 sections & 16 guy layers', () => {
    const mastId = useProjectStore.getState().createProject({
      projectType: 'vertical_mast',
      projectName: 'Philippines 120m MET MAST — Tower Erection',
      location: 'Camarines Norte Ridge',
      template: 'clean',
    });

    const project = useProjectStore.getState().project;
    expect(project.projectType).toBe('vertical_mast');
    expect(project.foundations).toHaveLength(13);
    expect(project.verticalMast?.sections).toHaveLength(41);
    expect(project.verticalMast?.guyLayers).toHaveLength(16);
    expect(GUY_LAYER_DEFINITIONS).toHaveLength(16);
    expect(VERTICAL_MAST_DESIGN_SPECS.drawingNo).toBe('ZT-120-01');

    const s01 = project.verticalMast!.sections.find((s) => s.id === 'S01')!;
    const s03 = project.verticalMast!.sections.find((s) => s.id === 'S03')!;
    const s40 = project.verticalMast!.sections.find((s) => s.id === 'S40')!;
    const s41 = project.verticalMast!.sections.find((s) => s.id === 'S41')!;
    expect(s01.legSpec).toContain('89');
    expect(s03.hasPlatform).toBe(true);
    expect(s40.hasLightningRod).toBe(false);
    expect(s41.hasLightningRod).toBe(true);
    expect(s41.guyLayerIds).toHaveLength(0);
    expect(s41.elevationFromM).toBe(120);
    expect(s41.elevationToM).toBe(123);

    // Simplified tower leg activity checklist: single "Tower Leg Installed" step
    useProjectStore.getState().toggleTowerSectionChecklistItem('S01', 'plumbedAndInspected');
    expect(
      useProjectStore.getState().project.verticalMast!.sections.find((s) => s.id === 'S01')!.status
    ).toBe('plumbed_verified');

    // Batch update sections S02..S05 to Installed
    useProjectStore.getState().batchUpdateTowerSectionRange(2, 5, 'plumbed_verified');
    const s05 = useProjectStore.getState().project.verticalMast!.sections.find((s) => s.id === 'S05')!;
    expect(s05.status).toBe('plumbed_verified');

    // Update all 3 sectors of Guy Layer L01 -> status becomes tensioned_verified
    useProjectStore.getState().updateGuyLayerSector('L01', 'I', {
      pulled: true,
      terminated: true,
      tensioned: true,
      tensionKn: '16.5',
    });
    useProjectStore.getState().updateGuyLayerSector('L01', 'II', {
      pulled: true,
      terminated: true,
      tensioned: true,
      tensionKn: '16.4',
    });
    useProjectStore.getState().updateGuyLayerSector('L01', 'III', {
      pulled: true,
      terminated: true,
      tensioned: true,
      tensionKn: '16.6',
    });
    const l01 = useProjectStore.getState().project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    expect(l01.status).toBe('tensioned_verified');

    const metrics = computeVerticalMastMetrics(useProjectStore.getState().project);
    expect(metrics.erectedSections).toBe(5);
    expect(metrics.erectedHeightM).toBe(15);
    expect(metrics.tensionedGuyLayers).toBe(1);
    expect(metrics.tensionedStrands).toBe(3);

    const overview = buildVerticalMastOverviewData(useProjectStore.getState().project);
    expect(overview.projectedAnchorStatuses.get('PF-0')).toBe('completed');
    expect(overview.projectedAnchorStatuses.get('I-C1')).toBe('rebar_and_anchor'); // L01 tensioned, L02-L03 pending on C1
    expect(overview.anchorGuyStates['I-C1'].stage).toBe('guy_1');
    expect(overview.anchorGuyStates['I-C1'].anchoredCount).toBe(1);
    expect(overview.anchorGuyStates['I-C1'].totalGuys).toBe(4);
    expect(overview.anchorGuyStates['II-C1'].stage).toBe('guy_1');
    expect(overview.anchorGuyStates['I-B1'].stage).toBe('pending');

    // Load sample data and check realistic partial progress
    useProjectStore.getState().loadSampleData();
    const sampleMetrics = computeVerticalMastMetrics(useProjectStore.getState().project);
    expect(sampleMetrics.overallProgressPct).toBeGreaterThan(20);
    expect(sampleMetrics.erectedSections).toBeGreaterThan(10);

    // Flexible mast inspection add/edit/remove/reset on section & guy layer
    useProjectStore.getState().addMastInspectionItem('guy_layer', 'L01', {
      description: 'Turnbuckle safety wire lock check',
      planMeasurement: 'Locked w/ stainless safety pin',
    });
    let l01Updated = useProjectStore.getState().project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    let rows = buildVerticalMastInspectionRows('guy_layer', undefined, l01Updated);
    const customRow = rows.find((r) => r.description === 'Turnbuckle safety wire lock check')!;
    expect(customRow).toBeTruthy();

    useProjectStore.getState().updateMastInspectionItem('guy_layer', 'L01', customRow.key, {
      status: 'Passed',
      actualMeasurement: 'Verified all 3 sectors',
    });
    l01Updated = useProjectStore.getState().project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    rows = buildVerticalMastInspectionRows('guy_layer', undefined, l01Updated);
    expect(rows.find((r) => r.key === customRow.key)?.status).toBe('Passed');

    useProjectStore.getState().removeMastInspectionItem('guy_layer', 'L01', customRow.key);
    useProjectStore.getState().resetMastInspectionChecklist('guy_layer', 'L01');
    l01Updated = useProjectStore.getState().project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    rows = buildVerticalMastInspectionRows('guy_layer', undefined, l01Updated);
    expect(rows.some((r) => r.key === customRow.key)).toBe(false);
    expect(rows.length).toBeGreaterThanOrEqual(4);

    // Clean up extra project
    useProjectStore.getState().deleteProject(mastId);
  });

  it('preserves browser-controlled print orientation without injecting @page locks', () => {
    const store = useUiStore.getState();
    expect(store.printPaperSize).toBe('A4');
    expect(store.printOrientation).toBe('portrait');

    expect(() => applyPrintPageStyle()).not.toThrow();
  });

  it('integrates attached guy cable checklist steps into tower sections', () => {
    const mastId = useProjectStore.getState().createProject({
      projectType: 'vertical_mast',
      projectName: 'Mast Checklist Cable Test',
      location: 'Site X',
      contractor: 'Crew Y',
      preparedBy: 'Eng Z',
      template: 'clean',
    });

    const vm0 = useProjectStore.getState().project.verticalMast!;
    const s02 = vm0.sections.find((s) => s.id === 'S02')!;
    const s03 = vm0.sections.find((s) => s.id === 'S03')!;
    const l01 = vm0.guyLayers.find((g) => g.id === 'L01')!;

    expect(getSectionGuyChecklistItems(undefined)).toEqual([]);
    const guySteps = getSectionGuyChecklistItems(l01);
    expect(guySteps.map((s) => `${s.stepNumber}. ${s.label}`)).toEqual([
      '2. Sector I (30°) · Anchor I-C1 installed',
      '3. Sector II (150°) · Anchor II-C1 installed',
      '4. Sector III (270°) · Anchor III-C1 installed',
      '5. All Cables Tensioned',
    ]);

    expect(buildSectionActivityReportData(s02).tasks).toHaveLength(1);
    const s03ReportBefore = buildSectionActivityReportData(s03, l01);
    expect(s03ReportBefore.tasks).toHaveLength(5);
    expect(s03ReportBefore.tasks.every((t) => !t.done)).toBe(true);

    // Erect S01-S03 bottom-up before installing L01 (attached to S03), then toggle Sector I & II installed
    useProjectStore.getState().batchUpdateTowerSectionRange(1, 3, 'plumbed_verified');
    useProjectStore.getState().toggleGuyLayerSectorInstalled('L01', 'I');
    useProjectStore.getState().toggleGuyLayerSectorInstalled('L01', 'II');
    let updatedL01 = useProjectStore
      .getState()
      .project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    expect(updatedL01.sectors.I.terminated).toBe(true);
    expect(updatedL01.sectors.II.terminated).toBe(true);
    expect(updatedL01.sectors.III.terminated).toBe(false);
    expect(updatedL01.status).toBe('strands_pulled');

    // Toggle Sector III installed -> anchored
    useProjectStore.getState().toggleGuyLayerSectorInstalled('L01', 'III');
    updatedL01 = useProjectStore
      .getState()
      .project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    expect(updatedL01.status).toBe('anchored');

    // Toggle All Cables Tensioned -> tensioned_verified
    useProjectStore.getState().toggleGuyLayerAllTensioned('L01');
    updatedL01 = useProjectStore
      .getState()
      .project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    expect(updatedL01.status).toBe('tensioned_verified');
    expect(updatedL01.sectors.I.tensioned).toBe(true);
    expect(updatedL01.sectors.II.tensioned).toBe(true);
    expect(updatedL01.sectors.III.tensioned).toBe(true);

    const s03Updated = useProjectStore
      .getState()
      .project.verticalMast!.sections.find((s) => s.id === 'S03')!;
    const s03ReportAfter = buildSectionActivityReportData(s03Updated, updatedL01);
    expect(s03ReportAfter.tasks.slice(1).every((t) => t.done)).toBe(true);

    // Toggling All Cables Tensioned off keeps anchors installed cleanly
    useProjectStore.getState().toggleGuyLayerAllTensioned('L01');
    updatedL01 = useProjectStore
      .getState()
      .project.verticalMast!.guyLayers.find((g) => g.id === 'L01')!;
    expect(updatedL01.status).toBe('anchored');
    expect(updatedL01.sectors.I.terminated).toBe(true);
    expect(updatedL01.sectors.I.tensioned).toBe(false);

    useProjectStore.getState().deleteProject(mastId);
  });

  it('combines Foundation and Vertical Mast phases via setProjectPhase without losing either phase data', () => {
    const unifiedId = useProjectStore.getState().createProject({
      projectType: 'foundation',
      projectName: 'Unified Tower Project',
      location: 'Site Unified',
      contractor: 'Contractor U',
      preparedBy: 'Engineer U',
      template: 'clean',
    });

    // Newly created foundation project also initializes verticalMast (41 sections & 16 guy layers)
    let state = useProjectStore.getState().project;
    expect(state.projectType).toBe('foundation');
    expect(state.foundations).toHaveLength(13);
    expect(state.verticalMast?.sections).toHaveLength(41);
    expect(state.verticalMast?.guyLayers).toHaveLength(16);

    // Record foundation progress
    useProjectStore.getState().updateFoundationStatus('PF-0', 'completed');
    useProjectStore.getState().toggleFoundationChecklistItem('I-A1', 'excavationVerified');

    // Toggle to Vertical Mast Phase and record mast + cable progress
    useProjectStore.getState().setProjectPhase('vertical_mast');
    state = useProjectStore.getState().project;
    expect(state.projectType).toBe('vertical_mast');
    expect(state.foundations.find((f) => f.id === 'PF-0')?.status).toBe('completed');

    useProjectStore.getState().batchUpdateTowerSectionRange(1, 3, 'plumbed_verified');
    useProjectStore.getState().toggleGuyLayerSectorInstalled('L01', 'I');

    // Toggle back to Foundation Phase and confirm both foundation and vertical mast progress remain intact
    useProjectStore.getState().setProjectPhase('foundation');
    state = useProjectStore.getState().project;
    expect(state.projectType).toBe('foundation');
    expect(state.foundations.find((f) => f.id === 'PF-0')?.status).toBe('completed');
    expect(state.foundations.find((f) => f.id === 'I-A1')?.checklist.excavationVerified).toBe(true);
    expect(state.verticalMast?.sections.find((s) => s.id === 'S01')?.status).toBe('plumbed_verified');
    expect(state.verticalMast?.guyLayers.find((g) => g.id === 'L01')?.sectors.I.terminated).toBe(true);

    useProjectStore.getState().deleteProject(unifiedId);
  });

  it('starts clean projects without contractor boilerplate notes and defaults vertical mast daily logs to tower parts', () => {
    const cleanFoundations = createInitialFoundations();
    expect(cleanFoundations.every((f) => f.status === 'not_started')).toBe(true);
    expect(cleanFoundations.every((f) => !f.checklist.excavationVerified)).toBe(true);
    expect(cleanFoundations.every((f) => f.notes === '')).toBe(true);

    const cleanVerticalMast = createCleanVerticalMastProject();
    expect(cleanVerticalMast.foundations.every((f) => f.notes === '')).toBe(true);

    const sampleVerticalMast = createSampleVerticalMastProject();
    expect(sampleVerticalMast.foundations.every((f) => f.notes === '')).toBe(true);
    expect(
      sampleVerticalMast.dailyLogs?.[0]?.materialsOnSite?.some(
        (m) => m.name === 'Modular Tower Section (3.0m)'
      )
    ).toBe(true);

    const mastParts = createDefaultDailyLogMaterials('vertical_mast');
    expect(mastParts).toHaveLength(6);
    expect(mastParts.map((m) => m.name)).toEqual([
      'Modular Tower Section (3.0m)',
      'Flange Splice Bolt (M16×70)',
      'Guy Wire Strand (Ø11.4mm)',
      'Turnbuckle & Shackle Set',
      'U-Ring & NUT-3 Clamp',
      'Working Platform / Lightning Rod',
    ]);

    const prevFoundationLog = {
      id: 'dl-found-1',
      date: '2026-11-12',
      dayNumber: 1,
      weather: 'Sunny' as const,
      foundationsWorked: ['PF-0'],
      workers: [],
      totalWorkers: 0,
      totalManHours: 0,
      cementUsedBags: 0,
      sandUsedBags: 0,
      gravelUsedBags: 0,
      rebarPcsUsed: 0,
      activitiesSummary: '',
      issuesOrDelays: '',
      materialsOnSite: [
        {
          id: 'mat-cement',
          name: 'Cement',
          unit: 'bags',
          onSiteQty: 0,
          deliveredQty: 0,
          usedTodayQty: 0,
          remainingQty: 0,
        },
        {
          id: 'mat-sand',
          name: 'Sand',
          unit: 'bags',
          onSiteQty: 5,
          deliveredQty: 0,
          usedTodayQty: 2,
          remainingQty: 3,
        },
      ],
    };
    const nextMastMaterials = buildNextDayMaterialsFromLog(prevFoundationLog, 'vertical_mast');
    expect(nextMastMaterials.some((m) => m.name === 'Cement')).toBe(false);
    expect(nextMastMaterials.some((m) => m.name === 'Modular Tower Section (3.0m)')).toBe(true);
    expect(nextMastMaterials.find((m) => m.name === 'Sand')?.onSiteQty).toBe(3);
  });

  it('shows project launcher only on very first launch before any workspace entry', () => {
    const emptyStorage = { getItem: () => null };
    const visitedStorage = {
      getItem: (k: string) => (k === 'mast2-launcher-completed-v1' ? '1' : null),
    };
    const savedWorkspaceStorage = {
      getItem: (k: string) =>
        k === 'mast2-tower-projects-workspace-v1' ? '{"activeProjectId":"p1","projects":[]}' : null,
    };
    const legacyStorage = {
      getItem: (k: string) => (k === 'mast2-tower-report-generator-v1' ? '{}' : null),
    };

    expect(shouldOpenLauncherOnStartup(null)).toBe(false);
    expect(shouldOpenLauncherOnStartup(emptyStorage)).toBe(true);
    expect(shouldOpenLauncherOnStartup(visitedStorage)).toBe(false);
    expect(shouldOpenLauncherOnStartup(savedWorkspaceStorage)).toBe(false);
    expect(shouldOpenLauncherOnStartup(legacyStorage)).toBe(false);
  });

  it('scales vertical mast elevation viewBox cleanly for interactive selection', () => {
    expect(getMastElevationGeometry('all', 1)).toEqual({
      yScale: 3.6,
      yGround: 528,
      viewBox: '0 0 760 595',
    });
    expect(getMastElevationGeometry('upper', 1).viewBox).toBe('0 0 760 335');
    expect(getMastElevationGeometry('lower', 1).viewBox).toBe('0 270 760 325');

    const scaled2x = getMastElevationGeometry('all', 2);
    expect(scaled2x.yScale).toBe(7.2);
    expect(scaled2x.yGround).toBe(992);
    expect(scaled2x.viewBox).toBe('0 0 760 1059');

    const store = useUiStore.getState();
    expect(store.mastVerticalScale).toBe(1);
    store.setMastVerticalScale(2);
    expect(useUiStore.getState().mastVerticalScale).toBe(2);
    store.setMastVerticalScale(1);
  });

  it('provides GSL (left), PGPC (center), and GEDI (right) as default report letterhead logos', () => {
    expect(DEFAULT_REPORT_LOGOS.left.dataUrl).toBeTruthy();
    expect(DEFAULT_REPORT_LOGOS.center.dataUrl).toBeTruthy();
    expect(DEFAULT_REPORT_LOGOS.right.dataUrl).toBeTruthy();

    for (const factory of [
      createSampleMast2Project,
      createCleanBaselineProject,
      createCleanVerticalMastProject,
      createSampleVerticalMastProject,
    ]) {
      const project = factory();
      expect(project.reportDetails?.logos?.left?.dataUrl).toBe(DEFAULT_REPORT_LOGOS.left.dataUrl);
      expect(project.reportDetails?.logos?.center?.dataUrl).toBe(
        DEFAULT_REPORT_LOGOS.center.dataUrl
      );
      expect(project.reportDetails?.logos?.right?.dataUrl).toBe(
        DEFAULT_REPORT_LOGOS.right.dataUrl
      );
    }

    // Legacy / uninitialized projects resolve to default logos too
    const legacyResolved = resolveReportDetails({
      projectName: 'Legacy Project',
      location: 'Site',
      preparedBy: 'Engr.',
      contractor: 'Contractor',
      lastUpdated: '2026-11-13',
    });
    expect(legacyResolved.logos).toEqual({
      left: DEFAULT_REPORT_LOGOS.left,
      center: DEFAULT_REPORT_LOGOS.center,
      right: DEFAULT_REPORT_LOGOS.right,
    });

    // Explicitly cleared slots stay cleared while remaining slots keep defaults/overrides
    const partialCleared = resolveReportLogos({
      left: { dataUrl: '', caption: '' },
      right: { dataUrl: 'data:image/png;base64,CUSTOM', caption: 'Custom' },
    });
    expect(partialCleared.left?.dataUrl).toBe('');
    expect(partialCleared.center?.dataUrl).toBe(DEFAULT_REPORT_LOGOS.center.dataUrl);
    expect(partialCleared.right?.dataUrl).toBe('data:image/png;base64,CUSTOM');
  });

  it('enforces bottom-up tower section erection order and populates message modal state on violation', () => {
    const testId = useProjectStore.getState().createProject({
      projectType: 'vertical_mast',
      projectName: 'Bottom-Up Order Test',
      location: 'Mt. Labo',
      contractor: 'GSL',
      preparedBy: 'Engr.',
      template: 'clean',
    });

    useUiStore.getState().setMastOrderViolation(null);

    // 1. Trying to mark S40 completed when S01..S39 are pending is blocked
    const s40Violation = useProjectStore
      .getState()
      .updateTowerSectionStatus('S40', 'plumbed_verified');
    expect(s40Violation).not.toBeNull();
    expect(s40Violation?.kind).toBe('section_bottom_up');
    expect(s40Violation?.blockingSectionId).toBe('S01');
    expect(useUiStore.getState().mastOrderViolation?.blockingSectionId).toBe('S01');
    expect(
      useProjectStore
        .getState()
        .project.verticalMast?.sections.find((s) => s.id === 'S40')?.status
    ).toBe('not_started');

    // 2. Trying to toggle S02 checklist item before S01 is completed is blocked
    const s02ChecklistViolation = useProjectStore
      .getState()
      .toggleTowerSectionChecklistItem('S02', 'plumbedAndInspected');
    expect(s02ChecklistViolation?.kind).toBe('section_bottom_up');
    expect(s02ChecklistViolation?.blockingSectionId).toBe('S01');

    // 3. Batch range S10..S20 fails when S01..S09 are pending
    const rangeViolation = useProjectStore
      .getState()
      .batchUpdateTowerSectionRange(10, 20, 'plumbed_verified');
    expect(rangeViolation?.kind).toBe('section_bottom_up');
    expect(rangeViolation?.blockingSectionId).toBe('S01');

    // 4. Cannot install/tension guy layer L01 (on S03) before S01..S03 are completed
    const guyViolation = useProjectStore
      .getState()
      .toggleGuyLayerSectorInstalled('L01', 'I');
    expect(guyViolation?.kind).toBe('guy_requires_section');
    expect(guyViolation?.blockingSectionId).toBe('S01');

    // 5. Erecting S01, then S02, then S03 bottom-up succeeds cleanly
    useUiStore.getState().setMastOrderViolation(null);
    expect(
      useProjectStore.getState().updateTowerSectionStatus('S01', 'plumbed_verified')
    ).toBeNull();
    expect(
      useProjectStore.getState().updateTowerSectionStatus('S02', 'plumbed_verified')
    ).toBeNull();
    expect(
      useProjectStore.getState().updateTowerSectionStatus('S03', 'plumbed_verified')
    ).toBeNull();
    expect(useUiStore.getState().mastOrderViolation).toBeNull();

    // 6. Now L01 (on S03) can be installed cleanly
    expect(
      useProjectStore.getState().toggleGuyLayerSectorInstalled('L01', 'I')
    ).toBeNull();

    // 7. Cannot revert S01 while S02–S03 above it are still installed
    const revertS01Violation = useProjectStore
      .getState()
      .updateTowerSectionStatus('S01', 'not_started');
    expect(revertS01Violation?.kind).toBe('section_top_down_revert');
    expect(revertS01Violation?.blockingSectionId).toBe('S03');

    // 8. Cannot revert S03 while attached L01 still has installed/tensioned guy cables
    const revertS03WithGuyViolation = useProjectStore
      .getState()
      .updateTowerSectionStatus('S03', 'not_started');
    expect(revertS03WithGuyViolation?.kind).toBe('section_has_active_guys');

    // Clearing L01 allows top-down revert of S03 -> S02 -> S01
    expect(
      useProjectStore.getState().updateGuyLayerStatus('L01', 'not_started')
    ).toBeNull();
    expect(
      useProjectStore.getState().batchUpdateTowerSectionRange(1, 3, 'not_started')
    ).toBeNull();

    useUiStore.getState().setMastOrderViolation(null);
    useProjectStore.getState().deleteProject(testId);
  });

  it('enforces sequential 1->8 order on foundation activity checklist and populates message modal state on violation', () => {
    const testId = useProjectStore.getState().createProject({
      projectType: 'foundation',
      projectName: 'Foundation Checklist Order Test',
      location: 'Mt. Labo',
      contractor: 'GSL',
      preparedBy: 'Engr.',
      template: 'clean',
    });

    useUiStore.getState().setFoundationOrderViolation(null);

    // 1. Checking step 6 (Concrete Poured) or step 2 before step 1 is blocked
    const skipToPourViolation = useProjectStore
      .getState()
      .toggleFoundationChecklistItem('I-A1', 'concretePoured');
    expect(skipToPourViolation?.kind).toBe('checklist_order_forward');
    expect(skipToPourViolation?.requiredStepKey).toBe('excavationVerified');
    expect(useUiStore.getState().foundationOrderViolation?.foundationId).toBe('I-A1');
    expect(
      useProjectStore
        .getState()
        .project.foundations.find((f) => f.id === 'I-A1')?.checklist.concretePoured
    ).toBe(false);

    // 2. Checking steps 1..8 sequentially works cleanly
    useUiStore.getState().setFoundationOrderViolation(null);
    const orderedKeys = [
      'excavationVerified',
      'excavationInspectionDone',
      'leanConcretePoured',
      'rebarCageInstalled',
      'formworkBraced',
      'concretePoured',
      'curingStarted',
      'curingAndBackfillDone',
    ] as const;

    for (const key of orderedKeys) {
      expect(
        useProjectStore.getState().toggleFoundationChecklistItem('I-A1', key)
      ).toBeNull();
    }
    expect(
      useProjectStore
        .getState()
        .project.foundations.find((f) => f.id === 'I-A1')?.status
    ).toBe('completed');
    expect(useUiStore.getState().foundationOrderViolation).toBeNull();

    // 3. Trying to uncheck an earlier step (e.g. step 3) while later steps remain checked is blocked
    const reverseSkipViolation = useProjectStore
      .getState()
      .toggleFoundationChecklistItem('I-A1', 'leanConcretePoured');
    expect(reverseSkipViolation?.kind).toBe('checklist_order_reverse');
    expect(reverseSkipViolation?.requiredStepKey).toBe('curingAndBackfillDone');

    // 4. Unchecking in reverse order (8 -> 7) works cleanly
    expect(
      useProjectStore
        .getState()
        .toggleFoundationChecklistItem('I-A1', 'curingAndBackfillDone')
    ).toBeNull();
    expect(
      useProjectStore
        .getState()
        .project.foundations.find((f) => f.id === 'I-A1')?.status
    ).toBe('curing');

    useUiStore.getState().setFoundationOrderViolation(null);
    useProjectStore.getState().deleteProject(testId);
  });

  it('recalculates foundation concrete pour volumes, metrics, and specs dynamically from custom dimensions', () => {
    const testId = useProjectStore.getState().createProject({
      projectType: 'foundation',
      projectName: 'Dynamic Dimensions Test',
      location: 'Site D',
      contractor: 'GSL',
      preparedBy: 'Engr.',
      template: 'clean',
    });

    // Baseline defaults remain exact (4.20 for PF-0, 51.96 m³ total across 13 pads)
    const baselineMetrics = computeProjectMetrics(useProjectStore.getState().project);
    expect(baselineMetrics.totalConcreteCuM).toBe(51.96);

    // Customize PF-0: 2.5m x 2.5m x 1.2m pad, 0.2m overburden, 0.05m lean bedding, 75mm cover, 48 main bars
    // -> Structural = 2.5 * 2.5 * 1.2 = 7.50 m³, Lean = 2.5 * 2.5 * 0.05 = 0.31 m³, Total = 7.81 m³
    // -> Total depth = 0.20 + 1.20 + 0.05 = 1.45 m
    useProjectStore.getState().updateFoundationCustomSpecs('PF-0', {
      lengthM: 2.5,
      widthM: 2.5,
      thicknessM: 1.2,
      overburdenDepthM: 0.2,
      leanThicknessM: 0.05,
      concreteCoverMm: 75,
      rebarM02Count: 48,
    });

    const updatedProject = useProjectStore.getState().project;
    const updatedPf0 = updatedProject.foundations.find((f) => f.id === 'PF-0')!;
    const resolvedPf0 = resolveFoundationSpec(updatedPf0.type, updatedPf0.customSpecs);
    expect(resolvedPf0.structuralConcreteCuM).toBe(7.5);
    expect(resolvedPf0.leanConcreteCuM).toBe(0.31);
    expect(resolvedPf0.totalConcreteCuM).toBe(7.81);
    expect(resolvedPf0.totalExcavationDepthM).toBe(1.45);
    expect(resolvedPf0.cementBags).toBe(94); // 50 * (7.5 / 4.0) = 93.75 -> 94 bags

    // Project total concrete increases by (7.81 - 4.20) = +3.61 => 55.57 m³
    const dynamicMetrics = computeProjectMetrics(updatedProject);
    expect(dynamicMetrics.totalConcreteCuM).toBe(55.57);

    // Mark PF-0 as poured -> pouredConcreteCuM reflects dynamic 7.81 m³
    useProjectStore.getState().updateFoundationStatus('PF-0', 'concreted');
    const pouredProject = useProjectStore.getState().project;
    const pouredMetrics = computeProjectMetrics(pouredProject);
    expect(pouredMetrics.pouredConcreteCuM).toBe(7.81);

    // Activity & Inspection & Overall Status reports all reflect dynamic specs & volumes
    const pouredPf0 = pouredProject.foundations.find((f) => f.id === 'PF-0')!;
    const activityReport = buildFoundationActivityReportData(
      pouredProject,
      pouredMetrics,
      pouredPf0
    );
    expect(activityReport.specDetails.size).toBe('2.5 × 2.5 × 1.2 m');
    expect(activityReport.specDetails.foundationVolume).toBe('7.5 m³ (Class AA)');
    expect(activityReport.specDetails.leanConcreteVolume).toBe('0.31 m³ (50 mm)');
    expect(activityReport.specDetails.excavationDepth).toBe(
      '1.45 m (1,450 mm from N.G.L.)'
    );
    expect(activityReport.specDetails.cover).toBe('75 mm');
    expect(activityReport.materials.find((m) => m.key === 'main_rebar')?.required).toBe(48);
    expect(activityReport.inspections[0].planMeasurement).toContain('2500 × 2500 mm pad');

    const overview = buildOverallProjectStatusReportData(pouredProject);
    const pf0OverviewRow = overview.foundationRows.find((r) => r.id === 'PF-0')!;
    expect(pf0OverviewRow.sizeLabel).toBe('2.5 × 2.5 × 1.2 m');
    expect(pf0OverviewRow.totalVolumeCuM).toBe(7.81);

    // Resetting restores baseline defaults cleanly
    useProjectStore.getState().resetFoundationCustomSpecs('PF-0');
    expect(computeProjectMetrics(useProjectStore.getState().project).totalConcreteCuM).toBe(51.96);

    useProjectStore.getState().deleteProject(testId);
  });

  it('parses workspace & legacy payloads for IndexedDB migration and handles Node fallback cleanly', async () => {
    const sample = createSampleMast2Project();
    sample.foundations[0].notes = 'Excavation completed by previous contractor.';

    const workspaceJson = JSON.stringify({
      activeProjectId: 'p-2',
      projects: [
        { id: 'p-1', createdAt: '2026-01-01', updatedAt: '2026-01-01', state: sample },
        { id: 'p-2', createdAt: '2026-01-02', updatedAt: '2026-01-02', state: createCleanBaselineProject() },
      ],
    });

    const parsedWorkspace = parseWorkspacePayload(workspaceJson);
    expect(parsedWorkspace).not.toBeNull();
    expect(parsedWorkspace!.activeProjectId).toBe('p-2');
    expect(parsedWorkspace!.projects).toHaveLength(2);
    expect(parsedWorkspace!.projects[0].state.foundations[0].notes).toBe('');

    const parsedLegacy = parseLegacyWorkspacePayload(JSON.stringify(sample));
    expect(parsedLegacy).not.toBeNull();
    expect(parsedLegacy!.activeProjectId).toBe('proj-1');
    expect(parsedLegacy!.projects).toHaveLength(1);
    expect(parsedLegacy!.projects[0].state.foundations[0].notes).toBe('');

    expect(parseWorkspacePayload(null)).toBeNull();
    expect(parseLegacyWorkspacePayload(JSON.stringify({ invalid: true }))).toBeNull();

    expect(isIndexedDbAvailable()).toBe(false);
    await expect(idbGet('test-key')).resolves.toBeUndefined();
    await expect(idbSet('test-key', { ok: true })).resolves.toBeUndefined();
    await expect(useProjectStore.getState().hydrateFromStorage()).resolves.toBeUndefined();
  });

  it('tracks PWA update and offline notification banner dismissals cleanly', () => {
    usePwaStore.setState({
      updateAvailable: true,
      updateDismissed: false,
      offlineReady: true,
      offlineReadyDismissed: false,
      offlineNoticeDismissed: false,
      justUpdated: true,
    });

    expect(usePwaStore.getState().updateAvailable).toBe(true);
    usePwaStore.getState().dismissUpdateBanner();
    expect(usePwaStore.getState().updateDismissed).toBe(true);

    usePwaStore.getState().dismissOfflineReady();
    expect(usePwaStore.getState().offlineReadyDismissed).toBe(true);

    usePwaStore.getState().dismissOfflineNotice();
    expect(usePwaStore.getState().offlineNoticeDismissed).toBe(true);

    usePwaStore.getState().dismissJustUpdated();
    expect(usePwaStore.getState().justUpdated).toBe(false);
  });
});

describe('Hauling & Centralized Inventory System', () => {
  const makeHaulingLog = (
    overrides: Partial<import('@/entities/project/types').HaulingLogEntry> &
      Pick<
        import('@/entities/project/types').HaulingLogEntry,
        'id' | 'date' | 'haulerName' | 'material' | 'unitLabel' | 'quantity' | 'totalKg'
      >
  ): import('@/entities/project/types').HaulingLogEntry => ({
    tripGroupId: undefined,
    tripNumber: 1,
    horsesUsed: 1,
    tripsCount: 1,
    kgPerUnit: overrides.quantity > 0 ? overrides.totalKg / overrides.quantity : 0,
    equivalentCuM: 0,
    destinationFoundationId: 'STOCKPILE',
    weather: 'Sunny',
    remarks: '',
    ...overrides,
  });

  it('calculates 120kg = P1100 credits with continuous excess carry-over across trips and mixed materials', () => {
    const project = createCleanBaselineProject();

    // Day 1 Trip 1 (mixed material load: 80 kg Cement + 55 kg Rebar = 135 kg -> 1 credit, 15 kg excess)
    // Day 1 Trip 2 (105 kg -> 105 + 15 = 120 kg -> 1 credit, 0 kg excess)
    // Day 2 Trip 1 (95 kg -> 0 credits, 95 kg excess - NO partial payment)
    // Day 3 Trip 1 (60 kg -> 60 + 95 = 155 kg -> 1 credit, 35 kg excess)
    project.haulingLogs = [
      makeHaulingLog({
        id: 'h-4',
        tripGroupId: 'grp-4',
        date: '2026-04-03',
        material: 'cement',
        materialId: 'mat-cement',
        itemLabel: 'Cement',
        unitLabel: 'bags',
        quantity: 1.5,
        kgPerUnit: 40,
        totalKg: 60,
        haulerName: 'Juan Dela Cruz',
        tripNumber: 1,
      }),
      makeHaulingLog({
        id: 'h-3',
        tripGroupId: 'grp-3',
        date: '2026-04-02',
        material: 'rebar_20mm',
        materialId: 'mat-rebar-20mm',
        itemLabel: '20mmØ Commercial Rebar (6m)',
        unitLabel: 'pcs',
        quantity: 2,
        kgPerUnit: 47.5,
        totalKg: 95,
        haulerName: 'Juan Dela Cruz',
        tripNumber: 1,
      }),
      makeHaulingLog({
        id: 'h-2',
        tripGroupId: 'grp-2',
        date: '2026-04-01',
        material: 'sand',
        materialId: 'mat-sand',
        itemLabel: 'Sand',
        unitLabel: 'bags',
        quantity: 3,
        kgPerUnit: 35,
        totalKg: 105,
        haulerName: 'Juan Dela Cruz',
        tripNumber: 2,
      }),
      makeHaulingLog({
        id: 'h-1b',
        tripGroupId: 'grp-1',
        date: '2026-04-01',
        material: 'rebar_20mm',
        materialId: 'mat-rebar-20mm',
        itemLabel: '20mmØ Commercial Rebar (6m)',
        unitLabel: 'pcs',
        quantity: 1,
        kgPerUnit: 55,
        totalKg: 55,
        haulerName: 'Juan Dela Cruz',
        tripNumber: 1,
        remarks: 'Mixed load',
      }),
      makeHaulingLog({
        id: 'h-1a',
        tripGroupId: 'grp-1',
        date: '2026-04-01',
        material: 'cement',
        materialId: 'mat-cement',
        itemLabel: 'Cement',
        unitLabel: 'bags',
        quantity: 2,
        kgPerUnit: 40,
        totalKg: 80,
        haulerName: 'Juan Dela Cruz',
        tripNumber: 1,
        remarks: 'Mixed load',
      }),
    ];
    project.haulerPayouts = [
      {
        id: 'pay-1',
        date: '2026-04-02',
        haulerName: 'Juan Dela Cruz',
        amountPhp: 1100,
        notes: 'Partial settlement',
      },
    ];

    const summary = computeHaulerCreditLedgers(
      project.haulingLogs,
      project.haulerPayouts
    );

    expect(HAULING_CREDIT_BLOCK_KG).toBe(120);
    expect(HAULING_RATE_PER_BLOCK_PHP).toBe(1100);
    expect(summary.totalHauledKg).toBe(395);
    expect(summary.totalCredits).toBe(3);
    expect(summary.totalEarnedPhp).toBe(3300);
    expect(summary.totalPaidPhp).toBe(1100);
    expect(summary.totalBalanceDuePhp).toBe(2200);
    expect(summary.totalActiveExcessKg).toBe(35);

    expect(summary.ledgers).toHaveLength(1);
    const juan = summary.ledgers[0];
    expect(juan.tripsCompleted).toBe(4);
    expect(juan.totalCredits).toBe(3);
    expect(juan.currentExcessKg).toBe(35);
    expect(juan.balanceDuePhp).toBe(2200);

    // Chronological ledger verification (summary.tripsChronological is oldest -> newest)
    expect(summary.tripsChronological).toHaveLength(4);
    expect(summary.tripsChronological[0].totalKg).toBe(135);
    expect(summary.tripsChronological[0].creditsEarned).toBe(1);
    expect(summary.tripsChronological[0].excessAfterKg).toBe(15);

    expect(summary.tripsChronological[1].priorExcessKg).toBe(15);
    expect(summary.tripsChronological[1].effectiveKg).toBe(120);
    expect(summary.tripsChronological[1].creditsEarned).toBe(1);
    expect(summary.tripsChronological[1].excessAfterKg).toBe(0);

    expect(summary.tripsChronological[2].totalKg).toBe(95);
    expect(summary.tripsChronological[2].creditsEarned).toBe(0);
    expect(summary.tripsChronological[2].payoutEarnedPhp).toBe(0);
    expect(summary.tripsChronological[2].excessAfterKg).toBe(95);

    expect(summary.tripsChronological[3].priorExcessKg).toBe(95);
    expect(summary.tripsChronological[3].effectiveKg).toBe(155);
    expect(summary.tripsChronological[3].creditsEarned).toBe(1);
    expect(summary.tripsChronological[3].excessAfterKg).toBe(35);
  });

  it('tracks Stock Yard cu.m (36 bags/cu.m), On-Site balances, and links hauling deliveries to Daily Logs', () => {
    const project = createCleanBaselineProject();
    const central = createDefaultCentralMaterials().map((m) => {
      if (m.id === 'mat-sand') {
        return { ...m, stockYardTotalQty: 2 * BAGS_PER_CUBIC_METER, targetQty: 100 }; // 2 cu.m = 72 bags
      }
      if (m.id === 'mat-rebar-20mm') {
        return { ...m, stockYardTotalQty: 40, targetQty: 40 };
      }
      return m;
    });
    project.centralMaterials = central;

    project.haulingLogs = [
      makeHaulingLog({
        id: 'hl-day1-1',
        tripGroupId: 'grp-d1-1',
        date: '2026-04-05',
        material: 'sand',
        materialId: 'mat-sand',
        itemLabel: 'Sand',
        unitLabel: 'bags',
        quantity: 6,
        kgPerUnit: 35,
        totalKg: 210,
        haulerName: 'Pedro',
        tripNumber: 1,
      }),
      makeHaulingLog({
        id: 'hl-day1-2',
        tripGroupId: 'grp-d1-1',
        date: '2026-04-05',
        material: 'rebar_20mm',
        materialId: 'mat-rebar-20mm',
        itemLabel: '20mmØ Commercial Rebar (6m)',
        unitLabel: 'pcs',
        quantity: 4,
        kgPerUnit: 46.2,
        totalKg: 184.8,
        haulerName: 'Pedro',
        tripNumber: 1,
      }),
    ];

    // Daily log on 2026-04-05 auto-populates deliveredQty from hauling
    const draftRows = buildCentralizedDailyLogMaterials(
      project,
      null,
      '2026-04-05',
      computeDailyLogMaterialRemaining
    );
    const sandDraft = draftRows.find((r) => r.id === 'mat-sand');
    const rebarDraft = draftRows.find((r) => r.id === 'mat-rebar-20mm');
    expect(sandDraft?.deliveredQty).toBe(6);
    expect(rebarDraft?.deliveredQty).toBe(4);

    // Simulate logging Daily Log usage of 2 bags sand and 3 pcs 20mm rebar
    project.dailyLogs = [
      {
        id: 'dl-1',
        date: '2026-04-05',
        dayNumber: 1,
        weather: 'Sunny',
        activitiesSummary: 'Foundation pouring prep',
        foundationsWorked: [],
        workers: [],
        totalWorkers: 0,
        totalManHours: 0,
        cementUsedBags: 0,
        sandUsedBags: 2,
        gravelUsedBags: 0,
        issuesOrDelays: '',
        materialsOnSite: draftRows.map((r) => {
          if (r.id === 'mat-sand') {
            return { ...r, usedTodayQty: 2, remainingQty: computeDailyLogMaterialRemaining({ ...r, usedTodayQty: 2 }) };
          }
          if (r.id === 'mat-rebar-20mm') {
            return { ...r, usedTodayQty: 3, remainingQty: computeDailyLogMaterialRemaining({ ...r, usedTodayQty: 3 }) };
          }
          return r;
        }),
      },
    ];

    const statuses = computeCentralMaterialStatuses(project);
    const sandStatus = statuses.find((s) => s.item.id === 'mat-sand')!;
    const rebarStatus = statuses.find((s) => s.item.id === 'mat-rebar-20mm')!;

    expect(sandStatus.stockYardRemainingQty).toBe(66); // 72 - 6
    expect(sandStatus.stockYardRemainingCuM).toBeCloseTo(66 / 36, 1);
    expect(sandStatus.hauledQty).toBe(6);
    expect(sandStatus.usedOnSiteQty).toBe(2);
    expect(sandStatus.onSiteRemainingQty).toBe(4);
    expect(sandStatus.stillNeededOnSiteQty).toBe(94); // target 100 - (delivered/hauled 6)

    expect(rebarStatus.stockYardRemainingQty).toBe(36); // 40 - 4
    expect(rebarStatus.hauledQty).toBe(4);
    expect(rebarStatus.usedOnSiteQty).toBe(3);
    expect(rebarStatus.onSiteRemainingQty).toBe(1);
    expect(rebarStatus.stillNeededOnSiteQty).toBe(36); // 40 - 4

    // Test manual Sync from Hauling override preserves usedTodayQty
    const updatedProject = {
      ...project,
      haulingLogs: [
        ...project.haulingLogs,
        makeHaulingLog({
          id: 'hl-day1-3',
          tripGroupId: 'grp-d1-2',
          date: '2026-04-05',
          material: 'sand',
          materialId: 'mat-sand',
          itemLabel: 'Sand',
          unitLabel: 'bags',
          quantity: 3,
          kgPerUnit: 35,
          totalKg: 105,
          haulerName: 'Pedro',
          tripNumber: 2,
        }),
      ],
    };
    const synced = syncDailyLogMaterialsWithHauling(
      updatedProject,
      '2026-04-05',
      project.dailyLogs[0].materialsOnSite ?? [],
      computeDailyLogMaterialRemaining
    );
    const syncedSand = synced.find((r) => r.id === 'mat-sand')!;
    expect(syncedSand.deliveredQty).toBe(9);
    expect(syncedSand.usedTodayQty).toBe(2);
    expect(syncedSand.remainingQty).toBe(7);
  });

  it('adds multi-material hauling trip via store and syncs saved daily log deliveries', () => {
    const clean = createCleanBaselineProject();
    useProjectStore.setState({ project: clean });

    useProjectStore.getState().addHaulingTrip({
      date: '2026-04-10',
      haulerName: 'Mario',
      tripNumber: 1,
      remarks: 'Morning horse load',
      items: [
        {
          materialId: 'mat-cement',
          material: 'cement',
          itemLabel: 'Cement',
          unitLabel: 'bags',
          quantity: 2,
          totalKg: 80,
        },
        {
          materialId: 'mat-rebar-20mm',
          material: 'rebar_20mm',
          itemLabel: '20mmØ Commercial Rebar (6m)',
          unitLabel: 'pcs',
          quantity: 5,
          totalKg: 45,
        },
      ],
    });

    const stateAfterAdd = useProjectStore.getState().project;
    expect(stateAfterAdd.haulingLogs).toHaveLength(2);
    expect(stateAfterAdd.haulerRoster).toContain('Mario');
    expect(stateAfterAdd.haulingLogs[0].tripGroupId).toBe(
      stateAfterAdd.haulingLogs[1].tripGroupId
    );
  });

  it('normalizes legacy boilerplate notes and vertical mast state on import', () => {
    const rawProject = createSampleVerticalMastProject();
    // Simulate legacy notes and an unnormalized verticalMast structure
    rawProject.foundations = rawProject.foundations.map((f, i) =>
      i === 0 ? { ...f, notes: 'Excavation completed by previous contractor.' } : f
    );

    const jsonText = JSON.stringify(rawProject);

    // Test importProjectAsNew
    useProjectStore.getState().importProjectAsNew(jsonText);
    const activeProject = useProjectStore.getState().project;
    expect(activeProject.foundations[0].notes).toBe('');
    expect(activeProject.verticalMast).toBeDefined();
    expect(activeProject.verticalMast?.sections.length).toBe(41);
    expect(activeProject.verticalMast?.guyLayers.length).toBe(16);

    // Test importProjectJson
    useProjectStore.getState().importProjectJson(jsonText);
    const importedProject = useProjectStore.getState().project;
    expect(importedProject.foundations[0].notes).toBe('');
    expect(importedProject.verticalMast?.sections.length).toBe(41);
    expect(importedProject.verticalMast?.guyLayers.length).toBe(16);
  });
});

