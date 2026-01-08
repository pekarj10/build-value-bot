import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { ProcessingProgress } from '@/components/project/ProcessingProgress';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { mockProcessingSteps } from '@/data/mockData';
import { ProcessingStep } from '@/types/project';
import { Loader2 } from 'lucide-react';

export default function ProjectProcessing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<ProcessingStep[]>(mockProcessingSteps);
  const [isComplete, setIsComplete] = useState(false);

  // Simulate processing progress
  useEffect(() => {
    const interval = setInterval(() => {
      setSteps(prevSteps => {
        const activeIndex = prevSteps.findIndex(s => s.status === 'active');
        if (activeIndex === -1 || activeIndex >= prevSteps.length - 1) {
          clearInterval(interval);
          if (activeIndex === prevSteps.length - 1) {
            setIsComplete(true);
            return prevSteps.map((s, i) => 
              i === activeIndex ? { ...s, status: 'complete' as const } : s
            );
          }
          return prevSteps;
        }

        return prevSteps.map((step, index) => {
          if (index === activeIndex) {
            return { ...step, status: 'complete' as const };
          }
          if (index === activeIndex + 1) {
            return { ...step, status: 'active' as const, message: 'Processing...' };
          }
          return step;
        });
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleViewResults = () => {
    navigate(`/project/${id}`);
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
                {isComplete ? 'Analysis Complete' : currentStep?.label || 'Starting...'}
              </span>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <ProcessingProgress steps={steps} />

          {/* Actions */}
          <div className="mt-8 pt-6 border-t">
            {isComplete ? (
              <Button onClick={handleViewResults} className="w-full">
                View Results
              </Button>
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
