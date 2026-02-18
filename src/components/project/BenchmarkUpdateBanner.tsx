import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Bell, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface BenchmarkUpdateBannerProps {
  projectId: string;
  summary: string | null;
  since: string | null;
  dismissedAt: string | null;
  onDismiss: () => void;
  onReanalyze: () => void;
  isReanalyzing: boolean;
}

/**
 * Determines whether the banner should be visible:
 * - If never dismissed → show
 * - If dismissed → show again once after 7 days, then hide forever
 */
function shouldShowBanner(dismissedAt: string | null): boolean {
  if (!dismissedAt) return true;
  const dismissed = new Date(dismissedAt);
  const now = new Date();
  const daysSinceDismiss = (now.getTime() - dismissed.getTime()) / (1000 * 60 * 60 * 24);
  // Reappear once after 7 days; if it was dismissed again later, the field gets cleared
  return daysSinceDismiss >= 7;
}

export function BenchmarkUpdateBanner({
  projectId,
  summary,
  since,
  dismissedAt,
  onDismiss,
  onReanalyze,
  isReanalyzing,
}: BenchmarkUpdateBannerProps) {
  const [isDismissing, setIsDismissing] = useState(false);

  if (!shouldShowBanner(dismissedAt)) return null;

  const sinceDate = since ? new Date(since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

  const handleDismiss = async () => {
    setIsDismissing(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('projects')
        .update({ pending_update_dismissed_at: now } as any)
        .eq('id', projectId);

      if (error) throw error;
      onDismiss();
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
      toast.error('Could not dismiss notification');
    } finally {
      setIsDismissing(false);
    }
  };

  const handleReanalyze = async () => {
    // After reanalyzing, clear the pending flag entirely
    onReanalyze();
    try {
      await supabase
        .from('projects')
        .update({
          pending_benchmark_update: false,
          pending_update_summary: null,
          pending_update_since: null,
          pending_update_dismissed_at: null,
        } as any)
        .eq('id', projectId);
    } catch (err) {
      console.error('Failed to clear benchmark update flag:', err);
    }
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-primary/30 bg-primary/5 animate-in slide-in-from-top-2 duration-300">
      <Bell className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          Benchmark data updated{sinceDate ? ` on ${sinceDate}` : ''}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {summary || 'Some reference prices used in this project have changed. You can re-analyse to get the latest recommended prices.'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={handleReanalyze}
          disabled={isReanalyzing || isDismissing}
          className="h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isReanalyzing ? 'animate-spin' : ''}`} />
          Re-analyse
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
          disabled={isDismissing || isReanalyzing}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
