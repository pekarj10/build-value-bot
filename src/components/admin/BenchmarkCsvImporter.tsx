import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Papa from 'papaparse';

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface CsvRow {
  item_description?: string;
  description?: string;
  unit?: string;
  quantity?: string;
  unit_rate?: string;
  avg_price?: string;
  price?: string;
  min_price?: string;
  max_price?: string;
  total_cost?: string;
  total?: string;
  country_code?: string;
  country?: string;
  category?: string;
  source?: string;
  currency?: string;
}

const VALID_UNITS = new Set([
  'm²', 'm2', 'sqm', 'kvm',
  'st', 'pcs', 'pc', 'piece', 'styck', 'stk',
  'm', 'meter', 'lm', 'rm',
  'kg', 'kilogram',
  'l', 'liter', 'litre',
  'h', 'hr', 'hour', 'tim', 'timmar',
  'set', 'kit', 'paket',
  'ton', 't',
  'm³', 'm3', 'cbm',
]);

const VALID_COUNTRY_CODES = new Set([
  'SE', 'CZ', 'DE', 'AT', 'PL', 'GB', 'US', 'SK', 'NO', 'DK', 'FI',
]);

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'kvm') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'styck') return 'st';
  if (u === 'm' || u === 'meter' || u === 'lm' || u === 'rm') return 'm';
  if (u === 'm3' || u === 'm³' || u === 'cbm') return 'm³';
  return u;
}

function validateRow(row: CsvRow, rowIndex: number): { valid: boolean; data?: Record<string, unknown>; error?: string } {
  const rawDescription = row.item_description || row.description || '';
  const rawCategory = row.category || 'General';
  const unit = row.unit || '';
  // Support both avg_price (benchmark_prices format) and unit_rate/price
  const avgPrice = parseFloat(row.avg_price || row.unit_rate || row.price || '0');
  const minPrice = row.min_price ? parseFloat(row.min_price) : null;
  const maxPrice = row.max_price ? parseFloat(row.max_price) : null;
  const countryRaw = (row.country_code || row.country || 'SE').toUpperCase().trim();
  const countryCode = countryRaw.length === 2 ? countryRaw : countryRaw.slice(0, 2);
  const currency = row.currency || 'SEK';
  const source = row.source || 'admin_import';

  // Build full description: combine category + description for richer context
  // e.g. category "3S11 - Rum yta <6 m²" + description "helmålning" → "3S11 - Rum yta <6 m²: helmålning"
  const descriptionParts = [rawCategory !== 'General' ? rawCategory : '', rawDescription]
    .map(p => p.trim())
    .filter(Boolean);
  const description = descriptionParts.join(' - ');

  // Validate: must have at least 2 characters total (single-word trades like "helmålning" are valid)
  if (!description || description.trim().length < 3) {
    return { valid: false, error: `Row ${rowIndex + 1}: Description is empty or too short` };
  }

  // Validate unit — accept any non-empty unit, normalize known ones
  if (!unit || unit.trim().length === 0) {
    return { valid: false, error: `Row ${rowIndex + 1}: Missing unit` };
  }
  const normalizedUnit = normalizeUnit(unit);

  // Validate price
  if (isNaN(avgPrice) || avgPrice <= 0 || avgPrice > 10000000) {
    return { valid: false, error: `Row ${rowIndex + 1}: Invalid avg price ${avgPrice} (must be between 0 and 10,000,000)` };
  }

  // Validate country code
  if (!VALID_COUNTRY_CODES.has(countryCode)) {
    return { valid: false, error: `Row ${rowIndex + 1}: Invalid country code "${countryCode}" (accepted: ${[...VALID_COUNTRY_CODES].join(', ')})` };
  }

  return {
    valid: true,
    data: {
      description,
      unit: normalizedUnit || unit.toLowerCase().trim(),
      avg_price: avgPrice,
      min_price: isNaN(minPrice!) ? null : minPrice,
      max_price: isNaN(maxPrice!) ? null : maxPrice,
      country: countryCode,
      category: rawCategory,
      currency,
      source,
    },
  };
}

