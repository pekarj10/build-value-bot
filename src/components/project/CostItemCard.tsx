import { CostItem } from '@/types/project';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronRight, MessageSquare, RotateCcw, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';

interface CostItemCardProps {
  item: CostItem;
  currency: string;
  onSelect: (item: CostItem) => void;
  onResetPrice?: (itemId: string) => void;
  formatPrice: (value: number) => string;
}

export function CostItemCard({
  item,
  currency,
  onSelect,
  onResetPrice,
  formatPrice,
}: CostItemCardProps) {
  const hasOverride = item.userOverridePrice !== undefined;
  const displayPrice = item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice;
  const totalPrice = displayPrice ? displayPrice * item.quantity : 0;

  // Calculate variance
  const variance = item.originalUnitPrice && item.benchmarkTypical
    ? ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100
    : null;

  return (
    <Card 
      className="p-4 cursor-pointer hover:border-primary/30 transition-all active:scale-[0.99]"
      onClick={() => onSelect(item)}
    >
      {/* Header: Description + Status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground line-clamp-2 text-sm">
            {item.originalDescription}
          </p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {item.trade} • {item.sheetName}
          </p>
        </div>
        <StatusBadge status={item.status} showIcon={false} />
      </div>

      {/* Grid: Qty, Unit, Price */}
      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Qty</p>
          <p className="font-mono font-medium">{item.quantity.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unit</p>
          <p className="font-medium">{item.unit}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Unit Price</p>
          <div className="flex items-center justify-end gap-1">
            <span className={cn("font-mono font-medium", hasOverride && "text-warning")}>
              {displayPrice ? formatPrice(displayPrice) : '—'}
            </span>
            {variance !== null && (
              <span className={cn('text-[10px] font-semibold px-1 py-0.5 rounded', 
                Math.abs(variance) <= 10 && 'bg-success/10 text-success',
                Math.abs(variance) > 10 && Math.abs(variance) <= 25 && 'bg-warning/10 text-warning',
                Math.abs(variance) > 25 && 'bg-destructive/10 text-destructive'
              )}>
                {variance > 0 ? '+' : ''}{variance.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Total + Actions */}
      <div className="flex items-center justify-between pt-3 border-t">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-mono font-semibold text-primary">
            {totalPrice ? `${formatPrice(totalPrice)} ${currency}` : '—'}
          </p>
        </div>
        
        <div className="flex items-center gap-1">
          {hasOverride && onResetPrice && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onResetPrice(item.id);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {item.clarificationQuestion && (
            <MessageSquare className="h-4 w-4 text-warning" />
          )}
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}