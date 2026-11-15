import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CIVIL_WORK_POSITIONS,
  MANPOWER_POSITIONS,
  computeCivilWorksPayrollPreview,
  computeHaulerPayrollPreview,
  formatCivilPayrollPlainText,
  formatHaulerPayrollPlainText,
  getPayrollPeriodBounds,
  resolveKnownHaulerNames,
  resolveManpowerRoster,
} from '@/entities/project/manpowerPayroll';
import { createCleanBaselineProject } from '@/entities/project/mast2Baseline';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
import {
  type ReportPrintResult,
  triggerReportPrint,
} from '@/widgets/report/ReportLetterhead';

function createStubWindow(options: {
  printImpl?: () => void;
  omitPrint?: boolean;
}) {
  const listeners = new Map<string, Set<() => void>>();
  let timerSeq = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const stubWindow = {
    addEventListener: (event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    removeEventListener: (event: string, cb: () => void) => {
      listeners.get(event)?.delete(cb);
    },
    dispatch: (event: string) => {
      for (const cb of Array.from(listeners.get(event) ?? [])) {
        cb();
      }
    },
    setTimeout: (fn: () => void, ms: number) => {
      const id = timerSeq++;
      const handle = globalThis.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.set(id, handle);
      return id;
    },
    clearTimeout: (id: number) => {
      const handle = timers.get(id);
      if (handle !== undefined) {
        globalThis.clearTimeout(handle);
        timers.delete(id);
      }
    },
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    ...(options.omitPrint
      ? {}
      : { print: options.printImpl ?? (() => {}) }),
  };

  return stubWindow;
}

describe('triggerReportPrint status and failure detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports failure when window.print is unavailable', () => {
    const stubWin = createStubWindow({ omitPrint: true });
    const stubDoc = { title: 'Original Title', getElementById: () => null };
    vi.stubGlobal('window', stubWin);
    vi.stubGlobal('document', stubDoc);

    let result: ReportPrintResult | undefined;
    triggerReportPrint('My Report: Test', (res) => {
      result = res;
    });

    expect(result?.status).toBe('failed');
    expect(result?.message).toContain('not supported');
    expect(stubDoc.title).toBe('Original Title');
  });

  it('reports failure and restores title when window.print throws', () => {
    const stubWin = createStubWindow({
      printImpl: () => {
        throw new Error('Printer spooler unavailable');
      },
    });
    const stubDoc = { title: 'Original Title', getElementById: () => null };
    vi.stubGlobal('window', stubWin);
    vi.stubGlobal('document', stubDoc);

    let result: ReportPrintResult | undefined;
    triggerReportPrint('Report / 2026', (res) => {
      result = res;
    });

    expect(result?.status).toBe('failed');
    expect(result?.message).toContain('Printer spooler unavailable');
    expect(stubDoc.title).toBe('Original Title');
  });

  it('reports completed when beforeprint/afterprint fires and restores title', () => {
    let capturedTitleDuringPrint = '';
    const stubWin = createStubWindow({
      printImpl: () => {
        capturedTitleDuringPrint = stubDoc.title;
        stubWin.dispatch('beforeprint');
      },
    });
    const stubDoc = { title: 'Initial Title', getElementById: () => null };
    vi.stubGlobal('window', stubWin);
    vi.stubGlobal('document', stubDoc);

    let result: ReportPrintResult | undefined;
    triggerReportPrint('Mast: 2 / Payroll', (res) => {
      result = res;
    });

    expect(capturedTitleDuringPrint).toBe('Mast- 2 - Payroll');
    expect(result).toBeUndefined();

    stubWin.dispatch('afterprint');

    expect(result?.status).toBe('completed');
    expect(result?.message).toContain('Print dialog closed');
    expect(stubDoc.title).toBe('Initial Title');
  });

  it('reports failed when WebView silently blocks window.print with no events', () => {
    const stubWin = createStubWindow({ printImpl: () => {} });
    const stubDoc = { title: 'Initial Title', getElementById: () => null };
    vi.stubGlobal('window', stubWin);
    vi.stubGlobal('document', stubDoc);

    let result: ReportPrintResult | undefined;
    triggerReportPrint('Payroll Sheet', (res) => {
      result = res;
    });

    expect(result).toBeUndefined();
    vi.advanceTimersByTime(650);

    expect(result?.status).toBe('failed');
    expect(result?.message).toContain('Unable to open the print dialog');
    expect(stubDoc.title).toBe('Initial Title');
  });
});

