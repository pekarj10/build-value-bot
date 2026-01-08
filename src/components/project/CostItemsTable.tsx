import { useState } from 'react';
import { CostItem } from '@/types/project';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ChevronRight, Search, Filter, MessageSquare, Pencil, Check, X, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostItemsTableProps {
  items: CostItem[];
  currency: string;
  onItemSelect: (item: CostItem) => void;
  onPriceUpdate?: (itemId: string, price: number) => void;
  onBulkAccept?: (itemIds: string[]) => void;
  onBulkMarkReviewed?: (itemIds: string[]) => void;
  statusFilter?: string;
}

export function CostItemsTable({ 
  items, 
  currency, 
  onItemSelect, 
  onPriceUpdate,
  onBulkAccept,
  onBulkMarkReviewed,
  statusFilter: externalStatusFilter
}: CostItemsTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>(externalStatusFilter || 'all');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const getVarianceColor = (variance: number | null) => {
    if (variance === null) return '';
    const absVariance = Math.abs(variance);
    if (absVariance <= 10) return 'text-success';
    if (absVariance <= 25) return 'text-warning';
    return 'text-destructive';
  };

  const getRowHighlight = (item: CostItem) => {
    const variance = getPriceVariance(item.originalUnitPrice, item.benchmarkTypical);
    if (variance === null) return '';
    const absVariance = Math.abs(variance);
    if (absVariance <= 10) return 'border-l-4 border-l-success/50';
    if (absVariance <= 25) return 'border-l-4 border-l-warning/50';
    return 'border-l-4 border-l-destructive/50';
  };

  const handleEditStart = (item: CostItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditValue((item.userOverridePrice || item.recommendedUnitPrice).toString());
  };

  const handleEditSave = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const price = parseFloat(editValue);
    if (!isNaN(price) && price > 0 && onPriceUpdate) {
      onPriceUpdate(itemId, price);
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleEditCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, itemId: string) => {
    if (e.key === 'Enter') {
      const price = parseFloat(editValue);
      if (!isNaN(price) && price > 0 && onPriceUpdate) {
        onPriceUpdate(itemId, price);
      }
      setEditingId(null);
      setEditValue('');
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkAccept = () => {
    if (onBulkAccept && selectedIds.size > 0) {
      onBulkAccept(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleBulkMarkReviewed = () => {
    if (onBulkMarkReviewed && selectedIds.size > 0) {
      onBulkMarkReviewed(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  // Calculate totals
  const totals = filteredItems.reduce((acc, item) => {
    acc.quantity += item.quantity;
    acc.originalTotal += (item.originalUnitPrice || 0) * item.quantity;
    acc.recommendedTotal += (item.userOverridePrice || item.recommendedUnitPrice || 0) * item.quantity;
    return acc;
  }, { quantity: 0, originalTotal: 0, recommendedTotal: 0 });

  const totalSavings = totals.originalTotal - totals.recommendedTotal;

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

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={handleBulkAccept}>
              <Check className="h-4 w-4 mr-1" />
              Accept Recommendations
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkMarkReviewed}>
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark as Reviewed
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-[40px]">
                <Checkbox
                  checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="w-[35%]">Description</th>
              <th className="w-[80px]">Qty</th>
              <th className="w-[60px]">Unit</th>
              <th className="w-[120px] text-right">Original</th>
              <th className="w-[140px] text-right">Recommended</th>
              <th className="w-[100px]">Status</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const variance = getPriceVariance(item.originalUnitPrice, item.benchmarkTypical);
              const isEditing = editingId === item.id;
              const hasOverride = item.userOverridePrice !== undefined;
              const displayPrice = item.userOverridePrice || item.recommendedUnitPrice;
              const isSelected = selectedIds.has(item.id);
              
              return (
                <tr
                  key={item.id}
                  onClick={() => !isEditing && onItemSelect(item)}
                  className={cn(
                    "cursor-pointer", 
                    isEditing && "bg-muted/50",
                    isSelected && "bg-primary/5",
                    getRowHighlight(item)
                  )}
                >
                  <td onClick={(e) => toggleSelect(item.id, e)}>
                    <Checkbox checked={isSelected} />
                  </td>
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
                        <span className={cn('text-xs font-medium', getVarianceColor(variance))}>
                          {variance > 0 ? '+' : ''}{variance.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, item.id)}
                          className="w-24 h-8 text-right font-mono"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => handleEditSave(item.id, e)}
                        >
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleEditCancel}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2 group">
                        <span className={cn(
                          "font-mono font-medium",
                          hasOverride && "text-warning"
                        )}>
                          {displayPrice ? formatPrice(displayPrice) : '—'}
                        </span>
                        {onPriceUpdate && displayPrice && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleEditStart(item, e)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
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
          {/* Totals Row */}
          <tfoot className="bg-muted/30 border-t-2">
            <tr className="font-medium">
              <td colSpan={2} className="text-right">Totals</td>
              <td className="font-mono">{formatPrice(totals.quantity)}</td>
              <td></td>
              <td className="text-right font-mono">{formatPrice(totals.originalTotal)}</td>
              <td className="text-right font-mono">{formatPrice(totals.recommendedTotal)}</td>
              <td colSpan={2}>
                <span className={cn(
                  "text-sm font-mono",
                  totalSavings > 0 ? "text-success" : totalSavings < 0 ? "text-destructive" : ""
                )}>
                  {totalSavings !== 0 && (
                    <>
                      {totalSavings > 0 ? 'Save ' : 'Over '}
                      {formatPrice(Math.abs(totalSavings))}
                    </>
                  )}
                </span>
              </td>
            </tr>
          </tfoot>
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