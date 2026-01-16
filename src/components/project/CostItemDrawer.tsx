import { useState, useEffect } from 'react';
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
import { Check, MessageSquare, TrendingUp, Loader2, HelpCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  sanitizeAnalysisNoteForUser, 
  getPriceRangeLabel,
  getUserFriendlyScope 
} from '@/lib/roleUtils';
import { useViewMode } from '@/hooks/useViewMode';

interface CostItemDrawerProps {
  item: CostItem | null;
  currency: string;
  open: boolean;
  onClose: () => void;
  onAccept: (itemId: string) => void;
  onOverride: (itemId: string, price: number) => void;
  onClarify: (itemId: string, text: string) => void;
  onResetPrice?: (itemId: string) => void;
  isProcessingClarification?: boolean;
  isAdmin?: boolean;
  projectCountry?: string;
}

export function CostItemDrawer({
  item,
  currency,
  open,
  onClose,
  onAccept,
  onOverride,
  onClarify,
  onResetPrice,
  isProcessingClarification = false,
  isAdmin = false,
  projectCountry = '',
}: CostItemDrawerProps) {
  const { showAsAdmin } = useViewMode();
  // Use viewMode-aware admin check: actual admin AND not in user preview mode
  const effectiveIsAdmin = isAdmin && showAsAdmin;
  
  const [overridePrice, setOverridePrice] = useState('');
  const [clarification, setClarification] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [showClarify, setShowClarify] = useState(false);

  // Reset state when item changes
  useEffect(() => {
    if (item) {
      setOverridePrice('');
      setClarification('');
      setShowOverride(false);
      setShowClarify(false);
    }
  }, [item?.id]);

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
      // Don't close - let the parent handle closing after processing
    }
  };

  // FIX: Use the actual displayed price (override or recommended) for slider position
  // Also handle cases where price is outside the benchmark range
  const getBenchmarkPosition = () => {
    if (item.benchmarkMax === item.benchmarkMin) return 50;
    // Use the current effective price (override takes precedence)
    const price = item.userOverridePrice || item.originalUnitPrice || item.recommendedUnitPrice;
    if (!price) return 50;
    
    const range = item.benchmarkMax - item.benchmarkMin;
    const position = ((price - item.benchmarkMin) / range) * 100;
    
    // Allow position to go beyond 0-100% to show prices outside range
    // But cap at -10% and 110% for visual purposes
    return Math.max(-10, Math.min(110, position));
  };

  // Determine if price is outside the benchmark range
  const isOutsideRange = () => {
    const price = item.userOverridePrice || item.originalUnitPrice || item.recommendedUnitPrice;
    if (!price || !item.benchmarkMax) return false;
    return price < item.benchmarkMin || price > item.benchmarkMax;
  };

  // Get sanitized content for regular users (respects view mode)
  const displayAnalysisNote = effectiveIsAdmin 
    ? (item.aiComment || 'No analysis notes available.')
    : sanitizeAnalysisNoteForUser(item.aiComment, item.matchConfidence, projectCountry, currency);

  const displayInterpretedScope = getUserFriendlyScope(
    item.originalDescription,
    item.interpretedScope,
    effectiveIsAdmin
  );

  const needsClarification = item.status === 'clarification';
  const hasOverride = item.userOverridePrice !== undefined && item.userOverridePrice !== null;

  const handleResetPrice = () => {
    if (onResetPrice && item) {
      onResetPrice(item.id);
      onClose();
    }
  };
  const hasClarificationQuestion = item.clarificationQuestion && item.clarificationQuestion.trim().length > 0;

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
          {/* Clarification Question - shown prominently if present */}
          {needsClarification && hasClarificationQuestion && !item.userClarification && (
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <HelpCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warning-foreground">Clarification Needed</p>
                  <p className="text-sm mt-1">{item.clarificationQuestion}</p>
                </div>
              </div>
              
              <div className="pt-2">
                <Textarea
                  value={clarification}
                  onChange={(e) => setClarification(e.target.value)}
                  placeholder="Provide additional details..."
                  rows={3}
                  disabled={isProcessingClarification}
                />
                <Button 
                  onClick={handleClarify} 
                  className="w-full mt-2"
                  disabled={!clarification.trim() || isProcessingClarification}
                >
                  {isProcessingClarification ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Re-analyzing...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Submit Clarification
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* AI Interpretation - Only show to admins or if content is safe for users */}
          {displayInterpretedScope && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {effectiveIsAdmin ? 'AI Interpretation' : 'Item Summary'}
              </Label>
              <div className="p-4 bg-muted/50 rounded-lg text-sm">
                {displayInterpretedScope}
              </div>
            </div>
          )}

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
              <div className={cn(
                "p-4 border rounded-lg",
                item.userOverridePrice 
                  ? "border-warning/30 bg-warning/5" 
                  : "border-primary/30 bg-primary/5"
              )}>
                <p className="text-xs text-muted-foreground mb-1">
                  {item.userOverridePrice ? 'Your Price' : 'Recommended'}
                </p>
                <p className={cn(
                  "font-mono text-xl font-semibold",
                  item.userOverridePrice ? "text-warning" : "text-primary"
                )}>
                  {formatPrice(item.userOverridePrice || item.recommendedUnitPrice)} {currency}
                </p>
              </div>
            </div>

            {/* Market Price Range - use role-appropriate labeling */}
            {item.benchmarkMax > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {getPriceRangeLabel(effectiveIsAdmin)}
                </Label>
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
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-card shadow-sm transition-all",
                      isOutsideRange() 
                        ? "bg-destructive" 
                        : item.userOverridePrice 
                          ? "bg-warning" 
                          : "bg-primary"
                    )}
                    style={{ 
                      left: `${Math.max(0, Math.min(100, getBenchmarkPosition()))}%`, 
                      marginLeft: '-6px' 
                    }}
                  />
                </div>
                {isOutsideRange() && (
                  <p className="text-xs text-destructive">
                    ⚠ Price is outside the typical market range
                  </p>
                )}
              </div>
            )}

            {/* Total */}
            <div className="p-4 bg-muted/30 rounded-lg flex justify-between items-center">
              <span className="text-muted-foreground">Total Value</span>
              <span className="font-mono text-lg font-semibold">
                {formatPrice(item.totalPrice)} {currency}
              </span>
            </div>
          </div>

          <Separator />

          {/* Analysis Note - sanitized for regular users */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Analysis Note</Label>
            <div className="p-4 bg-muted/50 rounded-lg text-sm flex items-start gap-3">
              <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p>{displayAnalysisNote}</p>
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
                {/* Reset to Recommended - only show when price is overridden */}
                {hasOverride && onResetPrice && (
                  <Button
                    variant="outline"
                    onClick={handleResetPrice}
                    className="w-full justify-start text-primary hover:text-primary"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Recommended ({formatPrice(item.recommendedUnitPrice)} {currency})
                  </Button>
                )}
                {needsClarification && !hasClarificationQuestion && (
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
                    disabled={isProcessingClarification || !clarification.trim()}
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
