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
  recommendedUnitPrice: number;
  benchmarkMin: number;
  benchmarkTypical: number;
  benchmarkMax: number;
  status: CostItemStatus;
  aiComment: string;
  clarificationQuestion?: string;
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
            recommendedUnitPrice: result.recommendedUnitPrice,
            benchmarkMin: result.benchmarkMin,
            benchmarkTypical: result.benchmarkTypical,
            benchmarkMax: result.benchmarkMax,
            totalPrice: item.quantity * result.recommendedUnitPrice,
            status: result.status,
            aiComment: result.aiComment,
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
          recommendedUnitPrice: item.originalUnitPrice || 0,
          benchmarkMin: 0,
          benchmarkTypical: 0,
          benchmarkMax: 0,
          totalPrice: item.quantity * (item.originalUnitPrice || 0),
          status: 'clarification' as const,
          aiComment: 'Unable to analyze this item. Please provide more details.',
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
        totalPrice: item.quantity * data.recommendedUnitPrice,
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
