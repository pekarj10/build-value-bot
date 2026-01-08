import { useState } from 'react';
import { CostItem } from '@/types/project';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Check, X, MessageSquare, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostItemDrawerProps {
  item: CostItem | null;
  currency: string;
  open: boolean;
  onClose: () => void;
  onAccept: (itemId: string) => void;
  onOverride: (itemId: string, price: number) => void;
  onClarify: (itemId: string, text: string) => void;
  isProcessingClarification?: boolean;
}

export function CostItemDrawer({
  item,
  currency,
  open,
  onClose,
  onAccept,
  onOverride,
  onClarify,
  isProcessingClarification = false,
}: CostItemDrawerProps) {
  const [overridePrice, setOverridePrice] = useState('');
  const [clarification, setClarification] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [showClarify, setShowClarify] = useState(false);

  if (!item) return null;

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleAccept = () => {
    onAccept(item.id);
    onClose();
  };

  const handleOverride = () => {
    const price = parseFloat(overridePrice);
    if (!isNaN(price)) {
      onOverride(item.id, price);
      setOverridePrice('');
      setShowOverride(false);
      onClose();
    }
  };

  const handleClarify = () => {
    if (clarification.trim()) {
      onClarify(item.id, clarification);
      setClarification('');
      setShowClarify(false);
      onClose();
    }
  };

  const getBenchmarkPosition = () => {
    const price = item.originalUnitPrice || item.recommendedUnitPrice;
    const range = item.benchmarkMax - item.benchmarkMin;
    const position = ((price - item.benchmarkMin) / range) * 100;
    return Math.max(0, Math.min(100, position));
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <SheetTitle className="text-left leading-normal">
              {item.originalDescription}
            </SheetTitle>
            <StatusBadge status={item.status} size="md" />
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* AI Interpretation */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">AI Interpretation</Label>
            <div className="p-4 bg-muted/50 rounded-lg text-sm">
              {item.interpretedScope}
            </div>
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Quantity</Label>
              <p className="font-mono text-lg mt-1">{formatPrice(item.quantity)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Unit</Label>
              <p className="text-lg mt-1">{item.unit}</p>
            </div>
          </div>

          <Separator />

          {/* Price Comparison */}
          <div className="space-y-4">
            <Label className="text-muted-foreground">Unit Price Analysis</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Original</p>
                <p className="font-mono text-xl font-semibold">
                  {item.originalUnitPrice ? `${formatPrice(item.originalUnitPrice)} ${currency}` : '—'}
                </p>
              </div>
              <div className="p-4 border rounded-lg border-primary/30 bg-primary/5">
                <p className="text-xs text-muted-foreground mb-1">Recommended</p>
                <p className="font-mono text-xl font-semibold text-primary">
                  {formatPrice(item.recommendedUnitPrice)} {currency}
                </p>
              </div>
            </div>

            {/* Benchmark Range */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Min: {formatPrice(item.benchmarkMin)}</span>
                <span>Typical: {formatPrice(item.benchmarkTypical)}</span>
                <span>Max: {formatPrice(item.benchmarkMax)}</span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 bg-gradient-to-r from-success via-warning to-destructive opacity-30"
                  style={{ left: '0%', right: '0%' }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full border-2 border-card shadow-sm"
                  style={{ left: `${getBenchmarkPosition()}%`, marginLeft: '-6px' }}
                />
              </div>
            </div>

            {/* Total */}
            <div className="p-4 bg-muted/30 rounded-lg flex justify-between items-center">
              <span className="text-muted-foreground">Total Value</span>
              <span className="font-mono text-lg font-semibold">
                {formatPrice(item.totalPrice)} {currency}
              </span>
            </div>
          </div>

          <Separator />

          {/* AI Comment */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Analysis Note</Label>
            <div className="p-4 bg-muted/50 rounded-lg text-sm flex items-start gap-3">
              <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p>{item.aiComment}</p>
            </div>
          </div>

          {/* User Clarification (if exists) */}
          {item.userClarification && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Your Clarification</Label>
              <div className="p-4 border rounded-lg text-sm bg-primary/5">
                {item.userClarification}
              </div>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="space-y-4">
            <Label>Actions</Label>
            
            {!showOverride && !showClarify && (
              <div className="flex flex-col gap-2">
                <Button onClick={handleAccept} className="w-full justify-start">
                  <Check className="h-4 w-4 mr-2" />
                  Accept Recommendation
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowOverride(true)}
                  className="w-full justify-start"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Override Price
                </Button>
                {item.status === 'clarification' && (
                  <Button
                    variant="outline"
                    onClick={() => setShowClarify(true)}
                    className="w-full justify-start"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Provide Clarification
                  </Button>
                )}
              </div>
            )}

            {showOverride && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="override-price">New Unit Price ({currency})</Label>
                  <Input
                    id="override-price"
                    type="number"
                    value={overridePrice}
                    onChange={(e) => setOverridePrice(e.target.value)}
                    placeholder="Enter price"
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleOverride} className="flex-1">
                    Confirm
                  </Button>
                  <Button variant="outline" onClick={() => setShowOverride(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {showClarify && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="clarification">Clarification</Label>
                  <Textarea
                    id="clarification"
                    value={clarification}
                    onChange={(e) => setClarification(e.target.value)}
                    placeholder="Provide additional context about this item..."
                    rows={4}
                    className="mt-1"
                    disabled={isProcessingClarification}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleClarify} 
                    className="flex-1"
                    disabled={isProcessingClarification}
                  >
                    {isProcessingClarification && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {isProcessingClarification ? 'Processing...' : 'Submit'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowClarify(false)}
                    disabled={isProcessingClarification}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
