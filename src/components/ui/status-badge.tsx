import { cn } from '@/lib/utils';
import { CostItemStatus, ProjectStatus } from '@/types/project';
import { CheckCircle, AlertCircle, HelpCircle, Clock, FileText, Package, TrendingDown, BadgeCheck } from 'lucide-react';

interface StatusBadgeProps {
  status: CostItemStatus | ProjectStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

const costItemConfig: Record<CostItemStatus, { label: string; className: string; icon: typeof CheckCircle }> = {
  ok: {
    label: 'OK',
    className: 'status-ok',
    icon: CheckCircle,
  },
  review: {
    label: 'Review',
    className: 'status-review',
    icon: AlertCircle,
  },
  clarification: {
    label: 'Clarification',
    className: 'status-clarification',
    icon: HelpCircle,
  },
  underpriced: {
    label: 'Under-Priced',
    className: 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    icon: TrendingDown,
  },
  actual: {
    label: 'Actual',
    className: 'bg-success/10 text-success border border-success/20',
    icon: BadgeCheck,
  },
};

const projectStatusConfig: Record<ProjectStatus, { label: string; className: string; icon: typeof CheckCircle }> = {
  draft: {
    label: 'Draft',
    className: 'bg-muted text-muted-foreground border border-border',
    icon: FileText,
  },
  processing: {
    label: 'Processing',
    className: 'bg-primary/10 text-primary border border-primary/20',
    icon: Clock,
  },
  ready: {
    label: 'Ready',
    className: 'status-ok',
    icon: CheckCircle,
  },
  exported: {
    label: 'Exported',
    className: 'bg-muted text-foreground border border-border',
    icon: Package,
  },
};

export function StatusBadge({ status, size = 'sm', showIcon = true }: StatusBadgeProps) {
  const isCostItemStatus = ['ok', 'review', 'clarification', 'underpriced', 'actual'].includes(status);
  const isProjectStatus = ['draft', 'processing', 'ready', 'exported'].includes(status);
  
  // Fallback for unknown statuses
  const defaultConfig = { label: status || 'Unknown', className: 'bg-muted text-muted-foreground border border-border', icon: HelpCircle };
  
  const config = isCostItemStatus 
    ? costItemConfig[status as CostItemStatus]
    : isProjectStatus 
      ? projectStatusConfig[status as ProjectStatus]
      : defaultConfig;
  
  const Icon = config.icon;
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        config.className
      )}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {config.label}
    </span>
  );
}
