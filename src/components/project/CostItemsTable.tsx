import { useState } from 'react';
import { CostItem } from '@/types/project';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ChevronRight, Search, Filter, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostItemsTableProps {
  items: CostItem[];
  currency: string;
  onItemSelect: (item: CostItem) => void;
}

export function CostItemsTable({ items, currency, onItemSelect }: CostItemsTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const trades = [...new Set(items.map(item => item.trade).filter(Boolean))];
  
  const filteredItems = items.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (tradeFilter !== 'all' && item.trade !== tradeFilter) return false;
    if (searchQuery && !item.originalDescription.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPriceVariance = (original?: number, recommended?: number) => {
    if (!original || !recommended) return null;
    const variance = ((original - recommended) / recommended) * 100;
    return variance;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="clarification">Clarification</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={tradeFilter} onValueChange={setTradeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Trade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              {trades.map(trade => (
                <SelectItem key={trade} value={trade!}>{trade}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="text-sm text-muted-foreground ml-auto">
          {filteredItems.length} of {items.length} items
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-[40%]">Description</th>
              <th className="w-[100px]">Qty</th>
              <th className="w-[80px]">Unit</th>
              <th className="w-[120px] text-right">Original</th>
              <th className="w-[120px] text-right">Recommended</th>
              <th className="w-[100px]">Status</th>
              <th className="w-[50px]"></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const variance = getPriceVariance(item.originalUnitPrice, item.recommendedUnitPrice);
              
              return (
                <tr
                  key={item.id}
                  onClick={() => onItemSelect(item)}
                  className="cursor-pointer"
                >
                  <td>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground line-clamp-1">
                        {item.originalDescription}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {item.trade} • {item.sheetName}
                      </p>
                    </div>
                  </td>
                  <td className="font-mono text-sm">{formatPrice(item.quantity)}</td>
                  <td className="text-muted-foreground">{item.unit}</td>
                  <td className="text-right font-mono">
                    <div className="flex items-center justify-end gap-2">
                      <span>{item.originalUnitPrice ? formatPrice(item.originalUnitPrice) : '—'}</span>
                      {variance !== null && (
                        <span
                          className={cn(
                            'text-xs',
                            variance < -10 && 'text-destructive',
                            variance > 10 && 'text-success',
                            Math.abs(variance) <= 10 && 'text-muted-foreground'
                          )}
                        >
                          {variance > 0 ? '+' : ''}{variance.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right font-mono font-medium">
                    {formatPrice(item.recommendedUnitPrice)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.status} showIcon={false} />
                      {item.userClarification && (
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </td>
                  <td>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {filteredItems.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No items match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
