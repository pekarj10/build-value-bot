import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertCircle, 
  CheckCircle2, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  Clock,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostItem } from '@/types/project';
import { format } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ClarificationsListProps {
  items: CostItem[];
  onUpdateClarification: (itemId: string, clarification: string) => Promise<void>;
  onResolveClarification: (itemId: string) => Promise<void>;
  onDeleteClarification: (itemId: string) => Promise<void>;
}

interface ClarificationGroup {
  category: string;
  items: CostItem[];
}

export function ClarificationsList({ 
  items, 
  onUpdateClarification, 
  onResolveClarification,
  onDeleteClarification 
}: ClarificationsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['All']));
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter items that need clarification
  const clarificationItems = items.filter(i => i.status === 'clarification');

  // Group by trade/category
  const groupedItems: ClarificationGroup[] = clarificationItems.reduce((groups, item) => {
    const category = item.trade || 'Uncategorized';
    const existing = groups.find(g => g.category === category);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ category, items: [item] });
    }
    return groups;
  }, [] as ClarificationGroup[]);

  // Sort groups alphabetically
  groupedItems.sort((a, b) => a.category.localeCompare(b.category));

  const handleEdit = (item: CostItem) => {
    setEditingId(item.id);
    setEditText(item.userClarification || item.matchReasoning || '');
  };

  const handleSave = async (itemId: string) => {
    setIsUpdating(true);
    try {
      await onUpdateClarification(itemId, editText);
      setEditingId(null);
      setEditText('');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleResolve = async (itemId: string) => {
    setIsUpdating(true);
    try {
      await onResolveClarification(itemId);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    setIsUpdating(true);
    try {
      await onDeleteClarification(itemId);
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleGroup = (category: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedGroups(newExpanded);
  };

  if (clarificationItems.length === 0) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="h-12 w-12 mx-auto text-success mb-3" />
        <h3 className="font-semibold text-lg">All Clear!</h3>
        <p className="text-muted-foreground text-sm mt-1">
          No items currently need clarification.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            <h3 className="font-semibold">Items Needing Clarification</h3>
          </div>
          <Badge variant="secondary">
            {clarificationItems.length} item{clarificationItems.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      <ScrollArea className="max-h-[400px]">
        <div className="p-4 space-y-3">
          {groupedItems.map((group) => (
            <Collapsible
              key={group.category}
              open={expandedGroups.has(group.category)}
              onOpenChange={() => toggleGroup(group.category)}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between px-3 py-2 h-auto"
                >
                  <div className="flex items-center gap-2">
                    {expandedGroups.has(group.category) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{group.category}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {group.items.length}
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 space-y-2 mt-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "p-3 rounded-lg border bg-card",
                      editingId === item.id && "ring-2 ring-primary"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.originalDescription}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{item.quantity} {item.unit}</span>
                          <span className="text-border">•</span>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Pending</span>
                          </div>
                        </div>
                      </div>
                      {editingId !== item.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEdit(item)}
                            disabled={isUpdating}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-success hover:text-success"
                            onClick={() => handleResolve(item.id)}
                            disabled={isUpdating}
                            title="Mark as resolved"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item.id)}
                            disabled={isUpdating}
                            title="Remove clarification status"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Clarification Text */}
                    {editingId === item.id ? (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          placeholder="Add clarification notes..."
                          rows={3}
                          className="text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancel}
                            disabled={isUpdating}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSave(item.id)}
                            disabled={isUpdating}
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        {item.clarificationQuestion && (
                          <div className="text-xs bg-warning/10 text-warning-foreground p-2 rounded border border-warning/20 mb-2">
                            <strong>AI Question:</strong> {item.clarificationQuestion}
                          </div>
                        )}
                        {item.matchReasoning && (
                          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                            {item.matchReasoning}
                          </p>
                        )}
                        {item.userClarification && (
                          <div className="text-xs bg-primary/5 p-2 rounded mt-2 border border-primary/20">
                            <strong>User Note:</strong> {item.userClarification}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
