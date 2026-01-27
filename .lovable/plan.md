

## Fix Plan: Excel Parsing and AI Analysis Improvements

This plan addresses three critical issues with the cost item parsing and matching system.

---

### Issue 1: Missing "Betongkantstöd justering" Item

**Root Cause**: The Excel parser at line 327 filters out any row containing the word "total" to skip summary rows. However, the description "Betongkantstöd justering (total längd 3500 m)" contains "total" as part of contextual information, not as a summary indicator.

**Solution**: Make the total-row detection smarter by only skipping rows where "total" appears at the START of the description or as a standalone word indicating a summary row, not when it appears within parentheses as context.

**Changes to `supabase/functions/parse-excel/index.ts`**:
- Update line 327 filter logic to use more precise pattern matching
- Only skip if description STARTS with "total", "celkem", "suma", etc.
- Allow "total" when it appears within parentheses as context (like "total längd 3500 m")

---

### Issue 2: "Kullersten justering" - Generic Error Message

**Root Cause**: The benchmark database has entries for "Kullersten justering 5% av bruttoytan", "Kullersten justering 10% av bruttoytan", and "Kullersten justering 20% av bruttoytan". The user provided an absolute value (250 m2) but the system expects a percentage of gross area.

**Solution**: Improve the AI analysis to detect when benchmarks require percentage-based pricing and provide a specific clarification message asking the user to specify either:
- The total gross area so the system can calculate the percentage
- The percentage of the total area being addressed

**Changes to `supabase/functions/analyze-cost-items/index.ts`**:
- Detect when available benchmarks contain "% av bruttoytan" or "% av total"
- Generate a specific clarification question like: "Please specify the total gross area (bruttoytan) so we can calculate the percentage being addressed, or specify the percentage directly (e.g., 5%, 10%, 20%)"
- Similar logic for curbs: "Please specify the total length so we can determine the adjustment percentage"

---

### Issue 3: "Nya Fönster och dörrar fasadtyp 1" - Unit Mismatch

**Root Cause**: The item was parsed with unit "pcs" (pieces) but the benchmark "Fönster och dörrar fasadtyp 1 byte fönster och dörrar" uses unit "m2" (square meters). The system correctly rejects the match due to unit incompatibility, but doesn't explain why.

**Solution**: 
1. When no match is found due to unit incompatibility, inform the user about the unit difference
2. Suggest converting to the correct unit (e.g., "Benchmarks for windows/doors use m2 - please provide the total window/door area in square meters instead of piece count")

**Changes to `supabase/functions/analyze-cost-items/index.ts`**:
- Track when candidates exist but are filtered out due to unit mismatch
- Provide specific error messages explaining the unit mismatch
- Suggest what unit the user should use based on available benchmarks

---

### Technical Implementation Details

#### parse-excel/index.ts Changes

```typescript
// OLD (line 326-327):
const lowerDesc = description.toLowerCase();
if (lowerDesc.includes("total") || lowerDesc.includes("celkem") || lowerDesc.includes("suma")) continue;

// NEW: Smarter total-row detection
const lowerDesc = description.toLowerCase();
// Only skip if it looks like a summary row (starts with total/sum keywords)
// Allow "total" within parentheses as context (e.g., "total längd 3500 m")
const isSummaryRow = 
  /^(total|celkem|suma|summa|subtotal|delsumma)/i.test(lowerDesc) ||
  (lowerDesc.includes("total") && !lowerDesc.includes("(total"));
if (isSummaryRow) continue;
```

#### analyze-cost-items/index.ts Changes

1. **Percentage-based benchmark detection**:
```typescript
// After filtering candidates, check if they require percentage input
const percentageBasedBenchmarks = candidates.filter(b => 
  b.description.includes('% av bruttoytan') || 
  b.description.includes('% av total')
);

if (percentageBasedBenchmarks.length > 0 && candidates.length === percentageBasedBenchmarks.length) {
  // All matches require percentage - ask for clarification
  const clarificationMessage = buildPercentageClarification(
    item.originalDescription, 
    percentageBasedBenchmarks
  );
  return {
    ...noMatchResult,
    aiComment: clarificationMessage
  };
}
```

2. **Unit mismatch detection**:
```typescript
// Before returning no-match, check if candidates existed before unit filtering
const allCandidatesBeforeUnitFilter = filterBenchmarkCandidates(
  allBenchmarks, 
  searchTerms, 
  null // no unit filter
);

if (allCandidatesBeforeUnitFilter.length > 0 && candidates.length === 0) {
  const expectedUnits = [...new Set(allCandidatesBeforeUnitFilter.map(c => c.unit))];
  return {
    ...noMatchResult,
    aiComment: `Unit mismatch: Your item uses "${item.unit}" but benchmarks use "${expectedUnits.join('", "')}". Please convert to the correct unit.`
  };
}
```

3. **Build specific clarification messages**:
```typescript
function buildPercentageClarification(description: string, benchmarks: BenchmarkPrice[]): string {
  const percentages = benchmarks
    .map(b => {
      const match = b.description.match(/(\d+)%/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
  
  if (description.toLowerCase().includes('kantstöd') || description.toLowerCase().includes('kantsten')) {
    return `Please specify the percentage of total length being adjusted. Available options: ${percentages.join('%, ')}% of total length. If you know the total length (e.g., 3500 m) and the length to adjust (e.g., 320 m), you can calculate: 320/3500 = ~9%, so use 10%.`;
  }
  
  return `Please specify the percentage of gross area (bruttoytan) being addressed. Available options: ${percentages.join('%, ')}%. Example: If the total area is 2500 m2 and you're adjusting 250 m2, that's 10%.`;
}
```

---

### Summary of Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/parse-excel/index.ts` | Fix total-row detection to allow "total" in parentheses |
| `supabase/functions/analyze-cost-items/index.ts` | Add percentage-based benchmark detection, unit mismatch detection, and specific clarification messages |

---

### Expected Results After Fix

1. **"Betongkantstöd justering (total längd 3500 m)"** - Will be parsed correctly (7 items instead of 6)

2. **"Kullersten justering 250 m2"** - Will show: "Please specify the percentage of gross area (bruttoytan) being addressed. Available options: 5%, 10%, 20%. Example: If the total area is 2500 m2 and you're adjusting 250 m2, that's 10%."

3. **"Nya Fönster och dörrar fasadtyp 1" (11 pcs)** - Will show: "Unit mismatch: Your item uses 'pcs' but benchmarks use 'm2'. Please provide the total window/door area in square meters."

