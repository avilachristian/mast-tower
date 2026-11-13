import type {
  GuyLayerStatus,
  TowerSectionRecord,
  TowerSectionStatus,
  VerticalMastState,
} from './types';
import { TOWER_SECTION_STATUS_META } from './verticalMastBaseline';

export interface VerticalMastOrderViolation {
  kind:
    | 'section_bottom_up'
    | 'section_top_down_revert'
    | 'section_has_active_guys'
    | 'guy_requires_section';
  title: string;
  message: string;
  detail: string;
  blockingSectionId?: string;
}

function formatSectionRange(sections: TowerSectionRecord[]): string {
  if (sections.length === 0) return '';
  const sorted = [...sections].sort((a, b) => a.sectionNo - b.sectionNo);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return sorted.length === 1
    ? first.id
    : `${first.id}–${last.id} (${sorted.length} sections)`;
}

/**
 * Enforces bottom-up tower erection order when advancing a single tower section
 * and top-down / dependency checks when reverting a section back to Pending.
 */
export function validateTowerSectionUpdate(
  vm: VerticalMastState,
  sectionId: string,
  nextStatus: TowerSectionStatus
): VerticalMastOrderViolation | null {
  const target = vm.sections.find((s) => s.id === sectionId);
  if (!target) return null;

  if (nextStatus === target.status) {
    return null;
  }

  // Upward progress: all lower sections S01..S[k-1] must be completed first
  if (nextStatus !== 'not_started') {
    const incompleteBelow = vm.sections
      .filter((s) => s.sectionNo < target.sectionNo && s.status !== 'plumbed_verified')
      .sort((a, b) => a.sectionNo - b.sectionNo);

    if (incompleteBelow.length > 0) {
      const firstIncomplete = incompleteBelow[0];
      const nextLabel = TOWER_SECTION_STATUS_META[nextStatus].label;
      return {
        kind: 'section_bottom_up',
        title: 'Bottom-Up Erection Order Required',
        message: `Cannot mark ${target.id} (+${target.elevationFromM.toFixed(1)}m–${target.elevationToM.toFixed(1)}m) as "${nextLabel}" while lower tower sections remain incomplete.`,
        detail: `Tower sections must be erected from bottom to top. Complete ${formatSectionRange(incompleteBelow)} first, starting at ${firstIncomplete.id}.`,
        blockingSectionId: firstIncomplete.id,
      };
    }
    return null;
  }

  // Downward revert to Pending: check sections above target and attached guy layers
  const installedAbove = vm.sections
    .filter((s) => s.sectionNo > target.sectionNo && s.status !== 'not_started')
    .sort((a, b) => a.sectionNo - b.sectionNo);

  if (installedAbove.length > 0) {
    const topInstalled = installedAbove[installedAbove.length - 1];
    return {
      kind: 'section_top_down_revert',
      title: 'Upper Sections Still Installed',
      message: `Cannot revert ${target.id} to "Pending / Not Started" while upper section${installedAbove.length > 1 ? 's' : ''} ${formatSectionRange(installedAbove)} remain marked installed.`,
      detail: `Revert erected sections from the top down starting at ${topInstalled.id}, or use "Apply Range" in Mast Tower Status to clear ${target.id}–${topInstalled.id}.`,
      blockingSectionId: topInstalled.id,
    };
  }

  const activeGuys = vm.guyLayers.filter(
    (g) => g.sectionId === target.id && g.status !== 'not_started'
  );
  if (activeGuys.length > 0) {
    return {
      kind: 'section_has_active_guys',
      title: 'Attached Guy Layer Still Marked Installed',
      message: `Cannot revert ${target.id} to "Pending / Not Started" while attached guy layer ${activeGuys.map((g) => g.id).join(', ')} is still marked installed or tensioned.`,
      detail: `Reset ${activeGuys.map((g) => g.id).join(', ')} back to "Pending / Not Installed" before reverting ${target.id}.`,
      blockingSectionId: target.id,
    };
  }

  return null;
}

/**
 * Enforces bottom-up erection order and top-down revert order for batch range updates.
 */
