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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSpreadsheet, FileText, Download, BookOpen, FileBarChart } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { formatCurrency } from '@/lib/formatters';
import { useViewMode } from '@/hooks/useViewMode';
import { generatePdfReport, type ReportFormat } from '@/lib/pdfReport';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  items: CostItem[];
  selectedItemIds?: string[];
  isAdmin?: boolean;
}

interface ExportOptions {
  includeDescription: boolean;
  includeTrade: boolean;
  includeQuantity: boolean;
  includeUnit: boolean;
  includeOriginalPrice: boolean;
  includeOriginalTotal: boolean;
  includeRecommendedPrice: boolean;
  includeRecommendedTotal: boolean;
  includeBenchmarks: boolean;
  includeVariance: boolean;
  includeStatus: boolean;
  includeAIComments: boolean;
  onlyFlagged: boolean;
  currencyFormat: 'symbol' | 'code' | 'none';
  pdfFormat: ReportFormat;
}

const DEFAULT_OPTIONS: ExportOptions = {
  includeDescription: true,
  includeTrade: true,
  includeQuantity: true,
  includeUnit: true,
  includeOriginalPrice: true,
  includeOriginalTotal: true,
  includeRecommendedPrice: true,
  includeRecommendedTotal: true,
  includeBenchmarks: false,
  includeVariance: true,
  includeStatus: true,
  includeAIComments: false,
  onlyFlagged: false,
  currencyFormat: 'code',
  pdfFormat: 'executive',
};

