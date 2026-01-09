import { useMemo } from 'react';
import { CostItem } from '@/types/project';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  PieChart as PieChartIcon,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface InsightsPanelProps {
  items: CostItem[];
  currency: string;
  onFilterByStatus?: (status: string) => void;
  onFilterByTrade?: (trade: string) => void;
  onFilterByVariance?: (range: string) => void;
}

// Chart colors using CSS variables
const CHART_COLORS = {
  ok: 'hsl(142, 71%, 45%)',
  review: 'hsl(38, 92%, 50%)',
  clarification: 'hsl(0, 72%, 51%)',
};

const TRADE_COLORS = [
  'hsl(222, 47%, 31%)',
  'hsl(222, 47%, 41%)',
  'hsl(222, 47%, 51%)',
  'hsl(222, 47%, 61%)',
  'hsl(222, 47%, 71%)',
  'hsl(220, 14%, 46%)',
];

export function InsightsPanel({ 
  items, 
  currency, 
  onFilterByStatus,
  onFilterByTrade,
  onFilterByVariance,
}: InsightsPanelProps) {
  const formatPrice = (value: number) => formatCurrency(value, currency);

  // Status counts for pie chart
  const statusData = useMemo(() => {
    const counts = {
      ok: items.filter(i => i.status === 'ok').length,
      review: items.filter(i => i.status === 'review').length,
      clarification: items.filter(i => i.status === 'clarification').length,
    };
    
    return [
      { name: 'Approved', value: counts.ok, status: 'ok', color: CHART_COLORS.ok },
      { name: 'Need Review', value: counts.review, status: 'review', color: CHART_COLORS.review },
      { name: 'Clarification', value: counts.clarification, status: 'clarification', color: CHART_COLORS.clarification },
    ].filter(d => d.value > 0);
  }, [items]);

  // Trade distribution for pie chart
  const tradeData = useMemo(() => {
    const distribution = items.reduce((acc, item) => {
      const trade = item.trade || 'Other';
      if (!acc[trade]) {
        acc[trade] = { count: 0, value: 0 };
      }
      acc[trade].count++;
      acc[trade].value += item.totalPrice || 0;
      return acc;
    }, {} as Record<string, { count: number; value: number }>);

    return Object.entries(distribution)
      .map(([name, data], index) => ({
        name,
        value: data.value,
        count: data.count,
        color: TRADE_COLORS[index % TRADE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [items]);

  // Top variance items for bar chart
  const varianceData = useMemo(() => {
    return items
      .filter(i => i.originalUnitPrice && i.benchmarkTypical)
      .map(i => ({
        id: i.id,
        name: i.originalDescription.length > 25 
          ? i.originalDescription.substring(0, 25) + '...' 
          : i.originalDescription,
        fullName: i.originalDescription,
        trade: i.trade,
        variance: ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100,
        varianceValue: (i.originalUnitPrice! - i.benchmarkTypical!) * i.quantity,
        isOverpriced: i.originalUnitPrice! > i.benchmarkTypical!,
      }))
      .sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue))
      .slice(0, 10);
  }, [items]);

  // Custom tooltip for pie charts
  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium">{data.name}</p>
          {data.count !== undefined && (
            <p className="text-muted-foreground">{data.count} items</p>
          )}
          {data.value !== undefined && typeof data.value === 'number' && data.count !== undefined && (
            <p className="font-mono">{formatPrice(data.value)} {currency}</p>
          )}
          {data.status && (
            <p className="text-xs text-muted-foreground mt-1">Click to filter</p>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for bar chart
  const BarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm max-w-xs">
          <p className="font-medium">{data.fullName}</p>
          <p className="text-muted-foreground text-xs">{data.trade}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn(
              "font-mono font-medium",
              data.isOverpriced ? "text-destructive" : "text-success"
            )}>
              {data.variance > 0 ? '+' : ''}{data.variance.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">
              ({formatPrice(Math.abs(data.varianceValue))} {currency})
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleStatusClick = (data: any) => {
    if (data && data.status && onFilterByStatus) {
      onFilterByStatus(data.status);
    }
  };

  const handleTradeClick = (data: any) => {
    if (data && data.name && onFilterByTrade) {
      onFilterByTrade(data.name);
    }
  };

  return (
    <div className="space-y-6">
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution Pie Chart */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Items by Status</h3>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={handleStatusClick}
                  style={{ cursor: 'pointer' }}
                >
                  {statusData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-sm text-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Click a segment to filter the table
          </p>
        </Card>

        {/* Cost by Trade Pie Chart */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Cost Distribution by Trade</h3>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tradeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={handleTradeClick}
                  style={{ cursor: 'pointer' }}
                >
                  {tradeData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-sm text-foreground truncate max-w-[100px]">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Click a segment to filter by trade
          </p>
        </Card>
      </div>

      {/* Variance Bar Chart - Full Width */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Top 10 Variance Items</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            Sorted by absolute variance value
          </span>
        </div>
        {varianceData.length > 0 ? (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={varianceData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis 
                  type="number" 
                  tickFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`}
                  domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={150}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<BarTooltip />} />
                <Bar 
                  dataKey="variance" 
                  radius={[0, 4, 4, 0]}
                >
                  {varianceData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`}
                      fill={entry.isOverpriced ? 'hsl(0, 72%, 51%)' : 'hsl(142, 71%, 45%)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No variance data available
          </div>
        )}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-destructive" />
            <span className="text-muted-foreground">Overpriced (above benchmark)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-success" />
            <span className="text-muted-foreground">Underpriced (below benchmark)</span>
          </div>
        </div>
      </Card>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status Summary */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Status Summary
          </h3>
          <div className="space-y-3">
            {statusData.map((item) => (
              <button 
                key={item.status}
                onClick={() => onFilterByStatus?.(item.status)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={item.status as any} />
                  <span className="text-sm">{item.name}</span>
                </div>
                <span className="font-mono font-semibold">{item.value}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Top Trades by Value */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Top Trades by Value</h3>
          <div className="space-y-2">
            {tradeData.slice(0, 5).map((trade, index) => {
              const maxValue = tradeData[0]?.value || 1;
              const widthPercent = (trade.value / maxValue) * 100;
              
              return (
                <button
                  key={trade.name}
                  onClick={() => onFilterByTrade?.(trade.name)}
                  className="w-full text-left hover:bg-muted/30 rounded p-2 transition-colors"
                >
                  <div className="flex justify-between text-sm mb-1">
                    <span className="truncate flex-1">{trade.name}</span>
                    <span className="font-mono text-muted-foreground ml-2">
                      {formatPrice(trade.value)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${widthPercent}%`,
                        backgroundColor: trade.color,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Highest Variance Items */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Highest Variance Items</h3>
          <div className="space-y-3">
            {varianceData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No variance data available</p>
            ) : (
              varianceData.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2 py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.fullName}</p>
                    <p className="text-xs text-muted-foreground">{item.trade}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn(
                      "flex items-center gap-1 text-sm font-medium",
                      item.isOverpriced ? "text-destructive" : "text-success"
                    )}>
                      {item.isOverpriced ? (
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
    </div>
  );
}
