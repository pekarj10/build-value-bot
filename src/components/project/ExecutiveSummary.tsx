import { CostItem } from '@/types/project';
import { Card } from '@/components/ui/card';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  DollarSign,
  BarChart3 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExecutiveSummaryProps {
  items: CostItem[];
  currency: string;
}

export function ExecutiveSummary({ items, currency }: ExecutiveSummaryProps) {
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
    <Card className="p-6 bg-gradient-to-br from-card to-muted/20 border-2">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">Executive Summary</h2>
          <p className="text-sm text-muted-foreground">Key cost analysis metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Value */}
        <div className="p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Estimated
            </span>
          </div>
          <p className="text-2xl font-bold font-mono">{formatCurrency(totalValue)}</p>
        </div>

        {/* Review Count */}
        <div className="p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
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
            <TrendingDown className="h-4 w-4 text-success" />
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
            <TrendingUp className="h-4 w-4 text-destructive" />
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
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
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