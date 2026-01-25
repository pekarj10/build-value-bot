import { useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Clock, 
  Edit2, 
  AlertCircle, 
  DollarSign, 
  MessageSquare, 
  Plus, 
  Trash2, 
  RotateCcw,
  ChevronDown,
  ChevronUp,
  User,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCostItemMutations, MutationEntry } from '@/hooks/useCostItemMutations';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MutationTimelineProps {
  costItemId: string;
  currency: string;
  onRestore?: () => void;
  isAdmin?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  user_override_price: 'Price Override',
  recommended_unit_price: 'Recommended Price',
  original_description: 'Description',
  quantity: 'Quantity',
  unit: 'Unit',
  user_clarification: 'Clarification',
  interpreted_scope: 'Interpretation',
  ai_comment: 'AI Notes',
  total_price: 'Total Price',
  item: 'Item',
  restore: 'Restoration',
};

const CHANGE_TYPE_ICONS: Record<string, typeof Edit2> = {
  create: Plus,
  update: Edit2,
  status_change: AlertCircle,
  price_override: DollarSign,
  note_added: MessageSquare,
  delete: Trash2,
  restore: RotateCcw,
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  create: 'bg-success/10 text-success border-success/30',
  update: 'bg-primary/10 text-primary border-primary/30',
  status_change: 'bg-warning/10 text-warning border-warning/30',
  price_override: 'bg-accent/10 text-accent-foreground border-accent/30',
  note_added: 'bg-muted text-muted-foreground border-muted-foreground/30',
  delete: 'bg-destructive/10 text-destructive border-destructive/30',
  restore: 'bg-primary/10 text-primary border-primary/30',
};

export function MutationTimeline({ 
  costItemId, 
  currency, 
  onRestore,
  isAdmin = false 
}: MutationTimelineProps) {
  const { getTimeline, restoreToTimestamp, isLoading, error } = useCostItemMutations();
  const [mutations, setMutations] = useState<MutationEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedTimestamp, setSelectedTimestamp] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    loadTimeline();
  }, [costItemId]);

  const loadTimeline = async (pageNum = 1, append = false) => {
    const result = await getTimeline(costItemId, pageNum, 20);
    if (result) {
      setMutations(prev => append ? [...prev, ...result.data] : result.data);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
      setPage(pageNum);
    }
  };

  const handleLoadMore = () => {
    loadTimeline(page + 1, true);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRestoreClick = (timestamp: string) => {
    setSelectedTimestamp(timestamp);
    setRestoreReason('');
    setRestoreDialogOpen(true);
  };

  const handleRestore = async () => {
    if (!selectedTimestamp) return;
    
    setIsRestoring(true);
    const result = await restoreToTimestamp(costItemId, selectedTimestamp, restoreReason);
    setIsRestoring(false);

    if (result) {
      toast.success(`Restored ${result.fields_restored.length} fields`);
      setRestoreDialogOpen(false);
      loadTimeline(); // Refresh timeline
      onRestore?.();
    } else {
      toast.error('Failed to restore');
    }
  };

  const formatValue = (value: string | null, fieldName: string): string => {
    if (value === null || value === 'null' || value === '') return '—';
    
    // Format numeric values
    if (['user_override_price', 'recommended_unit_price', 'total_price', 'quantity'].includes(fieldName)) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return fieldName.includes('price') 
          ? `${num.toLocaleString()} ${currency}`
          : num.toLocaleString();
      }
    }
    
    // Truncate long text
    if (value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    
    return value;
  };

  const getChangeDescription = (mutation: MutationEntry): string => {
    const fieldLabel = FIELD_LABELS[mutation.field_name] || mutation.field_name;
    
    switch (mutation.change_type) {
      case 'create':
        return 'Item created';
      case 'delete':
        return 'Item deleted';
      case 'restore':
        return `Restored to ${format(new Date(mutation.new_value || ''), 'PPp')}`;
      case 'status_change':
        return `${fieldLabel}: ${mutation.old_value || '—'} → ${mutation.new_value || '—'}`;
      case 'price_override':
        return `${fieldLabel} set to ${formatValue(mutation.new_value, mutation.field_name)}`;
      default:
        return `${fieldLabel} updated`;
    }
  };

  if (isLoading && mutations.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertCircle className="h-6 w-6 mb-2" />
        <p>Failed to load history</p>
      </div>
    );
  }

  if (mutations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-6 w-6 mb-2" />
        <p>No changes recorded yet</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} change{total !== 1 ? 's' : ''} recorded
          </p>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />
            
            <div className="space-y-4">
              {mutations.map((mutation, index) => {
                const Icon = CHANGE_TYPE_ICONS[mutation.change_type] || Edit2;
                const colorClasses = CHANGE_TYPE_COLORS[mutation.change_type] || CHANGE_TYPE_COLORS.update;
                const isExpanded = expandedIds.has(mutation.id);
                const timestamp = new Date(mutation.timestamp);
                const isFirst = index === 0;
                
                return (
                  <div key={mutation.id} className="relative pl-10">
                    {/* Timeline dot */}
                    <div className={cn(
                      "absolute left-0 top-0 w-8 h-8 rounded-full border-2 flex items-center justify-center bg-card",
                      colorClasses
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className={cn(
                      "rounded-lg border p-3 transition-all",
                      isFirst && "ring-2 ring-primary/20"
                    )}>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">
                            {getChangeDescription(mutation)}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {formatDistanceToNow(timestamp, { addSuffix: true })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {format(timestamp, 'PPpp')}
                              </TooltipContent>
                            </Tooltip>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {mutation.user_name || 'System'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {isAdmin && mutation.change_type !== 'create' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleRestoreClick(mutation.timestamp)}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Restore to this point</TooltipContent>
                            </Tooltip>
                          )}
                          
                          {(mutation.old_value || mutation.new_value || mutation.reason) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpanded(mutation.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          {mutation.change_type !== 'create' && mutation.change_type !== 'delete' && (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Before</p>
                                <p className="font-mono text-xs bg-muted/50 rounded px-2 py-1 break-all">
                                  {formatValue(mutation.old_value, mutation.field_name)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">After</p>
                                <p className="font-mono text-xs bg-primary/5 rounded px-2 py-1 break-all">
                                  {formatValue(mutation.new_value, mutation.field_name)}
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {mutation.reason && (
                            <div className="text-sm">
                              <p className="text-xs text-muted-foreground mb-1">Reason</p>
                              <p className="text-sm italic">"{mutation.reason}"</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLoadMore}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          )}
        </ScrollArea>

        {/* Restore Dialog */}
        <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restore to Previous State</DialogTitle>
              <DialogDescription>
                This will revert all changes made after{' '}
                {selectedTimestamp && format(new Date(selectedTimestamp), 'PPpp')}.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="restore-reason">Reason for restoration</Label>
                <Textarea
                  id="restore-reason"
                  value={restoreReason}
                  onChange={(e) => setRestoreReason(e.target.value)}
                  placeholder="Why are you restoring to this version?"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {restoreReason.length}/500
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setRestoreDialogOpen(false)}
                disabled={isRestoring}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleRestore}
                disabled={isRestoring || !restoreReason.trim()}
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
