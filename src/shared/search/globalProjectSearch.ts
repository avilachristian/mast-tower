import type {
  MastProjectState,
} from '@/entities/project/types';
import type { ActiveAppTab } from '@/shared/state/uiStore';

export type SearchCategory =
  | 'daily_logs'
  | 'inspections'
  | 'manpower'
  | 'hauling'
  | 'photos';

export interface SearchNavigationTarget {
  tab: ActiveAppTab;
  phase?: 'foundation' | 'vertical_mast';
  foundationId?: string;
  dailyLogId?: string;
  manpowerSubTab?: 'roster' | 'payment';
  manpowerMode?: 'civil_works' | 'hauler';
  photoId?: string;
}

export interface SearchResultItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'indigo';
  snippet?: string;
  photoUrl?: string;
  navigation: SearchNavigationTarget;
}

export interface SearchCategoryGroup {
  category: SearchCategory;
  label: string;
  items: SearchResultItem[];
}

function truncateSnippet(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}...`;
}

function extractSnippet(text: string, term: string, radius = 40): string {
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(term.toLowerCase());
  if (idx === -1) return truncateSnippet(text);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function searchProject(
  project: MastProjectState,
  query: string
): SearchResultItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const results: SearchResultItem[] = [];

  // 1. Search Daily Logs
  for (const log of project.dailyLogs ?? []) {
    const dayStr = `day ${log.dayNumber}`;
    const dateStr = log.date ?? '';
    const weatherStr = `${log.weather ?? ''} ${log.weatherNotes ?? ''}`;
    const summaryStr = log.activitiesSummary ?? '';
    const remarksStr = log.issuesOrDelays ?? '';
    const safetySummary = log.safetyAndVisitors ?? '';

    let matched = false;
    let snippet = '';

    if (dayStr.includes(trimmed)) {
      matched = true;
      snippet = `Matched day: Day ${log.dayNumber}`;
    } else if (dateStr.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = `Date: ${dateStr}`;
    } else if (weatherStr.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = extractSnippet(weatherStr, trimmed);
    } else if (summaryStr.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = extractSnippet(summaryStr, trimmed);
    } else if (remarksStr.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = extractSnippet(remarksStr, trimmed);
    } else if (safetySummary.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = extractSnippet(safetySummary, trimmed);
    }

    // Check individual activities
    if (!matched && log.activities) {
      for (const act of log.activities) {
        if (
          act.description.toLowerCase().includes(trimmed) ||
          (act.remarks && act.remarks.toLowerCase().includes(trimmed))
        ) {
          matched = true;
          snippet = extractSnippet(
            `${act.description} ${act.remarks ? `(${act.remarks})` : ''}`,
            trimmed
          );
          break;
        }
      }
    }

    // Check safety items
    if (!matched && log.safetyLogs) {
      for (const s of log.safetyLogs) {
        if (
          s.hazardOrFinding.toLowerCase().includes(trimmed) ||
          s.actionTaken.toLowerCase().includes(trimmed)
        ) {
          matched = true;
          snippet = extractSnippet(`${s.hazardOrFinding} - ${s.actionTaken}`, trimmed);
          break;
        }
      }
    }

    // Check workers in log
    if (!matched && log.workers) {
      for (const w of log.workers) {
        if (
          w.names.toLowerCase().includes(trimmed) ||
          w.role.toLowerCase().includes(trimmed)
        ) {
          matched = true;
          snippet = extractSnippet(`${w.role}: ${w.names}`, trimmed);
          break;
        }
      }
    }

    // Check materials in log
    if (!matched && log.materialsOnSite) {
      for (const m of log.materialsOnSite) {
        if (
          m.name.toLowerCase().includes(trimmed) ||
          (m.remarks && m.remarks.toLowerCase().includes(trimmed))
        ) {
          matched = true;
          snippet = extractSnippet(`${m.name} (${m.usedTodayQty} ${m.unit} used)`, trimmed);
          break;
        }
      }
    }

    if (matched) {
      results.push({
        id: `daily-log-${log.id}`,
        category: 'daily_logs',
        title: `Day ${log.dayNumber} Daily Log`,
        subtitle: `${log.date} • Weather: ${log.weather} • Workers: ${log.totalWorkers ?? log.workers?.length ?? 0}`,
        badge: `Day ${log.dayNumber}`,
        badgeTone: 'sky',
        snippet,
        navigation: {
          tab: 'daily_logs',
          dailyLogId: log.id,
        },
      });
    }
  }

  // 2. Search Foundations & Inspections
  for (const f of project.foundations ?? []) {
    let matched = false;
    let snippet = '';

    const labelStr = `${f.code} ${f.name} ${f.type} ${f.status} ${f.notes ?? ''}`;
    if (labelStr.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = f.notes
        ? extractSnippet(f.notes, trimmed)
        : `Status: ${f.status.replace(/_/g, ' ')}`;
    }

    // Check inspection checklist items
    if (!matched && f.inspectionChecklist) {
      for (const [key, entry] of Object.entries(f.inspectionChecklist)) {
        if (!entry) continue;
        const entryStr = `${key} ${entry.description ?? ''} ${entry.remarks ?? ''} ${entry.planMeasurement ?? ''} ${entry.actualMeasurement ?? ''}`;
        if (entryStr.toLowerCase().includes(trimmed)) {
          matched = true;
          snippet = extractSnippet(
            `${entry.description || key}: ${entry.remarks || entry.status}`,
            trimmed
          );
          break;
        }
      }
    }

    // Check custom inspection items
    if (!matched && f.customInspectionItems) {
      for (const item of f.customInspectionItems) {
        if (
          item.description.toLowerCase().includes(trimmed) ||
          item.planMeasurement.toLowerCase().includes(trimmed)
        ) {
          matched = true;
          snippet = extractSnippet(`${item.description} (${item.planMeasurement})`, trimmed);
          break;
        }
      }
    }

    if (matched) {
      results.push({
        id: `foundation-${f.id}`,
        category: 'inspections',
        title: `${f.name} (${f.code})`,
        subtitle: `Sector ${f.sector} • Status: ${f.status.replace(/_/g, ' ')}`,
        badge: f.code,
        badgeTone: 'amber',
        snippet,
        navigation: {
          tab: 'inspection',
          phase: 'foundation',
          foundationId: f.id,
        },
      });
    }
  }

  // Search vertical mast sections (if present)
  if (project.verticalMast?.sections) {
    for (const sec of project.verticalMast.sections) {
      let matched = false;
      let snippet = '';
      const secStr = `${sec.label} ${sec.kind} ${sec.status} ${sec.notes ?? ''}`;
      if (secStr.toLowerCase().includes(trimmed)) {
        matched = true;
        snippet = sec.notes ? extractSnippet(sec.notes, trimmed) : `Status: ${sec.status}`;
      }

      if (!matched && sec.inspectionChecklist) {
        for (const [key, entry] of Object.entries(sec.inspectionChecklist)) {
          if (!entry) continue;
          const entryStr = `${key} ${entry.description ?? ''} ${entry.remarks ?? ''}`;
          if (entryStr.toLowerCase().includes(trimmed)) {
            matched = true;
            snippet = extractSnippet(`${entry.description || key}: ${entry.remarks || ''}`, trimmed);
            break;
          }
        }
      }

      if (matched) {
        results.push({
          id: `section-${sec.id}`,
          category: 'inspections',
          title: `Tower Section ${sec.label}`,
          subtitle: `Elevation: ${sec.elevationFromM}m - ${sec.elevationToM}m • Status: ${sec.status}`,
          badge: sec.label,
          badgeTone: 'indigo',
          snippet,
          navigation: {
            tab: 'inspection',
            phase: 'vertical_mast',
          },
        });
      }
    }
  }

  // 3. Search Payroll & Manpower
  // Roster members
  for (const m of project.manpowerRoster ?? []) {
    const memberStr = `${m.name} ${m.position} ${m.category} ${m.notes ?? ''}`;
    if (memberStr.toLowerCase().includes(trimmed)) {
      results.push({
        id: `manpower-member-${m.id}`,
        category: 'manpower',
        title: m.name,
        subtitle: `${m.position} • Rate: ₱${m.dailyRatePhp.toLocaleString()}/day • ${m.category === 'hauler' ? 'Hauler' : 'Civil Works'}`,
        badge: m.category === 'hauler' ? 'Hauler' : 'Civil Crew',
        badgeTone: m.category === 'hauler' ? 'indigo' : 'emerald',
        snippet: m.notes ? extractSnippet(m.notes, trimmed) : undefined,
        navigation: {
          tab: 'manpower',
          manpowerSubTab: 'roster',
        },
      });
    }
  }

  // Civil Payroll Snapshots
  for (const snap of project.civilPayrollHistory ?? []) {
    let matched = false;
    let snippet = '';
    const snapStr = `${snap.title} ${snap.startDate} ${snap.endDate} ${snap.notes ?? ''}`;
    if (snapStr.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = `Period: ${snap.startDate} to ${snap.endDate}`;
    }

    if (!matched && snap.items) {
      for (const item of snap.items) {
        if (
          item.name.toLowerCase().includes(trimmed) ||
          item.position.toLowerCase().includes(trimmed)
        ) {
          matched = true;
          snippet = extractSnippet(`${item.name} (${item.position}): ₱${(item.netPayPhp ?? item.grossPayPhp).toLocaleString()}`, trimmed);
          break;
        }
      }
    }

    if (matched) {
      results.push({
        id: `civil-payroll-${snap.id}`,
        category: 'manpower',
        title: `Civil Payroll: ${snap.title}`,
        subtitle: `Total: ₱${snap.totalAmountPhp.toLocaleString()} • ${snap.startDate} to ${snap.endDate} • Status: ${snap.status}`,
        badge: 'Civil Payroll',
        badgeTone: 'emerald',
        snippet,
        navigation: {
          tab: 'manpower',
          manpowerSubTab: 'payment',
          manpowerMode: 'civil_works',
        },
      });
    }
  }

  // Hauler Payroll Snapshots
  for (const snap of project.haulerPayrollHistory ?? []) {
    let matched = false;
    let snippet = '';
    const snapStr = `${snap.title} ${snap.startDate} ${snap.endDate} ${snap.notes ?? ''}`;
    if (snapStr.toLowerCase().includes(trimmed)) {
      matched = true;
      snippet = `Period: ${snap.startDate} to ${snap.endDate}`;
    }

    if (!matched && snap.items) {
      for (const item of snap.items) {
        if (item.haulerName.toLowerCase().includes(trimmed)) {
          matched = true;
          snippet = extractSnippet(
            `${item.haulerName}: ${item.hauledKg} kg hauled, ₱${item.payoutReleasedPhp.toLocaleString()} paid`,
            trimmed
          );
          break;
        }
      }
    }

    if (matched) {
      results.push({
        id: `hauler-payroll-${snap.id}`,
        category: 'manpower',
        title: `Hauler Payroll: ${snap.title}`,
        subtitle: `Total: ₱${snap.totalPayoutPhp.toLocaleString()} • ${snap.startDate} to ${snap.endDate} • Status: ${snap.status}`,
        badge: 'Hauler Payroll',
        badgeTone: 'indigo',
        snippet,
        navigation: {
          tab: 'manpower',
          manpowerSubTab: 'payment',
          manpowerMode: 'hauler',
        },
      });
    }
  }

  // Hauler Payouts / Ledger Records
  for (const p of project.haulerPayouts ?? []) {
    const payoutStr = `${p.haulerName} ${p.date} ${p.notes ?? ''} ${p.kind ?? 'payout'}`;
    if (payoutStr.toLowerCase().includes(trimmed)) {
      results.push({
        id: `hauler-payout-${p.id}`,
        category: 'manpower',
        title: `Hauler Ledger: ${p.haulerName}`,
        subtitle: `${p.kind === 'deduction' ? 'Deduction' : 'Payout'}: ₱${p.amountPhp.toLocaleString()} on ${p.date}`,
        badge: p.kind === 'deduction' ? 'Deduction' : 'Payout',
        badgeTone: p.kind === 'deduction' ? 'rose' : 'emerald',
        snippet: p.notes ? extractSnippet(p.notes, trimmed) : undefined,
        navigation: {
          tab: 'manpower',
          manpowerSubTab: 'payment',
          manpowerMode: 'hauler',
        },
      });
    }
  }

  // 4. Search Hauling & Inventory
  for (const h of project.haulingLogs ?? []) {
    const haulingStr = `${h.haulerName} ${h.itemLabel ?? ''} ${h.material} ${h.destinationFoundationId} ${h.date} ${h.remarks ?? ''}`;
    if (haulingStr.toLowerCase().includes(trimmed)) {
      results.push({
        id: `hauling-log-${h.id}`,
        category: 'hauling',
        title: `${h.haulerName} - ${h.itemLabel || h.material}`,
        subtitle: `${h.date} • ${h.quantity} ${h.unitLabel} (${h.totalKg} kg) -> ${h.destinationFoundationId}`,
        badge: 'Hauling',
        badgeTone: 'indigo',
        snippet: h.remarks ? extractSnippet(h.remarks, trimmed) : `Trip ${h.tripNumber ?? 1}`,
        navigation: {
          tab: 'hauling_inventory',
        },
      });
    }
  }

  for (const cm of project.centralMaterials ?? []) {
    const cmStr = `${cm.name} ${cm.category} ${cm.unit} ${cm.remarks ?? ''}`;
    if (cmStr.toLowerCase().includes(trimmed)) {
      results.push({
        id: `central-mat-${cm.id}`,
        category: 'hauling',
        title: `Material: ${cm.name}`,
        subtitle: `Target: ${cm.targetQty} ${cm.unit} • Stockyard: ${cm.stockYardTotalQty} ${cm.unit}`,
        badge: 'Material Item',
        badgeTone: 'slate',
        snippet: cm.remarks ? extractSnippet(cm.remarks, trimmed) : undefined,
        navigation: {
          tab: 'hauling_inventory',
        },
      });
    }
  }

  // 5. Search Photos & Documentation
  for (const log of project.dailyLogs ?? []) {
    for (const doc of log.documentationItems ?? []) {
      if (!doc.photoDataUrl && !doc.description && !doc.remarks) continue;
      const normalizedName = (doc.photoName ?? '').replace(/[_-]/g, ' ');
      const photoStr = `${doc.photoName ?? ''} ${normalizedName} ${doc.description ?? ''} ${doc.remarks ?? ''} day ${log.dayNumber} ${log.date}`;
      if (photoStr.toLowerCase().includes(trimmed)) {
        const isStaged = doc.photoDataUrl?.startsWith('data:image/');
        results.push({
          id: `photo-doc-${doc.id}`,
          category: 'photos',
          title: doc.description || doc.photoName || `Day ${log.dayNumber} Photo`,
          subtitle: `Day ${log.dayNumber} (${log.date})${doc.remarks ? ` • ${doc.remarks}` : ''}`,
          badge: isStaged ? 'Offline Staged' : 'Cloud R2',
          badgeTone: isStaged ? 'amber' : 'sky',
          photoUrl: doc.photoDataUrl,
          snippet: doc.remarks ? extractSnippet(doc.remarks, trimmed) : undefined,
          navigation: {
            tab: 'daily_logs',
            dailyLogId: log.id,
            photoId: doc.id,
          },
        });
      }
    }
  }

  // Inspection Photos
  for (const f of project.foundations ?? []) {
    if (!f.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(f.inspectionChecklist)) {
      if (!entry?.photoDataUrl) continue;
      const normalizedKey = key.replace(/[_-]/g, ' ');
      const normalizedName = (entry.photoName ?? '').replace(/[_-]/g, ' ');
      const inspPhotoStr = `${f.code} ${f.name} ${key} ${normalizedKey} ${entry.description ?? ''} ${entry.remarks ?? ''} ${entry.photoName ?? ''} ${normalizedName}`;
      if (inspPhotoStr.toLowerCase().includes(trimmed)) {
        const isStaged = entry.photoDataUrl.startsWith('data:image/');
        results.push({
          id: `photo-insp-${f.id}-${key}`,
          category: 'photos',
          title: `${f.name}: ${entry.description || key}`,
          subtitle: `Inspection Item (${entry.status})${entry.remarks ? ` • ${entry.remarks}` : ''}`,
          badge: isStaged ? 'Offline Staged' : 'Cloud R2',
          badgeTone: isStaged ? 'amber' : 'sky',
          photoUrl: entry.photoDataUrl,
          snippet: entry.remarks ? extractSnippet(entry.remarks, trimmed) : undefined,
          navigation: {
            tab: 'inspection',
            phase: 'foundation',
            foundationId: f.id,
          },
        });
      }
    }
  }

  return results;
}

export function groupSearchResults(items: SearchResultItem[]): SearchCategoryGroup[] {
  const groups: Record<SearchCategory, SearchResultItem[]> = {
    daily_logs: [],
    inspections: [],
    manpower: [],
    hauling: [],
    photos: [],
  };

  for (const item of items) {
    groups[item.category].push(item);
  }

  const categoryLabels: Record<SearchCategory, string> = {
    daily_logs: 'Daily Activity Logs',
    inspections: 'Foundations & Inspections',
    manpower: 'Manpower & Payroll',
    hauling: 'Hauling & Inventory',
    photos: 'Photos & Documentation',
  };

  const result: SearchCategoryGroup[] = [];
  const orderedCategories: SearchCategory[] = [
    'daily_logs',
    'inspections',
    'manpower',
    'hauling',
    'photos',
  ];

  for (const cat of orderedCategories) {
    if (groups[cat].length > 0) {
      result.push({
        category: cat,
        label: categoryLabels[cat],
        items: groups[cat],
      });
    }
  }

  return result;
}
