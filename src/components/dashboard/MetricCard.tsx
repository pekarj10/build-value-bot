import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function MetricCard({ title, value, description, trend, className }: MetricCardProps) {
  return (
    <Card className={cn('metric-card', className)}>
      <div className="flex items-start justify-between">
        <p className="metric-label">{title}</p>
        {trend && (
          <div
            className={cn(
              'p-1 rounded',
              trend === 'up' && 'bg-destructive/10 text-destructive',
              trend === 'down' && 'bg-success/10 text-success',
              trend === 'neutral' && 'bg-muted text-muted-foreground'
            )}
          >
            {trend === 'up' && <TrendingUp className="h-4 w-4" />}
            {trend === 'down' && <TrendingDown className="h-4 w-4" />}
            {trend === 'neutral' && <Minus className="h-4 w-4" />}
          </div>
        )}
      </div>
      <p className="metric-value">{value}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </Card>
  );
}
