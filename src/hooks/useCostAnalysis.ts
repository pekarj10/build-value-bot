import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CostItem, CostItemStatus } from '@/types/project';
import { toast } from 'sonner';

interface CostItemInput {
  id: string;
  originalDescription: string;
  quantity: number;
  unit: string;
  originalUnitPrice?: number;
  trade?: string;
  sheetName?: string;
}

interface ProjectContext {
  country: string;
  currency: string;
  projectType: string;
  name?: string;
}

interface AnalysisResult {
  id: string;
  interpretedScope: string;
  recommendedUnitPrice: number | null;
  benchmarkMin: number | null;
  benchmarkTypical: number | null;
  benchmarkMax: number | null;
  status: CostItemStatus;
  aiComment: string;
  clarificationQuestion?: string;
  // New benchmark matching fields
  matchedBenchmarkId?: string | null;
  matchConfidence?: number | null;
  matchReasoning?: string | null;
  priceSource?: string | null;
  userExplanation?: string | null;
}

export function useCostAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeItems = async (
    items: CostItemInput[],
    project: ProjectContext
  ): Promise<CostItem[]> => {
    setIsAnalyzing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-cost-items', {
        body: { items, project },
      });

      if (error) {
        console.error('Analysis error:', error);
        throw new Error(error.message || 'Analysis failed');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const results: AnalysisResult[] = data.items || [];

      // Merge AI results with original items
      const analyzedItems: CostItem[] = items.map((item) => {
        const result = results.find((r) => r.id === item.id);
        
        if (result) {
          const recommendedPrice = result.recommendedUnitPrice ?? null;
          return {
            id: item.id,
            projectId: '', // Will be set by caller
            sheetName: item.sheetName,
            trade: item.trade,
            originalDescription: item.originalDescription,
            interpretedScope: result.interpretedScope,
            quantity: item.quantity,
            unit: item.unit,
            originalUnitPrice: item.originalUnitPrice,
            recommendedUnitPrice: recommendedPrice,
            benchmarkMin: result.benchmarkMin ?? null,
            benchmarkTypical: result.benchmarkTypical ?? null,
            benchmarkMax: result.benchmarkMax ?? null,
            totalPrice: recommendedPrice ? item.quantity * recommendedPrice : 0,
            status: result.status,
            aiComment: result.aiComment,
            // New benchmark matching fields
            matchedBenchmarkId: result.matchedBenchmarkId ?? null,
            matchConfidence: result.matchConfidence ?? null,
            matchReasoning: result.matchReasoning ?? null,
            priceSource: result.priceSource ?? null,
            userExplanation: result.userExplanation ?? null,
          };
        }

        // Fallback if AI didn't return result for this item
        return {
          id: item.id,
          projectId: '',
          sheetName: item.sheetName,
          trade: item.trade,
          originalDescription: item.originalDescription,
          interpretedScope: item.originalDescription,
          quantity: item.quantity,
          unit: item.unit,
          originalUnitPrice: item.originalUnitPrice,
          recommendedUnitPrice: null,
          benchmarkMin: null,
          benchmarkTypical: null,
          benchmarkMax: null,
          totalPrice: 0,
          status: 'clarification' as const,
          aiComment: 'Unable to analyze this item. No benchmark match found.',
          matchedBenchmarkId: null,
          matchConfidence: null,
          matchReasoning: null,
          priceSource: null,
          userExplanation: null,
        };
      });

      toast.success(`Analyzed ${analyzedItems.length} cost items`);
      return analyzedItems;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      toast.error(message);
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processClarification = async (
    item: CostItem,
    clarification: string,
    project: ProjectContext
  ): Promise<Partial<CostItem>> => {
    try {
      const { data, error } = await supabase.functions.invoke('clarify-cost-item', {
        body: {
          item: {
            id: item.id,
            originalDescription: item.originalDescription,
            interpretedScope: item.interpretedScope,
            quantity: item.quantity,
            unit: item.unit,
            originalUnitPrice: item.originalUnitPrice,
            recommendedUnitPrice: item.recommendedUnitPrice,
            trade: item.trade,
            sheetName: item.sheetName,
            aiComment: item.aiComment,
          },
          clarification,
          project,
        },
      });

      if (error) {
        console.error('Clarification error:', error);
        throw new Error(error.message || 'Clarification processing failed');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success('Clarification processed');

      return {
        interpretedScope: data.interpretedScope,
        recommendedUnitPrice: data.recommendedUnitPrice,
        benchmarkMin: data.benchmarkMin,
        benchmarkTypical: data.benchmarkTypical,
        benchmarkMax: data.benchmarkMax,
        status: data.status,
        aiComment: data.aiComment,
        userClarification: clarification,
        totalPrice: data.recommendedUnitPrice ? item.quantity * data.recommendedUnitPrice : 0,
        // Include benchmark matching fields for trust score recalculation
        matchedBenchmarkId: data.matchedBenchmarkId || null,
        matchConfidence: data.matchConfidence || null,
        matchReasoning: data.matchReasoning || null,
        priceSource: data.priceSource || null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      toast.error(message);
      throw err;
    }
  };

  return {
    isAnalyzing,
    analyzeItems,
    processClarification,
  };
}