describe('useFeedbackStore custom modal queue and toasts', () => {
  beforeEach(() => {
    useFeedbackStore.getState().clearAllFeedback();
  });

  it('queues alert and confirm dialogs and resolves each promise in order', async () => {
    const firstPromise = useFeedbackStore.getState().requestConfirm({
      title: 'Delete Trip?',
      message: 'Remove trip log?',
      tone: 'danger',
    });
    const secondPromise = useFeedbackStore.getState().showAlert({
      title: 'Notice',
      message: 'Queued alert message',
    });

    expect(useFeedbackStore.getState().activeDialog?.title).toBe('Delete Trip?');
    expect(useFeedbackStore.getState().dialogQueue).toHaveLength(1);

    useFeedbackStore.getState().resolveActiveDialog(true);
    await expect(firstPromise).resolves.toBe(true);

    expect(useFeedbackStore.getState().activeDialog?.title).toBe('Notice');
    expect(useFeedbackStore.getState().dialogQueue).toHaveLength(0);

    useFeedbackStore.getState().resolveActiveDialog(true);
    await expect(secondPromise).resolves.toBeUndefined();
    expect(useFeedbackStore.getState().activeDialog).toBeNull();
  });

  it('pushes and dismisses toast messages cleanly', () => {
    const id = useFeedbackStore.getState().pushToast({
      tone: 'success',
      message: 'Payroll saved.',
    });
    expect(useFeedbackStore.getState().toasts).toHaveLength(1);
    expect(useFeedbackStore.getState().toasts[0].message).toBe('Payroll saved.');

    useFeedbackStore.getState().dismissToast(id);
    expect(useFeedbackStore.getState().toasts).toHaveLength(0);
  });
});

