/**
 * Format a number as Swedish SEK with space as thousand separator
 */
export function formatSEK(value: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number with the appropriate locale based on currency
 */
export function formatCurrency(value: number, currency: string): string {
  // Swedish kronor uses space as thousand separator
  if (currency === 'SEK') {
    return formatSEK(value);
  }
  
  // Default formatting for other currencies
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a price with currency symbol
 */
export function formatPriceWithCurrency(value: number, currency: string): string {
  return `${formatCurrency(value, currency)} ${currency}`;
}

/**
 * Parse a formatted number string back to a number
 */
export function parseFormattedNumber(value: string): number {
  // Remove spaces and convert Swedish decimal separator
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

export function formatCompactNumber(
  value: number | null | undefined,
  locale: string = 'sv-SE'
): { display: string; full: string; tooltip: string } {
  if (value == null || Number.isNaN(value)) {
    return { display: '–', full: '–', tooltip: '–' };
  }

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const full = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

  // For values >= 1,000,000 abbreviate to keep the UI stable.
  // Target: display length ~<= 5 chars including suffix (ex: 1.67M)
  const formatAbbrev = (n: number, suffix: string) => {
    let decimals = 0;
    if (n < 10) decimals = 2;
    else if (n < 100) decimals = 1;
    else decimals = 0;
    const num = n.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    return `${sign}${num}${suffix}`;
  };

  let display = full;
  if (abs >= 1_000_000_000) {
    display = formatAbbrev(abs / 1_000_000_000, 'B');
  } else if (abs >= 1_000_000) {
    display = formatAbbrev(abs / 1_000_000, 'M');
  }

  return {
    display,
    full,
    tooltip: full,
  };
}
