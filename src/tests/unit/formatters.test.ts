import { describe, it, expect } from 'vitest';
import {
  formatSEK,
  formatCurrency,
  formatPriceWithCurrency,
  parseFormattedNumber,
  formatCompactNumber,
} from '@/lib/formatters';

describe('formatSEK', () => {
  it('formats positive numbers with space separators', () => {
    // Intl sv-SE uses non-breaking space (U+00A0)
    expect(formatSEK(1000)).toMatch(/1\s000/);
    expect(formatSEK(1234567)).toMatch(/1\s234\s567/);
  });

  it('handles zero', () => {
    expect(formatSEK(0)).toBe('0');
  });

  it('handles negative numbers', () => {
    const result = formatSEK(-5000);
    expect(result).toContain('5');
    expect(result).toContain('000');
  });

  it('rounds decimals', () => {
    expect(formatSEK(1234.56)).toMatch(/1\s235/);
  });
});

describe('formatCurrency', () => {
  it('uses Swedish formatting for SEK', () => {
    const result = formatCurrency(10000, 'SEK');
    expect(result).toMatch(/10\s000/);
  });

  it('uses en-US formatting for USD', () => {
    expect(formatCurrency(10000, 'USD')).toBe('10,000');
  });

  it('uses en-US formatting for EUR', () => {
    expect(formatCurrency(1500000, 'EUR')).toBe('1,500,000');
  });

  it('handles zero for any currency', () => {
    expect(formatCurrency(0, 'SEK')).toBe('0');
    expect(formatCurrency(0, 'USD')).toBe('0');
  });

  it('handles negative numbers', () => {
    const result = formatCurrency(-2500, 'USD');
    expect(result).toBe('-2,500');
  });
});

describe('formatPriceWithCurrency', () => {
  it('appends currency code', () => {
    const result = formatPriceWithCurrency(5000, 'USD');
    expect(result).toBe('5,000 USD');
  });

  it('works with SEK', () => {
    const result = formatPriceWithCurrency(5000, 'SEK');
    expect(result).toMatch(/5\s000 SEK/);
  });
});

describe('parseFormattedNumber', () => {
  it('parses plain numbers', () => {
    expect(parseFormattedNumber('1234')).toBe(1234);
  });

  it('removes spaces (Swedish thousands)', () => {
    expect(parseFormattedNumber('1 234 567')).toBe(1234567);
  });

  it('converts Swedish decimal comma', () => {
    expect(parseFormattedNumber('1234,56')).toBeCloseTo(1234.56);
  });

  it('returns 0 for empty string', () => {
    expect(parseFormattedNumber('')).toBe(0);
  });

  it('returns 0 for non-numeric', () => {
    expect(parseFormattedNumber('abc')).toBe(0);
  });
});

describe('formatCompactNumber', () => {
  it('returns dash for null', () => {
    expect(formatCompactNumber(null).display).toBe('–');
  });

  it('returns dash for undefined', () => {
    expect(formatCompactNumber(undefined).display).toBe('–');
  });

  it('returns dash for NaN', () => {
    expect(formatCompactNumber(NaN).display).toBe('–');
  });

  it('abbreviates thousands as k', () => {
    const result = formatCompactNumber(86000);
    expect(result.display).toBe('86k');
  });

  it('abbreviates millions as M', () => {
    const result = formatCompactNumber(1670000);
    expect(result.display).toBe('1.67M');
  });

  it('abbreviates billions as B', () => {
    const result = formatCompactNumber(2100000000);
    expect(result.display).toBe('2.1B');
  });

  it('handles negative values', () => {
    const result = formatCompactNumber(-5000);
    expect(result.display).toBe('-5k');
  });

  it('keeps small numbers as-is (full format)', () => {
    const result = formatCompactNumber(500);
    expect(result.display).toBe(result.full);
  });

  it('provides tooltip with full formatted value', () => {
    const result = formatCompactNumber(1234567);
    expect(result.tooltip).toBe(result.full);
  });
});
