import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface MultiSelectProps {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  };

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('min-w-[140px] justify-between', className)}
        >
          <div className="flex items-center gap-1 flex-1 overflow-hidden">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : selected.length <= 2 ? (
              <div className="flex items-center gap-1">
                {selectedLabels.map((label, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="px-1.5 py-0 text-xs"
                  >
                    {label}
                    <button
                      className="ml-1 hover:text-destructive"
                      onClick={(e) => handleRemove(selected[i], e)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {selected.length} selected
              </Badge>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-2" align="start">
        <div className="space-y-1 max-h-[240px] overflow-auto">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'flex items-center w-full gap-2 px-2 py-1.5 rounded-sm text-sm hover:bg-accent',
                selected.includes(option.value) && 'bg-accent'
              )}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                  selected.includes(option.value)
                    ? 'bg-primary text-primary-foreground'
                    : 'opacity-50'
                )}
              >
                {selected.includes(option.value) && (
                  <Check className="h-3 w-3" />
                )}
              </div>
              {option.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
