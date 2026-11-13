import { getFoundationChecklistSteps } from './mast2Baseline';
import type { FoundationRecord, FoundationStageChecklist } from './types';

export interface FoundationChecklistViolation {
  kind: 'checklist_order_forward' | 'checklist_order_reverse';
  title: string;
  message: string;
  detail: string;
  foundationId: string;
  requiredStepKey: keyof FoundationStageChecklist;
}

/**
 * Enforces sequential 1→8 completion order (and 8→1 reverse unchecking order)
 * on the Foundation Phase activities checklist.
 */
export function validateFoundationChecklistToggle(
  foundation: FoundationRecord,
  key: keyof FoundationStageChecklist
): FoundationChecklistViolation | null {
  const steps = getFoundationChecklistSteps(foundation.type);
  const idx = steps.findIndex((s) => s.key === key);
  if (idx === -1) return null;

  const targetStep = steps[idx];
  const nextVal = !Boolean(foundation.checklist[key]);

  if (nextVal) {
    const missingPrior = steps
      .slice(0, idx)
      .filter((s) => !Boolean(foundation.checklist[s.key]));
    if (missingPrior.length > 0) {
      const firstMissing = missingPrior[0];
      return {
        kind: 'checklist_order_forward',
        title: 'Sequential Activity Order Required',
        message: `Cannot mark "${targetStep.label}" completed on ${foundation.id} before earlier foundation ${missingPrior.length > 1 ? 'activities are' : 'activity is'} checked.`,
        detail: `Check foundation activities in order. Complete "${firstMissing.label}"${missingPrior.length > 1 ? ` (and ${missingPrior.length - 1} more preceding step${missingPrior.length - 1 > 1 ? 's' : ''})` : ''} first.`,
        foundationId: foundation.id,
        requiredStepKey: firstMissing.key,
      };
    }
    return null;
  }

  const checkedAfter = steps
    .slice(idx + 1)
    .filter((s) => Boolean(foundation.checklist[s.key]));
  if (checkedAfter.length > 0) {
    const lastChecked = checkedAfter[checkedAfter.length - 1];
    return {
      kind: 'checklist_order_reverse',
      title: 'Uncheck Later Activities First',
      message: `Cannot uncheck "${targetStep.label}" on ${foundation.id} while later foundation ${checkedAfter.length > 1 ? 'activities remain' : 'activity remains'} checked completed.`,
      detail: `Uncheck activities in reverse order starting from "${lastChecked.label}" before reverting step ${idx + 1}.`,
      foundationId: foundation.id,
      requiredStepKey: lastChecked.key,
    };
  }

  return null;
}

