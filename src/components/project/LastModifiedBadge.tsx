import { formatDistanceToNow, format } from 'date-fns';
import { Clock, User } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface LastModifiedBadgeProps {
  lastModifiedAt?: string | Date | null;
  lastModifiedBy?: string | null;
  mutationCount?: number;
  className?: string;
  showIcon?: boolean;
}

export function LastModifiedBadge({
  lastModifiedAt,
  lastModifiedBy,
  mutationCount,
  className,
  showIcon = true,
}: LastModifiedBadgeProps) {
  if (!lastModifiedAt) return null;

  const date = typeof lastModifiedAt === 'string' 
    ? new Date(lastModifiedAt) 
    : lastModifiedAt;

  const timeAgo = formatDistanceToNow(date, { addSuffix: true });
  const fullDate = format(date, 'PPpp');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help",
            className
          )}>
            {showIcon && <Clock className="h-3 w-3" />}
            <span>{timeAgo}</span>
            {mutationCount !== undefined && mutationCount > 1 && (
              <span className="text-muted-foreground/60">
                ({mutationCount} changes)
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">Last modified</p>
            <p className="text-xs">{fullDate}</p>
            {lastModifiedBy && (
              <p className="text-xs flex items-center gap-1 mt-1">
                <User className="h-3 w-3" />
                {lastModifiedBy}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
