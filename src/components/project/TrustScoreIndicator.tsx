import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrustScoreIndicatorProps {
  costItemId: string;
  countryCode?: string;
  className?: string;
  /** Force recalculation by changing this value (e.g., item.updatedAt or status) */
  refreshKey?: string | number;
}

interface TrustScoreData {
  overall_trust_score: number;
  plausibility_score: number;
  similarity_score: number;
  reference_count: number;
  explanation: string;
  country_code: string;
}

export function TrustScoreIndicator({ 
  costItemId, 
  countryCode = 'SE',
  className,
  refreshKey
}: TrustScoreIndicatorProps) {
  const [trustScore, setTrustScore] = useState<TrustScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrCalculateTrustScore() {
      if (!costItemId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // When refreshKey changes, always recalculate (don't use cached)
        // First, try to fetch existing trust score ONLY if no refresh triggered
        if (!refreshKey) {
          const { data: existingScore } = await supabase
            .from('estimate_trust_scores')
            .select('*')
            .eq('cost_item_id', costItemId)
            .maybeSingle();

          if (existingScore) {
            setTrustScore(existingScore as unknown as TrustScoreData);
            setIsLoading(false);
            return;
          }
        }

        // Calculate fresh trust score
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) {
          setError('Not authenticated');
          setIsLoading(false);
          return;
        }

        const { data, error: calcError } = await supabase.functions.invoke('calculate-trust-score', {
          body: { costItemId, countryCode },
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        });

        if (calcError) {
          console.error('Trust score calculation error:', calcError);
          // Don't show error to user, just hide the component
          setIsLoading(false);
          return;
        }

        if (data) {
          setTrustScore({
            overall_trust_score: data.overallTrustScore,
            plausibility_score: data.plausibilityScore,
            similarity_score: data.similarityScore,
            reference_count: data.referenceCount,
            explanation: data.explanation,
            country_code: countryCode,
          });
        }
      } catch (err) {
        console.error('Failed to fetch trust score:', err);
        // Don't show error, just hide component gracefully
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrCalculateTrustScore();
  }, [costItemId, countryCode, refreshKey]);

  if (isLoading) {
    return (
      <div className={cn("p-4 rounded-lg border bg-muted/30 space-y-3", className)}>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (error || !trustScore) {
    return null; // Hide component if no data
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-success/10 border-success/20';
    if (score >= 60) return 'bg-warning/10 border-warning/20';
    return 'bg-destructive/10 border-destructive/20';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-success';
    if (score >= 60) return 'bg-warning';
    return 'bg-destructive';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return '✓';
    if (score >= 60) return '⚠';
    return '⚠️';
  };

  const countryNames: Record<string, string> = {
    'SE': 'Sweden',
    'CZ': 'Czech Republic', 
    'DE': 'Germany',
    'AT': 'Austria',
    'PL': 'Poland',
    'GB': 'United Kingdom',
    'US': 'United States',
  };

  return (
    <div className={cn(
      "p-4 rounded-lg border space-y-3",
      getScoreBg(trustScore.overall_trust_score),
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className={cn("h-4 w-4", getScoreColor(trustScore.overall_trust_score))} />
          <span className="font-medium text-sm">Estimate Trust Score:</span>
          <span className={cn("font-bold text-lg", getScoreColor(trustScore.overall_trust_score))}>
            {Math.round(trustScore.overall_trust_score)}%
          </span>
          <span className={getScoreColor(trustScore.overall_trust_score)}>
            {getScoreIcon(trustScore.overall_trust_score)}
          </span>
        </div>
      </div>

      {/* Score Bars */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-20">Plausibility:</span>
          <div className="flex-1 relative">
            <Progress 
              value={trustScore.plausibility_score} 
              className="h-2"
            />
            <div 
              className={cn("absolute inset-y-0 left-0 rounded-full transition-all", getProgressColor(trustScore.plausibility_score))}
              style={{ width: `${trustScore.plausibility_score}%`, height: '100%' }}
            />
          </div>
          <span className={cn("text-xs font-medium w-10", getScoreColor(trustScore.plausibility_score))}>
            {Math.round(trustScore.plausibility_score)}%
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-20">Similarity:</span>
          <div className="flex-1 relative">
            <Progress 
              value={trustScore.similarity_score} 
              className="h-2"
            />
            <div 
              className={cn("absolute inset-y-0 left-0 rounded-full transition-all", getProgressColor(trustScore.similarity_score))}
              style={{ width: `${trustScore.similarity_score}%`, height: '100%' }}
            />
          </div>
          <span className={cn("text-xs font-medium w-10", getScoreColor(trustScore.similarity_score))}>
            {Math.round(trustScore.similarity_score)}%
          </span>
        </div>
      </div>

      {/* Reference Info */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3 w-3" />
        <span>
          Based on {trustScore.reference_count} similar items from {countryNames[trustScore.country_code] || trustScore.country_code} database
        </span>
      </div>

      {/* Low Trust Warning */}
      {trustScore.overall_trust_score < 60 && (
        <div className="flex items-start gap-2 p-2 rounded bg-destructive/5 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <span className="text-xs text-destructive">
            Limited reference data available. Consider manual verification.
          </span>
        </div>
      )}
    </div>
  );
}
