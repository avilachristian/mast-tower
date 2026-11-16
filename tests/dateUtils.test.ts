import { describe, expect, it } from 'vitest';
import { todayLocalIso, formatLocalDateIso } from '../src/shared/lib/dateUtils';

describe('dateUtils', () => {
  it('formats dates in local time rather than UTC', () => {
    // Construct a specific local date: 2026-05-18 at 02:30:00 (which in UTC might be 2026-05-17 if ahead of UTC)
    const localDate = new Date(2026, 4, 18, 2, 30, 0); // month 4 is May
    expect(todayLocalIso(localDate)).toBe('2026-05-18');
    expect(formatLocalDateIso(localDate)).toBe('2026-05-18');
  });

  it('pads single-digit month and day', () => {
    const singleDigit = new Date(2026, 0, 5, 0, 0, 0); // Jan 5
    expect(todayLocalIso(singleDigit)).toBe('2026-01-05');
  });

  it('defaults to current date matching local calendar', () => {
    const result = todayLocalIso();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});
