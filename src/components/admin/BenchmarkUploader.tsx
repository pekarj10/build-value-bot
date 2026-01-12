import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Download,
  Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BenchmarkRow {
  category: string;
  description: string;
  unit: string;
  country: string;
  currency: string;
  min_price?: number;
  avg_price: number;
  max_price?: number;
  source?: string;
}

interface ParsedData {
  rows: BenchmarkRow[];
  errors: string[];
  warnings: string[];
}

interface ColumnMapping {
  category: string;
  description: string;
  unit: string;
  country: string;
  currency: string;
  min_price: string;
  avg_price: string;
  max_price: string;
  source: string;
}

const REQUIRED_FIELDS = ['category', 'description', 'unit', 'country', 'currency', 'avg_price'];

const DEFAULT_MAPPING: ColumnMapping = {
  category: 'category',
  description: 'description',
  unit: 'unit',
  country: 'country',
  currency: 'currency',
  min_price: 'min_price',
  avg_price: 'avg_price',
  max_price: 'max_price',
  source: 'source',
};

export function BenchmarkUploader({ onUploadComplete }: { onUploadComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'complete'>('upload');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (!csvFile) return;

    setFile(csvFile);
    
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, unknown>[];
        if (data.length === 0) {
          toast.error('CSV file is empty');
          return;
        }

        const csvHeaders = Object.keys(data[0]);
        setHeaders(csvHeaders);
        setRawData(data);

        // Auto-detect column mapping
        const autoMapping = { ...DEFAULT_MAPPING };
        csvHeaders.forEach((header) => {
          const normalized = header.toLowerCase().replace(/[^a-z]/g, '');
          if (normalized.includes('category') || normalized.includes('trade')) {
            autoMapping.category = header;
          } else if (normalized.includes('description') || normalized.includes('item') || normalized.includes('name')) {
            autoMapping.description = header;
          } else if (normalized === 'unit' || normalized.includes('uom')) {
            autoMapping.unit = header;
          } else if (normalized.includes('country')) {
            autoMapping.country = header;
          } else if (normalized.includes('currency') || normalized === 'curr') {
            autoMapping.currency = header;
          } else if (normalized.includes('min') || normalized.includes('low')) {
            autoMapping.min_price = header;
          } else if (normalized.includes('avg') || normalized.includes('average') || normalized.includes('typical')) {
            autoMapping.avg_price = header;
          } else if (normalized.includes('max') || normalized.includes('high')) {
            autoMapping.max_price = header;
          } else if (normalized.includes('source') || normalized.includes('ref')) {
            autoMapping.source = header;
          }
        });

        setColumnMapping(autoMapping);
        setStep('map');
      },
      error: (error) => {
        toast.error(`Failed to parse CSV: ${error.message}`);
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const validateAndTransform = () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rows: BenchmarkRow[] = [];

    rawData.forEach((row, index) => {
      const rowNum = index + 2; // +2 for header and 0-indexing

      // Check required fields
      const category = String(row[columnMapping.category] || '').trim();
      const description = String(row[columnMapping.description] || '').trim();
      const unit = String(row[columnMapping.unit] || '').trim();
      const country = String(row[columnMapping.country] || '').trim();
      const currency = String(row[columnMapping.currency] || '').trim();
      const avgPriceStr = row[columnMapping.avg_price];

      if (!category) {
        errors.push(`Row ${rowNum}: Missing category`);
        return;
      }
      if (!description) {
        errors.push(`Row ${rowNum}: Missing description`);
        return;
      }
      if (!unit) {
        errors.push(`Row ${rowNum}: Missing unit`);
        return;
      }
      if (!country) {
        errors.push(`Row ${rowNum}: Missing country`);
        return;
      }
      if (!currency) {
        errors.push(`Row ${rowNum}: Missing currency`);
        return;
      }

      const avgPrice = parseFloat(String(avgPriceStr));
      if (isNaN(avgPrice) || avgPrice <= 0) {
        errors.push(`Row ${rowNum}: Invalid average price "${avgPriceStr}"`);
        return;
      }

      const minPriceStr = row[columnMapping.min_price];
      const maxPriceStr = row[columnMapping.max_price];
      const minPrice = minPriceStr ? parseFloat(String(minPriceStr)) : undefined;
      const maxPrice = maxPriceStr ? parseFloat(String(maxPriceStr)) : undefined;

      if (minPrice !== undefined && minPrice > avgPrice) {
        warnings.push(`Row ${rowNum}: Min price (${minPrice}) > Avg price (${avgPrice})`);
      }
      if (maxPrice !== undefined && maxPrice < avgPrice) {
        warnings.push(`Row ${rowNum}: Max price (${maxPrice}) < Avg price (${avgPrice})`);
      }

      rows.push({
        category,
        description,
        unit,
        country: country.toUpperCase(),
        currency: currency.toUpperCase(),
        min_price: minPrice && !isNaN(minPrice) ? minPrice : undefined,
        avg_price: avgPrice,
        max_price: maxPrice && !isNaN(maxPrice) ? maxPrice : undefined,
        source: row[columnMapping.source] ? String(row[columnMapping.source]).trim() : undefined,
      });
    });

    setParsedData({ rows, errors, warnings });
    setStep('preview');
  };

  const handleUpload = async () => {
    if (!parsedData || parsedData.rows.length === 0) return;

    setIsUploading(true);
    try {
      // Insert in batches of 100
      const batchSize = 100;
      const batches = [];
      for (let i = 0; i < parsedData.rows.length; i += batchSize) {
        batches.push(parsedData.rows.slice(i, i + batchSize));
      }

      let insertedCount = 0;
      for (const batch of batches) {
        const { error } = await supabase
          .from('benchmark_prices')
          .insert(batch);

        if (error) throw error;
        insertedCount += batch.length;
      }

      toast.success(`Successfully imported ${insertedCount} benchmark prices`);
      setStep('complete');
      onUploadComplete();
    } catch (error) {
      console.error('Error uploading benchmarks:', error);
      toast.error('Failed to upload benchmark data');
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      ['category', 'description', 'unit', 'country', 'currency', 'min_price', 'avg_price', 'max_price', 'source'],
      ['Structural', 'Reinforced concrete C30/37 for foundations', 'm3', 'CZ', 'CZK', '3500', '4200', '5000', 'Market Research 2024'],
      ['Finishes', 'Ceramic wall tiles 30x60cm including adhesive', 'm2', 'CZ', 'CZK', '800', '1100', '1400', 'Supplier Quotes'],
    ];
    
    const csv = template.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'benchmark_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setRawData([]);
    setColumnMapping(DEFAULT_MAPPING);
    setParsedData(null);
    setStep('upload');
  };

  if (step === 'complete') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Import Complete</h3>
            <p className="text-muted-foreground mb-4">
              Successfully imported {parsedData?.rows.length} benchmark prices.
            </p>
            <Button onClick={reset}>Upload Another File</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'preview' && parsedData) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Preview Import</CardTitle>
              <CardDescription>
                Review data before importing to the database
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep('map')}>
              Back to Mapping
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          <div className="flex gap-4">
            <Badge variant="secondary" className="text-base py-1 px-3">
              {parsedData.rows.length} valid rows
            </Badge>
            {parsedData.errors.length > 0 && (
              <Badge variant="destructive" className="text-base py-1 px-3">
                {parsedData.errors.length} errors
              </Badge>
            )}
            {parsedData.warnings.length > 0 && (
              <Badge className="bg-warning/10 text-warning border-warning/20 text-base py-1 px-3">
                {parsedData.warnings.length} warnings
              </Badge>
            )}
          </div>

          {/* Errors */}
          {parsedData.errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h4 className="font-medium text-destructive mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Errors (rows will be skipped)
              </h4>
              <ScrollArea className="h-32">
                <ul className="text-sm space-y-1">
                  {parsedData.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {/* Warnings */}
          {parsedData.warnings.length > 0 && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <h4 className="font-medium text-warning mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Warnings
              </h4>
              <ScrollArea className="h-24">
                <ul className="text-sm space-y-1">
                  {parsedData.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {/* Preview Table */}
          <div className="border rounded-lg">
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Avg</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.rows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{row.description}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell>{row.country}</TableCell>
                      <TableCell>{row.currency}</TableCell>
                      <TableCell className="text-right">{row.min_price?.toLocaleString() || '-'}</TableCell>
                      <TableCell className="text-right font-medium">{row.avg_price.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.max_price?.toLocaleString() || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            {parsedData.rows.length > 50 && (
              <div className="text-center py-2 text-sm text-muted-foreground border-t">
                Showing first 50 of {parsedData.rows.length} rows
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={parsedData.rows.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>Import {parsedData.rows.length} Rows</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'map') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Map Columns</CardTitle>
              <CardDescription>
                Match your CSV columns to the benchmark fields
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileSpreadsheet className="h-4 w-4" />
            {file?.name} ({rawData.length} rows)
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(columnMapping).map(([field, value]) => (
              <div key={field} className="space-y-2">
                <Label className="flex items-center gap-1">
                  {field.replace(/_/g, ' ')}
                  {REQUIRED_FIELDS.includes(field) && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                <Select
                  value={value}
                  onValueChange={(v) =>
                    setColumnMapping((prev) => ({ ...prev, [field]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">-- None --</SelectItem>
                    {headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>
            <Button onClick={validateAndTransform}>
              Continue to Preview
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Upload step
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Benchmark Data</CardTitle>
        <CardDescription>
          Import pricing benchmarks from a CSV file to extend your reference database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">
                {isDragActive ? 'Drop CSV file here' : 'Drop CSV file here or click to browse'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Supports .csv files with benchmark pricing data
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 border-t" />
          <span className="text-sm text-muted-foreground">or</span>
          <div className="flex-1 border-t" />
        </div>

        <Button variant="outline" className="w-full" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Download CSV Template
        </Button>

        <div className="bg-muted/50 rounded-lg p-4 text-sm">
          <h4 className="font-medium mb-2">Expected CSV format:</h4>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>category</strong> - Trade or category name (required)</li>
            <li>• <strong>description</strong> - Item description (required)</li>
            <li>• <strong>unit</strong> - Unit of measure, e.g., m2, m3, pcs (required)</li>
            <li>• <strong>country</strong> - Country code, e.g., CZ, DE, US (required)</li>
            <li>• <strong>currency</strong> - Currency code, e.g., CZK, EUR, USD (required)</li>
            <li>• <strong>avg_price</strong> - Average/typical unit price (required)</li>
            <li>• <strong>min_price</strong> - Minimum price (optional)</li>
            <li>• <strong>max_price</strong> - Maximum price (optional)</li>
            <li>• <strong>source</strong> - Data source reference (optional)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
