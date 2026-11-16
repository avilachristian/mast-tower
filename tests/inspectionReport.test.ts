import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import { createCleanVerticalMastProject } from '../src/entities/project/verticalMastBaseline';
import { collectInlineImageRefs } from '../src/shared/lib/inlineImageRefs';
import { InspectionReportSheet } from '../src/widgets/inspection/InspectionReportSheet';
import { VerticalMastInspectionSheet } from '../src/widgets/mast-tower/VerticalMastInspectionSheet';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '../src/widgets/report/ReportLetterhead';
import {
  applySignoffOverridesToDetails,
  resolveInspectionSignoffs,
  resolveOverriddenSignatureUrl,
} from '../src/widgets/report/ReportSignoffOverrideContext';
import { extractMediaKeysFromProjectState } from '../worker/r2Service';

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

  it('renders uploaded signatures for Prepared By, Checked By, Approved By and leaves missing signatures blank', () => {
    const blankFooterHtml = renderToStaticMarkup(
      createElement(ReportSignoffFooter, {
        details: {
          preparedBy: 'Engr. Avila',
          checkedBy: 'Engr. Santos',
          approvedBy: 'Dir. Reyes',
        },
        fallbackDate: '2026-11-16',
      })
    );

    expect(blankFooterHtml).toContain('Prepared By');
    expect(blankFooterHtml).toContain('Checked / Reviewed By');
    expect(blankFooterHtml).toContain('Approved By');
    expect(blankFooterHtml).not.toContain('<img');

    const signedFooterHtml = renderToStaticMarkup(
      createElement(ReportSignoffFooter, {
        details: {
          preparedBy: 'Engr. Avila',
          preparedSignatureUrl: 'data:image/png;base64,PREP',
          checkedBy: 'Engr. Santos',
          checkedSignatureUrl: 'data:image/png;base64,CHECK',
          approvedBy: 'Dir. Reyes',
        },
        fallbackDate: '2026-11-16',
      })
    );

    expect(signedFooterHtml).toContain('src="data:image/png;base64,PREP"');
    expect(signedFooterHtml).toContain('src="data:image/png;base64,CHECK"');
    expect(signedFooterHtml).not.toContain('Approved By signature');
  });

  it('renders uploaded inspector & verified signatures on inspection sheets and protects signatures in storage refs', () => {
    const baseFoundationProject = createCleanBaselineProject();
    const projectWithReportSig = {
      ...baseFoundationProject,
      preparedBy: 'Engr. Avila',
      reportDetails: {
        ...baseFoundationProject.reportDetails,
        preparedBy: 'Engr. Avila',
        preparedSignatureUrl: 'data:image/png;base64,DEFAULTSIG',
      },
    };

    // Inherits Prepared By signature when inspector matches Prepared By; Verified By stays omitted when blank
    const inheritedFoundationHtml = renderToStaticMarkup(
      createElement(InspectionReportSheet, {
        project: projectWithReportSig,
        foundation: {
          ...projectWithReportSig.foundations[0],
          inspectionMeta: {
            verifiedSignatureUrl: 'data:image/png;base64,ORPHANVER',
          },
        },
      })
    );
    expect(inheritedFoundationHtml).toContain('alt="Inspector signature"');
    expect(inheritedFoundationHtml).not.toContain('Verifier signature');

    // Different inspector name without custom signature stays blank instead of reusing Prepared By signature
    const differentInspectorHtml = renderToStaticMarkup(
      createElement(InspectionReportSheet, {
        project: projectWithReportSig,
        foundation: {
          ...projectWithReportSig.foundations[0],
          inspectionMeta: {
            inspectorName: 'Engr. Navarro',
            contractorRep: 'QA Witness Cruz',
            verifiedSignatureUrl: 'data:image/png;base64,VERSIG',
          },
        },
      })
    );
    expect(differentInspectorHtml).not.toContain('Inspector signature');
    expect(differentInspectorHtml).toContain('src="data:image/png;base64,VERSIG"');
    expect(differentInspectorHtml).toContain('QA Witness Cruz');

    // Vertical Mast Inspection Sheet renders uploaded signatures on its signoff row
    const mastProject = createCleanVerticalMastProject();
    const sec = mastProject.verticalMast!.sections[0];
    const mastSignedHtml = renderToStaticMarkup(
      createElement(VerticalMastInspectionSheet, {
        project: {
          ...mastProject,
          verticalMast: {
            ...mastProject.verticalMast!,
            sections: mastProject.verticalMast!.sections.map((s) =>
              s.id === sec.id
                ? {
                    ...s,
                    inspectionMeta: {
                      inspectorName: 'QA Engr. Tan',
                      inspectorSignatureUrl: '/api/images/proj1/signature/insp.png',
                      contractorRep: 'Client Engr. Lim',
                      verifiedSignatureUrl: '/api/images/proj1/signature/ver.png',
                    },
                  }
                : s
            ),
          },
        },
        target: { kind: 'section', id: sec.id },
      })
    );
    expect(mastSignedHtml).toContain('src="/api/images/proj1/signature/insp.png"');
    expect(mastSignedHtml).toContain('src="/api/images/proj1/signature/ver.png"');

    // Storage / R2 key tracking collects inline & synced signatures
    const inlineRefs = collectInlineImageRefs({
      foundations: [
        {
          inspectionMeta: {
            inspectorSignatureUrl: 'data:image/png;base64,FINS',
            verifiedSignatureUrl: 'data:image/png;base64,FVER',
          },
        },
      ],
      verticalMast: {
        sections: [
          { inspectionMeta: { inspectorSignatureUrl: 'data:image/png;base64,SEC' } },
        ],
        guyLayers: [
          { inspectionMeta: { verifiedSignatureUrl: 'data:image/png;base64,GL' } },
        ],
      },
      dailyLogs: [],
      reportDetails: {
        preparedSignatureUrl: 'data:image/png;base64,RP',
        checkedSignatureUrl: 'data:image/png;base64,RC',
        approvedSignatureUrl: 'data:image/png;base64,RA',
      },
    });
    expect(inlineRefs.map((r) => r.category)).toEqual([
      'signature',
      'signature',
      'signature',
      'signature',
      'signature',
      'signature',
      'signature',
    ]);

    const r2Keys = extractMediaKeysFromProjectState({
      ...mastProject,
      reportDetails: {
        preparedSignatureUrl: '/api/images/p1/signature/p.png',
        checkedSignatureUrl: '/api/images/p1/signature/c.png',
        approvedSignatureUrl: '/api/images/p1/signature/a.png',
      },
      foundations: mastProject.foundations.map((f, idx) =>
        idx === 0
          ? {
              ...f,
              inspectionMeta: {
                inspectorSignatureUrl: '/api/images/p1/signature/fi.png',
                verifiedSignatureUrl: '/api/images/p1/signature/fv.png',
              },
            }
          : f
      ),
      verticalMast: {
        ...mastProject.verticalMast!,
        sections: mastProject.verticalMast!.sections.map((s, idx) =>
          idx === 0
            ? {
                ...s,
                inspectionMeta: {
                  inspectorSignatureUrl: '/api/images/p1/signature/ms.png',
                },
              }
            : s
        ),
        guyLayers: mastProject.verticalMast!.guyLayers.map((g, idx) =>
          idx === 0
            ? {
                ...g,
                inspectionMeta: {
                  verifiedSignatureUrl: '/api/images/p1/signature/mg.png',
                },
              }
            : g
        ),
      },
    });
    expect(Array.from(r2Keys)).toEqual(
      expect.arrayContaining([
        'p1/signature/p.png',
        'p1/signature/c.png',
        'p1/signature/a.png',
        'p1/signature/fi.png',
        'p1/signature/fv.png',
        'p1/signature/ms.png',
        'p1/signature/mg.png',
      ])
    );
  });

  it('supports overriding signatory names, titles, and signatures per report generation without altering project defaults', () => {
    // 1. Replacing a name drops the old default signature unless a new signature is provided
    expect(
      resolveOverriddenSignatureUrl({
        overrideName: 'Engr. Replacement',
        overrideSignature: undefined,
        baseName: 'Engr. Avila',
        baseSignature: 'data:image/png;base64,OLD',
      })
    ).toBeUndefined();

    // 2. Providing a new signature for the overridden name uses the uploaded override
    expect(
      resolveOverriddenSignatureUrl({
        overrideName: 'Engr. Replacement',
        overrideSignature: 'data:image/png;base64,NEW',
        baseName: 'Engr. Avila',
        baseSignature: 'data:image/png;base64,OLD',
      })
    ).toBe('data:image/png;base64,NEW');

    // 3. Explicit null leaves signature blank even when keeping the same name
    expect(
      resolveOverriddenSignatureUrl({
        overrideName: undefined,
        overrideSignature: null,
        baseName: 'Engr. Avila',
        baseSignature: 'data:image/png;base64,OLD',
      })
    ).toBeUndefined();

    // 4. Applying overrides to report details and inspection signoffs updates rendered sheets cleanly
    const baseProject = createCleanBaselineProject();
    const projectWithDefaults = {
      ...baseProject,
      preparedBy: 'Engr. Avila',
      reportDetails: {
        ...baseProject.reportDetails,
        preparedBy: 'Engr. Avila',
        preparedTitle: 'Site Engineer',
        preparedSignatureUrl: 'data:image/png;base64,DEFSIG',
        checkedBy: 'Engr. Checker',
        checkedSignatureUrl: 'data:image/png;base64,CHKSIG',
      },
    };

    const overriddenDetails = applySignoffOverridesToDetails(
      resolveReportDetails(projectWithDefaults),
      {
        prepared: {
          name: 'Engr. Mateo',
          title: 'Relieving Engineer',
          signatureUrl: 'data:image/png;base64,MATEO',
        },
        checked: {
          name: 'Engr. QA Override',
          signatureUrl: null,
        },
        approved: {
          name: 'Dir. Gomez',
          signatureUrl: 'data:image/png;base64,GOMEZ',
        },
      }
    );

    const footerHtml = renderToStaticMarkup(
      createElement(ReportSignoffFooter, {
        details: overriddenDetails,
        fallbackDate: '2026-11-16',
      })
    );
    expect(footerHtml).toContain('Engr. Mateo');
    expect(footerHtml).toContain('Relieving Engineer');
    expect(footerHtml).toContain('src="data:image/png;base64,MATEO"');
    expect(footerHtml).not.toContain('src="data:image/png;base64,DEFSIG"');
    expect(footerHtml).toContain('Engr. QA Override');
    expect(footerHtml).not.toContain('src="data:image/png;base64,CHKSIG"');
    expect(footerHtml).toContain('Dir. Gomez');
    expect(footerHtml).toContain('src="data:image/png;base64,GOMEZ"');

    const headerHtml = renderToStaticMarkup(
      createElement(ReportLetterhead, {
        details: overriddenDetails,
        defaultTitle: 'ACTIVITY REPORT',
      })
    );
    expect(headerHtml).toContain('Engr. QA Override');

    const inspResolved = resolveInspectionSignoffs({
      project: projectWithDefaults,
      meta: {
        inspectorName: 'Engr. Avila',
        contractorRep: 'Original Witness',
        verifiedSignatureUrl: 'data:image/png;base64,OLDVER',
      },
      baseDetails: resolveReportDetails(projectWithDefaults),
      overrides: {
        prepared: {
          name: 'Engr. Temp Inspector',
          signatureUrl: 'data:image/png;base64,TEMPINSP',
        },
        verified: {
          name: 'Engr. Temp Verifier',
          signatureUrl: 'data:image/png;base64,TEMPVER',
        },
      },
    });
    expect(inspResolved.inspectorName).toBe('Engr. Temp Inspector');
    expect(inspResolved.inspectorSignatureUrl).toBe('data:image/png;base64,TEMPINSP');
    expect(inspResolved.verifiedBy).toBe('Engr. Temp Verifier');
    expect(inspResolved.verifiedSignatureUrl).toBe('data:image/png;base64,TEMPVER');
  });
});
