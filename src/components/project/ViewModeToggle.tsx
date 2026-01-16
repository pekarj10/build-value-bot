import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useViewMode } from '@/hooks/useViewMode';
import { Badge } from '@/components/ui/badge';

/**
 * Floating button for admins to toggle between admin and user view modes.
 * Regular users never see this component.
 */
export function ViewModeToggle() {
  const { isActualAdmin, isUserPreview, toggleViewMode } = useViewMode();

  // Only show to actual admins
  if (!isActualAdmin) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="lg"
            variant={isUserPreview ? "secondary" : "outline"}
            className={cn(
              "fixed bottom-6 right-24 h-14 w-14 rounded-full shadow-lg z-50",
              "hover:scale-105 transition-transform",
              isUserPreview && "bg-blue-100 hover:bg-blue-200 border-blue-300 dark:bg-blue-950 dark:hover:bg-blue-900 dark:border-blue-800"
            )}
            onClick={toggleViewMode}
          >
            {isUserPreview ? (
              <EyeOff className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            ) : (
              <Eye className="h-6 w-6" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {isUserPreview ? 'Back to Admin View' : 'Preview as User'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * User preview mode indicator badge that shows at the top of the screen
 * when an admin is viewing the app as a regular user.
 */
export function UserPreviewBadge() {
  const { isActualAdmin, isUserPreview, toggleViewMode } = useViewMode();

  // Only show when admin is in user preview mode
  if (!isActualAdmin || !isUserPreview) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <Badge 
        variant="secondary"
        className={cn(
          "mt-2 px-4 py-1.5 pointer-events-auto cursor-pointer",
          "bg-blue-100 text-blue-700 border border-blue-300",
          "dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
          "hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors",
          "shadow-md"
        )}
        onClick={toggleViewMode}
      >
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        User Preview Mode
      </Badge>
    </div>
  );
}
