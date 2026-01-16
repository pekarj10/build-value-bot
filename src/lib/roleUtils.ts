/**
 * Role-based utility functions for protecting proprietary data
 * Regular users should not see internal database names, Swedish terms, or technical matching details
 */

/**
 * Sanitizes analysis notes to remove proprietary database references for regular users
 * @param aiComment - The original AI comment with potential database references
 * @param confidence - Match confidence percentage
 * @param region - Project region/country
 * @param currency - Project currency
 * @returns Sanitized, user-friendly analysis note
 */
export function sanitizeAnalysisNoteForUser(
  aiComment: string | null | undefined,
  confidence: number | null | undefined,
  region: string,
  currency: string
): string {
  if (!aiComment) {
    return 'Price analysis based on market data for this region.';
  }

  // Patterns to detect proprietary information
  const proprietaryPatterns = [
    /REPAB/gi,
    /Gräsytor/gi,
    /omläggning/gi,
    /Betongarbeten/gi,
    /Markarbeten/gi,
    /Plåtarbeten/gi,
    /Målning/gi,
    /VVS-arbeten/gi,
    /Elarbeten/gi,
    /Träarbeten/gi,
    // Swedish benchmark terms
    /\b[A-ZÅÄÖ][a-zåäö]+arbeten\b/g,
    /\b[A-ZÅÄÖ][a-zåäö]+ytor\b/g,
    // Match patterns like "Matched to [Swedish term]"
    /Matched to [^.()]+(?:\([^)]+\))?/gi,
    // Database IDs and internal references
    /benchmark_id[:\s]+[a-f0-9-]+/gi,
    /source[:\s]*["']?[A-Z]+["']?/gi,
  ];

  // Check if content contains proprietary info
  let hasProprietary = proprietaryPatterns.some(pattern => pattern.test(aiComment));
  
  if (hasProprietary) {
    // Generate a sanitized version
    const confidenceText = confidence ? `${Math.round(confidence)}% confidence` : 'high confidence';
    return `Based on our comprehensive database (${confidenceText}), the recommended price falls within the typical market range for this type of work in the ${region} area. The analysis considers regional pricing factors and comparable project data.`;
  }

  // Additional cleanup - remove any remaining Swedish terms or database references
  let sanitized = aiComment
    .replace(/\([^)]*%\s*confidence\)/gi, '') // Remove inline confidence
    .replace(/matched\s+to\s+/gi, 'comparable to ')
    .replace(/benchmark\s+(data|database|source)/gi, 'market data')
    .replace(/REPAB/gi, 'industry standards')
    .trim();

  // If it still looks technical, replace entirely
  if (sanitized.length < 20 || /[åäöÅÄÖ]/.test(sanitized)) {
    const confidenceText = confidence ? `${Math.round(confidence)}% confidence` : 'analyzed';
    return `Based on market analysis (${confidenceText}), this price is within the expected range for ${region}.`;
  }

  return sanitized;
}

/**
 * Gets a user-friendly description for the price range section
 * @param isAdmin - Whether the user is an admin
 * @returns Label text for the price range slider
 */
export function getPriceRangeLabel(isAdmin: boolean): string {
  return isAdmin ? 'Benchmark Range' : 'Market Price Range';
}

/**
 * Sanitizes the price source tooltip for regular users
 * @param priceSource - Original price source (may contain database names)
 * @param isAdmin - Whether the user is an admin
 * @returns Sanitized or original price source
 */
export function sanitizePriceSource(
  priceSource: string | null | undefined,
  isAdmin: boolean
): string {
  if (!priceSource) return 'Market analysis';
  if (isAdmin) return priceSource;
  
  // Remove proprietary references
  return 'Based on market data';
}

/**
 * Checks if the interpreted scope should be shown
 * Only admins should see the raw AI interpretation with Swedish terms
 */
export function shouldShowInterpretedScope(isAdmin: boolean): boolean {
  return isAdmin;
}

/**
 * Gets a user-friendly version of the interpreted scope
 */
export function getUserFriendlyScope(
  originalDescription: string,
  interpretedScope: string | null | undefined,
  isAdmin: boolean
): string | null {
  if (isAdmin) return interpretedScope || null;
  
  // For regular users, just show a simplified version or nothing
  if (!interpretedScope) return null;
  
  // Check if it contains Swedish or proprietary terms
  if (/[åäöÅÄÖ]/.test(interpretedScope)) {
    return null; // Don't show to users if it contains Swedish
  }
  
  return interpretedScope;
}
