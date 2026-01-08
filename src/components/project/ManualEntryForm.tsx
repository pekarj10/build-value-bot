import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ManualCostItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  originalPrice?: number;
}

interface ManualEntryFormProps {
  onSubmit: (items: ManualCostItem[]) => void;
  isSubmitting?: boolean;
}

const COMMON_UNITS = [
  'm2', 'm3', 'm', 'lm', 'pcs', 'ks', 'kpl', 'st', 'set', 'kg', 'ton', 'l', 'hr'
];

export function ManualEntryForm({ onSubmit, isSubmitting = false }: ManualEntryFormProps) {
  const [items, setItems] = useState<ManualCostItem[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unit: 'pcs' }
  ]);

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

  const updateItem = (id: string, field: keyof ManualCostItem, value: string | number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const validItems = items.filter(item => item.description.trim().length >= 3);
  const canSubmit = validItems.length > 0 && !isSubmitting;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(validItems);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Add cost items manually for AI analysis
        </p>
        <Button variant="outline" size="sm" onClick={addItem} disabled={isSubmitting}>
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {items.map((item, index) => (
          <Card 
            key={item.id} 
            className={cn(
              "p-4 transition-all",
              item.description.trim().length < 3 && item.description.length > 0 && "border-warning/50"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                {index + 1}
              </div>
              
              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder="e.g., Concrete foundation C30/37"
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Qty</Label>
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
                    <Label className="text-xs text-muted-foreground">Unit</Label>
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
                
                <div>
                  <Label className="text-xs text-muted-foreground">Price (optional)</Label>
                  <Input
                    type="number"
                    value={item.originalPrice || ''}
                    onChange={(e) => updateItem(item.id, 'originalPrice', parseFloat(e.target.value) || undefined)}
                    placeholder="Unit price"
                    className="mt-1"
                    min={0}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(item.id)}
                disabled={items.length === 1 || isSubmitting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <p className="text-sm text-muted-foreground">
          {validItems.length} of {items.length} items ready for analysis
        </p>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              Start Analysis
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}