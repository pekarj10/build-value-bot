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
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import { MultiSelect } from './MultiSelect';
import { QuickFilterChips } from './QuickFilterChips';
import { TablePagination } from './TablePagination';
import { SaveFilterDialog } from './SaveFilterDialog';
import { EmptyState } from './EmptyState';
import { CostItemCard } from './CostItemCard';
import { useSavedFilters, FilterState } from '@/hooks/useSavedFilters';
import { useAuth } from '@/hooks/useAuth';
import { useViewMode } from '@/hooks/useViewMode';

interface CostItemsTableProps {
  items: CostItem[];
  currency: string;
  onItemSelect: (item: CostItem) => void;
  onPriceUpdate?: (itemId: string, price: number) => void;
  onResetPrice?: (itemId: string) => void;
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

type SortField = 'description' | 'quantity' | 'originalPrice' | 'recommendedPrice' | 'originalTotal' | 'recommendedTotal' | 'variance' | 'trade' | 'status';
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
  onResetPrice,
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
  const { isAdmin } = useAuth();
  const { showAsAdmin } = useViewMode();
  // Effective admin check: actual admin AND not in user preview mode
  const effectiveIsAdmin = isAdmin && showAsAdmin;
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

  // Single-item re-analysis UI state
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  
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
  // Helper to calculate totals
  const getOriginalTotal = (item: CostItem) => {
    if (!item.originalUnitPrice) return null;
    return item.originalUnitPrice * item.quantity;
  };

  const getRecommendedTotal = (item: CostItem) => {
    const price = item.userOverridePrice || item.recommendedUnitPrice;
    if (!price) return null;
    return price * item.quantity;
  };

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
        case 'originalTotal':
          comparison = (getOriginalTotal(a) || 0) - (getOriginalTotal(b) || 0);
          break;
        case 'recommendedTotal':
          comparison = (getRecommendedTotal(a) || 0) - (getRecommendedTotal(b) || 0);
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

