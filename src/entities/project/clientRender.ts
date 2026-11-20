import { resolveReportLogos } from '@/shared/assets/defaultLogos';
import { checklistFromStatus } from './mast2Baseline';
import { resolveVerticalMastState } from './verticalMastCalculations';
import type { ClientProjectShowcaseDto, MastProjectState } from './types';

/**
 * Reconstructs a minimal read-only MastProjectState shell from a sanitized ClientProjectShowcaseDto
 * so shared KPI calculators and 2D SVG diagram widgets can render without duplicating engineering logic.
 */
export function toClientRenderProjectState(
  dto: ClientProjectShowcaseDto
): MastProjectState {
  const rd = dto.reportDetails;
  const effectiveProjectType =
    dto.settings.phaseMode === 'foundation' && !dto.verticalMastSummary
      ? 'foundation'
      : dto.projectType;
  const shell: MastProjectState = {
    projectType: effectiveProjectType,
    projectName: dto.projectName,
    location: dto.location,
    preparedBy: rd?.preparedBy?.trim() || '',
    contractor: dto.contractor,
    towerHeightM: dto.towerHeightM,
    lastUpdated: dto.lastUpdated,
    reportDetails: {
      ...(rd ?? {}),
      projectName: rd?.projectName?.trim() || dto.projectName,
      projectLocation: rd?.projectLocation?.trim() || dto.location,
      clientName: rd?.clientName?.trim() || dto.clientName,
      contractor: rd?.contractor?.trim() || dto.contractor,
      referenceNo: rd?.referenceNo?.trim() || dto.referenceNo,
      logos: resolveReportLogos(rd?.logos ?? dto.logos),
    },
    foundations: dto.foundations.map((f) => ({
      ...f,
      checklist: checklistFromStatus(f.status),
      actualCementBagsUsed: 0,
      actualSandBagsUsed: 0,
      actualGravelBagsUsed: 0,
      notes: '',
    })),
    verticalMast: dto.verticalMastSummary,
    haulingLogs: [],
    dailyLogs: [],
    inventory: [],
  };

  return {
    ...shell,
    verticalMast: resolveVerticalMastState(shell),
  };
}