describe('Manpower roster and Civil Works / Individual Hauler payroll', () => {
  beforeEach(() => {
    useFeedbackStore.getState().clearAllFeedback();
  });

  it('shares Daily Log roles while separating civil positions from Horse Hauler', () => {
    expect(MANPOWER_POSITIONS).toContain('Horse Hauler');
    expect(MANPOWER_POSITIONS).toContain('Mason');
    expect(CIVIL_WORK_POSITIONS).not.toContain('Horse Hauler');
    expect(CIVIL_WORK_POSITIONS).toContain('Site Engineer');
  });

  it('computes daily, weekly (Mon-Sun), monthly, and overall period bounds', () => {
    expect(getPayrollPeriodBounds('daily', '2026-11-11')).toMatchObject({
      startDate: '2026-11-11',
      endDate: '2026-11-11',
    });

    // 2026-11-11 is Wednesday -> Monday 2026-11-09 through Sunday 2026-11-15
    expect(getPayrollPeriodBounds('weekly', '2026-11-11')).toMatchObject({
      startDate: '2026-11-09',
      endDate: '2026-11-15',
    });

    expect(getPayrollPeriodBounds('monthly', '2024-02-10')).toMatchObject({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });

    expect(
      getPayrollPeriodBounds('overall', '2026-11-15', ['2026-11-01', '2026-11-14'])
    ).toMatchObject({
      startDate: '2026-11-01',
      endDate: '2026-11-14',
    });
  });

  it('manages Civil Works roster, Present/Absent attendance, and payroll snapshots', () => {
    const clean = createCleanBaselineProject();
    useProjectStore.setState({ project: clean });

    const store = useProjectStore.getState();
    const masonId = store.addManpowerMember({
      name: 'Juan Dela Cruz',
      category: 'civil_works',
      position: 'Mason',
      dailyRatePhp: 850,
      active: true,
    });
    const laborerId = store.addManpowerMember({
      name: 'Pedro Reyes',
      category: 'civil_works',
      position: 'Laborer',
      dailyRatePhp: 600,
      active: true,
    });

    // Tick Present/Absent attendance across 2 days in the same week
    useProjectStore.getState().toggleCivilAttendanceMember('2026-11-10', masonId);
    useProjectStore.getState().toggleCivilAttendanceMember('2026-11-10', laborerId);
    useProjectStore.getState().toggleCivilAttendanceMember('2026-11-11', masonId);
    // Toggle laborer off after toggling on to verify Absent unchecking
    useProjectStore.getState().toggleCivilAttendanceMember('2026-11-11', laborerId);
    useProjectStore.getState().toggleCivilAttendanceMember('2026-11-11', laborerId);

    const state = useProjectStore.getState().project;
    const bounds = getPayrollPeriodBounds('weekly', '2026-11-11');
    const preview = computeCivilWorksPayrollPreview(
      resolveManpowerRoster(state),
      state.civilAttendance ?? [],
      bounds.startDate,
      bounds.endDate
    );

    expect(preview.totalDaysWorked).toBe(3);
    expect(preview.totalAmountPhp).toBe(2 * 850 + 1 * 600);

    const items = preview.rows.filter((r) => r.daysPresent > 0);
    const snapId = useProjectStore.getState().createCivilPayrollSnapshot({
      periodType: 'weekly',
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      title: 'Week 2 Nov',
      items,
      totalDaysWorked: preview.totalDaysWorked,
      totalAmountPhp: preview.totalAmountPhp,
      status: 'generated',
    });

    useProjectStore
      .getState()
      .updateCivilPayrollStatus(snapId, 'paid', '2026-11-15');

    const saved = useProjectStore
      .getState()
      .project.civilPayrollHistory?.find((s) => s.id === snapId);
    expect(saved?.status).toBe('paid');
    expect(saved?.paidDate).toBe('2026-11-15');

    const summaryText = formatCivilPayrollPlainText(
      saved!,
      useProjectStore.getState().project
    );
    expect(summaryText).toContain('Juan Dela Cruz (Mason): 2 days');
    expect(summaryText).toContain('TOTAL PAYROLL: PHP 2,300');

    // Deleting a worker removes them from roster and cleans attendance arrays
    useProjectStore.getState().deleteManpowerMember(laborerId);
    const afterDelete = useProjectStore.getState().project;
    expect(resolveManpowerRoster(afterDelete).some((m) => m.id === laborerId)).toBe(
      false
    );
    const day1 = afterDelete.civilAttendance?.find((a) => a.date === '2026-11-10');
    expect(day1?.presentMemberIds).toEqual([masonId]);

    useProjectStore.getState().deleteCivilPayrollSnapshot(snapId);
    expect(useProjectStore.getState().project.civilPayrollHistory).toHaveLength(0);
  });

  it('tracks Individual Hauler 120kg carry-over payroll, linked payouts, and deletes cleanly', () => {
    const clean = createCleanBaselineProject();
    useProjectStore.setState({ project: clean });

    // Adding trip creates individual hauler in both haulerRoster and manpowerRoster
    useProjectStore.getState().addHaulingTrip({
      date: '2026-11-02',
      haulerName: 'Mario Santos',
      tripNumber: 1,
      items: [
        {
          itemLabel: 'Portland Cement',
          material: 'cement',
          unitLabel: 'bags',
          quantity: 3.75,
          totalKg: 150,
        },
      ],
    });
    // Next week trip combines prior 30 kg excess + 100 kg -> 130 kg (1 credit, 10 kg ending)
    useProjectStore.getState().addHaulingTrip({
      date: '2026-11-10',
      haulerName: 'Mario Santos',
      tripNumber: 1,
      items: [
        {
          itemLabel: 'Portland Cement',
          material: 'cement',
          unitLabel: 'bags',
          quantity: 2.5,
          totalKg: 100,
        },
      ],
    });

    const projectAfterTrips = useProjectStore.getState().project;
    const roster = resolveManpowerRoster(projectAfterTrips);
    const marioMember = roster.find((m) => m.name === 'Mario Santos');
    expect(marioMember?.category).toBe('hauler');
    expect(marioMember?.position).toBe('Horse Hauler');
    expect(marioMember?.dailyRatePhp).toBe(0);
    expect(resolveKnownHaulerNames(projectAfterTrips)).toContain('Mario Santos');

    // Rename individual hauler and verify haulingLogs update
    useProjectStore.getState().updateManpowerMember(marioMember!.id, {
      name: 'Mario S.',
    });
    expect(
      useProjectStore
        .getState()
        .project.haulingLogs.every((l) => l.haulerName === 'Mario S.')
    ).toBe(true);

    const bounds = getPayrollPeriodBounds('weekly', '2026-11-10');
    const afterRename = useProjectStore.getState().project;
    const preview = computeHaulerPayrollPreview(
      afterRename.haulingLogs,
      afterRename.haulerPayouts ?? [],
      resolveManpowerRoster(afterRename),
      bounds.startDate,
      bounds.endDate,
      'weekly'
    );

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      haulerName: 'Mario S.',
      tripsCompleted: 1,
      hauledKg: 100,
      priorExcessKg: 30,
      creditsEarned: 1,
      endingExcessKg: 10,
      grossEarnedPhp: 1100,
      payoutReleasedPhp: 1100,
      overallEarnedPhp: 2200,
      overallBalanceDuePhp: 2200,
    });

    // Save generated batch -> no payout record yet
    const snapId = useProjectStore.getState().createHaulerPayrollSnapshot({
      periodType: 'weekly',
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      title: 'Week Nov 9-15',
      items: preview.rows,
      totalHauledKg: preview.totalHauledKg,
      totalCredits: preview.totalCredits,
      totalEarnedPhp: preview.totalEarnedPhp,
      totalPayoutPhp: preview.totalSuggestedPayoutPhp,
      status: 'generated',
    });
    expect(useProjectStore.getState().project.haulerPayouts ?? []).toHaveLength(0);

    // Mark Paid -> syncs linked HaulerPayoutRecord
    useProjectStore
      .getState()
      .updateHaulerPayrollStatus(snapId, 'paid', '2026-11-15');
    const afterPaid = useProjectStore.getState().project;
    expect(afterPaid.haulerPayouts).toHaveLength(1);
    expect(afterPaid.haulerPayouts?.[0]).toMatchObject({
      haulerName: 'Mario S.',
      amountPhp: 1100,
      payrollSnapshotId: snapId,
    });

    const plainText = formatHaulerPayrollPlainText(
      afterPaid.haulerPayrollHistory![0],
      afterPaid
    );
    expect(plainText).toContain('INDIVIDUAL HAULERS:');
    expect(plainText).toContain('Mario S.: 1 trip, 100 kg hauled');
    expect(plainText).toContain('TOTAL PAYOUT AMOUNT: PHP 1,100');

    // Delete hauler payroll snapshot -> cleans up linked payouts automatically
    useProjectStore.getState().deleteHaulerPayrollSnapshot(snapId);
    expect(useProjectStore.getState().project.haulerPayrollHistory).toHaveLength(0);
    expect(useProjectStore.getState().project.haulerPayouts).toHaveLength(0);

    // Deleting a hauler from manpowerRoster prevents legacy re-seeding from haulingLogs
    useProjectStore.getState().deleteManpowerMember(marioMember!.id);
    expect(
      resolveManpowerRoster(useProjectStore.getState().project).some(
        (m) => m.id === marioMember!.id
      )
    ).toBe(false);
  });
});
