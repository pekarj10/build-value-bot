import { useState, useMemo, useRef, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  ChevronRight, 
  Search, 
  Filter, 
  MessageSquare, 
  Pencil, 
  Check, 
  X, 
  CheckCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Save,
  Trash2,
  Download,
  Flag,
  RotateCcw,
  Plus,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import { MultiSelect } from './MultiSelect';
import { QuickFilterChips } from './QuickFilterChips';
import { TablePagination } from './TablePagination';
import { SaveFilterDialog } from './SaveFilterDialog';
import { EmptyState } from './EmptyState';
import { useSavedFilters, FilterState } from '@/hooks/useSavedFilters';

interface CostItemsTableProps {
  items: CostItem[];
  currency: string;
  onItemSelect: (item: CostItem) => void;
  onPriceUpdate?: (itemId: string, price: number) => void;
  onBulkAccept?: (itemIds: string[]) => void;
  onBulkMarkReviewed?: (itemIds: string[]) => void;
  onBulkStatusChange?: (itemIds: string[], status: string) => void;
  onDeleteItem?: (itemId: string) => Promise<boolean>;
  onAddItem?: () => void;
  onReanalyzeItems?: (itemIds: string[]) => Promise<void>;
  isReanalyzing?: boolean;
  statusFilter?: string;
  tradeFilter?: string;
  isLoading?: boolean;
}

type SortField = 'description' | 'quantity' | 'originalPrice' | 'recommendedPrice' | 'variance' | 'trade' | 'status';
type SortDirection = 'asc' | 'desc';

const VARIANCE_RANGES = [
  { value: 'all', label: 'All Variance' },
  { value: '<5', label: '< 5%' },
  { value: '5-10', label: '5% – 10%' },
  { value: '10-15', label: '10% – 15%' },
  { value: '>15', label: '> 15%' },
];

const STATUS_OPTIONS = [
  { value: 'ok', label: 'OK' },
  { value: 'review', label: 'Review' },
  { value: 'clarification', label: 'Clarification' },
  { value: 'underpriced', label: 'Under-Priced' },
];

export function CostItemsTable({ 
  items, 
  currency, 
  onItemSelect, 
  onPriceUpdate,
  onBulkAccept,
  onBulkMarkReviewed,
  onBulkStatusChange,
  onDeleteItem,
  onAddItem,
  onReanalyzeItems,
  isReanalyzing = false,
  statusFilter: externalStatusFilter,
  tradeFilter: externalTradeFilter,
  isLoading = false,
}: CostItemsTableProps) {
  // Filter states
  const [statusFilters, setStatusFilters] = useState<string[]>(
    externalStatusFilter && externalStatusFilter !== 'all' ? [externalStatusFilter] : []
  );
  const [tradeFilters, setTradeFilters] = useState<string[]>(
    externalTradeFilter ? [externalTradeFilter] : []
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');
  const [varianceRange, setVarianceRange] = useState<string>('all');
  const [quickFilters, setQuickFilters] = useState<string[]>([]);
  
  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Sort states
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Save filter dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  
  // Search input ref for keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const { savedFilters, saveFilter, deleteFilter, getDefaultFilterState } = useSavedFilters();
  
  // Trade options
  const trades = useMemo(() => 
    [...new Set(items.map(item => item.trade).filter(Boolean))] as string[],
    [items]
  );
  
  const tradeOptions = trades.map(t => ({ value: t, label: t }));

  // Sync external status filter
  useEffect(() => {
    if (externalStatusFilter && externalStatusFilter !== 'all') {
      setStatusFilters([externalStatusFilter]);
      setCurrentPage(1);
    }
  }, [externalStatusFilter]);

  // Sync external trade filter
  useEffect(() => {
    if (externalTradeFilter) {
      setTradeFilters([externalTradeFilter]);
      setCurrentPage(1);
    }
  }, [externalTradeFilter]);

  // Calculate variance for an item
  const getItemVariance = (item: CostItem) => {
    if (!item.originalUnitPrice || !item.benchmarkTypical) return null;
    return ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100;
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Status filter (multi-select)
      if (statusFilters.length > 0 && !statusFilters.includes(item.status)) {
        return false;
      }
      
      // Trade filter (multi-select)
      if (tradeFilters.length > 0 && (!item.trade || !tradeFilters.includes(item.trade))) {
        return false;
      }
      
      // Search query (description, trade, sheet name)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesDescription = item.originalDescription.toLowerCase().includes(query);
        const matchesTrade = item.trade?.toLowerCase().includes(query);
        const matchesSheet = item.sheetName?.toLowerCase().includes(query);
        if (!matchesDescription && !matchesTrade && !matchesSheet) {
          return false;
        }
      }
      
      // Price range filter
      const price = item.originalUnitPrice || 0;
      if (priceMin && price < parseFloat(priceMin)) return false;
      if (priceMax && price > parseFloat(priceMax)) return false;
      
      // Variance range filter
      const variance = getItemVariance(item);
      if (varianceRange !== 'all' && variance !== null) {
        const absVariance = Math.abs(variance);
        switch (varianceRange) {
          case '<5':
            if (absVariance >= 5) return false;
            break;
          case '5-10':
            if (absVariance < 5 || absVariance >= 10) return false;
            break;
          case '10-15':
            if (absVariance < 10 || absVariance >= 15) return false;
            break;
          case '>15':
            if (absVariance < 15) return false;
            break;
        }
      }
      
      // Quick filters
      if (quickFilters.includes('high-variance')) {
        const v = getItemVariance(item);
        if (v === null || Math.abs(v) < 15) return false;
      }
      if (quickFilters.includes('needs-review')) {
        if (item.status !== 'review' && item.status !== 'clarification') return false;
      }
      if (quickFilters.includes('over-budget')) {
        const v = getItemVariance(item);
        // Item is over-budget (more than 10% above benchmark)
        if (v === null || v <= 10) return false;
      }
      if (quickFilters.includes('under-priced')) {
        const v = getItemVariance(item);
        // Item is significantly under-priced (more than 10% below benchmark)
        if (v === null || v >= -10) return false;
      }
      
      return true;
    });
  }, [items, statusFilters, tradeFilters, searchQuery, priceMin, priceMax, varianceRange, quickFilters]);

  // Sort items
  const sortedItems = useMemo(() => {
    if (!sortField) return filteredItems;
    
    return [...filteredItems].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'description':
          comparison = a.originalDescription.localeCompare(b.originalDescription);
          break;
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
        case 'originalPrice':
          comparison = (a.originalUnitPrice || 0) - (b.originalUnitPrice || 0);
          break;
        case 'recommendedPrice':
          comparison = (a.recommendedUnitPrice || 0) - (b.recommendedUnitPrice || 0);
          break;
        case 'variance':
          const vA = getItemVariance(a) || 0;
          const vB = getItemVariance(b) || 0;
          comparison = Math.abs(vB) - Math.abs(vA);
          break;
        case 'trade':
          comparison = (a.trade || '').localeCompare(b.trade || '');
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredItems, sortField, sortDirection]);

  // Paginate items
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedItems.length / pageSize);

  // Format price using locale-aware formatter
  const formatPrice = (value: number) => formatCurrency(value, currency);

  const getVarianceColor = (variance: number | null) => {
    if (variance === null) return '';
    const absVariance = Math.abs(variance);
    if (absVariance <= 10) return 'text-success';
    if (absVariance <= 25) return 'text-warning';
    return 'text-destructive';
  };

  const getRowHighlight = (item: CostItem) => {
    const variance = getItemVariance(item);
    if (variance === null) return '';
    const absVariance = Math.abs(variance);
    if (absVariance <= 10) return 'border-l-4 border-l-success/50';
    if (absVariance <= 25) return 'border-l-4 border-l-warning/50';
    return 'border-l-4 border-l-destructive/50';
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary" />;
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
      toast.success('Price updated successfully');
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
        toast.success('Price updated successfully');
      }
      setEditingId(null);
      setEditValue('');
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedItems.map(i => i.id)));
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
      toast.success(`${selectedIds.size} items accepted`);
    }
  };

  const handleBulkMarkReviewed = () => {
    if (onBulkMarkReviewed && selectedIds.size > 0) {
      onBulkMarkReviewed(Array.from(selectedIds));
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} items marked for review`);
    }
  };

  const handleBulkStatusChange = (status: string) => {
    if (onBulkStatusChange && selectedIds.size > 0) {
      onBulkStatusChange(Array.from(selectedIds), status);
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} items updated to ${status}`);
    }
  };

  const handleExportSelected = () => {
    // This would trigger the export dialog with selected items
    toast.success(`Preparing export for ${selectedIds.size} items...`);
  };

  const handleReanalyzeSelected = async () => {
    if (onReanalyzeItems && selectedIds.size > 0) {
      await onReanalyzeItems(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleReanalyzeAll = async () => {
    if (onReanalyzeItems) {
      const allIds = items.map(i => i.id);
      await onReanalyzeItems(allIds);
    }
  };

  const toggleQuickFilter = (filter: string) => {
    setQuickFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
    setCurrentPage(1);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (statusFilters.length > 0) count++;
    if (tradeFilters.length > 0) count++;
    if (searchQuery) count++;
    if (priceMin || priceMax) count++;
    if (varianceRange !== 'all') count++;
    if (quickFilters.length > 0) count += quickFilters.length;
    return count;
  };

  const clearAllFilters = () => {
    setStatusFilters([]);
    setTradeFilters([]);
    setSearchQuery('');
    setPriceMin('');
    setPriceMax('');
    setVarianceRange('all');
    setQuickFilters([]);
    setCurrentPage(1);
    toast.success('All filters cleared');
  };

  const handleSaveFilter = (name: string) => {
    const filters: FilterState = {
      statusFilters,
      tradeFilters,
      searchQuery,
      priceMin: priceMin ? parseFloat(priceMin) : null,
      priceMax: priceMax ? parseFloat(priceMax) : null,
      varianceRange,
      quickFilters,
    };
    saveFilter(name, filters);
    toast.success(`Filter "${name}" saved`);
  };

  const applyFilter = (filter: FilterState) => {
    setStatusFilters(filter.statusFilters);
    setTradeFilters(filter.tradeFilters);
    setSearchQuery(filter.searchQuery);
    setPriceMin(filter.priceMin?.toString() || '');
    setPriceMax(filter.priceMax?.toString() || '');
    setVarianceRange(filter.varianceRange);
    setQuickFilters(filter.quickFilters);
    setCurrentPage(1);
    toast.success('Filter applied');
  };

  // Calculate totals
  const totals = paginatedItems.reduce((acc, item) => {
    acc.quantity += item.quantity;
    acc.originalTotal += (item.originalUnitPrice || 0) * item.quantity;
    acc.recommendedTotal += (item.userOverridePrice || item.recommendedUnitPrice || 0) * item.quantity;
    return acc;
  }, { quantity: 0, originalTotal: 0, recommendedTotal: 0 });

  const totalSavings = totals.originalTotal - totals.recommendedTotal;
  const activeFilterCount = getActiveFilterCount();

  // Empty states
  if (items.length === 0) {
    return <EmptyState type="no-items" />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Main Filters Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder='Search items... (Press "/" to focus)'
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            
            {/* Status Multi-Select */}
            <MultiSelect
              options={STATUS_OPTIONS}
              selected={statusFilters}
              onChange={(values) => {
                setStatusFilters(values);
                setCurrentPage(1);
              }}
              placeholder="Status"
              className="w-[140px]"
            />
            
            {/* Trade Multi-Select */}
            <MultiSelect
              options={tradeOptions}
              selected={tradeFilters}
              onChange={(values) => {
                setTradeFilters(values);
                setCurrentPage(1);
              }}
              placeholder="Trade"
              className="w-[160px]"
            />

            {/* Variance Range */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Select value={varianceRange} onValueChange={(v) => {
                  setVarianceRange(v);
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Variance" />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIANCE_RANGES.map(range => (
                      <SelectItem key={range.value} value={range.value}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TooltipTrigger>
              <TooltipContent>
                <p>Filter by price variance percentage</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Price Range */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Input
                  type="number"
                  placeholder="Min price"
                  value={priceMin}
                  onChange={(e) => {
                    setPriceMin(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-[100px]"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>Minimum original unit price ({currency})</p>
              </TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground">–</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Input
                  type="number"
                  placeholder="Max price"
                  value={priceMax}
                  onChange={(e) => {
                    setPriceMax(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-[100px]"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>Maximum original unit price ({currency})</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Quick Filters & Actions Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <QuickFilterChips 
              activeFilters={quickFilters} 
              onToggle={toggleQuickFilter} 
            />

            {/* Saved Filters */}
            {savedFilters.length > 0 && (
              <Select onValueChange={(id) => {
                const filter = savedFilters.find(f => f.id === id);
                if (filter) applyFilter(filter.filters);
              }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Saved filters" />
                </SelectTrigger>
                <SelectContent>
                  {savedFilters.map(filter => (
                    <SelectItem key={filter.id} value={filter.id}>
                      {filter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <>
                <Badge variant="secondary" className="gap-1">
                  {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => setShowSaveDialog(true)}>
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save current filters</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear all filters</TooltipContent>
                </Tooltip>
              </>
            )}
            
            <div className="text-sm text-muted-foreground">
              {sortedItems.length} of {items.length} items
            </div>

            {onReanalyzeItems && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleReanalyzeAll} 
                    size="sm" 
                    variant="outline"
                    disabled={isReanalyzing || items.length === 0}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-1", isReanalyzing && "animate-spin")} />
                    {isReanalyzing ? 'Analyzing...' : 'Re-analyze All'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Re-run AI analysis on all items with current project context</TooltipContent>
              </Tooltip>
            )}

            {onAddItem && (
              <Button onClick={onAddItem} size="sm" disabled={isReanalyzing}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            )}
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <span className="text-sm font-medium">
              {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleBulkAccept}>
                    <Check className="h-4 w-4 mr-1" />
                    Accept
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Accept recommendations for selected items</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleBulkMarkReviewed}>
                    <Flag className="h-4 w-4 mr-1" />
                    Flag for Review
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mark selected items for review</TooltipContent>
              </Tooltip>
              <Select onValueChange={handleBulkStatusChange}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleExportSelected}>
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export selected items to Excel</TooltipContent>
              </Tooltip>
              {onReanalyzeItems && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleReanalyzeSelected}
                      disabled={isReanalyzing}
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-1", isReanalyzing && "animate-spin")} />
                      {isReanalyzing ? 'Analyzing...' : 'Re-analyze'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Re-run AI analysis on selected items</TooltipContent>
                </Tooltip>
              )}
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
                    checked={selectedIds.size === paginatedItems.length && paginatedItems.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th 
                  className="w-[35%] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('description')}
                >
                  <div className="flex items-center">
                    Description
                    <SortIcon field="description" />
                  </div>
                </th>
                <th 
                  className="w-[80px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('quantity')}
                >
                  <div className="flex items-center">
                    Qty
                    <SortIcon field="quantity" />
                  </div>
                </th>
                <th className="w-[60px]">Unit</th>
                <th 
                  className="w-[120px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('originalPrice')}
                >
                  <div className="flex items-center justify-end">
                    Original
                    <SortIcon field="originalPrice" />
                  </div>
                </th>
                <th 
                  className="w-[140px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('recommendedPrice')}
                >
                  <div className="flex items-center justify-end">
                    Recommended
                    <SortIcon field="recommendedPrice" />
                  </div>
                </th>
                <th 
                  className="w-[100px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status
                    <SortIcon field="status" />
                  </div>
                </th>
                <th className="w-[100px]">Status</th>
                <th className="w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const variance = getItemVariance(item);
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn('text-xs font-medium', getVarianceColor(variance))}>
                                {variance > 0 ? '+' : ''}{variance.toFixed(0)}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Variance from benchmark: {variance > 0 ? 'over' : 'under'} by {Math.abs(variance).toFixed(1)}%</p>
                            </TooltipContent>
                          </Tooltip>
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => handleEditSave(item.id, e)}
                              >
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save price</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={handleEditCancel}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cancel</TooltipContent>
                          </Tooltip>
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => handleEditStart(item, e)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit price</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.status} showIcon={false} />
                        {item.userClarification && (
                          <Tooltip>
                            <TooltipTrigger>
                              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>Has clarification notes</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        {onDeleteItem && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const success = await onDeleteItem(item.id);
                                  if (success) {
                                    toast.success('Item deleted');
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete item</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {paginatedItems.length === 0 && (
            <EmptyState type="no-results" onClearFilters={clearAllFilters} />
          )}
        </div>

        {/* Pagination */}
        {sortedItems.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={sortedItems.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        )}

        {/* Save Filter Dialog */}
        <SaveFilterDialog
          open={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSave={handleSaveFilter}
        />
      </div>
    </TooltipProvider>
  );
}
