import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import { MaterialsReportSheet } from '../src/widgets/hauling/MaterialsReportSheet';
import { resolveReportDetails } from '../src/widgets/report/ReportLetterhead';
import {
  applySignoffOverridesToDetails,
  ReportSignoffOverrideProvider,
} from '../src/widgets/report/ReportSignoffOverrideContext';

describe('MaterialsReportSheet', () => {
  it('renders combined Stock Yard and On-Site balances with cu.m conversions and daily log consumption', () => {
    const base = createCleanBaselineProject();
    const project = {
      ...base,
      projectType: 'foundation' as const,
      centralMaterials: [
        {
          id: 'mat-cement',
          name: 'Cement',
          category: 'foundation' as const,
          unit: 'bags',
          haulingMaterialKey: 'cement' as const,
          defaultKgPerUnit: 40,
          targetQty: 100,
          stockYardTotalQty: 80,
          onSiteOpeningQty: 10,
          remarks: '40 kg/bag Portland cement',
        },
        {
          id: 'mat-sand',
          name: 'Sand',
          category: 'foundation' as const,
          unit: 'bags',
          haulingMaterialKey: 'sand' as const,
          purchaseUnit: 'cu.m',
          unitsPerPurchaseUnit: 36,
          defaultKgPerUnit: 40,
          targetQty: 72,
          stockYardTotalQty: 72,
          onSiteOpeningQty: 0,
        },
        {
          id: 'part-tower-section',
          name: 'Modular Tower Section (3.0m)',
          category: 'vertical_mast' as const,
          unit: 'sec',
          haulingMaterialKey: 'tower_section' as const,
          targetQty: 41,
          stockYardTotalQty: 41,
          onSiteOpeningQty: 0,
        },
      ],
      haulingLogs: [
        {
          id: 'haul-1',
          date: '2026-11-16',
          haulerName: 'Mang Ben',
          tripNumber: 1,
          materialId: 'mat-cement',
          itemLabel: 'Cement',
          horsesUsed: 2,
          tripsCount: 1,
          material: 'cement' as const,
          unitLabel: 'bags',
          quantity: 30,
          kgPerUnit: 40,
          totalKg: 1200,
          equivalentCuM: 0,
          destinationFoundationId: 'STOCKPILE',
          weather: 'Sunny',
          remarks: '',
        },
        {
          id: 'haul-2',
          date: '2026-11-16',
          haulerName: 'Mang Ben',
          tripNumber: 2,
          materialId: 'mat-sand',
          itemLabel: 'Sand',
          horsesUsed: 2,
          tripsCount: 1,
          material: 'sand' as const,
          unitLabel: 'bags',
          quantity: 72,
          kgPerUnit: 40,
          totalKg: 2880,
          equivalentCuM: 2,
          destinationFoundationId: 'STOCKPILE',
          weather: 'Sunny',
          remarks: '',
        },
      ],
      dailyLogs: [
        {
          id: 'log-1',
          dayNumber: 1,
          date: '2026-11-16',
          weather: 'Sunny' as const,
          foundationsWorked: ['PF-0'],
          workers: [],
          totalWorkers: 0,
          totalManHours: 0,
          cementUsedBags: 15,
          sandUsedBags: 0,
          gravelUsedBags: 0,
          activitiesSummary: 'Concrete pour prep',
          materialsOnSite: [
            {
              id: 'mat-cement',
              name: 'Cement',
              unit: 'bags',
              onSiteQty: 40,
              deliveredQty: 0,
              usedTodayQty: 15,
              remainingQty: 25,
              remarks: '',
            },
          ],
          issuesOrDelays: '',
        },
      ],
    };

    const activeHtml = renderToStaticMarkup(
      createElement(MaterialsReportSheet, { project, phaseScope: 'active' })
    );

    expect(activeHtml).toContain('MATERIALS INVENTORY REPORT');
    expect(activeHtml).toContain('Stock Yard');
    expect(activeHtml).toContain('On-Site Flow &amp; Balance');
    expect(activeHtml).toContain('Cement');
    expect(activeHtml).toContain('Sand');
    // Vertical mast item omitted in active foundation phase
    expect(activeHtml).not.toContain('Modular Tower Section (3.0m)');
    // Cement calculations: Yard Purchased 80, Hauled 30 (1,200 kg), Yard Remaining 50;
    // Opening 10, Delivered 40, Used 15, On Site 25, Target 100, Need 60
    expect(activeHtml).toContain('4,080 kg');
    expect(activeHtml).toContain('1,200 kg');
    expect(activeHtml).toContain('2 cu.m');
    expect(activeHtml).toContain('Need 60');
    expect(activeHtml).toContain('Complete');

    const allHtml = renderToStaticMarkup(
      createElement(MaterialsReportSheet, { project, phaseScope: 'all' })
    );
    expect(allHtml).toContain('Modular Tower Section (3.0m)');
    expect(allHtml).toContain('Vertical Mast');
    expect(allHtml).toContain('All Project Materials');
  });

  it('renders empty state cleanly when centralMaterials is empty', () => {
    const base = createCleanBaselineProject();
    const emptyProject = {
      ...base,
      centralMaterials: [],
      haulingLogs: [],
      dailyLogs: [],
    };

    const html = renderToStaticMarkup(
      createElement(MaterialsReportSheet, { project: emptyProject, phaseScope: 'active' })
    );

    expect(html).toContain('MATERIALS INVENTORY REPORT');
    expect(html).toContain('No materials recorded');
  });

  it('omits Safety Officer signatory by default on MaterialsReportSheet and shows it when overridden on', () => {
    const base = createCleanBaselineProject();
    const project = {
      ...base,
      reportDetails: {
        ...base.reportDetails,
        preparedBy: 'Engr. Avila',
        safetyOfficerBy: 'Flordeliza Manjares',
        safetyOfficerSignatureUrl: 'data:image/png;base64,SOSIGMAT',
      },
    };

    const defaultHtml = renderToStaticMarkup(
      createElement(ReportSignoffOverrideProvider, {
        project,
        children: createElement(MaterialsReportSheet, { project }),
      })
    );
    expect(defaultHtml).not.toContain('Flordeliza Manjares');
    expect(defaultHtml).not.toContain('SOSIGMAT');

    const overriddenDetails = applySignoffOverridesToDetails(
      resolveReportDetails(project),
      { includeSafetyOfficer: true }
    );
    expect(overriddenDetails?.safetyOfficerBy).toBe('Flordeliza Manjares');
    expect(overriddenDetails?.safetyOfficerSignatureUrl).toBe('data:image/png;base64,SOSIGMAT');
  });
});
