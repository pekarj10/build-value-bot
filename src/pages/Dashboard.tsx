import { Link } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { mockProjects } from '@/data/mockData';
import { Plus, TrendingUp, FileText, AlertTriangle, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const totalProjects = mockProjects.length;
  const readyProjects = mockProjects.filter(p => p.status === 'ready').length;
  const totalItems = mockProjects.reduce((sum, p) => sum + (p.totalItems || 0), 0);
  const totalIssues = mockProjects.reduce((sum, p) => sum + (p.issuesCount || 0), 0);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            trend="neutral"
            description="Requiring attention"
          />
          <MetricCard
            title="Analysis Accuracy"
            value="94%"
            trend="down"
            description="Based on user feedback"
          />
        </div>

        {/* Recent projects */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            <Link to="/projects">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockProjects.slice(0, 3).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
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

            <Card className="p-5 hover:border-primary/30 transition-base cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="font-medium group-hover:text-primary transition-base">
                    Review Flagged Items
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {totalIssues} items need attention
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-5 hover:border-primary/30 transition-base cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium group-hover:text-primary transition-base">
                    Export Reports
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Generate summary documents
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
