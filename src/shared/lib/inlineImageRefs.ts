import { DEFAULT_REPORT_LOGOS } from '@/shared/assets/defaultLogos';

export interface InlineImageCapableState {
  foundations: Array<{
    inspectionChecklist?: Record<
      string,
      { photoDataUrl?: string; photoName?: string } | undefined
    >;
  }>;
  verticalMast?: {
    sections: Array<{
      inspectionChecklist?: Record<
        string,
        { photoDataUrl?: string; photoName?: string } | undefined
      >;
    }>;
    guyLayers: Array<{
      inspectionChecklist?: Record<
        string,
        { photoDataUrl?: string; photoName?: string } | undefined
      >;
    }>;
  };
  dailyLogs: Array<{
    documentationItems?: Array<{ photoDataUrl?: string; photoName?: string }>;
  }>;
  reportDetails?: {
    logos?: {
      left?: { dataUrl: string; caption?: string };
      center?: { dataUrl: string; caption?: string };
      right?: { dataUrl: string; caption?: string };
    };
  };
}

export interface InlineImageRef {
  category: 'inspection' | 'daily_log' | 'logo';
  nameHint: string;
  getValue: () => string | undefined;
  setValue: (next: string) => void;
}

export function collectInlineImageRefs(
  state: InlineImageCapableState
): InlineImageRef[] {
  const refs: InlineImageRef[] = [];

  for (const f of state.foundations ?? []) {
    if (!f.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(f.inspectionChecklist)) {
      if (entry?.photoDataUrl && entry.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'inspection',
          nameHint: entry.photoName || `foundation-${key}.jpg`,
          getValue: () => entry.photoDataUrl,
          setValue: (next) => {
            entry.photoDataUrl = next;
          },
        });
      }
    }
  }

  for (const sec of state.verticalMast?.sections ?? []) {
    if (!sec.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(sec.inspectionChecklist)) {
      if (entry?.photoDataUrl && entry.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'inspection',
          nameHint: entry.photoName || `mast-sec-${key}.jpg`,
          getValue: () => entry.photoDataUrl,
          setValue: (next) => {
            entry.photoDataUrl = next;
          },
        });
      }
    }
  }

  for (const layer of state.verticalMast?.guyLayers ?? []) {
    if (!layer.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(layer.inspectionChecklist)) {
      if (entry?.photoDataUrl && entry.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'inspection',
          nameHint: entry.photoName || `mast-layer-${key}.jpg`,
          getValue: () => entry.photoDataUrl,
          setValue: (next) => {
            entry.photoDataUrl = next;
          },
        });
      }
    }
  }

  for (const log of state.dailyLogs ?? []) {
    for (const doc of log.documentationItems ?? []) {
      if (doc.photoDataUrl && doc.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'daily_log',
          nameHint: doc.photoName || 'daily-doc.jpg',
          getValue: () => doc.photoDataUrl,
          setValue: (next) => {
            doc.photoDataUrl = next;
          },
        });
      }
    }
  }

  const logos = state.reportDetails?.logos;
  if (logos) {
    for (const slot of ['left', 'center', 'right'] as const) {
      const item = logos[slot];
      const defaultUrl = DEFAULT_REPORT_LOGOS[slot]?.dataUrl;
      if (
        item?.dataUrl &&
        item.dataUrl.startsWith('data:image/') &&
        item.dataUrl !== defaultUrl
      ) {
        refs.push({
          category: 'logo',
          nameHint: `logo-${slot}.png`,
          getValue: () => item.dataUrl,
          setValue: (next) => {
            item.dataUrl = next;
          },
        });
      }
    }
  }

  return refs;
}

/**
 * Replaces matching inline data URLs inside a project state clone without
 * disturbing concurrent edits to unrelated fields.
 */
export function replaceInlineImageUrlsInState<
  T extends InlineImageCapableState,
>(state: T, urlMap: ReadonlyMap<string, string>): { nextState: T; replacedCount: number } {
  if (urlMap.size === 0) return { nextState: state, replacedCount: 0 };
  const cloned = JSON.parse(JSON.stringify(state)) as T;
  const refs = collectInlineImageRefs(cloned);
  let replacedCount = 0;

  for (const ref of refs) {
    const val = ref.getValue();
    if (!val) continue;
    const mapped = urlMap.get(val);
    if (mapped) {
      ref.setValue(mapped);
      replacedCount += 1;
    }
  }

  return { nextState: cloned, replacedCount };
}
