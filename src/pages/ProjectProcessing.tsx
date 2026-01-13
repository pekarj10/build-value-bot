import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { ProcessingProgress } from '@/components/project/ProcessingProgress';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProcessingStep } from '@/types/project';
import { useProject } from '@/hooks/useProject';
import { useCostAnalysis } from '@/hooks/useCostAnalysis';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const INITIAL_STEPS: ProcessingStep[] = [
  { id: 'fetch', label: 'Loading cost items', status: 'pending' },
  { id: 'analyze', label: 'AI analysis in progress', status: 'pending' },
  { id: 'save', label: 'Saving results', status: 'pending' },
  { id: 'complete', label: 'Analysis complete', status: 'pending' },
];

export default function ProjectProcessing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getProject, getCostItems, updateCostItem, updateProjectStatus } = useProject();
  const { analyzeItems } = useCostAnalysis();
  
  const [steps, setSteps] = useState<ProcessingStep[]>(INITIAL_STEPS);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const updateStep = useCallback((stepId: string, status: ProcessingStep['status'], message?: string) => {
    setSteps(prev => prev.map(s => 
      s.id === stepId ? { ...s, status, message } : s
    ));
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!id || hasStarted) return;
    setHasStarted(true);

    try {
      // Step 1: Load project and items
      updateStep('fetch', 'active', 'Loading project data...');
      
      const project = await getProject(id);
      if (!project) {
        throw new Error('Project not found');
      }

      const items = await getCostItems(id);
      if (items.length === 0) {
        throw new Error('No cost items found');
      }

      updateStep('fetch', 'complete', `Loaded ${items.length} items`);

      // Step 2: Analyze with AI
      updateStep('analyze', 'active', 'AI is analyzing cost items...');

      const itemsToAnalyze = items.map(item => ({
        id: item.id,
        originalDescription: item.originalDescription,
        quantity: item.quantity,
        unit: item.unit,
        originalUnitPrice: item.originalUnitPrice,
        trade: item.trade,
        sheetName: item.sheetName,
      }));

      const analyzedItems = await analyzeItems(itemsToAnalyze, {
        country: project.country,
        currency: project.currency,
        projectType: project.projectType,
        name: project.name,
      });

      updateStep('analyze', 'complete', `Analyzed ${analyzedItems.length} items`);

      // Step 3: Save results
      updateStep('save', 'active', 'Saving analysis results...');

      let savedCount = 0;
      let totalValue = 0;
      let issuesCount = 0;

      for (const item of analyzedItems) {
        const success = await updateCostItem(item.id, {
          interpreted_scope: item.interpretedScope,
          recommended_unit_price: item.recommendedUnitPrice,
          benchmark_min: item.benchmarkMin,
          benchmark_typical: item.benchmarkTypical,
          benchmark_max: item.benchmarkMax,
          total_price: item.totalPrice,
          status: item.status,
          ai_comment: item.aiComment,
          // CRITICAL: Persist benchmark matching fields for consistency
          matched_benchmark_id: item.matchedBenchmarkId || null,
          match_confidence: item.matchConfidence || null,
          match_reasoning: item.matchReasoning || null,
          price_source: item.priceSource || null,
        });

        if (success) {
          savedCount++;
          totalValue += item.totalPrice;
          if (item.status !== 'ok') issuesCount++;
        }
      }

      updateStep('save', 'complete', `Saved ${savedCount} results`);

      // Step 4: Complete
      await updateProjectStatus(id, 'ready', { 
        total_value: totalValue,
        issues_count: issuesCount 
      });

      updateStep('complete', 'complete', 'Analysis complete');
      setIsComplete(true);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
      toast.error(message);
      
      // Mark current step as error
      setSteps(prev => prev.map(s => 
        s.status === 'active' ? { ...s, status: 'error', message } : s
      ));
    }
  }, [id, hasStarted, getProject, getCostItems, analyzeItems, updateCostItem, updateProjectStatus, updateStep]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const handleViewResults = () => {
    navigate(`/project/${id}`);
  };

  const handleRetry = () => {
    setSteps(INITIAL_STEPS);
    setError(null);
    setHasStarted(false);
  };

  const currentStep = steps.find(s => s.status === 'active');
  const completedSteps = steps.filter(s => s.status === 'complete').length;
  const progress = Math.round((completedSteps / steps.length) * 100);

  return (
    <AppLayout>
      <PageHeader
        title="Processing Project"
        description="Analyzing cost data and matching benchmarks"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Projects', href: '/projects' },
          { label: 'Processing' },
        ]}
      />

      <div className="p-8 max-w-2xl mx-auto">
        <Card className="p-8">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {error ? 'Analysis Failed' : isComplete ? 'Analysis Complete' : currentStep?.label || 'Starting...'}
              </span>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ease-out ${error ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <ProcessingProgress steps={steps} />

          {/* Error message */}
          {error && (
            <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Analysis Error</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 pt-6 border-t">
            {isComplete ? (
              <Button onClick={handleViewResults} className="w-full">
                View Results
              </Button>
            ) : error ? (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate('/projects')} className="flex-1">
                  Back to Projects
                </Button>
                <Button onClick={handleRetry} className="flex-1">
                  Retry Analysis
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Processing may take a few minutes...</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
