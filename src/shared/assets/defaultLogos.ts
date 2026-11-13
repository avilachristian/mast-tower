import gslLogoUrl from '@/assets/defaults/GSL Logo.png';
import pgpcLogoUrl from '@/assets/defaults/PGPC Logo.png';
import gediLogoUrl from '@/assets/defaults/GEDI Logo.png';
import type { ReportDetailsSpec, ReportLogoItem } from '@/entities/project/types';

export type ReportLogoSlot = 'left' | 'center' | 'right';
export type ReportLogosMap = NonNullable<ReportDetailsSpec['logos']>;

export const DEFAULT_REPORT_LOGOS: Readonly<Record<ReportLogoSlot, ReportLogoItem>> = {
  left: { dataUrl: gslLogoUrl, caption: '' },
  center: { dataUrl: pgpcLogoUrl, caption: '' },
  right: { dataUrl: gediLogoUrl, caption: '' },
};

export function createDefaultReportLogos(): ReportLogosMap {
  return {
    left: { ...DEFAULT_REPORT_LOGOS.left },
    center: { ...DEFAULT_REPORT_LOGOS.center },
    right: { ...DEFAULT_REPORT_LOGOS.right },
  };
}

/**
 * Resolve letterhead logos with GSL (left), PGPC (center), and GEDI (right) defaults
 * whenever a slot is unset, while preserving explicitly cleared slots (`dataUrl: ''`)
 * and user-uploaded overrides.
 */
export function resolveReportLogos(logos?: ReportDetailsSpec['logos']): ReportLogosMap {
  return {
    left: logos?.left !== undefined ? { ...logos.left } : { ...DEFAULT_REPORT_LOGOS.left },
    center: logos?.center !== undefined ? { ...logos.center } : { ...DEFAULT_REPORT_LOGOS.center },
    right: logos?.right !== undefined ? { ...logos.right } : { ...DEFAULT_REPORT_LOGOS.right },
  };
}