  const handleReanalyzeSingle = async (itemId: string) => {
    if (!onReanalyzeItems) return;
    try {
      setReanalyzingId(itemId);
      await onReanalyzeItems([itemId]);
    } finally {
      setReanalyzingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!onDeleteItem || selectedIds.size === 0) return;
    
    const idsToDelete = Array.from(selectedIds);
    let deletedCount = 0;
    
    for (const id of idsToDelete) {
      const success = await onDeleteItem(id);
      if (success) deletedCount++;
    }
    
    setSelectedIds(new Set());
    
    if (deletedCount === idsToDelete.length) {
      toast.success(`${deletedCount} item(s) deleted`);
    } else {
      toast.warning(`${deletedCount} of ${idsToDelete.length} items deleted`);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Search - full width on mobile */}
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder='Search items...'
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 h-11 sm:h-10"
            />
          </div>
          
          {/* Filters - horizontally scrollable on mobile */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0 hidden sm:block" />
            
            {/* Status Multi-Select */}
            <MultiSelect
              options={STATUS_OPTIONS}
              selected={statusFilters}
              onChange={(values) => {
                setStatusFilters(values);
                setCurrentPage(1);
              }}
              placeholder="Status"
              className="w-[120px] sm:w-[140px] flex-shrink-0"
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
              className="w-[130px] sm:w-[160px] flex-shrink-0"
            />

            {/* Variance Range - hide on smallest screens */}
            <div className="hidden sm:block">
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
          </div>

          {/* Price Range - desktop only */}
          <div className="hidden lg:flex items-center gap-2">
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
              {onDeleteItem && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete selected items</TooltipContent>
                </Tooltip>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear Selection
              </Button>
            </div>
          </div>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {paginatedItems.map((item) => (
            <CostItemCard
              key={item.id}
              item={item}
              currency={currency}
              onSelect={onItemSelect}
              onResetPrice={onResetPrice}
              formatPrice={formatPrice}
            />
          ))}
          {paginatedItems.length === 0 && (
            <EmptyState type="no-results" onClearFilters={clearAllFilters} />
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block border rounded-lg overflow-x-auto bg-card">
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
                  className="min-w-[250px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('description')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        Description
                        <SortIcon field="description" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Item description from uploaded file</TooltipContent>
                  </Tooltip>
                </th>
                <th 
                  className="w-[70px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('quantity')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        Qty
                        <SortIcon field="quantity" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Quantity of units</TooltipContent>
                  </Tooltip>
                </th>
                <th className="w-[50px]">
                  <Tooltip>
                    <TooltipTrigger>Unit</TooltipTrigger>
                    <TooltipContent>Unit of measurement</TooltipContent>
                  </Tooltip>
                </th>
                <th 
                  className="w-[100px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('originalPrice')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Orig. Price
                        <SortIcon field="originalPrice" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Original unit price from uploaded file</TooltipContent>
                  </Tooltip>
                </th>
                <th 
                  className="w-[110px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('originalTotal')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Orig. Total
                        <SortIcon field="originalTotal" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Qty × Original Price</TooltipContent>
                  </Tooltip>
                </th>
                <th 
                  className="w-[100px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('recommendedPrice')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Rec. Price
                        <SortIcon field="recommendedPrice" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>AI recommended unit price based on benchmarks</TooltipContent>
                  </Tooltip>
                </th>
                <th 
                  className="w-[110px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('recommendedTotal')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Rec. Total
                        <SortIcon field="recommendedTotal" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Qty × Recommended Price</TooltipContent>
                  </Tooltip>
                </th>
                <th 
                  className="w-[90px] cursor-pointer hover:bg-muted/70"
                  onClick={() => handleSort('status')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        Status
                        <SortIcon field="status" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Item review status</TooltipContent>
                  </Tooltip>
                </th>
                <th className="w-[84px]"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const variance = getItemVariance(item);
                const isEditing = editingId === item.id;
                const hasOverride = item.userOverridePrice !== undefined;
                const displayPrice = item.userOverridePrice || item.recommendedUnitPrice;
                const isSelected = selectedIds.has(item.id);
                const isRowReanalyzing = reanalyzingId === item.id;
                
                return (
                  <tr
                    key={item.id}
                    onClick={() => !isEditing && onItemSelect(item)}
                    className={cn(
                      "cursor-pointer group", 
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
                    <td className="font-mono text-sm text-right">{item.quantity.toLocaleString()}</td>
                    <td className="text-muted-foreground text-xs">{item.unit}</td>
                    <td className="text-right font-mono text-sm">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{item.originalUnitPrice ? formatPrice(item.originalUnitPrice) : '—'}</span>
                        {variance !== null && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn('text-[10px] font-semibold px-1 py-0.5 rounded', 
                                Math.abs(variance) <= 10 && 'bg-success/10 text-success',
                                Math.abs(variance) > 10 && Math.abs(variance) <= 25 && 'bg-warning/10 text-warning',
                                Math.abs(variance) > 25 && 'bg-destructive/10 text-destructive'
                              )}>
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
                    <td className="text-right font-mono text-sm">
                      <span className={cn(!getOriginalTotal(item) && "text-muted-foreground")}>
                        {getOriginalTotal(item) ? formatPrice(getOriginalTotal(item)!) : '—'}
                      </span>
                    </td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            className="w-20 h-7 text-right font-mono text-sm"
                            autoFocus
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleEditSave(item.id, e)}
                              >
                                <Check className="h-3.5 w-3.5 text-success" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save price</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={handleEditCancel}
                              >
                                <X className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cancel</TooltipContent>
                          </Tooltip>
                        </div>
                      ) : (
                        <div className="relative flex items-center justify-end group">
                          {/* Single action icon - reset takes priority over edit when override exists */}
                          <div className="absolute right-full mr-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {hasOverride && onResetPrice && (item.recommendedUnitPrice || item.originalUnitPrice) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 text-primary hover:text-primary hover:bg-primary/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      onResetPrice(item.id);
                                    }}
                                  >
                                    <RotateCcw className="h-2.5 w-2.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Reset to {item.recommendedUnitPrice ? 'recommended' : 'original'} ({formatPrice(item.recommendedUnitPrice ?? item.originalUnitPrice)} {currency})
                                </TooltipContent>
                              </Tooltip>
                            ) : onPriceUpdate && displayPrice ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 hover:bg-muted"
                                    onClick={(e) => handleEditStart(item, e)}
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit price</TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                          {/* Price value - always in same position */}
                          {effectiveIsAdmin && item.priceSource ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={cn(
                                  "font-mono text-sm font-medium cursor-help",
                                  hasOverride && "text-warning"
                                )}>
                                  {displayPrice ? formatPrice(displayPrice) : '—'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {effectiveIsAdmin ? (
                                  <>
                                    <p className="text-xs font-medium">{item.priceSource}</p>
                                    {item.matchConfidence && (
                                      <p className="text-xs text-muted-foreground">
                                        Match confidence: {item.matchConfidence}%
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs">Based on market data analysis</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className={cn(
                              "font-mono text-sm font-medium",
                              hasOverride && "text-warning",
                              !displayPrice && "text-muted-foreground"
                            )}>
                              {displayPrice ? formatPrice(displayPrice) : '—'}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono text-sm font-medium">
                      <span className={cn(
                        getRecommendedTotal(item) ? "text-primary" : "text-muted-foreground"
                      )}>
                        {getRecommendedTotal(item) ? formatPrice(getRecommendedTotal(item)!) : '—'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={item.status} showIcon={false} />
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        {onReanalyzeItems && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-6 px-2 w-auto gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                                  item.status === 'clarification' && "opacity-100",
                                )}
                                disabled={isReanalyzing || isRowReanalyzing}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReanalyzeSingle(item.id);
                                }}
                              >
                                <RotateCcw className={cn(
                                  "h-4 w-4",
                                  item.status === 'clarification' ? "text-warning" : "text-muted-foreground",
                                  (isReanalyzing || isRowReanalyzing) && "animate-spin"
                                )} />
                                {isRowReanalyzing && (
                                  <span className="text-xs text-muted-foreground">Analyzing…</span>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Re-analyze this item</TooltipContent>
                          </Tooltip>
                        )}
                        {item.userClarification && (
                          <Tooltip>
                            <TooltipTrigger>
                              <MessageSquare className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>Has clarification notes</TooltipContent>
                          </Tooltip>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        {onDeleteItem && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const success = await onDeleteItem(item.id);
                                  if (success) {
                                    toast.success('Item deleted');
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
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
