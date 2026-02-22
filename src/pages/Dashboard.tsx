import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ProjectHealthOverview } from '@/components/dashboard/ProjectHealthOverview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/hooks/useProject';
import { Project } from '@/types/project';
import { Plus, FolderOpen, LayoutList, HelpCircle } from 'lucide-react';

export default function Dashboard() {
  const { getAllProjects } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      setIsLoading(true);
      const data = await getAllProjects();
      setProjects(data);
      setIsLoading(false);
    };
    loadProjects();
  }, [getAllProjects]);

  const totalProjects = projects.length;
  const readyProjects = projects.filter(p => p.status === 'ready').length;
  const totalItems = projects.reduce((sum, p) => sum + (p.totalItems || 0), 0);
  const totalIssues = projects.reduce((sum, p) => sum + (p.issuesCount || 0), 0);

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader
          title="Dashboard"
          description="Overview of your cost analysis projects"
          actions={
            <Link to="/project/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </Link>
          }
        />
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        description="Overview of your cost analysis projects"
        actions={
          <Link to="/project/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
        }
      />

      <div className="p-8 space-y-8">
        {/* Overview metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Total Projects"
            value={totalProjects.toString()}
            description={`${readyProjects} ready for review`}
          />
          <MetricCard
            title="Cost Items Analyzed"
            value={totalItems.toLocaleString()}
            description="Across all projects"
          />
          <MetricCard
            title="Items Flagged"
            value={totalIssues.toString()}
            trend={totalIssues > 0 ? "neutral" : undefined}
            description="Requiring attention"
          />
        </div>

        {/* Recent projects */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            {projects.length > 0 && (
              <Link to="/projects">
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </Link>
            )}
          </div>

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.slice(0, 3).map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        {/* Project Health Overview */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Project Health</h2>
          <Card className="p-5">
            <ProjectHealthOverview projects={projects} />
          </Card>
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/project/new">
              <Card className="p-5 hover:border-primary/30 transition-base cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium group-hover:text-primary transition-base">
                      Create New Project
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Start a new cost analysis
                    </p>
                  </div>
                </div>
              </Card>
            </Link>

            <Link to="/projects">
              <Card className="p-5 hover:border-primary/30 transition-base cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                    <LayoutList className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <p className="font-medium group-hover:text-primary transition-base">
                      View All Projects
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Browse and manage your projects
                    </p>
                  </div>
                </div>
              </Card>
            </Link>

            <Link to="/help">
              <Card className="p-5 hover:border-primary/30 transition-base cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                    <HelpCircle className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <p className="font-medium group-hover:text-primary transition-base">
                      Help & Documentation
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Guides, tips, and legal docs
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