export function ExportDialog({ 
  open, 
  onClose, 
  project, 
  items,
  selectedItemIds,
  isAdmin = false,
}: ExportDialogProps) {
  const { showAsAdmin } = useViewMode();
  // Effective admin check: actual admin AND not in user preview mode
  const effectiveIsAdmin = isAdmin && showAsAdmin;
  
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS);
  const [isExporting, setIsExporting] = useState(false);
  // Default to PDF for non-admin users (or admin in user preview mode)
  const [exportType, setExportType] = useState<'excel' | 'pdf'>(effectiveIsAdmin ? 'excel' : 'pdf');

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

      if (exportType === 'excel') {
        await exportToExcel(exportItems, project, options);
      } else {
        await generatePdfReport(exportItems, project, {
          format: options.pdfFormat,
          includeDescription: options.includeDescription,
          includeTrade: options.includeTrade,
          includeQuantity: options.includeQuantity,
          includeUnit: options.includeUnit,
          includeOriginalPrice: options.includeOriginalPrice,
          includeOriginalTotal: options.includeOriginalTotal,
          includeRecommendedPrice: options.includeRecommendedPrice,
          includeRecommendedTotal: options.includeRecommendedTotal,
          includeVariance: options.includeVariance,
          includeStatus: options.includeStatus,
          onlyFlagged: options.onlyFlagged,
        });
        toast.success('PDF report exported successfully');
      }
      
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
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Report
          </DialogTitle>
          <DialogDescription>
            Generate a professional report of your cost analysis
          </DialogDescription>
        </DialogHeader>

        {/* Only show tabs for effective admin, regular users (or admin in preview) only get PDF */}
        {effectiveIsAdmin ? (
          <Tabs value={exportType} onValueChange={(v) => setExportType(v as 'excel' | 'pdf')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="excel" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </TabsTrigger>
              <TabsTrigger value="pdf" className="gap-2">
                <FileText className="h-4 w-4" />
                PDF
              </TabsTrigger>
            </TabsList>

            <TabsContent value="excel" className="space-y-4 mt-4">
              <div className="text-sm text-muted-foreground">
                Export to Excel with multiple sheets including Executive Summary, Cost Items, and Variance Analysis.
              </div>
            </TabsContent>

            <TabsContent value="pdf" className="space-y-4 mt-4">
              <div className="text-sm text-muted-foreground">
                Generate a professional PDF report suitable for client presentations with branded headers and formatted tables.
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-3 mt-4">
            <div className="text-sm text-muted-foreground">
              Generate a professional PDF report suitable for client presentations.
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Report Format</Label>
              <RadioGroup
                value={options.pdfFormat}
                onValueChange={(v) => updateOption('pdfFormat', v)}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="fmt-exec"
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${options.pdfFormat === 'executive' ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <RadioGroupItem value="executive" id="fmt-exec" className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      <BookOpen className="h-3.5 w-3.5" />
                      Executive Summary
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">2-3 pages with KPIs, charts, and risk matrix</p>
                  </div>
                </Label>
                <Label
                  htmlFor="fmt-full"
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${options.pdfFormat === 'full' ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <RadioGroupItem value="full" id="fmt-full" className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      <FileBarChart className="h-3.5 w-3.5" />
                      Full Report
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Complete with detailed tables and analysis</p>
                  </div>
                </Label>
              </RadioGroup>
            </div>
          </div>
        )}

        <div className="space-y-4 py-2 max-h-[300px] overflow-y-auto">
          {/* Columns to Include */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Columns to Include</Label>
            <div className="grid grid-cols-2 gap-2.5">
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
                <Label htmlFor="quantity" className="text-sm">Qty & Unit</Label>
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
                  id="originalTotal" 
                  checked={options.includeOriginalTotal}
                  onCheckedChange={(c) => updateOption('includeOriginalTotal', !!c)}
                />
                <Label htmlFor="originalTotal" className="text-sm">Original Total</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="recommendedPrice" 
                  checked={options.includeRecommendedPrice}
                  onCheckedChange={(c) => updateOption('includeRecommendedPrice', !!c)}
                />
                <Label htmlFor="recommendedPrice" className="text-sm">Rec. Price</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="recommendedTotal" 
                  checked={options.includeRecommendedTotal}
                  onCheckedChange={(c) => updateOption('includeRecommendedTotal', !!c)}
                />
                <Label htmlFor="recommendedTotal" className="text-sm">Rec. Total</Label>
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
              {exportType === 'excel' && (
                <>
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
                      id="aiComments" 
                      checked={options.includeAIComments}
                      onCheckedChange={(c) => updateOption('includeAIComments', !!c)}
                    />
                    <Label htmlFor="aiComments" className="text-sm">AI Comments</Label>
                  </div>
                </>
              )}
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

          {exportType === 'excel' && (
            <>
              <Separator />
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {exportType === 'excel' ? (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            {isExporting ? 'Exporting...' : `Export ${exportType === 'excel' ? 'Excel' : 'PDF'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== EXCEL EXPORT ====================

async function exportToExcel(items: CostItem[], project: Project, options: ExportOptions) {
  const wb = XLSX.utils.book_new();

  // Executive Summary Sheet
  const summaryData = createSummarySheet(project, items);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Executive Summary');

  // Cost Items Sheet
  const costItemsData = createCostItemsSheet(items, project.currency, options);
  const costItemsSheet = XLSX.utils.aoa_to_sheet(costItemsData);
  
  // Set column widths dynamically
  const colWidths = calculateColumnWidths(options, project.currency);
  costItemsSheet['!cols'] = colWidths;
  
  // Freeze header row and add auto-filter
  costItemsSheet['!freeze'] = { xSplit: 0, ySplit: 4 }; // After metadata rows
  const headerRowIndex = 3; // 0-indexed, row 4
  const lastCol = String.fromCharCode(64 + colWidths.length);
  costItemsSheet['!autofilter'] = { ref: `A${headerRowIndex + 1}:${lastCol}${headerRowIndex + 1 + items.length}` };
  
  XLSX.utils.book_append_sheet(wb, costItemsSheet, 'Cost Items');

  // Variance Analysis Sheet
  const varianceData = createVarianceSheet(items, project.currency);
  const varianceSheet = XLSX.utils.aoa_to_sheet(varianceData);
  varianceSheet['!cols'] = [{ wch: 45 }, { wch: 18 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, varianceSheet, 'Variance Analysis');

  // Generate filename and download
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `UnitRate_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`;
  XLSX.writeFile(wb, filename);
  
  toast.success('Excel report exported successfully');
}

function calculateColumnWidths(options: ExportOptions, currency: string): { wch: number }[] {
  const widths: { wch: number }[] = [];
  if (options.includeDescription) widths.push({ wch: 45 });
  if (options.includeTrade) widths.push({ wch: 18 });
  if (options.includeQuantity) widths.push({ wch: 12 });
  if (options.includeUnit) widths.push({ wch: 10 });
  if (options.includeOriginalPrice) widths.push({ wch: 16 });
  if (options.includeOriginalTotal) widths.push({ wch: 18 });
  if (options.includeRecommendedPrice) widths.push({ wch: 16 });
  if (options.includeRecommendedTotal) widths.push({ wch: 18 });
  if (options.includeBenchmarks) {
    widths.push({ wch: 14 }, { wch: 14 }, { wch: 14 });
  }
  if (options.includeVariance) widths.push({ wch: 12 });
  if (options.includeStatus) widths.push({ wch: 14 });
  if (options.includeAIComments) widths.push({ wch: 45 });
  return widths;
}

function createSummarySheet(project: Project, items: CostItem[]): (string | number)[][] {
  const totalOriginal = items.reduce((sum, i) => sum + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
  const totalRecommended = items.reduce((sum, i) => {
    const price = i.userOverridePrice || i.recommendedUnitPrice;
    return sum + (price ? price * i.quantity : 0);
  }, 0);
  const reviewCount = items.filter(i => i.status === 'review').length;
  const clarificationCount = items.filter(i => i.status === 'clarification').length;
  const okCount = items.filter(i => i.status === 'ok').length;
  
  const potentialSavings = items.reduce((sum, item) => {
    const recPrice = item.userOverridePrice || item.recommendedUnitPrice;
    if (item.originalUnitPrice && recPrice && item.originalUnitPrice > recPrice) {
      return sum + (item.originalUnitPrice - recPrice) * item.quantity;
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
    ['UNIT RATE - COST ANALYSIS REPORT', ''],
    ['', ''],
    ['PROJECT INFORMATION', ''],
    ['Project Name', project.name],
    ['Country', project.country],
    ['Currency', project.currency],
    ['Project Type', project.projectType],
    ['Report Generated', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
    ['', ''],
    ['KEY METRICS', ''],
    ['Total Items Analyzed', items.length],
    ['Total Original Value', `${project.currency} ${totalOriginal.toLocaleString('en-US', { minimumFractionDigits: 0 })}`],
    ['Total Recommended Value', `${project.currency} ${totalRecommended.toLocaleString('en-US', { minimumFractionDigits: 0 })}`],
    ['Potential Savings', `${project.currency} ${potentialSavings.toLocaleString('en-US', { minimumFractionDigits: 0 })}`],
    ['Average Variance', `${avgVariance.toFixed(1)}%`],
    ['', ''],
    ['STATUS BREAKDOWN', ''],
    ['Approved (OK)', okCount],
    ['Needs Review', reviewCount],
    ['Needs Clarification', clarificationCount],
    ['', ''],
    ['NOTES', ''],
    ['', project.notes || 'No additional notes'],
  ];
}

function createCostItemsSheet(items: CostItem[], currency: string, options: ExportOptions): (string | number)[][] {
  const rows: (string | number)[][] = [];
  
  // Add project metadata header
  rows.push(['COST ITEMS DETAIL', '']);
  rows.push(['Generated:', new Date().toLocaleDateString('en-GB')]);
  rows.push(['']);
  
  // Build header row
  const headers: string[] = [];
  if (options.includeDescription) headers.push('Description');
  if (options.includeTrade) headers.push('Trade');
  if (options.includeQuantity) headers.push('Qty');
  if (options.includeUnit) headers.push('Unit');
  if (options.includeOriginalPrice) headers.push(`Orig. Price (${currency})`);
  if (options.includeOriginalTotal) headers.push(`Orig. Total (${currency})`);
  if (options.includeRecommendedPrice) headers.push(`Rec. Price (${currency})`);
  if (options.includeRecommendedTotal) headers.push(`Rec. Total (${currency})`);
  if (options.includeBenchmarks) {
    headers.push(`BM Min (${currency})`, `BM Typical (${currency})`, `BM Max (${currency})`);
  }
  if (options.includeVariance) headers.push('Variance %');
  if (options.includeStatus) headers.push('Status');
  if (options.includeAIComments) headers.push('AI Comment');

  rows.push(headers);

  // Add data rows
  for (const item of items) {
    const row: (string | number)[] = [];
    const recPrice = item.userOverridePrice || item.recommendedUnitPrice;
    const origTotal = item.originalUnitPrice ? item.originalUnitPrice * item.quantity : null;
    const recTotal = recPrice ? recPrice * item.quantity : null;
    
    if (options.includeDescription) row.push(item.originalDescription);
    if (options.includeTrade) row.push(item.trade || '');
    if (options.includeQuantity) row.push(item.quantity);
    if (options.includeUnit) row.push(item.unit);
    if (options.includeOriginalPrice) row.push(item.originalUnitPrice || '');
    if (options.includeOriginalTotal) row.push(origTotal || '');
    if (options.includeRecommendedPrice) row.push(recPrice || '');
    if (options.includeRecommendedTotal) row.push(recTotal || '');
    if (options.includeBenchmarks) {
      row.push(item.benchmarkMin || '', item.benchmarkTypical || '', item.benchmarkMax || '');
    }
    if (options.includeVariance) {
      if (item.originalUnitPrice && item.benchmarkTypical) {
        const variance = ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100;
        row.push(`${variance.toFixed(1)}%`);
      } else {
        row.push('');
      }
    }
    if (options.includeStatus) row.push(item.status.toUpperCase());
    if (options.includeAIComments) row.push(item.aiComment || '');

    rows.push(row);
  }

  // Add totals row
  const totalsRow: (string | number)[] = [];
  let colIdx = 0;
  
  if (options.includeDescription) { totalsRow.push('TOTALS'); colIdx++; }
  if (options.includeTrade) { totalsRow.push(''); colIdx++; }
  if (options.includeQuantity) { 
    totalsRow.push(items.reduce((sum, i) => sum + i.quantity, 0)); 
    colIdx++; 
  }
  if (options.includeUnit) { totalsRow.push(''); colIdx++; }
  if (options.includeOriginalPrice) { totalsRow.push(''); colIdx++; }
  if (options.includeOriginalTotal) { 
    const total = items.reduce((sum, i) => sum + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
    totalsRow.push(total); 
    colIdx++; 
  }
  if (options.includeRecommendedPrice) { totalsRow.push(''); colIdx++; }
  if (options.includeRecommendedTotal) { 
    const total = items.reduce((sum, i) => {
      const price = i.userOverridePrice || i.recommendedUnitPrice;
      return sum + (price ? price * i.quantity : 0);
    }, 0);
    totalsRow.push(total); 
    colIdx++; 
  }
  if (options.includeBenchmarks) { totalsRow.push('', '', ''); colIdx += 3; }
  if (options.includeVariance) { totalsRow.push(''); colIdx++; }
  if (options.includeStatus) { totalsRow.push(''); colIdx++; }
  if (options.includeAIComments) { totalsRow.push(''); colIdx++; }

  rows.push(totalsRow);

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
    ['Items sorted by absolute variance value', '', '', ''],
    [''],
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