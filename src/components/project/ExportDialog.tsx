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
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '@/lib/formatters';
import { useViewMode } from '@/hooks/useViewMode';
import { renderChartToDataUrl } from '@/lib/pdfCharts';

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
        await exportToPDF(exportItems, project, options);
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
          <div className="text-sm text-muted-foreground mt-4">
            Generate a professional PDF report suitable for client presentations with branded headers and formatted tables.
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

// ==================== PDF EXPORT ====================

async function exportToPDF(items: CostItem[], project: Project, options: ExportOptions) {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Colors
  const primaryColor: [number, number, number] = [30, 58, 95]; // Navy blue
  const headerBg: [number, number, number] = [240, 244, 248];
  const borderColor: [number, number, number] = [200, 210, 220];

  // Helper function
  const addPageHeader = () => {
    // Header bar
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 18, 'F');
    
    // Logo text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Unit Rate', margin, 12);
    
    // Tagline
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Construction Cost Analysis', margin + 28, 12);
    
    // Date
    doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), pageWidth - margin, 12, { align: 'right' });
    
    return 25;
  };

  const addPageFooter = (pageNum: number) => {
    doc.setFillColor(...borderColor);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
    doc.text(`Generated by Unit Rate`, margin, pageHeight - 4);
    doc.text(project.name, pageWidth - margin, pageHeight - 4, { align: 'right' });
  };

  // Page 1: Cover + Executive Summary
  yPos = addPageHeader();
  
  // Project Title
  doc.setTextColor(...primaryColor);
  // Keep page 1 compact so the full executive summary fits on one page.
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Cost Analysis Report', margin, yPos + 10);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(project.name, margin, yPos + 20);
  
  yPos += 24;

  // Project Info Box
  doc.setFillColor(...headerBg);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 18, 3, 3, 'F');
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  
  const infoY = yPos + 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Country:', margin + 5, infoY);
  doc.text('Currency:', margin + 70, infoY);
  doc.text('Type:', margin + 135, infoY);
  doc.text('Items:', margin + 200, infoY);
  
  doc.setFont('helvetica', 'normal');
  doc.text(project.country, margin + 5, infoY + 7);
  doc.text(project.currency, margin + 70, infoY + 7);
  doc.text(project.projectType, margin + 135, infoY + 7);
  doc.text(String(items.length), margin + 200, infoY + 7);
  
  yPos += 24;

  // Calculate metrics (match in-app dashboard/detail estimate logic)
  const getEstimatedUnitPrice = (item: CostItem) => item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice;
  const totalOriginal = items.reduce((sum, i) => sum + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
  const totalEstimated = items.reduce((sum, i) => {
    const price = getEstimatedUnitPrice(i);
    return sum + (price != null ? price * i.quantity : 0);
  }, 0);
  const reviewCount = items.filter(i => i.status === 'review' || i.status === 'clarification' || i.status === 'underpriced').length;
  const okCount = items.filter(i => i.status === 'ok').length;
  const potentialSavings = totalOriginal - totalEstimated;

  const itemsWithVariance = items.filter(i => i.originalUnitPrice != null && i.benchmarkTypical != null && i.benchmarkTypical !== 0);
  const avgVariance = itemsWithVariance.length > 0
    ? itemsWithVariance.reduce((sum, i) => sum + ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100, 0) / itemsWithVariance.length
    : 0;
  
  // Executive Summary Section
  doc.setTextColor(...primaryColor);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Summary', margin, yPos);
  yPos += 7;

  // KPI cards (2x2 grid)
  const kpiGap = 6;
  const kpiW = (pageWidth - 2 * margin - kpiGap) / 2;
  const kpiH = 18;
  const kpiRowGap = 4;
  const kpiBgBlue: [number, number, number] = [30, 58, 95];
  const kpiBgOrange: [number, number, number] = [245, 158, 11];
  const kpiBgGreen: [number, number, number] = [22, 163, 74];
  const kpiBgGray: [number, number, number] = [100, 116, 139];

  const estimateDelta = totalEstimated - totalOriginal;
  const estimateDeltaLabel = estimateDelta >= 0 ? `(+${formatCurrency(Math.abs(estimateDelta), project.currency)} vs original)` : `(-${formatCurrency(Math.abs(estimateDelta), project.currency)} vs original)`;
  const varianceTrend = avgVariance >= 0 ? `▲ ${avgVariance.toFixed(1)}%` : `▼ ${Math.abs(avgVariance).toFixed(1)}%`;

  const drawKpi = (x: number, y: number, bg: [number, number, number], title: string, value: string, subtitle?: string) => {
    doc.setFillColor(...bg);
    doc.roundedRect(x, y, kpiW, kpiH, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(title.toUpperCase(), x + 5, y + 6);

    doc.setFontSize(12);
    doc.text(value, x + 5, y + 14);

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(subtitle, x + 5, y + 17);
    }
  };

  drawKpi(margin, yPos, kpiBgBlue, 'Project estimate', formatCurrency(totalEstimated, project.currency), estimateDeltaLabel);
  drawKpi(margin + kpiW + kpiGap, yPos, kpiBgOrange, 'Need review', `${reviewCount}`, '⚠ Review + Clarification');
  drawKpi(margin, yPos + kpiH + kpiRowGap, kpiBgGreen, 'Potential savings', formatCurrency(Math.max(0, potentialSavings), project.currency), 'Compared to original total');
  drawKpi(margin + kpiW + kpiGap, yPos + kpiH + kpiRowGap, kpiBgGray, 'Avg variance', varianceTrend, 'Original vs typical benchmark');

  yPos += (kpiH * 2) + kpiRowGap + 6;

  // Charts row
  const chartGap = 6;
  const chartH = 32;
  const chartW1 = 60; // donut
  const chartW3 = 52; // pie
  const chartW2 = pageWidth - 2 * margin - chartW1 - chartW3 - 2 * chartGap; // bar
  const chartY = yPos;

  // Data prep
  const tradeTotals = new Map<string, number>();
  for (const item of items) {
    const trade = item.trade?.trim() || 'Uncategorized';
    const unit = getEstimatedUnitPrice(item);
    const total = unit != null ? unit * item.quantity : 0;
    tradeTotals.set(trade, (tradeTotals.get(trade) || 0) + total);
  }
  const topTrades = [...tradeTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const topDrivers = [...items]
    .map((i) => ({
      label: i.originalDescription.length > 28 ? `${i.originalDescription.slice(0, 28)}…` : i.originalDescription,
      total: (getEstimatedUnitPrice(i) != null ? getEstimatedUnitPrice(i)! * i.quantity : 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const statusCounts = {
    ok: items.filter(i => i.status === 'ok').length,
    review: items.filter(i => i.status === 'review' || i.status === 'underpriced').length,
    clarification: items.filter(i => i.status === 'clarification').length,
  };

  // Render charts to images
  const donutUrl = await renderChartToDataUrl({
    type: 'doughnut',
    data: {
      labels: topTrades.map(([t]) => t),
      datasets: [{
        data: topTrades.map(([, v]) => Math.round(v)),
        backgroundColor: ['#1e3a5f', '#2563eb', '#0ea5e9', '#22c55e', '#f59e0b'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
      cutout: '65%',
    },
  }, 210, 140);

  const barUrl = await renderChartToDataUrl({
    type: 'bar',
    data: {
      labels: topDrivers.map(d => d.label),
      datasets: [{
        data: topDrivers.map(d => Math.round(d.total)),
        backgroundColor: '#1e3a5f',
        borderRadius: 6,
      }],
    },
    options: {
      responsive: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { display: false }, grid: { display: false } },
        y: { ticks: { font: { size: 8 } }, grid: { display: false } },
      },
    },
  }, 420, 150);

  const pieUrl = await renderChartToDataUrl({
    type: 'pie',
    data: {
      labels: ['OK', 'Review', 'Clarification'],
      datasets: [{
        data: [statusCounts.ok, statusCounts.review, statusCounts.clarification],
        backgroundColor: ['#22c55e', '#f59e0b', '#0ea5e9'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
    },
  }, 190, 140);

  // Chart titles + cards
  const drawChartCard = (title: string, x: number, y: number, w: number, h: number, dataUrl: string) => {
    doc.setFillColor(...headerBg);
    doc.roundedRect(x, y, w, h, 3, 3, 'F');
    doc.setDrawColor(...borderColor);
    doc.roundedRect(x, y, w, h, 3, 3, 'S');

    doc.setTextColor(...primaryColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title, x + 5, y + 6);
    doc.addImage(dataUrl, 'PNG', x + 5, y + 8.5, w - 10, h - 12);
  };

  drawChartCard('Cost Breakdown (Top Trades)', margin, chartY, chartW1, chartH, donutUrl);
  drawChartCard('Top Cost Drivers', margin + chartW1 + chartGap, chartY, chartW2, chartH, barUrl);
  drawChartCard('Status Distribution', pageWidth - margin - chartW3, chartY, chartW3, chartH, pieUrl);

  yPos += chartH + 6;
  addPageFooter(1);

  // Page 2+: Cost Items Table
  doc.addPage();
  yPos = addPageHeader();
  
  doc.setTextColor(...primaryColor);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Cost Items Detail', margin, yPos);
  yPos += 8;

  // Build table data (grouped by trade)
  // Build headers + keep a column index map for conditional formatting.
  const colIndex: Record<string, number> = {};
  const tableHeaders: string[] = [];
  const pushCol = (key: string, label: string) => {
    colIndex[key] = tableHeaders.length;
    tableHeaders.push(label);
  };
  if (options.includeDescription) pushCol('description', 'Description');
  if (options.includeTrade) pushCol('trade', 'Trade');
  if (options.includeQuantity) pushCol('qty', 'Qty');
  if (options.includeUnit) pushCol('unit', 'Unit');
  if (options.includeOriginalPrice) pushCol('origPrice', 'Orig. Price');
  if (options.includeOriginalTotal) pushCol('origTotal', 'Orig. Total');
  if (options.includeRecommendedPrice) pushCol('recPrice', 'Rec. Price');
  if (options.includeRecommendedTotal) pushCol('recTotal', 'Rec. Total');
  if (options.includeVariance) pushCol('variance', 'Var %');
  if (options.includeStatus) pushCol('status', 'Status');

  const labelColIndex = 0;
  const blankRow = () => new Array(tableHeaders.length).fill('');

  const formatStatusLabel = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'ok') return '✓ OK';
    if (s === 'review' || s === 'underpriced') return '⚠ REVIEW';
    if (s === 'clarification') return '❓ CLARIFY';
    return status.toUpperCase();
  };

  const buildItemRow = (item: CostItem) => {
    const row: string[] = [];
    const recPrice = getEstimatedUnitPrice(item);
    const origTotal = item.originalUnitPrice ? item.originalUnitPrice * item.quantity : null;
    const recTotal = recPrice != null ? recPrice * item.quantity : null;

    if (options.includeDescription) row.push(item.originalDescription.substring(0, 50) + (item.originalDescription.length > 50 ? '...' : ''));
    if (options.includeTrade) row.push(item.trade || '—');
    if (options.includeQuantity) row.push(item.quantity.toLocaleString());
    if (options.includeUnit) row.push(item.unit);
    if (options.includeOriginalPrice) row.push(item.originalUnitPrice != null ? item.originalUnitPrice.toLocaleString() : '—');
    if (options.includeOriginalTotal) row.push(origTotal != null ? origTotal.toLocaleString() : '—');
    if (options.includeRecommendedPrice) row.push(recPrice != null ? recPrice.toLocaleString() : '—');
    if (options.includeRecommendedTotal) row.push(recTotal != null ? recTotal.toLocaleString() : '—');
    if (options.includeVariance) {
      if (item.originalUnitPrice && item.benchmarkTypical) {
        const variance = ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100;
        row.push(`${variance > 0 ? '+' : ''}${variance.toFixed(0)}%`);
      } else {
        row.push('—');
      }
    }
    if (options.includeStatus) row.push(formatStatusLabel(item.status));

    return row;
  };

  const rowTypes: Array<'group' | 'item' | 'subtotal' | 'totals'> = [];
  const tableData: string[][] = [];

  const sorted = [...items].sort((a, b) => {
    const ta = (a.trade || 'Uncategorized').localeCompare(b.trade || 'Uncategorized');
    if (ta !== 0) return ta;
    return (b.originalDescription || '').localeCompare(a.originalDescription || '');
  });

  const groups = new Map<string, CostItem[]>();
  for (const it of sorted) {
    const key = it.trade?.trim() || 'Uncategorized';
    groups.set(key, [...(groups.get(key) || []), it]);
  }

  for (const [trade, groupItems] of groups.entries()) {
    const groupRow = blankRow();
    groupRow[labelColIndex] = `TRADE: ${trade}`;
    tableData.push(groupRow);
    rowTypes.push('group');

    for (const item of groupItems) {
      tableData.push(buildItemRow(item));
      rowTypes.push('item');
    }

    // Subtotal row
    const subOrig = groupItems.reduce((sum, i) => sum + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
    const subEst = groupItems.reduce((sum, i) => {
      const p = getEstimatedUnitPrice(i);
      return sum + (p != null ? p * i.quantity : 0);
    }, 0);

    const subRow = blankRow();
    subRow[labelColIndex] = `Subtotal (${trade})`;

    // Attempt to place totals into the correct columns if they exist
    let colCursor = 0;
    if (options.includeDescription) colCursor++;
    if (options.includeTrade) colCursor++;
    if (options.includeQuantity) colCursor++;
    if (options.includeUnit) colCursor++;
    if (options.includeOriginalPrice) colCursor++;
    if (options.includeOriginalTotal) subRow[colCursor] = subOrig.toLocaleString();
    if (options.includeOriginalTotal) colCursor++;
    if (options.includeRecommendedPrice) colCursor++;
    if (options.includeRecommendedTotal) subRow[colCursor] = subEst.toLocaleString();

    tableData.push(subRow);
    rowTypes.push('subtotal');
  }

  // Add totals row
  const totalsRow: string[] = [];
  if (options.includeDescription) totalsRow.push('TOTALS');
  if (options.includeTrade) totalsRow.push('');
  if (options.includeQuantity) totalsRow.push(items.reduce((s, i) => s + i.quantity, 0).toLocaleString());
  if (options.includeUnit) totalsRow.push('');
  if (options.includeOriginalPrice) totalsRow.push('');
  if (options.includeOriginalTotal) totalsRow.push(totalOriginal.toLocaleString());
  if (options.includeRecommendedPrice) totalsRow.push('');
  if (options.includeRecommendedTotal) totalsRow.push(totalEstimated.toLocaleString());
  if (options.includeVariance) totalsRow.push('');
  if (options.includeStatus) totalsRow.push('');
  tableData.push(totalsRow);
  rowTypes.push('totals');

  autoTable(doc, {
    head: [tableHeaders],
    body: tableData,
    startY: yPos,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      valign: 'middle',
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      ...(options.includeDescription ? { [colIndex.description]: { cellWidth: 78 } } : {}),
      ...(options.includeTrade ? { [colIndex.trade]: { cellWidth: 26 } } : {}),
      ...(options.includeQuantity ? { [colIndex.qty]: { cellWidth: 14, halign: 'right' } } : {}),
      ...(options.includeUnit ? { [colIndex.unit]: { cellWidth: 12 } } : {}),
      ...(options.includeOriginalPrice ? { [colIndex.origPrice]: { cellWidth: 20, halign: 'right' } } : {}),
      ...(options.includeOriginalTotal ? { [colIndex.origTotal]: { cellWidth: 22, halign: 'right' } } : {}),
      ...(options.includeRecommendedPrice ? { [colIndex.recPrice]: { cellWidth: 20, halign: 'right' } } : {}),
      ...(options.includeRecommendedTotal ? { [colIndex.recTotal]: { cellWidth: 22, halign: 'right' } } : {}),
      ...(options.includeVariance ? { [colIndex.variance]: { cellWidth: 14, halign: 'center' } } : {}),
      ...(options.includeStatus ? { [colIndex.status]: { cellWidth: 18, halign: 'center' } } : {}),
    },
    didParseCell: (data) => {
      const t = rowTypes[data.row.index];
      if (!t) return;

      if (t === 'group') {
        data.cell.styles.fillColor = headerBg;
        data.cell.styles.textColor = primaryColor;
        data.cell.styles.fontStyle = 'bold';
        if (data.column.index !== labelColIndex) data.cell.text = [''];
      }

      if (t === 'subtotal' || t === 'totals') {
        data.cell.styles.fillColor = [240, 244, 248];
        data.cell.styles.fontStyle = 'bold';
        if (data.column.index !== labelColIndex && data.cell.text?.[0] === '') {
          data.cell.styles.textColor = [60, 60, 60];
        }
      }

      // Conditional formatting for item rows.
      if (t === 'item') {
        // Emphasize recommended totals.
        if (options.includeRecommendedTotal && data.column.index === colIndex.recTotal) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = primaryColor;
        }

        // Variance color scale: green (negative) -> red (positive)
        if (options.includeVariance && data.column.index === colIndex.variance) {
          const raw = (data.cell.text?.[0] ?? '').replace('%', '');
          const v = Number(raw);
          if (!Number.isNaN(v)) {
            const clamped = Math.max(-50, Math.min(50, v));
            const t01 = (clamped + 50) / 100; // -50..50 => 0..1
            const r = Math.round(34 + (220 - 34) * t01);
            const g = Math.round(197 + (38 - 197) * t01);
            const b = Math.round(94 + (38 - 94) * t01);
            data.cell.styles.textColor = [r, g, b];
            data.cell.styles.fontStyle = 'bold';
          }
        }

        // Status pill styling
        if (options.includeStatus && data.column.index === colIndex.status) {
          const s = (data.cell.text?.[0] ?? '').toUpperCase();
          data.cell.styles.fontStyle = 'bold';
          if (s.includes('OK')) {
            data.cell.styles.fillColor = [230, 246, 236];
            data.cell.styles.textColor = [22, 163, 74];
          } else if (s.includes('REVIEW')) {
            data.cell.styles.fillColor = [255, 244, 229];
            data.cell.styles.textColor = [245, 158, 11];
          } else if (s.includes('CLARIFY')) {
            data.cell.styles.fillColor = [231, 245, 255];
            data.cell.styles.textColor = [14, 165, 233];
          }
        }
      }
    },
    didDrawPage: (data) => {
      addPageFooter(doc.getNumberOfPages());
    },
  });

  // Download
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `UnitRate_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.pdf`;
  doc.save(filename);
  
  toast.success('PDF report exported successfully');
}