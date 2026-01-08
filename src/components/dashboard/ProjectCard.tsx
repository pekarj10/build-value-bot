import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Project, PROJECT_TYPE_LABELS, SUPPORTED_COUNTRIES } from '@/types/project';
import { Calendar, MapPin, FileText, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const country = SUPPORTED_COUNTRIES.find(c => c.code === project.country);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: project.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Link to={`/project/${project.id}`}>
      <Card className="p-5 hover:border-primary/30 transition-base cursor-pointer group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-base truncate">
              {project.name}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {PROJECT_TYPE_LABELS[project.projectType]}
            </p>
          </div>
          <StatusBadge status={project.status} />
        </div>
        
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            <span>{country?.name || project.country}</span>
            <span className="text-border">•</span>
            <span>{project.currency}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>Updated {formatDistanceToNow(project.updatedAt, { addSuffix: true })}</span>
          </div>
        </div>
        
        {project.status === 'ready' && (
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{project.totalItems} items</span>
              </div>
              {project.issuesCount && project.issuesCount > 0 && (
                <div className="flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{project.issuesCount} issues</span>
                </div>
              )}
            </div>
            {project.totalValue && (
              <span className="font-medium text-foreground">
                {formatCurrency(project.totalValue)}
              </span>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}
