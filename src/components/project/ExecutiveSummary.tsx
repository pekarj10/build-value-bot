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

  function KpiCard({
    icon,
    label,
    accentClass,
    children,
    footer,
  }: {
    icon: React.ReactNode;
    label: string;
    accentClass: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) {
    return (
      <div
        className={cn(
          "p-5 h-[140px] kpi-card grid grid-rows-[auto,1fr,auto]",
          "gap-2",
          "border-l-4",
          accentClass,
          cardBase
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </span>
        </div>

        {children}

        <div className="min-h-[16px] text-xs text-muted-foreground">
          {footer ?? <span className="opacity-0">—</span>}
        </div>
      </div>
    );
  }

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
        <div className="mb-4">
          <KpiCard
            icon={<Calculator className="h-6 w-6 text-primary/80 flex-shrink-0" />}
            label={`Total Project Estimate (${currency})`}
            accentClass="border-primary/30"
            footer={
              totalOriginalValue > 0 && valueDifference !== 0 ? (
                <span className={cn(valueDifference > 0 ? 'text-success' : 'text-warning')}>
                  {estimateTrend} {formatCurrencyFull(Math.abs(valueDifference))} vs original
                </span>
              ) : undefined
            }
          >
            <KpiMoneyValue value={totalEstimatedValue} label="Project estimate" />
          </KpiCard>
        </div>

        {/* Expandable metrics */}
        {isExpanded && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            <KpiCard
              icon={<AlertCircle className="h-6 w-6 text-warning/80 flex-shrink-0" />}
              label="Review"
              accentClass="border-warning/30"
            >
              <div className="kpi-number-wrap">
                <p
                  className={cn("kpi-number text-foreground", numberBase)}
                  title={`Need review: ${reviewCount} items`}
                  aria-label={`Need review: ${reviewCount} items`}
                >
                  {reviewCount} <span className="text-xs font-normal text-muted-foreground">items</span>
                </p>
              </div>
            </KpiCard>

            <KpiCard
              icon={<TrendingDown className="h-6 w-6 text-success/80 flex-shrink-0" />}
              label={`Savings (${currency})`}
              accentClass="border-success/30"
            >
              <KpiMoneyValue value={potentialSavings} label="Potential savings" />
            </KpiCard>

            <KpiCard
              icon={<TrendingUp className="h-6 w-6 text-destructive/80 flex-shrink-0" />}
              label={`Risk (${currency})`}
              accentClass="border-destructive/30"
            >
              <KpiMoneyValue value={underpricedRisk} label="Underpriced risk" />
            </KpiCard>

            <KpiCard
              icon={<Percent className="h-6 w-6 text-primary/70 flex-shrink-0" />}
              label="Variance"
              accentClass="border-primary/20"
            >
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
            </KpiCard>
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
          <KpiCard
            icon={<Calculator className="h-6 w-6 text-primary/80 flex-shrink-0" />}
            label={`Project Estimate (${currency})`}
            accentClass="border-primary/30"
            footer={
              totalOriginalValue > 0 ? (
                <span>Original: {formatCurrencyFull(totalOriginalValue)}</span>
              ) : undefined
            }
          >
            <KpiMoneyValue value={totalEstimatedValue} label="Project estimate" />
          </KpiCard>

          {/* Review Count */}
          <KpiCard
            icon={<AlertCircle className="h-6 w-6 text-warning/80 flex-shrink-0" />}
            label="Need Review"
            accentClass="border-warning/30"
          >
            <div className="kpi-number-wrap">
              <p
                className={cn("kpi-number text-foreground", numberBase)}
                title={`Need review: ${reviewCount} items`}
                aria-label={`Need review: ${reviewCount} items`}
              >
                {reviewCount} <span className="text-sm font-normal text-muted-foreground">items</span>
              </p>
            </div>
          </KpiCard>

          {/* Potential Savings */}
          <KpiCard
            icon={<TrendingDown className="h-6 w-6 text-success/80 flex-shrink-0" />}
            label={`Potential Savings (${currency})`}
            accentClass="border-success/30"
          >
            <KpiMoneyValue value={potentialSavings} label="Potential savings" />
          </KpiCard>

          {/* Underpriced Risk */}
          <KpiCard
            icon={<TrendingUp className="h-6 w-6 text-destructive/80 flex-shrink-0" />}
            label={`Underpriced Risk (${currency})`}
            accentClass="border-destructive/30"
          >
            <KpiMoneyValue value={underpricedRisk} label="Underpriced risk" />
          </KpiCard>

          {/* Average Variance */}
          <KpiCard
            icon={<Percent className="h-6 w-6 text-primary/70 flex-shrink-0" />}
            label="Avg Variance"
            accentClass="border-primary/20"
          >
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
          </KpiCard>
        </div>
      )}
    </Card>
  );
}