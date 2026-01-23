import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CostItem } from '@/types/project';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Calculator,
  Percent
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompactNumber, formatCurrency } from '@/lib/formatters';

interface ExecutiveSummaryProps {
  items: CostItem[];
  currency: string;
}

export function ExecutiveSummary({ items, currency }: ExecutiveSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [forceCompactLayout, setForceCompactLayout] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => setForceCompactLayout(e.matches);

    setForceCompactLayout(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const formatCurrencyFull = (value: number) => `${formatCurrency(value, currency)} ${currency}`;

  // Calculate metrics
  // IMPORTANT: This total must match the value shown in the Projects dashboard (projects.total_value)
  // so we fall back to original prices when a recommendation/override doesn't exist yet.
  const totalEstimatedValue = items.reduce((sum, item) => {
    const price = item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice;
    return sum + (price != null ? price * item.quantity : 0);
  }, 0);

  const totalOriginalValue = items.reduce((sum, item) => {
    return sum + (item.originalUnitPrice ? item.originalUnitPrice * item.quantity : 0);
  }, 0);

  const reviewCount = items.filter(i => i.status === 'review' || i.status === 'clarification').length;
  
  // Potential savings - difference between original and recommended (when original is higher)
  const potentialSavings = items.reduce((sum, item) => {
    const recPrice = item.userOverridePrice || item.recommendedUnitPrice;
    if (item.originalUnitPrice && recPrice && item.originalUnitPrice > recPrice) {
      return sum + (item.originalUnitPrice - recPrice) * item.quantity;
    }
    return sum;
  }, 0);
  
  // Underpriced risk - items below benchmark minimum
  const underpricedRisk = items.reduce((sum, item) => {
    if (item.originalUnitPrice && item.benchmarkMin && item.originalUnitPrice < item.benchmarkMin) {
      const risk = (item.benchmarkMin - item.originalUnitPrice) * item.quantity;
      return sum + risk;
    }
    return sum;
  }, 0);

  // Average variance from benchmark
  const itemsWithVariance = items.filter(i => i.originalUnitPrice && i.benchmarkTypical);
  const avgVariance = itemsWithVariance.length > 0
    ? itemsWithVariance.reduce((sum, i) => {
        const variance = ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100;
        return sum + variance;
      }, 0) / itemsWithVariance.length
    : 0;

  // Difference between original and estimated (matches dashboard vs detail)
  const valueDifference = totalOriginalValue - totalEstimatedValue;

  const estimateTrend = valueDifference > 0 ? '▼' : valueDifference < 0 ? '▲' : '';
  const varianceTrend = avgVariance > 0 ? '▲' : avgVariance < 0 ? '▼' : '';

  // Keep the executive summary visually calm & professional:
  // - no loud gradients
  // - smaller numbers
  // - subtle hover (optional)
  const cardBase = "rounded-xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md";
  const numberBase = "font-mono tabular-nums";

  function KpiMoneyValue({
    value,
    label,
  }: {
    value: number;
    label: string;
  }) {
    const ref = useRef<HTMLParagraphElement | null>(null);
    const [shouldCompact, setShouldCompact] = useState(false);

    const full = useMemo(() => formatCurrencyFull(value), [value]);
    const compact = useMemo(() => {
      const c = formatCompactNumber(value, 'sv-SE');
      return c.display === '–' ? '–' : `${c.display} ${currency}`;
    }, [value]);

    const tooltip = `${label}: ${full}`;

    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;

      const compute = () => {
        // We render the chosen string in the element; overflow means it won't fit.
        const overflow = el.scrollWidth > el.clientWidth;
        setShouldCompact(overflow);
      };

      compute();
      const ro = new ResizeObserver(() => compute());
      ro.observe(el);
      return () => ro.disconnect();
    }, [full, compact]);

    return (
      <div className="kpi-number-wrap">
        <p
          ref={ref}
          className={cn("kpi-number text-foreground", numberBase)}
          title={tooltip}
          aria-label={tooltip}
        >
          {shouldCompact ? compact : full}
        </p>
      </div>
    );
  }

  return (
    <Card className="p-5 lg:p-6 bg-card border shadow-sm">
      {/* Header with toggle */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-lg">Executive Summary</h2>
            <p className="text-sm text-muted-foreground hidden sm:block">Key project metrics</p>
          </div>
        </div>
        
        {(forceCompactLayout) && (
          <Button
            variant="ghost"
            size="sm"
            className="flex-shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
        {!forceCompactLayout && (
          <Button
            variant="ghost"
            size="sm"
            className="xl:hidden flex-shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Compact view for tablet/mobile/touch */}
      <div className={forceCompactLayout ? '' : 'xl:hidden'}>
        {/* Main metric: Total Recommended Value */}
        <div
          className={cn(
              "p-5 mb-4 border-l-4 border-primary/30 h-[140px] flex flex-col justify-between kpi-card",
            cardBase
          )}
        >
            <div className="flex items-center gap-2">
              <Calculator className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Project Estimate ({currency})
            </span>
          </div>
            <KpiMoneyValue value={totalEstimatedValue} label="Project estimate" />
          {totalOriginalValue > 0 && valueDifference !== 0 && (
            <p className={cn(
              "text-xs font-medium text-muted-foreground",
              valueDifference > 0 ? "text-success" : "text-warning"
            )}>
                {estimateTrend} {formatCurrencyFull(Math.abs(valueDifference))} vs original
            </p>
          )}
        </div>

        {/* Expandable metrics */}
        {isExpanded && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
              <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Review</span>
              </div>
                <div className="kpi-number-wrap">
                  <p className={cn("kpi-number text-foreground", numberBase)} title={`Need review: ${reviewCount} items`} aria-label={`Need review: ${reviewCount} items`}>
                    {reviewCount} <span className="text-xs font-normal text-muted-foreground">items</span>
                  </p>
                </div>
            </div>

              <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Savings ({currency})</span>
              </div>
                <KpiMoneyValue value={potentialSavings} label="Potential savings" />
            </div>

              <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Risk ({currency})</span>
              </div>
                <KpiMoneyValue value={underpricedRisk} label="Underpriced risk" />
            </div>

              <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
                <div className="flex items-center gap-2">
                  <Percent className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Variance</span>
              </div>
                <div className="kpi-number-wrap">
                  <p
                    className={cn(
                      "kpi-number",
                      Math.abs(avgVariance) <= 10 && "text-success",
                      Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && "text-warning",
                      Math.abs(avgVariance) > 25 && "text-destructive"
                    )}
                    title={`Avg variance: ${avgVariance >= 0 ? '+' : ''}${avgVariance.toFixed(1)}%`}
                    aria-label={`Avg variance: ${avgVariance >= 0 ? '+' : ''}${avgVariance.toFixed(1)}%`}
                  >
                    {varianceTrend} {avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%
                  </p>
                </div>
            </div>
          </div>
        )}

        {/* Collapsed summary */}
        {!isExpanded && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-warning" />
              <span className="font-medium">{reviewCount}</span> review
            </span>
            {potentialSavings > 0 && (
              <span className="flex items-center gap-1 text-success">
                <TrendingDown className="h-3 w-3" />
                <span className="font-medium">{formatCurrencyFull(potentialSavings)}</span> savings
              </span>
            )}
            <span className={cn(
              "flex items-center gap-1",
              Math.abs(avgVariance) <= 10 && "text-success",
              Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && "text-warning",
              Math.abs(avgVariance) > 25 && "text-destructive"
            )}>
              <span className="font-medium">{avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%</span> avg
            </span>
          </div>
        )}
      </div>

      {/* Full grid view for desktop */}
      {!forceCompactLayout && (
        <div className="hidden xl:grid xl:grid-cols-5 gap-4">
          {/* Total Recommended Value - highlighted */}
          <div className={cn("p-5 border-l-4 border-primary/30 h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
            <div className="flex items-center gap-2">
              <Calculator className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Project Estimate ({currency})
              </span>
            </div>
            <KpiMoneyValue value={totalEstimatedValue} label="Project estimate" />
            {totalOriginalValue > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Original: {formatCurrencyFull(totalOriginalValue)}
              </p>
            )}
          </div>

          {/* Review Count */}
          <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Need Review
              </span>
            </div>
            <div className="kpi-number-wrap">
              <p className={cn("kpi-number text-foreground", numberBase)} title={`Need review: ${reviewCount} items`} aria-label={`Need review: ${reviewCount} items`}>
                {reviewCount} <span className="text-sm font-normal text-muted-foreground">items</span>
              </p>
            </div>
          </div>

          {/* Potential Savings */}
          <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Potential Savings ({currency})
              </span>
            </div>
            <KpiMoneyValue value={potentialSavings} label="Potential savings" />
          </div>

          {/* Underpriced Risk */}
          <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Underpriced Risk ({currency})
              </span>
            </div>
            <KpiMoneyValue value={underpricedRisk} label="Underpriced risk" />
          </div>

          {/* Average Variance */}
          <div className={cn("p-5 border-l-4 border-border h-[140px] flex flex-col justify-between kpi-card", cardBase)}>
            <div className="flex items-center gap-2">
              <Percent className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Avg Variance
              </span>
            </div>
            <div className="kpi-number-wrap">
              <p
                className={cn(
                  "kpi-number",
                  Math.abs(avgVariance) <= 10 && "text-success",
                  Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && "text-warning",
                  Math.abs(avgVariance) > 25 && "text-destructive"
                )}
                title={`Avg variance: ${avgVariance >= 0 ? '+' : ''}${avgVariance.toFixed(1)}%`}
                aria-label={`Avg variance: ${avgVariance >= 0 ? '+' : ''}${avgVariance.toFixed(1)}%`}
              >
                {varianceTrend} {avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}