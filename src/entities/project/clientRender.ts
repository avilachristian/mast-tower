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
  const shell: MastProjectState = {
    projectType: dto.projectType,
    projectName: dto.projectName,
    location: dto.location,
    preparedBy: '',
    contractor: dto.contractor,
    towerHeightM: dto.towerHeightM,
    lastUpdated: dto.lastUpdated,
    reportDetails: {
      projectName: dto.projectName,
      projectLocation: dto.location,
      clientName: dto.clientName,
      contractor: dto.contractor,
      referenceNo: dto.referenceNo,
      logos: resolveReportLogos(dto.logos),
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
    schedule: dto.schedule,
    inventory: [],
  };

  return {
    ...shell,
    verticalMast: resolveVerticalMastState(shell),
  };
}
