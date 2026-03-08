import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useViewMode } from '@/hooks/useViewMode';
import { SidebarViewModeToggle, UserPreviewBanner } from '@/components/project/ViewModeToggle';
import logoImg from '@/assets/logo-new.png';
import { 
  LayoutDashboard, 
  FolderOpen, 
  Settings,
  HelpCircle,
  ChevronRight,
  LogOut,
  User,
  Shield,
  Menu,
  X,
  MessageSquare
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface AppLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Help', href: '/help', icon: HelpCircle },
];

const adminNavigation = [
  { name: 'Admin', href: '/admin', icon: Shield },
];

// Sidebar content component - reused for both desktop and mobile
function SidebarContent({ 
  onNavigate 
}: { 
  onNavigate?: () => void 
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { showAsAdmin } = useViewMode();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
    : user?.email?.substring(0, 2).toUpperCase() || 'U';

  const handleNavClick = () => {
    onNavigate?.();
  };

  return (
    <div className="flex flex-col h-full">
      <nav className="flex flex-col gap-1 p-4 flex-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href !== '/' && location.pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-base min-h-[44px]',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
        
        {/* View Mode Toggle - only visible to admins */}
        {isAdmin && (
          <>
            <div className="my-2 border-t border-sidebar-border" />
            <SidebarViewModeToggle />
          </>
        )}
        
        {/* Admin navigation - only show when in admin view mode */}
        {showAsAdmin && (
          <>
            {adminNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-base min-h-[44px]',
                    isActive
                      ? 'bg-warning/20 text-warning'
                      : 'text-warning/70 hover:text-warning hover:bg-warning/10'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>
      
      {/* User section */}
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 h-auto py-3 px-3 text-sidebar-foreground hover:bg-sidebar-accent/50 min-h-[44px]"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="text-sm font-medium truncate w-full text-left">
                  {user?.user_metadata?.full_name || 'User'}
                </span>
                <span className="text-xs text-sidebar-foreground/60 truncate w-full text-left">
                  {user?.email}
                </span>
              </div>
              {isAdmin && (
                <Shield className="h-4 w-4 text-warning flex-shrink-0" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <span>My Account</span>
                {isAdmin && (
                  <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                    Admin
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-[44px]">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-[44px]">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive min-h-[44px]">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <div className="mt-3 rounded-lg bg-sidebar-accent/50 p-3">
          <p className="text-xs text-sidebar-foreground/70">Version 1.0.0</p>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-background relative z-10">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-sidebar border-b border-sidebar-border flex items-center px-4">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
        
        <Link to="/" className="flex items-center gap-2 ml-3">
          <img src={logoImg} alt="Unit Rate" className="h-8 w-8 rounded-lg object-contain" />
          <span className="font-semibold text-sidebar-foreground">Unit Rate</span>
        </Link>
      </header>

      {/* Mobile Sidebar Drawer */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent 
          side="left" 
          className="w-72 p-0 bg-sidebar border-sidebar-border"
        >
          <SheetHeader className="h-16 flex flex-row items-center px-6 border-b border-sidebar-border">
            <Link to="/" className="flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
              <img src={logoImg} alt="Unit Rate" className="h-9 w-9 rounded-lg object-contain" />
              <SheetTitle className="font-semibold text-lg text-sidebar-foreground tracking-tight">
                Unit Rate
              </SheetTitle>
            </Link>
          </SheetHeader>
          <SidebarContent onNavigate={() => setIsMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border">
        <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoImg} alt="Unit Rate" className="h-9 w-9 rounded-lg object-contain" />
            <span className="font-semibold text-lg text-sidebar-foreground tracking-tight">Unit Rate</span>
          </Link>
        </div>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="lg:pl-64 pt-16 lg:pt-0">
        {/* User Preview Banner - shows when admin is in user view mode */}
        <UserPreviewBanner />
        <div className="min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
}

export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="border-b bg-card px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-2 overflow-x-auto">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-1 whitespace-nowrap">
              {index > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
              {crumb.href ? (
                <Link to={crumb.href} className="hover:text-foreground transition-base">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}