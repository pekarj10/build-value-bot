import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, TrendingUp, TrendingDown, Eye } from 'lucide-react';

interface QuickFilterChipsProps {
  activeFilters: string[];
  onToggle: (filter: string) => void;
}

const quickFilters = [
  {
    id: 'high-variance',
    label: 'High Variance',
    icon: TrendingUp,
    description: 'Items with >15% price variance',
  },
  {
    id: 'needs-review',
    label: 'Needs Review',
    icon: Eye,
    description: 'Items marked for review or clarification',
  },
  {
    id: 'over-budget',
    label: 'Over Budget',
    icon: AlertTriangle,
    description: 'Items priced above benchmark',
  },
  {
    id: 'under-priced',
    label: 'Under-Priced',
    icon: TrendingDown,
    description: 'Items significantly below benchmark (potential scope/quality risk)',
  },
];

export function QuickFilterChips({ activeFilters, onToggle }: QuickFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {quickFilters.map((filter) => {
        const isActive = activeFilters.includes(filter.id);
        const Icon = filter.icon;
        
        return (
          <button
            key={filter.id}
            onClick={() => onToggle(filter.id)}
            title={filter.description}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
              "border hover:shadow-sm",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:border-primary/50"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
