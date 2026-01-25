import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Upload, Filter } from 'lucide-react';

interface EmptyStateProps {
  type: 'no-items' | 'no-results';
  onClearFilters?: () => void;
  onUpload?: () => void;
  onAddItem?: () => void;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState({ type, onClearFilters, onUpload, onAddItem }, ref) {
    if (type === 'no-results') {
      return (
        <div ref={ref} className="p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
            <Filter className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">No items match your filters</h3>
          <p className="text-muted-foreground mt-1 max-w-md mx-auto">
            Try adjusting your search criteria or clearing some filters to see more results.
          </p>
          {onClearFilters && (
            <Button variant="outline" className="mt-4" onClick={onClearFilters}>
              Clear All Filters
            </Button>
          )}
        </div>
      );
    }

    return (
      <div ref={ref} className="p-12 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg">No cost items yet</h3>
        <p className="text-muted-foreground mt-1 max-w-md mx-auto">
          Upload a cost estimate spreadsheet to start analyzing your project costs with AI-powered insights.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button onClick={onUpload}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Spreadsheet
          </Button>
          <Button variant="outline" onClick={onAddItem}>
            Add Items Manually
          </Button>
        </div>
      </div>
    );
  }
);
