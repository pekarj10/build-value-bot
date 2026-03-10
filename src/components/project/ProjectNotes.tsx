import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Heading1, 
  Heading2,
  CheckSquare,
  Minus,
  Save,
  Clock,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ProjectNotesProps {
  projectId: string;
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
  lastUpdated?: Date;
}

export function ProjectNotes({ projectId, initialNotes, onSave, lastUpdated }: ProjectNotesProps) {
  const [notes, setNotes] = useState(initialNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(lastUpdated || null);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save every 5 seconds when there are changes
  const autoSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    
    setIsSaving(true);
    try {
      await onSave(notes);
      setHasUnsavedChanges(false);
      setLastSavedAt(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast.error('Failed to save notes');
    } finally {
      setIsSaving(false);
    }
  }, [notes, hasUnsavedChanges, onSave]);

  useEffect(() => {
    if (hasUnsavedChanges) {
      saveTimeoutRef.current = setTimeout(autoSave, 5000);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, autoSave]);

  // Update notes when initialNotes changes
  useEffect(() => {
    setNotes(initialNotes || '');
  }, [initialNotes]);

  const handleInput = () => {
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      setNotes(content);
      setHasUnsavedChanges(true);
    }
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertHeading = (level: 1 | 2) => {
    execCommand('formatBlock', level === 1 ? 'h2' : 'h3');
  };

  const insertBulletList = () => {
    execCommand('insertUnorderedList');
  };

  const insertNumberedList = () => {
    execCommand('insertOrderedList');
  };

  const insertCheckbox = () => {
    const checkbox = '☐ ';
    execCommand('insertText', checkbox);
  };

  const insertDivider = () => {
    execCommand('insertHorizontalRule');
  };

  const handleManualSave = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setIsSaving(true);
    try {
      await onSave(notes);
      setHasUnsavedChanges(false);
      setLastSavedAt(new Date());
      toast.success('Notes saved');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save notes');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle @mentions and [[links]]
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        execCommand('bold');
      } else if (e.key === 'i') {
        e.preventDefault();
        execCommand('italic');
      } else if (e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => execCommand('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => execCommand('italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => insertHeading(1)}
            title="Heading 1"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => insertHeading(2)}
            title="Heading 2"
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={insertBulletList}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={insertNumberedList}
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={insertCheckbox}
            title="Checkbox"
          >
            <CheckSquare className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={insertDivider}
            title="Divider"
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {lastSavedAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Saved {format(lastSavedAt, 'h:mm a')}</span>
            </div>
          )}
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-xs">
              Unsaved changes
            </Badge>
          )}
          <Button
            size="sm"
            onClick={handleManualSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        className={cn(
          "min-h-[400px] p-6 prose prose-sm dark:prose-invert max-w-none",
          "focus:outline-none focus:ring-0",
          "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2",
          "[&_h3]:text-base [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1",
          "[&_ul]:list-disc [&_ul]:ml-4",
          "[&_ol]:list-decimal [&_ol]:ml-4",
          "[&_hr]:my-4 [&_hr]:border-border",
          "placeholder:text-muted-foreground"
        )}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{ __html: notes }}
        data-placeholder="Start typing your project notes here... Use @item to reference cost items or [[Cost Items]] to link to tabs."
        suppressContentEditableWarning
      />

      {/* Footer with tips */}
      <div className="p-3 border-t bg-muted/20 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>Use @item-name to reference cost items</span>
          </div>
          <span className="text-border">•</span>
          <span>[[Cost Items]] to link to tabs</span>
          <span className="text-border">•</span>
          <span>Auto-saves every 5 seconds</span>
        </div>
      </div>
    </Card>
  );
}
