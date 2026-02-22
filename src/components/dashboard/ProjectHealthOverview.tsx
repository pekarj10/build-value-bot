import { Project } from '@/types/project';
import { CheckCircle2, Clock, AlertTriangle, FileSearch, Loader2 } from 'lucide-react';

interface ProjectHealthOverviewProps {
  projects: Project[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/15' },
  processing: { label: 'Processing', icon: Loader2, color: 'text-primary', bg: 'bg-primary/15' },
  draft: { label: 'Draft', icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
  review: { label: 'In Review', icon: FileSearch, color: 'text-warning', bg: 'bg-warning/15' },
};

export function ProjectHealthOverview({ projects }: ProjectHealthOverviewProps) {
  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Create a project to see its health overview here.
      </p>
    );
  }

  // Count projects by status
  const statusCounts: Record<string, number> = {};
  projects.forEach((p) => {
    const s = p.status || 'draft';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const total = projects.length;
  const flaggedItems = projects.reduce((sum, p) => sum + (p.issuesCount || 0), 0);

  // Build ordered segments for the bar
  const orderedStatuses = ['ready', 'review', 'processing', 'draft'];
  const segments = orderedStatuses
    .filter((s) => statusCounts[s])
    .map((s) => ({
      status: s,
      count: statusCounts[s],
      pct: Math.round((statusCounts[s] / total) * 100),
      ...STATUS_CONFIG[s],
    }));

  // Include unknown statuses
  Object.keys(statusCounts).forEach((s) => {
    if (!orderedStatuses.includes(s)) {
      segments.push({
        status: s,
        count: statusCounts[s],
        pct: Math.round((statusCounts[s] / total) * 100),
        label: s.charAt(0).toUpperCase() + s.slice(1),
        icon: Clock,
        color: 'text-muted-foreground',
        bg: 'bg-muted',
      });
    }
  });

  return (
    <div className="space-y-5">
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {segments.map((seg) => (
          <div
            key={seg.status}
            className={`${seg.bg} transition-all`}
            style={{ width: `${Math.max(seg.pct, 4)}%` }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {segments.map((seg) => {
          const Icon = seg.icon;
          return (
            <div key={seg.status} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-md ${seg.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`h-3.5 w-3.5 ${seg.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{seg.count}</p>
                <p className="text-xs text-muted-foreground truncate">{seg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Flagged items callout */}
      {flaggedItems > 0 && (
        <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
          <span>
            <span className="font-medium">{flaggedItems} item{flaggedItems !== 1 ? 's' : ''}</span>
            {' '}flagged across your projects
          </span>
        </div>
      )}
    </div>
  );
}
