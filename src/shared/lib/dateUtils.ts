/**
 * Date utility helpers for local calendar date representations (YYYY-MM-DD).
 * Avoids the UTC offset bug where `new Date().toISOString().slice(0, 10)`
 * resolves to yesterday for users ahead of UTC (e.g. UTC+8 Philippines)
 * during morning hours (00:00 - 07:59).
 */

export function todayLocalIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatLocalDateIso(date: Date): string {
  return todayLocalIso(date);
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Parses YYYY-MM-DD in local calendar coordinates and returns its day name (e.g. "Tuesday"). */
export function getWeekdayName(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return '';
  }
  return WEEKDAY_NAMES[d.getDay()] ?? '';
}

/** Formats an ISO YYYY-MM-DD date with its weekday name (e.g. "Tuesday, 2026-11-10"). */
export function formatDateWithWeekday(isoDate: string): string {
  const trimmed = isoDate.trim();
  if (!trimmed) return '—';
  const weekday = getWeekdayName(trimmed);
  return weekday ? `${weekday}, ${trimmed}` : trimmed;
}
