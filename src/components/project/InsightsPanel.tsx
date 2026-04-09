import { useMemo } from 'react';
import { CostItem } from '@/types/project';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  PieChart as PieChartIcon,
  BarChart3,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatCompactNumber } from '@/lib/formatters';
import { inferTddCategory, TDD_CATEGORY_COLORS, TDD_CATEGORIES, TddCategory } from '@/lib/tddCategories';
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
  excludedIds?: Set<string>;
}

const STATUS_COLORS = {
  ok: 'hsl(142, 71%, 45%)',
  review: 'hsl(38, 92%, 50%)',
  clarification: 'hsl(0, 72%, 51%)',
};

export function InsightsPanel({
  items,
  currency,
  onFilterByStatus,
  onFilterByTrade,
}: InsightsPanelProps) {
  const fmt = (v: number) => formatCurrency(v, currency);
  const numberBase = 'font-mono tabular-nums';

  // ── Total CAPEX ────────────────────────────────────────────
  const totalCAPEX = useMemo(() =>
    items.reduce((s, i) => {
      const p = i.userOverridePrice ?? i.recommendedUnitPrice ?? i.originalUnitPrice;
      return s + (p != null ? p * i.quantity : 0);
    }, 0),
  [items]);

  const avgCost = items.length > 0 ? totalCAPEX / items.length : 0;

  // ── Status distribution ────────────────────────────────────
  const statusData = useMemo(() => {
    const c = { ok: 0, review: 0, clarification: 0 };
    items.forEach(i => { if (i.status in c) (c as any)[i.status]++; });
    return [
      { name: 'Approved', value: c.ok, status: 'ok', color: STATUS_COLORS.ok },
      { name: 'Need Review', value: c.review, status: 'review', color: STATUS_COLORS.review },
      { name: 'Clarification', value: c.clarification, status: 'clarification', color: STATUS_COLORS.clarification },
    ].filter(d => d.value > 0);
  }, [items]);

  // ── TDD Category distribution ──────────────────────────────
  const tddData = useMemo(() => {
    const map: Record<TddCategory, { value: number; count: number }> = {} as any;
    TDD_CATEGORIES.forEach(c => { map[c] = { value: 0, count: 0 }; });
    items.forEach(item => {
      const cat = inferTddCategory(null, item.trade, item.originalDescription);
      const price = item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice;
      map[cat].value += price != null ? price * item.quantity : 0;
      map[cat].count++;
    });
    return TDD_CATEGORIES
      .map(name => ({ name, ...map[name], color: TDD_CATEGORY_COLORS[name] }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [items]);

  // ── Top cost drivers ───────────────────────────────────────
  const topDrivers = useMemo(() =>
    [...items].sort((a, b) => (b.totalPrice || 0) - (a.totalPrice || 0)).slice(0, 5),
  [items]);

  // ── Variance data ──────────────────────────────────────────
  const varianceData = useMemo(() =>
    items
      .filter(i => i.originalUnitPrice && i.benchmarkTypical)
      .map(i => ({
        id: i.id,
        name: i.originalDescription.length > 25 ? i.originalDescription.substring(0, 25) + '…' : i.originalDescription,
        fullName: i.originalDescription,
        trade: i.trade,
        variance: ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100,
        varianceValue: (i.originalUnitPrice! - i.benchmarkTypical!) * i.quantity,
        isOverpriced: i.originalUnitPrice! > i.benchmarkTypical!,
      }))
      .sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue))
      .slice(0, 10),
  [items]);

  // ── Tooltips ───────────────────────────────────────────────
  const PieTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium">{d.name}</p>
        {d.count != null && <p className="text-muted-foreground">{d.count} items</p>}
        {d.value != null && typeof d.value === 'number' && d.count != null && (
          <p className="font-mono">{fmt(d.value)} {currency}</p>
        )}
        {d.status && <p className="text-xs text-muted-foreground mt-1">Click to filter</p>}
      </div>
    );
  };

  const TddTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const pct = totalCAPEX > 0 ? ((d.value / totalCAPEX) * 100).toFixed(1) : '0';
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium">{d.name}</p>
        <p className="font-mono">{fmt(d.value)} {currency}</p>
        <p className="text-xs text-muted-foreground">{d.count} items · {pct}%</p>
      </div>
    );
  };

  const BarTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm max-w-xs">
        <p className="font-medium">{d.fullName}</p>
        <p className="text-muted-foreground text-xs">{d.trade}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className={cn('font-mono font-medium', d.isOverpriced ? 'text-destructive' : 'text-success')}>
            {d.variance > 0 ? '+' : ''}{d.variance.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">({fmt(Math.abs(d.varianceValue))} {currency})</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Row 1: TDD Category Donut + Status Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TDD Category Donut */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Budget by TDD Category</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-[220px] w-[220px] flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tddData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {tddData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<TddTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              {tddData.map(d => {
                const pct = totalCAPEX > 0 ? (d.value / totalCAPEX * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="truncate flex-1">{d.name}</span>
                    <span className={cn('text-xs', numberBase)}>{pct.toFixed(0)}%</span>
                    <span className={cn('text-xs text-muted-foreground', numberBase)}>{fmt(d.value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Status Distribution */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Items by Status</h3>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={(d: any) => d?.status && onFilterByStatus?.(d.status)}
                  style={{ cursor: 'pointer' }}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltipContent />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(v: string) => <span className="text-sm text-foreground">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">Click a segment to filter</p>
        </Card>
      </div>

      {/* ── Row 2: Cost Distribution + Top Cost Drivers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Distribution Card */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Cost Distribution</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total CAPEX</p>
                <p className={cn('text-lg font-semibold', numberBase)}>{formatCompactNumber(totalCAPEX).display} <span className="text-xs font-normal text-muted-foreground">{currency}</span></p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Avg / Item</p>
                <p className={cn('text-lg font-semibold', numberBase)}>{formatCompactNumber(avgCost).display} <span className="text-xs font-normal text-muted-foreground">{currency}</span></p>
              </div>
            </div>

            {/* Category bars */}
            <div className="space-y-2">
              {tddData.slice(0, 5).map(d => {
                const maxVal = tddData[0]?.value || 1;
                const w = (d.value / maxVal) * 100;
                return (
                  <div key={d.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="truncate flex-1 text-muted-foreground">{d.name}</span>
                      <span className={cn('ml-2', numberBase, 'text-xs')}>{fmt(d.value)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: d.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Top Cost Drivers */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Top 5 Cost Drivers</h3>
          </div>
          <div className="space-y-3">
            {topDrivers.map((item, idx) => {
              const pct = totalCAPEX > 0 ? ((item.totalPrice || 0) / totalCAPEX * 100) : 0;
              const cat = inferTddCategory(null, item.trade, item.originalDescription);
              return (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    idx === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.originalDescription}</p>
                    <p className="text-xs text-muted-foreground">{cat} · {item.trade || '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn('text-sm font-semibold', numberBase)}>
                      {formatCompactNumber(item.totalPrice).display} <span className="text-xs font-normal text-muted-foreground">{currency}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Row 3: Variance Bar Chart ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Top 10 Variance Items</h3>
          <span className="text-xs text-muted-foreground ml-auto">Sorted by absolute variance value</span>
        </div>
        {varianceData.length > 0 ? (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={varianceData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis
                  type="number"
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                  domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 12 }}
                />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <Tooltip content={<BarTooltipContent />} />
                <Bar dataKey="variance" radius={[0, 4, 4, 0]}>
                  {varianceData.map((entry, i) => (
                    <Cell key={i} fill={entry.isOverpriced ? 'hsl(0, 72%, 51%)' : 'hsl(142, 71%, 45%)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">No variance data available</div>
        )}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-destructive" />
            <span className="text-muted-foreground">Overpriced</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-success" />
            <span className="text-muted-foreground">Underpriced</span>
          </div>
        </div>
      </Card>

      {/* ── Row 4: Status Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Status Summary
          </h3>
          <div className="space-y-3">
            {statusData.map(item => (
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

        {/* TDD Categories by Count */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">TDD Categories by Count</h3>
          <div className="space-y-2">
            {tddData.slice(0, 5).map(d => (
              <div key={d.name} className="flex items-center justify-between p-2 rounded hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="text-sm truncate">{d.name}</span>
                </div>
                <span className="font-mono text-sm text-muted-foreground">{d.count} items</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Highest Variance */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Highest Variance Items</h3>
          <div className="space-y-3">
            {varianceData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No variance data</p>
            ) : (
              varianceData.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-start justify-between gap-2 py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.fullName}</p>
                    <p className="text-xs text-muted-foreground">{item.trade}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn(
                      'flex items-center gap-1 text-sm font-medium',
                      item.isOverpriced ? 'text-destructive' : 'text-success',
                    )}>
                      {item.isOverpriced ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {item.variance > 0 ? '+' : ''}{item.variance.toFixed(0)}%
                    </div>
                    <p className="text-xs text-muted-foreground">{fmt(Math.abs(item.varianceValue))} {currency}</p>
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
