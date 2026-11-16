import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import { createCleanVerticalMastProject } from '../src/entities/project/verticalMastBaseline';
import { InspectionReportSheet } from '../src/widgets/inspection/InspectionReportSheet';
import { VerticalMastInspectionSheet } from '../src/widgets/mast-tower/VerticalMastInspectionSheet';

describe('Inspection Report Verified By Handling', () => {
  it('omits Verified By when contractorRep is blank in foundation inspection report', () => {
    const project = createCleanBaselineProject();
    const foundation = project.foundations[0];

    const html = renderToStaticMarkup(
      createElement(InspectionReportSheet, { project, foundation })
    );

    expect(html).not.toContain('Contractor Witness');
    expect(html).not.toContain('Witnessed By');
    expect(html).not.toContain('Contractor Rep:');
    expect(html).not.toContain('Verified By');
  });

  it('renders Verified By when contractorRep is provided in foundation inspection report', () => {
    const project = createCleanBaselineProject();
    const foundation = {
      ...project.foundations[0],
      inspectionMeta: { contractorRep: 'Engr. Santos' },
    };

    const html = renderToStaticMarkup(
      createElement(InspectionReportSheet, { project, foundation })
    );

    expect(html).not.toContain('Witnessed By');
    expect(html).not.toContain('Contractor Rep:');
    expect(html).toContain('Verified By');
    expect(html).toContain('Engr. Santos');
  });

  it('omits Verified By when blank and renders Verified By when set in vertical mast inspection report', () => {
    const project = createCleanVerticalMastProject();
    const section = project.verticalMast!.sections[0];

    const blankHtml = renderToStaticMarkup(
      createElement(VerticalMastInspectionSheet, {
        project,
        target: { kind: 'section', id: section.id },
      })
    );
    expect(blankHtml).not.toContain('Contractor Rep:');
    expect(blankHtml).not.toContain('Verified By:');

    const filledProject = {
      ...project,
      verticalMast: {
        ...project.verticalMast!,
        sections: project.verticalMast!.sections.map((s) =>
          s.id === section.id
            ? { ...s, inspectionMeta: { contractorRep: 'QA Lead Reyes' } }
            : s
        ),
      },
    };
    const filledHtml = renderToStaticMarkup(
      createElement(VerticalMastInspectionSheet, {
        project: filledProject,
        target: { kind: 'section', id: section.id },
      })
    );
    expect(filledHtml).not.toContain('Contractor Rep:');
    expect(filledHtml).toContain('Verified By:');
    expect(filledHtml).toContain('QA Lead Reyes');
  });
});
