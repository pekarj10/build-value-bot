import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TablePagination } from '@/components/project/TablePagination';
import { BenchmarkManager } from '@/components/admin/BenchmarkManager';
import { 
  Users, 
  FolderOpen, 
  Shield, 
  Search,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  is_admin: boolean;
  projects_count: number;
  total_items: number;
}

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  total_items: number;
  issues_count: number;
  created_at: string;
  user_email: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'benchmarks'>('users');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateResults, setRecalculateResults] = useState<{
    processed: number;
    updated: number;
    errors: number;
    changes: Array<{
      itemId: string;
      description: string;
      oldPrice: number | null;
      newPrice: number | null;
      priceSource: string | null;
      confidence: number;
    }>;
  } | null>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProjects: 0,
    totalItems: 0,
    totalIssues: 0,
  });
  
  const handleRecalculateAllPrices = async () => {
    setIsRecalculating(true);
    setRecalculateResults(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      toast.info('Starting price recalculation for all projects...');
      
      const { data, error } = await supabase.functions.invoke('recalculate-all-prices', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Recalculation error:', error);
        toast.error(`Recalculation failed: ${error.message}`);
        return;
      }

      setRecalculateResults(data);
      
      if (data.updated > 0) {
        toast.success(`Updated ${data.updated} prices across ${data.processed} items`);
      } else {
        toast.info(`Processed ${data.processed} items, no updates needed`);
      }
      
      // Refresh data
      fetchData();
      
    } catch (error) {
      console.error('Recalculation error:', error);
      toast.error('Failed to recalculate prices');
    } finally {
      setIsRecalculating(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch profiles with project counts
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch projects with user info
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*, profiles!projects_user_id_fkey(email)')
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;

      // Build user map with project counts
      const projectsByUser = (projectsData || []).reduce((acc, project) => {
        const userId = project.user_id;
        if (!acc[userId]) {
          acc[userId] = { count: 0, items: 0 };
        }
        acc[userId].count++;
        acc[userId].items += project.total_items || 0;
        return acc;
      }, {} as Record<string, { count: number; items: number }>);

      // Build admin map
      const adminMap = (roles || []).reduce((acc, role) => {
        if (role.role === 'admin') {
          acc[role.user_id] = true;
        }
        return acc;
      }, {} as Record<string, boolean>);

      // Map profiles with enriched data
      const enrichedUsers: UserProfile[] = (profiles || []).map((profile) => ({
        id: profile.id,
        email: profile.email || '',
        full_name: profile.full_name,
        created_at: profile.created_at,
        is_admin: adminMap[profile.id] || false,
        projects_count: projectsByUser[profile.id]?.count || 0,
        total_items: projectsByUser[profile.id]?.items || 0,
      }));

      // Map projects
      const mappedProjects: ProjectSummary[] = (projectsData || []).map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        total_items: project.total_items || 0,
        issues_count: project.issues_count || 0,
        created_at: project.created_at,
        user_email: (project.profiles as any)?.email || 'Unknown',
      }));

      setUsers(enrichedUsers);
      setProjects(mappedProjects);

      // Calculate stats
      const totalIssues = mappedProjects.reduce((sum, p) => sum + p.issues_count, 0);
      const totalItems = mappedProjects.reduce((sum, p) => sum + p.total_items, 0);

      setStats({
        totalUsers: enrichedUsers.length,
        totalProjects: mappedProjects.length,
        totalItems,
        totalIssues,
      });
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter data
  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.user_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Paginate
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalItems = activeTab === 'users' ? filteredUsers.length : filteredProjects.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Reset page when switching tabs or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  if (authLoading || (!isAdmin && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-success/10 text-success border-success/20">Ready</Badge>;
      case 'processing':
        return <Badge className="bg-warning/10 text-warning border-warning/20">Processing</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Admin Dashboard"
        description="Manage users and monitor all projects"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Admin' },
        ]}
      />

      <div className="p-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-success/10">
                  <FolderOpen className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalProjects}</p>
                  <p className="text-sm text-muted-foreground">Total Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <TrendingUp className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalItems.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Cost Items</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-warning/10">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalIssues}</p>
                  <p className="text-sm text-muted-foreground">Issues Flagged</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex gap-2">
                <Button
                  variant={activeTab === 'users' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('users')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Users
                </Button>
                <Button
                  variant={activeTab === 'projects' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('projects')}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Projects
                </Button>
                <Button
                  variant={activeTab === 'benchmarks' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('benchmarks')}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Benchmarks
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecalculateAllPrices}
                  disabled={isRecalculating}
                  className="ml-4 border-warning text-warning hover:bg-warning/10"
                >
                  {isRecalculating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isRecalculating ? 'Recalculating...' : 'Recalculate All Prices'}
                </Button>
              </div>

              {activeTab !== 'benchmarks' && (
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={activeTab === 'users' ? 'Search users...' : 'Search projects...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-64"
                    />
                  </div>

                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>

          {activeTab === 'benchmarks' ? (
            <CardContent className="p-0">
              <BenchmarkManager />
            </CardContent>
          ) : (
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : activeTab === 'users' ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Projects</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.full_name || 'No name'}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {user.is_admin ? (
                              <Badge className="bg-warning/10 text-warning border-warning/20">
                                <Shield className="h-3 w-3 mr-1" />
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="secondary">User</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {user.projects_count}
                          </TableCell>
                          <TableCell className="text-right">
                            {user.total_items.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {filteredUsers.length > pageSize && (
                  <div className="mt-4">
                    <TablePagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      totalItems={filteredUsers.length}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={setPageSize}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Issues</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProjects.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No projects found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedProjects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell className="font-medium">{project.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {project.user_email}
                          </TableCell>
                          <TableCell>{getStatusBadge(project.status)}</TableCell>
                          <TableCell className="text-right">
                            {project.total_items.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {project.issues_count > 0 ? (
                              <span className="text-warning font-medium">{project.issues_count}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/project/${project.id}`)}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {filteredProjects.length > pageSize && (
                  <div className="mt-4">
                    <TablePagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      totalItems={filteredProjects.length}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={setPageSize}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
