import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MutationEntry {
  id: string;
  timestamp: string;
  user_name: string | null;
  user_email: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_type: string;
  reason: string | null;
}

export interface TimelineResponse {
  data: MutationEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface CostItemVersion {
  data: Record<string, unknown>;
  as_of: string;
  mutations_reversed: number;
}

export interface RestoreResult {
  data: Record<string, unknown>;
  restored_to: string;
  fields_restored: string[];
}

export function useCostItemMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTimeline = useCallback(async (
    costItemId: string,
    page = 1,
    limit = 20,
    fieldFilter?: string
  ): Promise<TimelineResponse | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (fieldFilter) {
        params.set('field_filter', fieldFilter);
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        `cost-item-mutations/${costItemId}/timeline?${params.toString()}`,
        { method: 'GET' }
      );

      if (fnError) throw fnError;
      return data as TimelineResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch timeline';
      setError(message);
      console.error('Timeline fetch error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getVersionAt = useCallback(async (
    costItemId: string,
    timestamp: string
  ): Promise<CostItemVersion | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const encodedTimestamp = encodeURIComponent(timestamp);
      const { data, error: fnError } = await supabase.functions.invoke(
        `cost-item-mutations/${costItemId}/version/${encodedTimestamp}`,
        { method: 'GET' }
      );

      if (fnError) throw fnError;
      return data as CostItemVersion;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch version';
      setError(message);
      console.error('Version fetch error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restoreToTimestamp = useCallback(async (
    costItemId: string,
    timestamp: string,
    reason?: string
  ): Promise<RestoreResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        `cost-item-mutations/${costItemId}/restore`,
        {
          method: 'POST',
          body: {
            restore_to_timestamp: timestamp,
            reason,
          },
        }
      );

      if (fnError) throw fnError;
      return data as RestoreResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore';
      setError(message);
      console.error('Restore error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logMutation = useCallback(async (
    costItemId: string,
    mutation: {
      field_name: string;
      old_value: string | null;
      new_value: string | null;
      change_type: string;
      reason?: string;
    }
  ): Promise<boolean> => {
    try {
      const { error: fnError } = await supabase.functions.invoke(
        `cost-item-mutations/${costItemId}/log`,
        {
          method: 'POST',
          body: mutation,
        }
      );

      if (fnError) throw fnError;
      return true;
    } catch (err) {
      console.error('Log mutation error:', err);
      return false;
    }
  }, []);

  return {
    isLoading,
    error,
    getTimeline,
    getVersionAt,
    restoreToTimestamp,
    logMutation,
  };
}
