import { Eye, Users, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useViewMode } from '@/hooks/useViewMode';

/**
 * View mode selector for the sidebar - allows admins to toggle between admin and user views.
 * Regular users never see this component.
 */
export function SidebarViewModeToggle() {
  const { isActualAdmin, isUserPreview, setViewMode, viewMode } = useViewMode();

  // Only show to actual admins
  if (!isActualAdmin) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 px-3 py-2.5 h-auto text-sm font-medium transition-base",
            isUserPreview 
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Eye className="h-4 w-4" />
          <span className="flex-1 text-left">
            View as: {isUserPreview ? 'User' : 'Admin'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem 
          onClick={() => setViewMode('admin')}
          className={cn(
            "gap-2",
            viewMode === 'admin' && "bg-accent"
          )}
        >
          <Shield className="h-4 w-4" />
          Admin View
          {viewMode === 'admin' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setViewMode('user')}
          className={cn(
            "gap-2",
            viewMode === 'user' && "bg-accent"
          )}
        >
          <Users className="h-4 w-4" />
          User View
          {viewMode === 'user' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * User preview mode banner that shows at the top of the main content area
 * when an admin is viewing the app as a regular user.
 */
export function UserPreviewBanner() {
  const { isActualAdmin, isUserPreview, setViewMode } = useViewMode();

  // Only show when admin is in user preview mode
  if (!isActualAdmin || !isUserPreview) {
    return null;
  }

  return (
    <div className="bg-blue-100 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 px-4 py-2">
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <Eye className="h-4 w-4" />
          <span className="text-sm font-medium">PREVIEWING AS USER</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setViewMode('admin')}
          className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-200 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
        >
          Switch to Admin
        </Button>
      </div>
    </div>
  );
}
