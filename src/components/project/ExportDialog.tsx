import { useState, useMemo, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileSpreadsheet, FileText, Download, BookOpen, FileBarChart, Eye, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { formatCurrency } from '@/lib/formatters';
import { useViewMode } from '@/hooks/useViewMode';
import { generatePdfReport, type ReportFormat } from '@/lib/pdfReport';
import { useExportPreferences } from '@/hooks/useExportPreferences';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  items: CostItem[];
  selectedItemIds?: string[];
  isAdmin?: boolean;
}

export function ExportDialog({ 
  open, 
  onClose, 
  project, 
  items,
  selectedItemIds,
  isAdmin = false,
}: ExportDialogProps) {
  const { showAsAdmin } = useViewMode();
  const effectiveIsAdmin = isAdmin && showAsAdmin;
  
  const { preferences, updatePreference, resetPreferences } = useExportPreferences();
  const [isExporting, setIsExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [showCoverFields, setShowCoverFields] = useState(false);
  const [showTradeFilter, setShowTradeFilter] = useState(false);
  
  const exportType = effectiveIsAdmin ? preferences.exportType : 'pdf';

  // Get unique trades from items
  const availableTrades = useMemo(() => {
    const trades = new Set<string>();
    items.forEach(item => {
      trades.add(item.trade?.trim() || 'Uncategorized');
    });
    return [...trades].sort();
  }, [items]);

  // Filter items based on selections
  const filteredItems = useMemo(() => {
    let filtered = selectedItemIds 
      ? items.filter(i => selectedItemIds.includes(i.id))
      : items;
    
    if (preferences.onlyFlagged) {
      filtered = filtered.filter(i => i.status === 'review' || i.status === 'clarification');
    }

    if (preferences.excludedTrades.length > 0) {
      filtered = filtered.filter(i => {
        const trade = i.trade?.trim() || 'Uncategorized';
        return !preferences.excludedTrades.includes(trade);
      });
    }

    return filtered;
  }, [items, selectedItemIds, preferences.onlyFlagged, preferences.excludedTrades]);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      if (exportType === 'excel') {
        await exportToExcel(filteredItems, project, preferences);
      } else {
        await generatePdfReport(filteredItems, project, {
          format: preferences.pdfFormat,
          includeDescription: preferences.includeDescription,
          includeTrade: preferences.includeTrade,
          includeQuantity: preferences.includeQuantity,
          includeUnit: preferences.includeUnit,
          includeOriginalPrice: preferences.includeOriginalPrice,
          includeOriginalTotal: preferences.includeOriginalTotal,
          includeRecommendedPrice: preferences.includeRecommendedPrice,
          includeRecommendedTotal: preferences.includeRecommendedTotal,
          includeVariance: preferences.includeVariance,
          includeStatus: preferences.includeStatus,
          onlyFlagged: false, // already filtered
          clientName: preferences.clientName || undefined,
          contractorName: preferences.contractorName || undefined,
          coverNotes: preferences.coverNotes || undefined,
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

  const handlePreview = async () => {
    setIsGeneratingPreview(true);
    try {
      const blob = await generatePdfReport(filteredItems, project, {
        format: preferences.pdfFormat,
        includeDescription: preferences.includeDescription,
        includeTrade: preferences.includeTrade,
        includeQuantity: preferences.includeQuantity,
        includeUnit: preferences.includeUnit,
        includeOriginalPrice: preferences.includeOriginalPrice,
        includeOriginalTotal: preferences.includeOriginalTotal,
        includeRecommendedPrice: preferences.includeRecommendedPrice,
        includeRecommendedTotal: preferences.includeRecommendedTotal,
        includeVariance: preferences.includeVariance,
        includeStatus: preferences.includeStatus,
        onlyFlagged: false,
        clientName: preferences.clientName || undefined,
        contractorName: preferences.contractorName || undefined,
        coverNotes: preferences.coverNotes || undefined,
      }, true); // preview mode - returns blob instead of downloading

      if (blob) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } catch (error) {
      console.error('Preview failed:', error);
      toast.error('Failed to generate preview');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const toggleTrade = (trade: string) => {
    const current = preferences.excludedTrades;
    if (current.includes(trade)) {
      updatePreference('excludedTrades', current.filter(t => t !== trade));
    } else {
      updatePreference('excludedTrades', [...current, trade]);
    }
  };

  // If preview is showing, render preview dialog
  if (previewUrl) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setPreviewUrl(null);
          onClose();
        }
      }}>
        <DialogContent className="sm:max-w-[900px] h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              PDF Preview
            </DialogTitle>
            <DialogDescription>
              Preview of your {preferences.pdfFormat === 'executive' ? 'Executive Summary' : 'Full Report'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-0">
            <iframe
              src={previewUrl}
              className="w-full h-[calc(85vh-160px)] border rounded-lg"
              title="PDF Preview"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewUrl(null)}>
              Back to Settings
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Downloading...' : 'Download PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Report
          </DialogTitle>
          <DialogDescription>
            Generate a professional report of your cost analysis ({filteredItems.length} items)
          </DialogDescription>
        </DialogHeader>

        {effectiveIsAdmin ? (
          <Tabs value={exportType} onValueChange={(v) => updatePreference('exportType', v as 'excel' | 'pdf')}>
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
              <PdfFormatSelector value={preferences.pdfFormat} onChange={(v) => updatePreference('pdfFormat', v)} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-3 mt-4">
            <div className="text-sm text-muted-foreground">
              Generate a professional PDF report suitable for client presentations.
            </div>
            <PdfFormatSelector value={preferences.pdfFormat} onChange={(v) => updatePreference('pdfFormat', v)} />
          </div>
        )}

        <ScrollArea className="max-h-[340px]">
          <div className="space-y-4 py-2 pr-3">
            {/* Cover Page Fields */}
            {exportType === 'pdf' && (
              <Collapsible open={showCoverFields} onOpenChange={setShowCoverFields}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full hover:text-primary transition-colors">
                  {showCoverFields ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Cover Page Details
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Client Name</Label>
                      <Input
                        placeholder="e.g. Skanska AB"
                        value={preferences.clientName}
                        onChange={(e) => updatePreference('clientName', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Contractor Name</Label>
                      <Input
                        placeholder="e.g. NCC Group"
                        value={preferences.contractorName}
                        onChange={(e) => updatePreference('contractorName', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Report Notes</Label>
                    <Textarea
                      placeholder="Additional notes for the cover page..."
                      value={preferences.coverNotes}
                      onChange={(e) => updatePreference('coverNotes', e.target.value)}
                      className="text-sm min-h-[60px]"
                      rows={2}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Columns to Include */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Columns to Include</Label>
              <div className="grid grid-cols-2 gap-2.5">
                <ColumnCheckbox label="Description" checked={preferences.includeDescription} onChange={(c) => updatePreference('includeDescription', c)} />
                <ColumnCheckbox label="Trade" checked={preferences.includeTrade} onChange={(c) => updatePreference('includeTrade', c)} />
                <ColumnCheckbox label="Qty & Unit" checked={preferences.includeQuantity} onChange={(c) => updatePreference('includeQuantity', c)} />
                <ColumnCheckbox label="Original Price" checked={preferences.includeOriginalPrice} onChange={(c) => updatePreference('includeOriginalPrice', c)} />
                <ColumnCheckbox label="Original Total" checked={preferences.includeOriginalTotal} onChange={(c) => updatePreference('includeOriginalTotal', c)} />
                <ColumnCheckbox label="Rec. Price" checked={preferences.includeRecommendedPrice} onChange={(c) => updatePreference('includeRecommendedPrice', c)} />
                <ColumnCheckbox label="Rec. Total" checked={preferences.includeRecommendedTotal} onChange={(c) => updatePreference('includeRecommendedTotal', c)} />
                <ColumnCheckbox label="Variance %" checked={preferences.includeVariance} onChange={(c) => updatePreference('includeVariance', c)} />
                <ColumnCheckbox label="Status" checked={preferences.includeStatus} onChange={(c) => updatePreference('includeStatus', c)} />
                {exportType === 'excel' && (
                  <>
                    <ColumnCheckbox label="Benchmarks" checked={preferences.includeBenchmarks} onChange={(c) => updatePreference('includeBenchmarks', c)} />
                    <ColumnCheckbox label="AI Comments" checked={preferences.includeAIComments} onChange={(c) => updatePreference('includeAIComments', c)} />
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Trade Filter */}
            <Collapsible open={showTradeFilter} onOpenChange={setShowTradeFilter}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full hover:text-primary transition-colors">
                {showTradeFilter ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Filter by Trade
                {preferences.excludedTrades.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {availableTrades.length - preferences.excludedTrades.length}/{availableTrades.length} selected
                  </span>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                <div className="flex gap-2 mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => updatePreference('excludedTrades', [])}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => updatePreference('excludedTrades', [...availableTrades])}
                  >
                    Deselect All
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto">
                  {availableTrades.map(trade => (
                    <div key={trade} className="flex items-center space-x-2">
                      <Checkbox
                        id={`trade-${trade}`}
                        checked={!preferences.excludedTrades.includes(trade)}
                        onCheckedChange={() => toggleTrade(trade)}
                      />
                      <Label htmlFor={`trade-${trade}`} className="text-xs truncate cursor-pointer">
                        {trade}
                      </Label>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Filter Options */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Filter Options</Label>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="onlyFlagged" 
                  checked={preferences.onlyFlagged}
                  onCheckedChange={(c) => updatePreference('onlyFlagged', !!c)}
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
                    value={preferences.currencyFormat} 
                    onValueChange={(v) => updatePreference('currencyFormat', v as 'symbol' | 'code' | 'none')}
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
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={resetPreferences} className="mr-auto">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
          {exportType === 'pdf' && (
            <Button variant="outline" onClick={handlePreview} disabled={isGeneratingPreview || filteredItems.length === 0}>
              <Eye className="h-4 w-4 mr-2" />
              {isGeneratingPreview ? 'Generating...' : 'Preview'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || filteredItems.length === 0}>
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

// ─── Sub-components ──────────────────────────────────────────────

function ColumnCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `col-${label.replace(/\s/g, '-').toLowerCase()}`;
  return (
    <div className="flex items-center space-x-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(!!c)} />
      <Label htmlFor={id} className="text-sm">{label}</Label>
    </div>
  );
}

function PdfFormatSelector({ value, onChange }: { value: ReportFormat; onChange: (v: ReportFormat) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Report Format</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as ReportFormat)}
        className="grid grid-cols-2 gap-3"
      >
        <Label
          htmlFor="fmt-exec"
          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${value === 'executive' ? 'border-primary bg-primary/5' : 'border-border'}`}
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
          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${value === 'full' ? 'border-primary bg-primary/5' : 'border-border'}`}
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
  );
}

// ==================== EXCEL EXPORT ====================

async function exportToExcel(items: CostItem[], project: Project, options: any) {
  const wb = XLSX.utils.book_new();

  const summaryData = createSummarySheet(project, items);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Executive Summary');

  const costItemsData = createCostItemsSheet(items, project.currency, options);
  const costItemsSheet = XLSX.utils.aoa_to_sheet(costItemsData);
  const colWidths = calculateColumnWidths(options, project.currency);
  costItemsSheet['!cols'] = colWidths;
  costItemsSheet['!freeze'] = { xSplit: 0, ySplit: 4 };
  const headerRowIndex = 3;
  const lastCol = String.fromCharCode(64 + colWidths.length);
  costItemsSheet['!autofilter'] = { ref: `A${headerRowIndex + 1}:${lastCol}${headerRowIndex + 1 + items.length}` };
  XLSX.utils.book_append_sheet(wb, costItemsSheet, 'Cost Items');

  const varianceData = createVarianceSheet(items, project.currency);
  const varianceSheet = XLSX.utils.aoa_to_sheet(varianceData);
  varianceSheet['!cols'] = [{ wch: 45 }, { wch: 18 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, varianceSheet, 'Variance Analysis');

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `UnitRate_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`;
  XLSX.writeFile(wb, filename);
  
  toast.success('Excel report exported successfully');
}

function calculateColumnWidths(options: any, currency: string): { wch: number }[] {
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

function createCostItemsSheet(items: CostItem[], currency: string, options: any): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push(['COST ITEMS DETAIL', '']);
  rows.push(['Generated:', new Date().toLocaleDateString('en-GB')]);
  rows.push(['']);
  
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

  const totalsRow: (string | number)[] = [];
  if (options.includeDescription) totalsRow.push('TOTALS');
  if (options.includeTrade) totalsRow.push('');
  if (options.includeQuantity) totalsRow.push(items.reduce((sum, i) => sum + i.quantity, 0));
  if (options.includeUnit) totalsRow.push('');
  if (options.includeOriginalPrice) totalsRow.push('');
  if (options.includeOriginalTotal) {
    totalsRow.push(items.reduce((sum, i) => sum + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0));
  }
  if (options.includeRecommendedPrice) totalsRow.push('');
  if (options.includeRecommendedTotal) {
    totalsRow.push(items.reduce((sum, i) => {
      const price = i.userOverridePrice || i.recommendedUnitPrice;
      return sum + (price ? price * i.quantity : 0);
    }, 0));
  }
  if (options.includeBenchmarks) totalsRow.push('', '', '');
  if (options.includeVariance) totalsRow.push('');
  if (options.includeStatus) totalsRow.push('');
  if (options.includeAIComments) totalsRow.push('');
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
