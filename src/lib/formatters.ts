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