export function validateTowerSectionRangeUpdate(
  vm: VerticalMastState,
  fromSectionNo: number,
  toSectionNo: number,
  nextStatus: TowerSectionStatus
): VerticalMastOrderViolation | null {
  const lo = Math.min(fromSectionNo, toSectionNo);
  const hi = Math.max(fromSectionNo, toSectionNo);

  if (nextStatus !== 'not_started') {
    const incompleteBelow = vm.sections
      .filter((s) => s.sectionNo < lo && s.status !== 'plumbed_verified')
      .sort((a, b) => a.sectionNo - b.sectionNo);

    if (incompleteBelow.length > 0) {
      const firstIncomplete = incompleteBelow[0];
      const loId = `S${String(lo).padStart(2, '0')}`;
      const hiId = `S${String(hi).padStart(2, '0')}`;
      const rangeLabel = lo === hi ? loId : `${loId}–${hiId}`;
      return {
        kind: 'section_bottom_up',
        title: 'Bottom-Up Erection Order Required',
        message: `Cannot mark range ${rangeLabel} as "${TOWER_SECTION_STATUS_META[nextStatus].label}" while lower tower sections are still incomplete.`,
        detail: `Complete ${formatSectionRange(incompleteBelow)} first (or start the range from ${firstIncomplete.id}).`,
        blockingSectionId: firstIncomplete.id,
      };
    }
    return null;
  }

  const installedAbove = vm.sections
    .filter((s) => s.sectionNo > hi && s.status !== 'not_started')
    .sort((a, b) => a.sectionNo - b.sectionNo);

  if (installedAbove.length > 0) {
    const topInstalled = installedAbove[installedAbove.length - 1];
    const loId = `S${String(lo).padStart(2, '0')}`;
    const hiId = `S${String(hi).padStart(2, '0')}`;
    const rangeLabel = lo === hi ? loId : `${loId}–${hiId}`;
    return {
      kind: 'section_top_down_revert',
      title: 'Upper Sections Still Installed',
      message: `Cannot revert ${rangeLabel} to "Pending / Not Started" while upper section${installedAbove.length > 1 ? 's' : ''} ${formatSectionRange(installedAbove)} remain marked installed.`,
      detail: `Extend your revert range up to ${topInstalled.id} so sections are cleared from the top down.`,
      blockingSectionId: topInstalled.id,
    };
  }

  const sectionIdsInRange = new Set(
    vm.sections
      .filter((s) => s.sectionNo >= lo && s.sectionNo <= hi)
      .map((s) => s.id)
  );
  const activeGuysInRange = vm.guyLayers.filter(
    (g) => sectionIdsInRange.has(g.sectionId) && g.status !== 'not_started'
  );
  if (activeGuysInRange.length > 0) {
    const firstGuy = activeGuysInRange[0];
    return {
      kind: 'section_has_active_guys',
      title: 'Attached Guy Layers Still Marked Installed',
      message: `Cannot revert sections containing installed/tensioned guy cables (${activeGuysInRange.map((g) => g.id).join(', ')}).`,
      detail: `Reset guy layer ${firstGuy.id} back to "Pending / Not Installed" first before clearing ${firstGuy.sectionId}.`,
      blockingSectionId: firstGuy.sectionId,
    };
  }

  return null;
}

/**
 * Ensures a guy cable layer cannot be marked installed or tensioned until its host
 * tower section (and therefore all lower sections) is completed.
 */
export function validateGuyLayerUpdate(
  vm: VerticalMastState,
  guyLayerId: string,
  nextStatus: GuyLayerStatus
): VerticalMastOrderViolation | null {
  if (nextStatus === 'not_started') {
    return null;
  }

  const guyLayer = vm.guyLayers.find((g) => g.id === guyLayerId);
  if (!guyLayer) return null;

  const hostSection = vm.sections.find((s) => s.id === guyLayer.sectionId);
  if (hostSection && hostSection.status !== 'plumbed_verified') {
    const incompleteUpToHost = vm.sections
      .filter((s) => s.sectionNo <= hostSection.sectionNo && s.status !== 'plumbed_verified')
      .sort((a, b) => a.sectionNo - b.sectionNo);
    const firstIncomplete = incompleteUpToHost[0] ?? hostSection;
    return {
      kind: 'guy_requires_section',
      title: `Host Tower Section ${hostSection.id} Not Completed`,
      message: `Cannot update guy layer ${guyLayer.id} (+${guyLayer.elevationM.toFixed(1)} m) before host tower section ${hostSection.id} is marked "Tower Leg Installed".`,
      detail: `Erect lower tower sections bottom-up (${formatSectionRange(incompleteUpToHost)}) starting at ${firstIncomplete.id} before installing or tensioning ${guyLayer.id} guy cables.`,
      blockingSectionId: firstIncomplete.id,
    };
  }

  return null;
}
