import { CostItem } from '@/types/project';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightsPanelProps {
  items: CostItem[];
  currency: string;
  onFilterByStatus?: (status: string) => void;
}

export function InsightsPanel({ items, currency, onFilterByStatus }: InsightsPanelProps) {
  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Status counts
  const statusCounts = {
    ok: items.filter(i => i.status === 'ok').length,
    review: items.filter(i => i.status === 'review').length,
    clarification: items.filter(i => i.status === 'clarification').length,
  };

  // Trade distribution
  const tradeDistribution = items.reduce((acc, item) => {
    const trade = item.trade || 'Other';
    if (!acc[trade]) {
      acc[trade] = { count: 0, value: 0 };
    }
    acc[trade].count++;
    acc[trade].value += item.totalPrice || 0;
    return acc;
  }, {} as Record<string, { count: number; value: number }>);

  const sortedTrades = Object.entries(tradeDistribution)
    .sort((a, b) => b[1].value - a[1].value);

  // Top variance items
  const itemsWithVariance = items
    .filter(i => i.originalUnitPrice && i.benchmarkTypical)
    .map(i => ({
      ...i,
      variance: ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100,
      varianceValue: (i.originalUnitPrice! - i.benchmarkTypical!) * i.quantity
    }))
    .sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue))
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Status Distribution */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Items by Status
        </h3>
        <div className="space-y-3">
          <button 
            onClick={() => onFilterByStatus?.('ok')}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <StatusBadge status="ok" />
              <span className="text-sm">Approved</span>
            </div>
            <span className="font-mono font-semibold">{statusCounts.ok}</span>
          </button>
          <button 
            onClick={() => onFilterByStatus?.('review')}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <StatusBadge status="review" />
              <span className="text-sm">Need Review</span>
            </div>
            <span className="font-mono font-semibold">{statusCounts.review}</span>
          </button>
          <button 
            onClick={() => onFilterByStatus?.('clarification')}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <StatusBadge status="clarification" />
              <span className="text-sm">Clarification</span>
            </div>
            <span className="font-mono font-semibold">{statusCounts.clarification}</span>
          </button>
        </div>
      </Card>

      {/* Trade Distribution */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4">Cost by Trade</h3>
        <div className="space-y-2">
          {sortedTrades.slice(0, 5).map(([trade, data]) => {
            const maxValue = sortedTrades[0][1].value;
            const widthPercent = (data.value / maxValue) * 100;
            
            return (
              <div key={trade} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{trade}</span>
                  <span className="font-mono text-muted-foreground">
                    {formatPrice(data.value)} {currency}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary/70 rounded-full transition-all"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Top Variance Items */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4">Highest Variance Items</h3>
        <div className="space-y-3">
          {itemsWithVariance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No variance data available</p>
          ) : (
            itemsWithVariance.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.originalDescription}</p>
                  <p className="text-xs text-muted-foreground">{item.trade}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn(
                    "flex items-center gap-1 text-sm font-medium",
                    item.variance > 0 ? "text-destructive" : "text-success"
                  )}>
                    {item.variance > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {item.variance > 0 ? '+' : ''}{item.variance.toFixed(0)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(Math.abs(item.varianceValue))} {currency}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}