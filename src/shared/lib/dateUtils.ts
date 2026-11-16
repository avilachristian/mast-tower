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
