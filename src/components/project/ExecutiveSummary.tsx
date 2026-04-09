import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CostItem } from '@/types/project';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Calculator,
  Percent,
  DollarSign,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompactNumber, formatCurrency } from '@/lib/formatters';
import { inferTddCategory, TDD_CATEGORY_COLORS, TDD_CATEGORIES, TddCategory } from '@/lib/tddCategories';
import { useProjectTerminology } from '@/hooks/useProjectTerminology';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface ExecutiveSummaryProps {
  items: CostItem[];
  currency: string;
  excludedIds?: Set<string>;
  projectType?: string;
}

export function ExecutiveSummary({ items, currency, excludedIds, projectType = 'new_construction_residential' }: ExecutiveSummaryProps) {
  const t = useProjectTerminology(projectType);
  const [isExpanded, setIsExpanded] = useState(true);
  const [forceCompactLayout, setForceCompactLayout] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => setForceCompactLayout(e.matches);
    setForceCompactLayout(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const fmt = (value: number) => `${formatCurrency(value, currency)} ${currency}`;

  // Filter items based on scenario exclusions
  const activeItems = useMemo(() =>
    excludedIds?.size ? items.filter(i => !excludedIds.has(i.id)) : items,
  [items, excludedIds]);

  // ── Core metrics ──────────────────────────────────────────
  const totalCAPEX = useMemo(() =>
    activeItems.reduce((sum, item) => {
      const price = item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice;
      return sum + (price != null ? price * item.quantity : 0);
    }, 0),
  [activeItems]);

  const totalOriginal = useMemo(() =>
    activeItems.reduce((sum, item) => sum + (item.originalUnitPrice ? item.originalUnitPrice * item.quantity : 0), 0),
  [activeItems]);

  const reviewCount = useMemo(() =>
    activeItems.filter(i => i.status === 'review' || i.status === 'clarification').length,
  [activeItems]);

  const avgCostPerItem = activeItems.length > 0 ? totalCAPEX / activeItems.length : 0;

  const avgVariance = useMemo(() => {
    const withVar = activeItems.filter(i => i.originalUnitPrice && i.benchmarkTypical);
    if (!withVar.length) return 0;
    return withVar.reduce((s, i) =>
      s + ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100, 0
    ) / withVar.length;
  }, [activeItems]);

  // ── Top 3 cost drivers ────────────────────────────────────
  const topDrivers = useMemo(() =>
    [...activeItems]
      .sort((a, b) => (b.totalPrice || 0) - (a.totalPrice || 0))
      .slice(0, 3),
  [activeItems]);

  // ── TDD Category distribution ─────────────────────────────
  const tddData = useMemo(() => {
    const map: Record<TddCategory, number> = {} as any;
    TDD_CATEGORIES.forEach(c => { map[c] = 0; });

    activeItems.forEach(item => {
      const cat = inferTddCategory(null, item.trade, item.originalDescription);
      const price = item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice;
      map[cat] += price != null ? price * item.quantity : 0;
    });

    return TDD_CATEGORIES
      .map(name => ({ name, value: map[name], color: TDD_CATEGORY_COLORS[name] }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const valueDifference = totalOriginal - totalCAPEX;

  // ── Shared sub-components ─────────────────────────────────
  const numberBase = 'font-mono tabular-nums';

  const DonutTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const pct = totalCAPEX > 0 ? ((d.value / totalCAPEX) * 100).toFixed(1) : '0';
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium">{d.name}</p>
        <p className="font-mono text-muted-foreground">{fmt(d.value)}</p>
        <p className="text-xs text-muted-foreground">{pct}% of {t.totalBudgetShort}</p>
      </div>
    );
  };

  return (
    <Card className="p-5 lg:p-6 bg-card border shadow-sm animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-lg">{t.summaryTitle}</h2>
            <p className="text-sm text-muted-foreground hidden sm:block">{t.summarySubtitle}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="flex-shrink-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* ── Hero: Total Estimated CAPEX ── */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 mb-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          {t.totalBudgetLabel}
        </p>
        <p className={cn('text-3xl lg:text-4xl font-semibold text-foreground', numberBase)}>
          {fmt(totalCAPEX)}
        </p>
        {totalOriginal > 0 && valueDifference !== 0 && (
          <p className={cn(
            'text-sm mt-1',
            valueDifference > 0 ? 'text-success' : 'text-warning',
          )}>
            {valueDifference > 0 ? '▼' : '▲'} {fmt(Math.abs(valueDifference))} vs original estimate
          </p>
        )}
      </div>

      {/* ── Collapsed summary line ── */}
      {!isExpanded && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-warning" />
            <span className="font-medium">{reviewCount}</span> need review
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            Avg/item <span className="font-medium font-mono">{fmt(avgCostPerItem)}</span>
          </span>
          <span className={cn(
            'flex items-center gap-1',
            Math.abs(avgVariance) <= 10 && 'text-success',
            Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && 'text-warning',
            Math.abs(avgVariance) > 25 && 'text-destructive',
          )}>
            <span className="font-medium">{avgVariance >= 0 ? '+' : ''}{avgVariance.toFixed(1)}%</span> avg variance
          </span>
        </div>
      )}

      {/* ── Expanded content ── */}
      {isExpanded && (
        <div className="space-y-5 animate-fade-in">
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MiniKpi
              icon={<AlertCircle className="h-4 w-4 text-warning" />}
              label="Need Review"
              value={`${reviewCount}`}
              sub={`of ${items.length} items`}
            />
            <MiniKpi
              icon={<DollarSign className="h-4 w-4 text-primary" />}
              label="Avg Cost / Item"
              value={formatCompactNumber(avgCostPerItem).display}
              sub={currency}
            />
            <MiniKpi
              icon={<Percent className="h-4 w-4 text-muted-foreground" />}
              label="Avg Variance"
              value={`${avgVariance >= 0 ? '+' : ''}${avgVariance.toFixed(1)}%`}
              valueClass={cn(
                Math.abs(avgVariance) <= 10 && 'text-success',
                Math.abs(avgVariance) > 10 && Math.abs(avgVariance) <= 25 && 'text-warning',
                Math.abs(avgVariance) > 25 && 'text-destructive',
              )}
            />
            <MiniKpi
              icon={<Layers className="h-4 w-4 text-muted-foreground" />}
              label={t.categoriesLabel}
              value={`${tddData.length}`}
              sub="active"
            />
          </div>

          {/* Two-column: Donut + Cost Drivers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* TDD Category Donut */}
            <div className="rounded-xl border p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                {t.budgetChartTitle}
              </h3>
              {tddData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="w-[160px] h-[160px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={tddData}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={72}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        >
                          {tddData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<DonutTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {tddData.map(d => {
                      const pct = totalCAPEX > 0 ? ((d.value / totalCAPEX) * 100) : 0;
                      return (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="truncate flex-1 text-muted-foreground">{d.name}</span>
                          <span className="font-mono text-xs text-foreground">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No data</p>
              )}
            </div>

            {/* Top Cost Drivers */}
            <div className="rounded-xl border p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Top 3 {t.costDriversTitle}
              </h3>
              {topDrivers.length > 0 ? (
                <div className="space-y-3">
                  {topDrivers.map((item, idx) => {
                    const pct = totalCAPEX > 0 ? ((item.totalPrice || 0) / totalCAPEX * 100) : 0;
                    return (
                      <div key={item.id} className="flex items-start gap-3">
                        <span className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
                          idx === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        )}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.originalDescription}</p>
                          <p className="text-xs text-muted-foreground">{item.trade || 'No trade'}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={cn('text-sm font-semibold', numberBase)}>
                            {formatCompactNumber(item.totalPrice).display}
                          </p>
                          <p className="text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No items</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Mini KPI card ────────────────────────────────────────────
function MiniKpi({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn('text-xl font-semibold font-mono tabular-nums', valueClass || 'text-foreground')}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
