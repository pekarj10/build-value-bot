import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import {
  FilePlus,
  Pencil,
  RefreshCw,
  DollarSign,
  StickyNote,
  Trash2,
  RotateCcw,
  Activity,
} from 'lucide-react';

interface ActivityItem {
  id: string;
  change_type: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  item_description: string;
  project_id: string;
  project_name: string;
}

const CHANGE_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  create: { label: 'Item added', icon: FilePlus, color: 'text-success' },
  update: { label: 'Item updated', icon: Pencil, color: 'text-foreground' },
  status_change: { label: 'Status changed', icon: RefreshCw, color: 'text-primary' },
  price_override: { label: 'Price overridden', icon: DollarSign, color: 'text-warning' },
  note_added: { label: 'Note added', icon: StickyNote, color: 'text-foreground' },
  delete: { label: 'Item deleted', icon: Trash2, color: 'text-destructive' },
  restore: { label: 'Item restored', icon: RotateCcw, color: 'text-success' },
};

function ActivityIcon({ changeType }: { changeType: string }) {
  const config = CHANGE_TYPE_CONFIG[changeType] ?? {
    label: 'Changed',
    icon: Activity,
    color: 'text-muted-foreground',
  };
  const Icon = config.icon;
  return (
    <div className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center flex-shrink-0">
      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
    </div>
  );
}

function activityLabel(item: ActivityItem): string {
  const config = CHANGE_TYPE_CONFIG[item.change_type];
  const base = config?.label ?? 'Changed';
  if (item.change_type === 'status_change' && item.new_value) {
    return `${base} → ${item.new_value}`;
  }
  if (item.change_type === 'price_override' && item.new_value) {
    const val = parseFloat(item.new_value);
    return `${base}: ${isNaN(val) ? item.new_value : val.toLocaleString()}`;
  }
  return base;
}

export function RecentActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('cost_item_mutations')
        .select(
          `id, change_type, field_name, old_value, new_value, created_at,
           cost_items!inner(
             original_description,
             projects!inner(id, name)
           )`
        )
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        const mapped: ActivityItem[] = data.map((row: any) => ({
          id: row.id,
          change_type: row.change_type,
          field_name: row.field_name,
          old_value: row.old_value,
          new_value: row.new_value,
          created_at: row.created_at,
          item_description: row.cost_items?.original_description ?? 'Unknown item',
          project_id: row.cost_items?.projects?.id ?? '',
          project_name: row.cost_items?.projects?.name ?? 'Unknown project',
        }));
        setActivities(mapped);
      }
      setIsLoading(false);
    };
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No activity yet — changes to your cost items will appear here.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {activities.map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <ActivityIcon changeType={item.change_type} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{activityLabel(item)}</p>
            <p className="text-xs text-muted-foreground truncate">
              <Link
                to={`/project/${item.project_id}`}
                className="hover:text-primary transition-colors"
              >
                {item.project_name}
              </Link>
              {' · '}
              {item.item_description.length > 40
                ? item.item_description.slice(0, 40) + '…'
                : item.item_description}
            </p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}
