import { useState, useEffect, useCallback, useRef } from 'react';
import { CostItem } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/progress';
import {
  Check,
  Pencil,
  SkipForward,
  X,
  Keyboard,
  Trophy,
  ArrowRight,
  Target,
  Zap,
  AlertTriangle,
  HelpCircle,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import confetti from 'canvas-confetti';

interface FocusReviewModeProps {
  items: CostItem[];
  currency: string;
  onAccept: (itemId: string) => Promise<void>;
  onOverride: (itemId: string, price: number) => Promise<void>;
  onClose: () => void;
}

export function FocusReviewMode({
  items,
  currency,
  onAccept,
  onOverride,
  onClose,
}: FocusReviewModeProps) {
  const reviewItems = items.filter(
    (i) => i.status === 'review' || i.status === 'clarification'
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const totalToReview = reviewItems.length;
  const reviewedCount = reviewedIds.size;
  const isComplete = reviewedCount >= totalToReview;
  const currentItem = reviewItems[currentIndex] ?? null;

  const formatPrice = (v: number) => formatCurrency(v, currency);

  const getVariance = (item: CostItem) => {
    if (!item.originalUnitPrice || !item.benchmarkTypical) return null;
    return ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100;
  };

  const goToNextUnreviewed = useCallback(() => {
    for (let offset = 1; offset <= reviewItems.length; offset++) {
      const idx = (currentIndex + offset) % reviewItems.length;
      if (!reviewedIds.has(reviewItems[idx].id)) {
        setCurrentIndex(idx);
        setIsEditing(false);
        return;
      }
    }
  }, [currentIndex, reviewItems, reviewedIds]);

  const handleAccept = useCallback(async () => {
    if (!currentItem || isProcessing) return;
    setIsProcessing(true);
    try {
      await onAccept(currentItem.id);
      setReviewedIds((prev) => new Set(prev).add(currentItem.id));
      setTimeout(goToNextUnreviewed, 300);
    } finally {
      setIsProcessing(false);
    }
  }, [currentItem, isProcessing, onAccept, goToNextUnreviewed]);

  const handleOverrideSave = useCallback(async () => {
    if (!currentItem || isProcessing) return;
    const price = parseFloat(editPrice);
    if (isNaN(price) || price <= 0) return;
    setIsProcessing(true);
    try {
      await onOverride(currentItem.id, price);
      setReviewedIds((prev) => new Set(prev).add(currentItem.id));
      setIsEditing(false);
      setTimeout(goToNextUnreviewed, 300);
    } finally {
      setIsProcessing(false);
    }
  }, [currentItem, isProcessing, editPrice, onOverride, goToNextUnreviewed]);

  const handleSkip = useCallback(() => {
    if (isProcessing) return;
    goToNextUnreviewed();
  }, [isProcessing, goToNextUnreviewed]);

  const handleStartEdit = useCallback(() => {
    if (!currentItem) return;
    setEditPrice(
      (currentItem.userOverridePrice || currentItem.recommendedUnitPrice || '').toString()
    );
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 50);
  }, [currentItem]);

  // Keyboard shortcuts
  useEffect(() => {
    if (isComplete) return;

    const handler = (e: KeyboardEvent) => {
      // Don't capture when editing
      if (isEditing) {
        if (e.key === 'Escape') {
          setIsEditing(false);
        }
        if (e.key === 'Enter') {
          handleOverrideSave();
        }
        return;
      }

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          handleAccept();
          break;
        case 'e':
          e.preventDefault();
          handleStartEdit();
          break;
        case ' ':
          e.preventDefault();
          handleSkip();
          break;
        case 'escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isComplete, isEditing, handleAccept, handleStartEdit, handleSkip, handleOverrideSave, onClose]);

  // Fire confetti on completion
  useEffect(() => {
    if (isComplete && totalToReview > 0) {
      const duration = 2000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors: ['#22c55e', '#3b82f6', '#f59e0b'],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors: ['#22c55e', '#3b82f6', '#f59e0b'],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [isComplete, totalToReview]);

  const progressPercent = totalToReview > 0 ? (reviewedCount / totalToReview) * 100 : 0;

  // ─── Completion screen ───
  if (isComplete && totalToReview > 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center animate-in fade-in-0 duration-500">
        <div className="text-center space-y-6 max-w-md">
          <div className="mx-auto w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
            <Trophy className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">All Done!</h1>
          <p className="text-muted-foreground text-lg">
            You reviewed <span className="font-semibold text-foreground">{totalToReview}</span> items.
            All cost items have been processed.
          </p>
          <Button size="lg" onClick={onClose} className="mt-4">
            <ArrowRight className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </div>
      </div>
    );
  }

  // ─── No items to review ───
  if (totalToReview === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <Check className="h-12 w-12 text-success mx-auto" />
          <h2 className="text-2xl font-bold">Nothing to Review</h2>
          <p className="text-muted-foreground">All cost items are already resolved.</p>
          <Button onClick={onClose}>Back to Project</Button>
        </div>
      </div>
    );
  }

  const variance = currentItem ? getVariance(currentItem) : null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top Bar */}
      <div className="border-b bg-card px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Exit Review
        </Button>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Reviewing item {currentIndex + 1} of {totalToReview}
            </span>
            <span className="text-muted-foreground">
              {reviewedCount} reviewed · {totalToReview - reviewedCount} remaining
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
          <Keyboard className="h-3 w-3" />
          <kbd className="font-mono font-semibold">A</kbd> Accept
          <span className="mx-1">·</span>
          <kbd className="font-mono font-semibold">E</kbd> Edit
          <span className="mx-1">·</span>
          <kbd className="font-mono font-semibold">Space</kbd> Skip
          <span className="mx-1">·</span>
          <kbd className="font-mono font-semibold">Esc</kbd> Exit
        </div>
      </div>

      {/* Main Content */}
      {currentItem && (
        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT: Original Item */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Target className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Original Item</h2>
                <StatusBadge status={currentItem.status} />
              </div>

              <Card className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                  <p className="text-base font-medium">{currentItem.originalDescription}</p>
                </div>

                {currentItem.interpretedScope && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">AI Interpreted Scope</p>
                    <p className="text-sm text-muted-foreground">{currentItem.interpretedScope}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Quantity</p>
                    <p className="text-lg font-mono font-semibold">{currentItem.quantity.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Unit</p>
                    <p className="text-lg font-mono">{currentItem.unit}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Original Price</p>
                    <p className="text-lg font-mono font-semibold">
                      {currentItem.originalUnitPrice
                        ? `${formatPrice(currentItem.originalUnitPrice)} ${currency}`
                        : '—'}
                    </p>
                  </div>
                </div>

                {currentItem.trade && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{currentItem.trade}</Badge>
                    {currentItem.sheetName && (
                      <Badge variant="secondary">{currentItem.sheetName}</Badge>
                    )}
                  </div>
                )}
              </Card>

              {/* AI Comment / Reasoning */}
              {(currentItem.aiComment || currentItem.matchReasoning) && (
                <Card className="p-6 space-y-3 border-primary/20 bg-primary/[0.02]">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">AI Reasoning</h3>
                  </div>
                  {currentItem.matchReasoning && (
                    <p className="text-sm text-muted-foreground">{currentItem.matchReasoning}</p>
                  )}
                  {currentItem.aiComment && currentItem.aiComment !== currentItem.matchReasoning && (
                    <p className="text-sm text-muted-foreground">{currentItem.aiComment}</p>
                  )}
                  {currentItem.clarificationQuestion && (
                    <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-md mt-2">
                      <HelpCircle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-warning">{currentItem.clarificationQuestion}</p>
                    </div>
                  )}
                </Card>
              )}
            </div>

            {/* RIGHT: AI Match / Benchmark */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-success" />
                </div>
                <h2 className="text-lg font-semibold">AI Recommendation</h2>
                {currentItem.matchConfidence != null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      currentItem.matchConfidence >= 80 && 'border-success/50 text-success',
                      currentItem.matchConfidence >= 50 && currentItem.matchConfidence < 80 && 'border-warning/50 text-warning',
                      currentItem.matchConfidence < 50 && 'border-destructive/50 text-destructive'
                    )}
                  >
                    {currentItem.matchConfidence}% confidence
                  </Badge>
                )}
              </div>

              <Card className={cn(
                "p-6 space-y-5 border-2",
                currentItem.matchConfidence != null && currentItem.matchConfidence >= 80 && "border-success/30",
                currentItem.matchConfidence != null && currentItem.matchConfidence >= 50 && currentItem.matchConfidence < 80 && "border-warning/30",
                currentItem.matchConfidence != null && currentItem.matchConfidence < 50 && "border-destructive/30",
                currentItem.matchConfidence == null && "border-border"
              )}>
                {/* Recommended Price */}
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Recommended Unit Price</p>
                  <p className="text-4xl font-mono font-bold text-primary">
                    {currentItem.recommendedUnitPrice
                      ? `${formatPrice(currentItem.recommendedUnitPrice)}`
                      : '—'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{currency} / {currentItem.unit}</p>
                </div>

                {/* Benchmark Range */}
                {(currentItem.benchmarkMin != null || currentItem.benchmarkMax != null) && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Benchmark Range</p>
                    <div className="flex items-center justify-between font-mono text-sm">
                      <span className="text-muted-foreground">
                        {currentItem.benchmarkMin != null ? formatPrice(currentItem.benchmarkMin) : '—'}
                      </span>
                      <div className="flex-1 mx-4 h-2 bg-muted rounded-full relative overflow-hidden">
                        <div
                          className="absolute inset-y-0 bg-primary/30 rounded-full"
                          style={{
                            left: '10%',
                            right: '10%',
                          }}
                        />
                        {currentItem.benchmarkTypical != null && currentItem.benchmarkMin != null && currentItem.benchmarkMax != null && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full border-2 border-background"
                            style={{
                              left: `${Math.min(90, Math.max(10, ((currentItem.benchmarkTypical - currentItem.benchmarkMin) / (currentItem.benchmarkMax - currentItem.benchmarkMin)) * 80 + 10))}%`,
                            }}
                          />
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {currentItem.benchmarkMax != null ? formatPrice(currentItem.benchmarkMax) : '—'}
                      </span>
                    </div>
                    {currentItem.benchmarkTypical != null && (
                      <p className="text-center text-xs text-muted-foreground">
                        Typical: {formatPrice(currentItem.benchmarkTypical)} {currency}
                      </p>
                    )}
                  </div>
                )}

                {/* Variance */}
                {variance !== null && (
                  <div className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-lg",
                    Math.abs(variance) <= 10 && "bg-success/10",
                    Math.abs(variance) > 10 && Math.abs(variance) <= 25 && "bg-warning/10",
                    Math.abs(variance) > 25 && "bg-destructive/10"
                  )}>
                    <AlertTriangle className={cn(
                      "h-4 w-4",
                      Math.abs(variance) <= 10 && "text-success",
                      Math.abs(variance) > 10 && Math.abs(variance) <= 25 && "text-warning",
                      Math.abs(variance) > 25 && "text-destructive"
                    )} />
                    <span className={cn(
                      "font-semibold",
                      Math.abs(variance) <= 10 && "text-success",
                      Math.abs(variance) > 10 && Math.abs(variance) <= 25 && "text-warning",
                      Math.abs(variance) > 25 && "text-destructive"
                    )}>
                      {variance > 0 ? '+' : ''}{variance.toFixed(1)}% variance
                    </span>
                  </div>
                )}

                {/* Price source */}
                {currentItem.priceSource && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Source</p>
                    <p className="text-sm">{currentItem.priceSource}</p>
                  </div>
                )}

                {/* Projected Total */}
                {currentItem.recommendedUnitPrice != null && (
                  <div className="pt-3 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Projected Total</span>
                      <span className="text-lg font-mono font-semibold text-primary">
                        {formatPrice(currentItem.recommendedUnitPrice * currentItem.quantity)} {currency}
                      </span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Action Buttons */}
              <div className="space-y-3">
                {isEditing ? (
                  <Card className="p-4 space-y-3">
                    <p className="text-sm font-medium">Override Unit Price ({currency})</p>
                    <div className="flex gap-2">
                      <Input
                        ref={editInputRef}
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        placeholder="Enter price..."
                        className="font-mono"
                      />
                      <Button onClick={handleOverrideSave} disabled={isProcessing}>
                        <Check className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      <Button variant="ghost" onClick={() => setIsEditing(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Press <kbd className="font-mono bg-muted px-1 rounded">Enter</kbd> to save,{' '}
                      <kbd className="font-mono bg-muted px-1 rounded">Esc</kbd> to cancel
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <Button
                      size="lg"
                      className="bg-success hover:bg-success/90 text-success-foreground"
                      onClick={handleAccept}
                      disabled={isProcessing}
                    >
                      <Check className="h-5 w-5 mr-2" />
                      Accept
                      <kbd className="ml-2 text-xs opacity-70 font-mono">A</kbd>
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleStartEdit}
                      disabled={isProcessing}
                    >
                      <Pencil className="h-5 w-5 mr-2" />
                      Edit
                      <kbd className="ml-2 text-xs opacity-70 font-mono">E</kbd>
                    </Button>
                    <Button
                      size="lg"
                      variant="secondary"
                      onClick={handleSkip}
                      disabled={isProcessing}
                    >
                      <SkipForward className="h-5 w-5 mr-2" />
                      Skip
                      <kbd className="ml-2 text-xs opacity-70 font-mono">␣</kbd>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
