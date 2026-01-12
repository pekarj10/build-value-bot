import { useEffect, useState } from 'react';
import { CostItem } from '@/types/project';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  BarChart3,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExecutiveSummaryProps {
  items: CostItem[];
  currency: string;
}

export function ExecutiveSummary({ items, currency }: ExecutiveSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [forceCompactLayout, setForceCompactLayout] = useState(false);

  // iPad can render at desktop widths; force the compact summary on touch devices
  // so "Total Estimated" is always readable regardless of sidebar/panel layout.
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
  const totalValue = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
  const reviewCount = items.filter(i => i.status === 'review' || i.status === 'clarification').length;
  
  // Potential savings - items priced above benchmark max
  const potentialSavings = items.reduce((sum, item) => {
    if (item.originalUnitPrice && item.benchmarkTypical && item.originalUnitPrice > item.benchmarkTypical) {
      const savings = (item.originalUnitPrice - item.benchmarkTypical) * item.quantity;
      return sum + savings;
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

  return (
    <Card className="p-4 lg:p-6 bg-gradient-to-br from-card to-muted/20 border-2">
      {/* Header with toggle for tablet/mobile */}
      <div className="flex items-center justify-between gap-3 mb-4 lg:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-lg">Executive Summary</h2>
            <p className="text-sm text-muted-foreground hidden sm:block">Key cost analysis metrics</p>
          </div>
        </div>
        
        {/* Expand/Collapse button - only visible on tablet and below */}
        <Button
          variant="ghost"
          size="sm"
          className="xl:hidden flex-shrink-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Less</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">More</span>
            </>
          )}
        </Button>
      </div>

      {/* Compact view for tablet/mobile - always shows total */}
      <div className="xl:hidden">
        {/* Always visible: Total Estimated - full width for prominence */}
        <div className="p-4 bg-card rounded-lg border mb-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Estimated
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-primary">{formatCurrency(totalValue)}</p>
        </div>

        {/* Expandable metrics */}
        {isExpanded && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            {/* Review Count */}
            <div className="p-3 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Review
                </span>
              </div>
              <p className="text-lg font-bold">
                {reviewCount} <span className="text-xs font-normal text-muted-foreground">items</span>
              </p>
            </div>

            {/* Potential Savings */}
            <div className="p-3 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-3 w-3 text-success flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Savings
                </span>
              </div>
              <p className={cn("text-lg font-bold font-mono", potentialSavings > 0 && "text-success")}>
                {formatCurrency(potentialSavings)}
              </p>
            </div>

            {/* Underpriced Risk */}
            <div className="p-3 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3 w-3 text-destructive flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Risk
                </span>
              </div>
              <p className={cn("text-lg font-bold font-mono", underpricedRisk > 0 && "text-destructive")}>
                {formatCurrency(underpricedRisk)}
              </p>
            </div>

            {/* Average Variance */}
            <div className="p-3 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Variance
                </span>
              </div>
              <p className={cn(
                "text-lg font-bold",
                Math.abs(avgVariance) <= 10 && "text-success",
                Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && "text-warning",
                Math.abs(avgVariance) > 25 && "text-destructive"
              )}>
                {avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {/* Collapsed summary - quick stats inline */}
        {!isExpanded && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-warning" />
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

      {/* Full grid view for desktop - unchanged */}
      <div className="hidden xl:grid xl:grid-cols-5 gap-4">
        {/* Total Value */}
        <div className="p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Estimated
            </span>
          </div>
          <p className="text-2xl font-bold font-mono">{formatCurrency(totalValue)}</p>
        </div>

        {/* Review Count */}
        <div className="p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Need Review
            </span>
          </div>
          <p className="text-2xl font-bold">
            {reviewCount} <span className="text-sm font-normal text-muted-foreground">items</span>
          </p>
        </div>

        {/* Potential Savings */}
        <div className="p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-success flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Potential Savings
            </span>
          </div>
          <p className={cn("text-2xl font-bold font-mono", potentialSavings > 0 && "text-success")}>
            {formatCurrency(potentialSavings)}
          </p>
        </div>

        {/* Underpriced Risk */}
        <div className="p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-destructive flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Underpriced Risk
            </span>
          </div>
          <p className={cn("text-2xl font-bold font-mono", underpricedRisk > 0 && "text-destructive")}>
            {formatCurrency(underpricedRisk)}
          </p>
        </div>

        {/* Average Variance */}
        <div className="p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Avg Variance
            </span>
          </div>
          <p className={cn(
            "text-2xl font-bold",
            Math.abs(avgVariance) <= 10 && "text-success",
            Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && "text-warning",
            Math.abs(avgVariance) > 25 && "text-destructive"
          )}>
            {avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%
          </p>
        </div>
      </div>
    </Card>
  );
}
