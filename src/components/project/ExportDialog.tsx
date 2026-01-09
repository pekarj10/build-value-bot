import { useState } from 'react';
import { CostItem, Project } from '@/types/project';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { FileSpreadsheet, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { formatCurrency } from '@/lib/formatters';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  items: CostItem[];
  selectedItemIds?: string[];
}

interface ExportOptions {
  includeDescription: boolean;
  includeTrade: boolean;
  includeQuantity: boolean;
  includeUnit: boolean;
  includeOriginalPrice: boolean;
  includeRecommendedPrice: boolean;
  includeBenchmarks: boolean;
  includeVariance: boolean;
  includeStatus: boolean;
  includeAIComments: boolean;
  onlyFlagged: boolean;
  currencyFormat: 'symbol' | 'code' | 'none';
}

const DEFAULT_OPTIONS: ExportOptions = {
  includeDescription: true,
  includeTrade: true,
  includeQuantity: true,
  includeUnit: true,
  includeOriginalPrice: true,
  includeRecommendedPrice: true,
  includeBenchmarks: true,
  includeVariance: true,
  includeStatus: true,
  includeAIComments: false,
  onlyFlagged: false,
  currencyFormat: 'code',
};

export function ExportDialog({ 
  open, 
  onClose, 
  project, 
  items,
  selectedItemIds,
}: ExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // Filter items
      let exportItems = selectedItemIds 
        ? items.filter(i => selectedItemIds.includes(i.id))
        : items;
      
      if (options.onlyFlagged) {
        exportItems = exportItems.filter(i => i.status === 'review' || i.status === 'clarification');
      }

      // Create workbook
      const wb = XLSX.utils.book_new();

      // === Executive Summary Sheet ===
      const summaryData = createSummarySheet(project, exportItems, options);
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Style summary sheet
      summarySheet['!cols'] = [{ wch: 25 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Executive Summary');

      // === Cost Items Sheet ===
      const costItemsData = createCostItemsSheet(exportItems, project.currency, options);
      const costItemsSheet = XLSX.utils.aoa_to_sheet(costItemsData);
      
      // Set column widths
      const colWidths = [
        { wch: 40 }, // Description
        { wch: 15 }, // Trade
        { wch: 10 }, // Qty
        { wch: 8 },  // Unit
        { wch: 15 }, // Original Price
        { wch: 15 }, // Recommended Price
        { wch: 12 }, // Benchmark Min
        { wch: 12 }, // Benchmark Typical
        { wch: 12 }, // Benchmark Max
        { wch: 12 }, // Variance %
        { wch: 15 }, // Total
        { wch: 12 }, // Status
        { wch: 40 }, // AI Comment
      ].filter((_, i) => shouldIncludeColumn(i, options));
      
      costItemsSheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, costItemsSheet, 'Cost Items');

      // === Variance Analysis Sheet ===
      const varianceData = createVarianceSheet(exportItems, project.currency);
      const varianceSheet = XLSX.utils.aoa_to_sheet(varianceData);
      varianceSheet['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 12 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, varianceSheet, 'Variance Analysis');

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_Cost_Report_${timestamp}.xlsx`;

      // Download
      XLSX.writeFile(wb, filename);
      
      toast.success('Excel report exported successfully');
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export report');
    } finally {
      setIsExporting(false);
    }
  };

  const updateOption = (key: keyof ExportOptions, value: boolean | string) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Export to Excel
          </DialogTitle>
          <DialogDescription>
            Configure your export options. The report will include an Executive Summary, 
            Cost Items, and Variance Analysis sheets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 max-h-[400px] overflow-y-auto">
          {/* Columns to Include */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Columns to Include</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="description" 
                  checked={options.includeDescription}
                  onCheckedChange={(c) => updateOption('includeDescription', !!c)}
                />
                <Label htmlFor="description" className="text-sm">Description</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="trade" 
                  checked={options.includeTrade}
                  onCheckedChange={(c) => updateOption('includeTrade', !!c)}
                />
                <Label htmlFor="trade" className="text-sm">Trade</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="quantity" 
                  checked={options.includeQuantity}
                  onCheckedChange={(c) => updateOption('includeQuantity', !!c)}
                />
                <Label htmlFor="quantity" className="text-sm">Quantity & Unit</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="originalPrice" 
                  checked={options.includeOriginalPrice}
                  onCheckedChange={(c) => updateOption('includeOriginalPrice', !!c)}
                />
                <Label htmlFor="originalPrice" className="text-sm">Original Price</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="recommendedPrice" 
                  checked={options.includeRecommendedPrice}
                  onCheckedChange={(c) => updateOption('includeRecommendedPrice', !!c)}
                />
                <Label htmlFor="recommendedPrice" className="text-sm">Recommended Price</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="benchmarks" 
                  checked={options.includeBenchmarks}
                  onCheckedChange={(c) => updateOption('includeBenchmarks', !!c)}
                />
                <Label htmlFor="benchmarks" className="text-sm">Benchmarks</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="variance" 
                  checked={options.includeVariance}
                  onCheckedChange={(c) => updateOption('includeVariance', !!c)}
                />
                <Label htmlFor="variance" className="text-sm">Variance %</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="status" 
                  checked={options.includeStatus}
                  onCheckedChange={(c) => updateOption('includeStatus', !!c)}
                />
                <Label htmlFor="status" className="text-sm">Status</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="aiComments" 
                  checked={options.includeAIComments}
                  onCheckedChange={(c) => updateOption('includeAIComments', !!c)}
                />
                <Label htmlFor="aiComments" className="text-sm">AI Comments</Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Filter Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Filter Options</Label>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="onlyFlagged" 
                checked={options.onlyFlagged}
                onCheckedChange={(c) => updateOption('onlyFlagged', !!c)}
              />
              <Label htmlFor="onlyFlagged" className="text-sm">
                Include only flagged items (Review & Clarification)
              </Label>
            </div>
            {selectedItemIds && selectedItemIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedItemIds.length} items selected for export
              </p>
            )}
          </div>

          <Separator />

          {/* Currency Format */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Currency Format</Label>
            <RadioGroup 
              value={options.currencyFormat} 
              onValueChange={(v) => updateOption('currencyFormat', v)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="code" id="code" />
                <Label htmlFor="code" className="text-sm">Code ({project.currency})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="symbol" id="symbol" />
                <Label htmlFor="symbol" className="text-sm">Symbol</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="none" id="none" />
                <Label htmlFor="none" className="text-sm">Numbers Only</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function shouldIncludeColumn(index: number, options: ExportOptions): boolean {
  const columns = [
    options.includeDescription,
    options.includeTrade,
    options.includeQuantity,
    options.includeUnit,
    options.includeOriginalPrice,
    options.includeRecommendedPrice,
    options.includeBenchmarks,
    options.includeBenchmarks,
    options.includeBenchmarks,
    options.includeVariance,
    true, // Total always included
    options.includeStatus,
    options.includeAIComments,
  ];
  return columns[index] ?? true;
}

function createSummarySheet(project: Project, items: CostItem[], options: ExportOptions): (string | number)[][] {
  const totalValue = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
  const reviewCount = items.filter(i => i.status === 'review').length;
  const clarificationCount = items.filter(i => i.status === 'clarification').length;
  const okCount = items.filter(i => i.status === 'ok').length;
  
  const potentialSavings = items.reduce((sum, item) => {
    if (item.originalUnitPrice && item.benchmarkTypical && item.originalUnitPrice > item.benchmarkTypical) {
      return sum + (item.originalUnitPrice - item.benchmarkTypical) * item.quantity;
    }
    return sum;
  }, 0);

  const underpricedRisk = items.reduce((sum, item) => {
    if (item.originalUnitPrice && item.benchmarkMin && item.originalUnitPrice < item.benchmarkMin) {
      return sum + (item.benchmarkMin - item.originalUnitPrice) * item.quantity;
    }
    return sum;
  }, 0);

  const itemsWithVariance = items.filter(i => i.originalUnitPrice && i.benchmarkTypical);
  const avgVariance = itemsWithVariance.length > 0
    ? itemsWithVariance.reduce((sum, i) => {
        return sum + ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100;
      }, 0) / itemsWithVariance.length
    : 0;

  return [
    ['COST INSIGHT AI - EXECUTIVE SUMMARY', ''],
    ['', ''],
    ['PROJECT INFORMATION', ''],
    ['Project Name', project.name],
    ['Country', project.country],
    ['Currency', project.currency],
    ['Project Type', project.projectType],
    ['Report Date', new Date().toLocaleDateString('sv-SE')],
    ['', ''],
    ['KEY METRICS', ''],
    ['Total Items Analyzed', items.length],
    ['Total Estimated Value', `${formatCurrency(totalValue, project.currency)} ${project.currency}`],
    ['', ''],
    ['STATUS BREAKDOWN', ''],
    ['Approved Items', okCount],
    ['Items Needing Review', reviewCount],
    ['Items Needing Clarification', clarificationCount],
    ['', ''],
    ['COST ANALYSIS', ''],
    ['Potential Savings (Overpriced Items)', `${formatCurrency(potentialSavings, project.currency)} ${project.currency}`],
    ['Underpriced Risk', `${formatCurrency(underpricedRisk, project.currency)} ${project.currency}`],
    ['Average Variance from Benchmark', `${avgVariance.toFixed(1)}%`],
    ['', ''],
    ['NOTES', ''],
    ['', project.notes || 'No additional notes'],
  ];
}

function createCostItemsSheet(items: CostItem[], currency: string, options: ExportOptions): (string | number)[][] {
  // Build header row based on options
  const headers: string[] = [];
  if (options.includeDescription) headers.push('Description');
  if (options.includeTrade) headers.push('Trade');
  if (options.includeQuantity) headers.push('Quantity');
  if (options.includeUnit) headers.push('Unit');
  if (options.includeOriginalPrice) headers.push(`Original Price (${currency})`);
  if (options.includeRecommendedPrice) headers.push(`Recommended Price (${currency})`);
  if (options.includeBenchmarks) {
    headers.push(`Benchmark Min (${currency})`);
    headers.push(`Benchmark Typical (${currency})`);
    headers.push(`Benchmark Max (${currency})`);
  }
  if (options.includeVariance) headers.push('Variance %');
  headers.push(`Total (${currency})`);
  if (options.includeStatus) headers.push('Status');
  if (options.includeAIComments) headers.push('AI Comment');

  const rows: (string | number)[][] = [headers];

  for (const item of items) {
    const row: (string | number)[] = [];
    
    if (options.includeDescription) row.push(item.originalDescription);
    if (options.includeTrade) row.push(item.trade || '');
    if (options.includeQuantity) row.push(item.quantity);
    if (options.includeUnit) row.push(item.unit);
    if (options.includeOriginalPrice) row.push(item.originalUnitPrice || '');
    if (options.includeRecommendedPrice) row.push(item.userOverridePrice || item.recommendedUnitPrice || '');
    if (options.includeBenchmarks) {
      row.push(item.benchmarkMin || '');
      row.push(item.benchmarkTypical || '');
      row.push(item.benchmarkMax || '');
    }
    if (options.includeVariance) {
      if (item.originalUnitPrice && item.benchmarkTypical) {
        const variance = ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100;
        row.push(`${variance.toFixed(1)}%`);
      } else {
        row.push('');
      }
    }
    row.push(item.totalPrice || 0);
    if (options.includeStatus) row.push(item.status.toUpperCase());
    if (options.includeAIComments) row.push(item.aiComment || '');

    rows.push(row);
  }

  // Add totals row
  const totalRow: (string | number)[] = [];
  let colIndex = 0;
  if (options.includeDescription) { totalRow.push('TOTALS'); colIndex++; }
  else totalRow.push('TOTALS');
  
  // Fill empty cells
  const numCols = headers.length;
  while (totalRow.length < numCols - 1) {
    if (totalRow.length === headers.indexOf(`Total (${currency})`)) {
      const total = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
      totalRow.push(total);
    } else {
      totalRow.push('');
    }
  }
  
  // Ensure total is in the right column
  const totalColIndex = headers.indexOf(`Total (${currency})`);
  if (totalColIndex >= 0) {
    while (totalRow.length <= totalColIndex) totalRow.push('');
    totalRow[totalColIndex] = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
  }
  
  while (totalRow.length < numCols) totalRow.push('');
  rows.push(totalRow);

  return rows;
}

function createVarianceSheet(items: CostItem[], currency: string): (string | number)[][] {
  const varianceItems = items
    .filter(i => i.originalUnitPrice && i.benchmarkTypical)
    .map(i => ({
      description: i.originalDescription,
      trade: i.trade || '',
      variance: ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100,
      varianceValue: (i.originalUnitPrice! - i.benchmarkTypical!) * i.quantity,
    }))
    .sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue));

  const rows: (string | number)[][] = [
    ['VARIANCE ANALYSIS', '', '', ''],
    ['', '', '', ''],
    ['Description', 'Trade', 'Variance %', `Variance Value (${currency})`],
  ];

  for (const item of varianceItems) {
    rows.push([
      item.description,
      item.trade,
      `${item.variance.toFixed(1)}%`,
      item.varianceValue,
    ]);
  }

  return rows;
}
