import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Bot, MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIChatPanel } from './AIChatPanel';
import { CostItem, Project } from '@/types/project';

interface AIFloatingButtonProps {
  project: Project;
  items: CostItem[];
  onItemsUpdate: (updates: { id: string; updates: Partial<CostItem> }[]) => void;
}

export function AIFloatingButton({ project, items, onItemsUpdate }: AIFloatingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const clarificationCount = items.filter(i => i.status === 'clarification').length;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className={cn(
            "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg",
            "hover:scale-105 transition-transform",
            "bg-primary hover:bg-primary/90"
          )}
        >
          <Bot className="h-6 w-6" />
          {clarificationCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center font-medium">
              {clarificationCount > 9 ? '9+' : clarificationCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[450px] sm:w-[500px] p-0">
        <AIChatPanel 
          project={project}
          items={items}
          onItemsUpdate={onItemsUpdate}
          className="h-full rounded-none border-0"
        />
      </SheetContent>
    </Sheet>
  );
}
