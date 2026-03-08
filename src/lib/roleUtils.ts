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
  currency: string,
  hasRecommendedPrice: boolean = true,
  userExplanation?: string | null
): string {
  // If we have a dedicated user explanation from the AI, use it directly
  if (userExplanation && hasRecommendedPrice) {
    return userExplanation;
  }

  if (!aiComment) {
    return hasRecommendedPrice 
      ? 'Price analysis based on market data for this region.'
      : 'No matching market data found. Please provide additional details or set a manual price.';
  }

  // If there's no recommended price, the comment should guide the user to action
  if (!hasRecommendedPrice) {
    // Extract actionable guidance from the AI comment
    const lowerComment = aiComment.toLowerCase();
    
    // Unit mismatch - keep the guidance, just sanitize database references
    if (lowerComment.includes('unit mismatch')) {
      return aiComment
        .replace(/benchmark[s]?/gi, 'market data')
        .replace(/REPAB/gi, 'database');
    }
    
    // Percentage required - keep the guidance
    if (lowerComment.includes('percentage required') || lowerComment.includes('% av')) {
      return aiComment
        .replace(/benchmark[s]?/gi, 'market data')
        .replace(/bruttoytan/gi, 'gross area')
        .replace(/REPAB/gi, 'database');
    }
    
    // Closest benchmark mentioned - simplify for user
    if (lowerComment.includes('closest benchmark') || lowerComment.includes('no exact match')) {
      return 'No exact match found in our database for this item. Please use the clarification box below to describe the work in more detail, or set a manual price.';
    }
    
    // Generic no-match
    return 'We could not find a matching price in our database. Please provide more details about this work item using the clarification box, or set a manual price.';
  }

  // HAS a recommended price but NO userExplanation - try to extract useful info from aiComment
  // First strip the "Matched with X% confidence." prefix
  let explanation = aiComment
    .replace(/^Matched with \d+% confidence\.\s*/i, '')
    .trim();

  // Remove proprietary references but keep the explanation
  explanation = explanation
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/REPAB/gi, 'industry')
    .replace(/benchmark\s*(ID|database|source|data)?/gi, 'market data')
    .replace(/category\s+\d+[\w]*/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If explanation still has Swedish or is too short, use a confidence-based fallback
  if (explanation.length < 30 || /[åäöÅÄÖ]/.test(explanation)) {
    const confidenceText = confidence && confidence >= 50 ? `${Math.round(confidence)}% match confidence` : '';
    const confSuffix = confidenceText ? ` (${confidenceText})` : '';
    return `Price matched from market data${confSuffix} for the ${region} region.`;
  }

  return explanation;
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
