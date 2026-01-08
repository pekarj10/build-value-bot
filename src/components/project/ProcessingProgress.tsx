import { ProcessingStep } from '@/types/project';
import { Check, Loader2, Circle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingProgressProps {
  steps: ProcessingStep[];
}

export function ProcessingProgress({ steps }: ProcessingProgressProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start gap-4">
          {/* Step indicator */}
          <div className="relative">
            <div
              className={cn(
                'step-circle',
                step.status === 'complete' && 'step-complete',
                step.status === 'active' && 'step-active',
                step.status === 'pending' && 'step-pending',
                step.status === 'error' && 'bg-destructive text-destructive-foreground'
              )}
            >
              {step.status === 'complete' && <Check className="h-4 w-4" />}
              {step.status === 'active' && <Loader2 className="h-4 w-4 animate-spin" />}
              {step.status === 'pending' && <span>{index + 1}</span>}
              {step.status === 'error' && <AlertCircle className="h-4 w-4" />}
            </div>
            
            {/* Connecting line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'absolute left-1/2 top-8 w-0.5 h-8 -translate-x-1/2',
                  step.status === 'complete' ? 'bg-success' : 'bg-border'
                )}
              />
            )}
          </div>

          {/* Step content */}
          <div className="flex-1 pt-1">
            <p
              className={cn(
                'font-medium',
                step.status === 'pending' && 'text-muted-foreground'
              )}
            >
              {step.label}
            </p>
            {step.message && step.status === 'active' && (
              <p className="text-sm text-muted-foreground mt-1">{step.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
