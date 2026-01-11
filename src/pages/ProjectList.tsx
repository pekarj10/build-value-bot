import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProject } from '@/hooks/useProject';
import { Project } from '@/types/project';
import { Plus, Search, Filter, FolderOpen } from 'lucide-react';

export default function ProjectList() {
  const { getAllProjects } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadProjects = async () => {
    setIsLoading(true);
    const data = await getAllProjects();
    setProjects(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, [getAllProjects]);

  const filteredProjects = projects.filter((project) => {
    if (statusFilter !== 'all' && project.status !== statusFilter) return false;
    if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader
          title="Projects"
          description="Manage your cost analysis projects"
          breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Projects' }]}
          actions={
            <Link to="/project/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </Link>
          }
        />
        <div className="p-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Projects"
        description="Manage your cost analysis projects"
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Projects' }]}
        actions={
          <Link to="/project/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
        }
      />

      <div className="p-8 space-y-6">
        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="exported">Exported</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="text-sm text-muted-foreground ml-auto">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">No projects yet</h3>
                <p className="text-muted-foreground mt-1">
                  Create your first project to start analyzing construction costs
                </p>
              </div>
              <Link to="/project/new">
                <Button className="mt-2">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Project
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onDeleted={loadProjects} />
              ))}
            </div>

            {filteredProjects.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No projects match your filters.</p>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
