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
  price?: string;
  total_cost?: string;
  total?: string;
  country_code?: string;
  country?: string;
  category?: string;
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
  const description = row.item_description || row.description || '';
  const unit = row.unit || '';
  const quantity = parseFloat(row.quantity || '1');
  const unitRate = parseFloat(row.unit_rate || row.price || '0');
  const totalCost = parseFloat(row.total_cost || row.total || '0') || (unitRate * quantity);
  const countryCode = (row.country_code || row.country || 'SE').toUpperCase();
  const category = row.category || null;

  // Validate description
  const words = description.trim().split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 2) {
    return { valid: false, error: `Row ${rowIndex + 1}: Description too short (${description})` };
  }

  // Validate unit
  const normalizedUnit = normalizeUnit(unit);
  if (!unit || (!VALID_UNITS.has(normalizedUnit) && !VALID_UNITS.has(unit.toLowerCase()))) {
    return { valid: false, error: `Row ${rowIndex + 1}: Invalid unit "${unit}"` };
  }

  // Validate price
  if (unitRate <= 0 || unitRate > 10000000) {
    return { valid: false, error: `Row ${rowIndex + 1}: Invalid unit rate ${unitRate}` };
  }

  // Validate country code
  if (!VALID_COUNTRY_CODES.has(countryCode)) {
    return { valid: false, error: `Row ${rowIndex + 1}: Invalid country code "${countryCode}"` };
  }

  return {
    valid: true,
    data: {
      item_description: description,
      unit: normalizedUnit,
      quantity: isNaN(quantity) ? 1 : quantity,
      unit_rate: unitRate,
      total_cost: totalCost,
      country_code: countryCode,
      category,
      approved: true,
      data_source: 'admin_import',
      flagged_for_review: false,
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

        // Import in batches of 50
        const batchSize = 50;
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < validRows.length; i += batchSize) {
          const batch = validRows.slice(i, i + batchSize);
          
          const { error } = await supabase
            .from('benchmark_costs')
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
        <div className="p-3 rounded-lg bg-muted/50 text-xs">
          <p className="font-medium mb-1">Expected CSV columns:</p>
          <code className="text-muted-foreground">
            item_description, unit, quantity, unit_rate, total_cost, country_code, category
          </code>
          <p className="text-muted-foreground mt-2">
            Alternative column names: description, price, total, country
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
