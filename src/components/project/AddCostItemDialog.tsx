import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostItemInput {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  originalPrice?: number;
  trade?: string;
}

interface AddCostItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (items: CostItemInput[]) => Promise<void>;
  trades?: string[];
  isAnalyzing?: boolean;
}

const COMMON_UNITS = [
  'm2', 'm3', 'm', 'lm', 'pcs', 'ks', 'kpl', 'st', 'set', 'kg', 'ton', 'l', 'hr'
];

export function AddCostItemDialog({ 
  open, 
  onOpenChange, 
  onSubmit,
  trades = [],
  isAnalyzing = false
}: AddCostItemDialogProps) {
  const [items, setItems] = useState<CostItemInput[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unit: 'pcs' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addItem = () => {
    setItems([
      ...items,
      { id: crypto.randomUUID(), description: '', quantity: 1, unit: 'pcs' }
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof CostItemInput, value: string | number | undefined) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const validItems = items.filter(item => item.description.trim().length >= 3);
  const canSubmit = validItems.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(validItems);
      // Reset form
      setItems([{ id: crypto.randomUUID(), description: '', quantity: 1, unit: 'pcs' }]);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!isSubmitting) {
      onOpenChange(open);
      if (!open) {
        setItems([{ id: crypto.randomUUID(), description: '', quantity: 1, unit: 'pcs' }]);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Cost Items</DialogTitle>
          <DialogDescription>
            Add new cost items to the project. AI will automatically analyze them and flag items 
            priced more than 10% below or above market benchmarks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {items.map((item, index) => (
            <div 
              key={item.id} 
              className={cn(
                "p-4 border rounded-lg space-y-3",
                item.description.trim().length < 3 && item.description.length > 0 && "border-warning/50"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Item #{index + 1}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(item.id)}
                  disabled={items.length === 1 || isSubmitting}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs">Description *</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder="e.g., Concrete foundation C30/37"
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                  {item.description.length > 0 && item.description.length < 3 && (
                    <p className="text-xs text-warning mt-1">Description must be at least 3 characters</p>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Quantity *</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="mt-1"
                      min={0}
                      step={0.1}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Unit *</Label>
                    <Select
                      value={item.unit}
                      onValueChange={(value) => updateItem(item.id, 'unit', value)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_UNITS.map(unit => (
                          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Unit Price (optional)</Label>
                    <Input
                      type="number"
                      value={item.originalPrice || ''}
                      onChange={(e) => updateItem(item.id, 'originalPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="0.00"
                      className="mt-1"
                      min={0}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Trade (optional)</Label>
                    <Select
                      value={item.trade || ''}
                      onValueChange={(value) => updateItem(item.id, 'trade', value || undefined)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select trade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manual Entry">Manual Entry</SelectItem>
                        {trades.map(trade => (
                          <SelectItem key={trade} value={trade}>{trade}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
          <Button 
            variant="outline" 
            onClick={addItem} 
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Item
          </Button>
          <div className="flex-1" />
          <span className="text-sm text-muted-foreground self-center">
            {validItems.length} of {items.length} items ready
          </span>
          <Button onClick={handleSubmit} disabled={!canSubmit || isAnalyzing}>
            {isSubmitting || isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isAnalyzing ? 'Analyzing...' : 'Adding...'}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add & Analyze
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