export function BenchmarkCsvImporter() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewRows, setPreviewRows] = useState<CsvRow[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setResult(null);
    setPreviewRows([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as CsvRow[];
        setPreviewRows(data.slice(0, 5));
        toast.info(`Found ${data.length} rows. Click "Import" to proceed.`);
      },
      error: (error) => {
        toast.error(`Failed to parse CSV: ${error.message}`);
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxFiles: 1,
  });

  /**
   * After import, find existing benchmarks whose avg_price changed by >5%
   * and flag affected projects for re-analysis notification.
   */
  const flagProjectsForSignificantChanges = async (
    importedDescriptions: string[],
    newPriceByDesc: Map<string, number>
  ) => {
    if (importedDescriptions.length === 0) return;

    try {
      // Fetch existing benchmarks with the same descriptions to compare prices
      const batchSize = 50;
      const changedBenchmarkIds: string[] = [];

      for (let i = 0; i < importedDescriptions.length; i += batchSize) {
        const batch = importedDescriptions.slice(i, i + batchSize);
        const { data: existing } = await supabase
          .from('benchmark_prices')
          .select('id, description, avg_price')
          .in('description', batch);

        for (const row of existing || []) {
          const newPrice = newPriceByDesc.get(row.description);
          if (newPrice !== undefined) {
            const priceDelta = Math.abs((newPrice - row.avg_price) / row.avg_price);
            if (priceDelta >= 0.05) {
              // Price changed by ≥5% — benchmark is significantly different
              changedBenchmarkIds.push(row.id);
            }
          }
        }
      }

      if (changedBenchmarkIds.length === 0) return;

      // Find projects with cost items matched to these benchmarks
      const affectedProjectIds = new Set<string>();
      const affectedCountPerProject = new Map<string, number>();

      for (let i = 0; i < changedBenchmarkIds.length; i += batchSize) {
        const batch = changedBenchmarkIds.slice(i, i + batchSize);
        const { data: costItems } = await supabase
          .from('cost_items')
          .select('project_id')
          .in('matched_benchmark_id', batch);

        for (const ci of costItems || []) {
          affectedProjectIds.add(ci.project_id);
          affectedCountPerProject.set(
            ci.project_id,
            (affectedCountPerProject.get(ci.project_id) || 0) + 1
          );
        }
      }

      if (affectedProjectIds.size === 0) return;

      const now = new Date().toISOString();
      for (const projectId of affectedProjectIds) {
        const count = affectedCountPerProject.get(projectId) || 0;
        const summary = `${count} cost item${count !== 1 ? 's' : ''} in this project have updated benchmark reference prices (≥5% change). Re-analyse to apply the latest prices.`;

        await supabase
          .from('projects')
          .update({
            pending_benchmark_update: true,
            pending_update_summary: summary,
            pending_update_since: now,
            pending_update_dismissed_at: null,
          } as any)
          .eq('id', projectId);
      }

      console.log(`[Import] Flagged ${affectedProjectIds.size} project(s) for benchmark price changes`);
    } catch (err) {
      console.error('[Import] Failed to flag projects for price changes:', err);
    }
  };

  const handleImport = async () => {
    const file = acceptedFiles[0];
    if (!file) {
      toast.error('Please select a CSV file first');
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as CsvRow[];
        const validRows: Record<string, unknown>[] = [];
        const errors: string[] = [];

        // Validate all rows
        rows.forEach((row, index) => {
          const validation = validateRow(row, index);
          if (validation.valid && validation.data) {
            validRows.push(validation.data);
          } else if (validation.error) {
            errors.push(validation.error);
          }
        });

        if (validRows.length === 0) {
          setResult({ success: 0, failed: rows.length, errors });
          setIsImporting(false);
          toast.error('No valid rows to import');
          return;
        }

        // Build a map of description → new avg_price for price-change detection
        const newPriceByDesc = new Map<string, number>();
        for (const row of validRows) {
          newPriceByDesc.set(row.description as string, row.avg_price as number);
        }
        const importedDescriptions = [...newPriceByDesc.keys()];

        // Check for significant price changes in existing benchmarks BEFORE inserting
        await flagProjectsForSignificantChanges(importedDescriptions, newPriceByDesc);

        // Import in batches of 50
        const batchSize = 50;
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < validRows.length; i += batchSize) {
          const batch = validRows.slice(i, i + batchSize);
          
          const { error } = await supabase
            .from('benchmark_prices')
            .insert(batch as any);

          if (error) {
            console.error('Batch insert error:', error);
            failedCount += batch.length;
            errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
          } else {
            successCount += batch.length;
          }

          setProgress(Math.round(((i + batch.length) / validRows.length) * 100));
        }

        setResult({
          success: successCount,
          failed: failedCount + (rows.length - validRows.length),
          errors,
        });
        setIsImporting(false);

        if (successCount > 0) {
          toast.success(`Imported ${successCount} benchmark costs`);
        }
        if (failedCount > 0 || errors.length > 0) {
          toast.warning(`${failedCount + (rows.length - validRows.length)} rows failed validation`);
        }
      },
      error: (error) => {
        toast.error(`Parse error: ${error.message}`);
        setIsImporting(false);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Import Benchmark Data
        </CardTitle>
        <CardDescription>
          Upload a CSV file to add benchmark cost data to the learning database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/25 hover:border-primary/50"
          )}
        >
          <input {...getInputProps()} />
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          {isDragActive ? (
            <p className="text-sm text-muted-foreground">Drop the CSV file here...</p>
          ) : (
            <div>
              <p className="text-sm font-medium">Drag and drop a CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            </div>
          )}
        </div>

        {/* Selected file */}
        {acceptedFiles.length > 0 && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{acceptedFiles[0].name}</span>
              <Badge variant="secondary" className="text-xs">
                {(acceptedFiles[0].size / 1024).toFixed(1)} KB
              </Badge>
            </div>
            <Button 
              onClick={handleImport} 
              disabled={isImporting}
              size="sm"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import'
              )}
            </Button>
          </div>
        )}

        {/* Progress */}
        {isImporting && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground text-center">{progress}% complete</p>
          </div>
        )}

        {/* Preview */}
        {previewRows.length > 0 && !result && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Preview (first 5 rows):</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Unit</th>
                    <th className="text-right p-2">Rate</th>
                    <th className="text-left p-2">Country</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b border-muted">
                      <td className="p-2 truncate max-w-[200px]">
                        {row.item_description || row.description}
                      </td>
                      <td className="p-2">{row.unit}</td>
                      <td className="p-2 text-right">
                        {row.unit_rate || row.price}
                      </td>
                      <td className="p-2">{row.country_code || row.country}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="text-sm font-medium">{result.success} imported</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium">{result.failed} failed</span>
                </div>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-medium text-destructive">Validation Errors:</p>
                    <ul className="text-destructive/80 max-h-32 overflow-y-auto">
                      {result.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {result.errors.length > 10 && (
                        <li>...and {result.errors.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expected format */}
        <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
          <p className="font-medium mb-1">Expected CSV columns (imports into Benchmark Prices database):</p>
          <code className="text-muted-foreground block">
            description, unit, avg_price, min_price, max_price, country, category, currency, source
          </code>
          <p className="text-muted-foreground">
            Alternative names: <code>item_description</code>, <code>unit_rate</code> / <code>price</code> (for avg_price), <code>country_code</code>
          </p>
          <p className="text-muted-foreground">
            Valid countries: SE, CZ, DE, AT, PL, GB, US, SK, NO, DK, FI
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
