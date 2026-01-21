import { useEffect, useState } from 'react';
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

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

  const cardBase = "rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg";
  const numberBase = "font-mono tabular-nums";

  return (
    <Card className="p-5 lg:p-6 bg-gradient-to-br from-card via-card to-primary/5 border-2 shadow-sm">
      {/* Header with toggle */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-5 w-5 text-primary" />
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
          <div className={cn("p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20 mb-4", cardBase)}>
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Total Project Estimate
            </span>
          </div>
            <p className={cn("text-4xl font-bold text-primary", numberBase)}>{formatCurrency(totalEstimatedValue)}</p>
          {totalOriginalValue > 0 && valueDifference !== 0 && (
            <p className={cn(
              "text-sm mt-2 font-medium",
              valueDifference > 0 ? "text-success" : "text-warning"
            )}>
                {estimateTrend} {formatCurrency(Math.abs(valueDifference))} vs original
            </p>
          )}
        </div>

        {/* Expandable metrics */}
        {isExpanded && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
              <div className={cn("p-3 bg-gradient-to-br from-warning/10 to-card", cardBase)}>
              <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-3 w-3 text-warning flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Review</span>
              </div>
              <p className="text-lg font-bold">
                {reviewCount} <span className="text-xs font-normal text-muted-foreground">items</span>
              </p>
            </div>

              <div className={cn("p-3 bg-gradient-to-br from-success/10 to-card", cardBase)}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-3 w-3 text-success flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Savings</span>
              </div>
                <p className={cn("text-lg font-bold", numberBase, potentialSavings > 0 && "text-success")}>
                {formatCurrency(potentialSavings)}
              </p>
            </div>

              <div className={cn("p-3 bg-gradient-to-br from-destructive/10 to-card", cardBase)}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3 w-3 text-destructive flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk</span>
              </div>
                <p className={cn("text-lg font-bold", numberBase, underpricedRisk > 0 && "text-destructive")}>
                {formatCurrency(underpricedRisk)}
              </p>
            </div>

              <div className={cn("p-3 bg-gradient-to-br from-muted/60 to-card", cardBase)}>
              <div className="flex items-center gap-2 mb-1">
                  <Percent className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Variance</span>
              </div>
              <p className={cn(
                "text-lg font-bold",
                Math.abs(avgVariance) <= 10 && "text-success",
                Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && "text-warning",
                Math.abs(avgVariance) > 25 && "text-destructive"
              )}>
                  {varianceTrend} {avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%
              </p>
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
                <span className="font-medium">{formatCurrency(potentialSavings)}</span> savings
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
          <div className={cn("p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20", cardBase)}>
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Project Estimate
              </span>
            </div>
            <p className={cn("text-4xl font-bold text-primary", numberBase)}>{formatCurrency(totalEstimatedValue)}</p>
            {totalOriginalValue > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Original: {formatCurrency(totalOriginalValue)}
              </p>
            )}
          </div>

          {/* Review Count */}
          <div className={cn("p-4 bg-gradient-to-br from-warning/10 to-card", cardBase)}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Need Review
              </span>
            </div>
            <p className="text-4xl font-bold">
              {reviewCount} <span className="text-sm font-normal text-muted-foreground">items</span>
            </p>
          </div>

          {/* Potential Savings */}
          <div className={cn("p-4 bg-gradient-to-br from-success/10 to-card", cardBase)}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-success flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Potential Savings
              </span>
            </div>
            <p className={cn("text-4xl font-bold", numberBase, potentialSavings > 0 && "text-success")}>
              {formatCurrency(potentialSavings)}
            </p>
          </div>

          {/* Underpriced Risk */}
          <div className={cn("p-4 bg-gradient-to-br from-destructive/10 to-card", cardBase)}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-destructive flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Underpriced Risk
              </span>
            </div>
            <p className={cn("text-4xl font-bold", numberBase, underpricedRisk > 0 && "text-destructive")}>
              {formatCurrency(underpricedRisk)}
            </p>
          </div>

          {/* Average Variance */}
          <div className={cn("p-4 bg-gradient-to-br from-muted/60 to-card", cardBase)}>
            <div className="flex items-center gap-2 mb-2">
              <Percent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Avg Variance
              </span>
            </div>
            <p className={cn(
              "text-4xl font-bold",
              Math.abs(avgVariance) <= 10 && "text-success",
              Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && "text-warning",
              Math.abs(avgVariance) > 25 && "text-destructive"
            )}>
              {varianceTrend} {avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}