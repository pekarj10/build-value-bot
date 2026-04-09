import { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { TablePagination } from '@/components/project/TablePagination';
import { BenchmarkUploader } from './BenchmarkUploader';
import { BenchmarkCsvImporter } from './BenchmarkCsvImporter';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { 
  Search, 
  Trash2, 
  Upload, 
  Database,
  Download,
  RefreshCw,
  Copy,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';

interface BenchmarkPrice {
  id: string;
  category: string;
  description: string;
  unit: string;
  country: string;
  currency: string;
  min_price: number | null;
  avg_price: number;
  max_price: number | null;
  source: string | null;
  created_at: string;
}

interface DuplicateGroup {
  key: string;
  items: BenchmarkPrice[];
  description: string;
  unit: string;
  countries: string[];
}

export function BenchmarkManager() {
  const [benchmarks, setBenchmarks] = useState<BenchmarkPrice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showUploader, setShowUploader] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<{ processed: number; total: number } | null>(null);
  const [missingEmbeddingsCount, setMissingEmbeddingsCount] = useState<number | null>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Get unique countries and categories for filters
  const countries = [...new Set(benchmarks.map((b) => b.country))].sort();
  const categories = [...new Set(benchmarks.map((b) => b.category))].sort();

  const fetchMissingEmbeddingsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('benchmark_prices')
        .select('id', { count: 'exact', head: true })
        .is('embedding', null);
      if (!error) setMissingEmbeddingsCount(count ?? 0);
    } catch (e) {
      console.error('Failed to fetch missing embeddings count:', e);
    }
  };

  useEffect(() => {
    fetchBenchmarks();
    fetchMissingEmbeddingsCount();
  }, []);

  const fetchBenchmarks = async () => {
    setIsLoading(true);
    try {
      // Fetch all records using pagination to overcome 1000 row limit
      let allData: BenchmarkPrice[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('benchmark_prices')
          .select('*')
          .order('category', { ascending: true })
          .order('description', { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setBenchmarks(allData);
    } catch (error) {
      console.error('Error fetching benchmarks:', error);
      toast.error('Failed to load benchmark data');
    } finally {
      setIsLoading(false);
    }
  };

  // Detect duplicates - items with same description (normalized) and unit but different country codes
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, BenchmarkPrice[]>();
    
    benchmarks.forEach((b) => {
      // Normalize description for comparison (lowercase, trim)
      const normalizedDesc = b.description.toLowerCase().trim();
      const key = `${normalizedDesc}|${b.unit.toLowerCase()}|${b.category.toLowerCase()}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(b);
    });

    // Filter to only groups with duplicates (different country codes for same item)
    const duplicates: DuplicateGroup[] = [];
    groups.forEach((items, key) => {
      const uniqueCountries = [...new Set(items.map(i => i.country))];
      if (items.length > 1 && uniqueCountries.length > 1) {
        duplicates.push({
          key,
          items,
          description: items[0].description,
          unit: items[0].unit,
          countries: uniqueCountries,
        });
      }
    });

    return duplicates;
  }, [benchmarks]);

  /**
   * Finds projects that have cost items matched to the given benchmark IDs,
   * then flags them with a pending benchmark update notification.
   */
  const flagAffectedProjects = async (benchmarkIds: string[], reason: string) => {
    if (benchmarkIds.length === 0) return;

    try {
      // Find cost items matched to these benchmarks
      const batchSize = 100;
      const affectedProjectIds = new Set<string>();
      const affectedCountPerProject = new Map<string, number>();

      for (let i = 0; i < benchmarkIds.length; i += batchSize) {
        const batch = benchmarkIds.slice(i, i + batchSize);
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

      // Flag each affected project
      for (const projectId of affectedProjectIds) {
        const count = affectedCountPerProject.get(projectId) || 0;
        const summary = `${count} cost item${count !== 1 ? 's' : ''} in this project ${reason}. You may want to re-analyse to get the latest recommended prices.`;

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

      console.log(`Flagged ${affectedProjectIds.size} project(s) for benchmark update`);
    } catch (err) {
      console.error('Failed to flag affected projects:', err);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      // Step 1: Flag affected projects BEFORE clearing matched_benchmark_id
      const allIds = benchmarks.map(b => b.id);
      await flagAffectedProjects(allIds, 'had their benchmark references removed (full database reset)');

      const batchSize = 100;

      // Step 2: Clear matched_benchmark_id on all cost_items to remove FK references
      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        await supabase
          .from('cost_items')
          .update({ matched_benchmark_id: null })
          .in('matched_benchmark_id', batch);
      }

      // Step 3: Now delete the benchmark prices in batches
      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        const { error } = await supabase
          .from('benchmark_prices')
          .delete()
          .in('id', batch);

        if (error) throw error;
      }

      toast.success(`All ${allIds.length.toLocaleString()} benchmark records deleted`);
      setBenchmarks([]);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error deleting benchmarks:', error);
      toast.error('Failed to delete benchmark data');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);

      // Flag affected projects BEFORE deletion
      await flagAffectedProjects(idsToDelete, 'had their matched benchmark prices deleted');

      const batchSize = 100;
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        const { error } = await supabase
          .from('benchmark_prices')
          .delete()
          .in('id', batch);

        if (error) throw error;
      }

      toast.success(`Deleted ${selectedIds.size} benchmark prices`);
      setSelectedIds(new Set());
      fetchBenchmarks();
    } catch (error) {
      console.error('Error deleting benchmarks:', error);
      toast.error('Failed to delete selected items');
    } finally {
      setIsDeleting(false);
    }
  };

  const selectAllDuplicatesKeepOne = (countryToKeep: string) => {
    const idsToSelect = new Set<string>();
    
    duplicateGroups.forEach((group) => {
      // Find items to delete (all except the one with preferred country)
      const itemToKeep = group.items.find(i => i.country === countryToKeep) || group.items[0];
      group.items.forEach((item) => {
        if (item.id !== itemToKeep.id) {
          idsToSelect.add(item.id);
        }
      });
    });

    setSelectedIds(idsToSelect);
    toast.info(`Selected ${idsToSelect.size} duplicate items for deletion`);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = (items: BenchmarkPrice[]) => {
    const allSelected = items.every((item) => selectedIds.has(item.id));
    const newSelected = new Set(selectedIds);
    
    if (allSelected) {
      items.forEach((item) => newSelected.delete(item.id));
    } else {
      items.forEach((item) => newSelected.add(item.id));
    }
    
    setSelectedIds(newSelected);
  };

  const exportToCSV = () => {
    const headers = ['category', 'description', 'unit', 'country', 'currency', 'min_price', 'avg_price', 'max_price', 'source'];
    const rows = benchmarks.map((b) => [
      b.category,
      `"${b.description.replace(/"/g, '""')}"`,
      b.unit,
      b.country,
      b.currency,
      b.min_price || '',
      b.avg_price,
      b.max_price || '',
      b.source || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateEmbeddings = async () => {
    setIsGeneratingEmbeddings(true);
    setEmbeddingProgress(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('You must be logged in');
        return;
      }

      let totalProcessed = 0;
      let remaining = 1;
      let totalKnown = 0;

      while (remaining > 0) {
        const response = await supabase.functions.invoke('generate-benchmarks-embeddings', {
          body: {},
        });

        const result = response.data as {
          processed?: number;
          remaining?: number;
          total?: number;
          errors?: number;
          errorMessages?: string[];
          error?: string;
        } | null;

        if (response.error) {
          const errorDetail = result?.error || response.error.message || 'Failed to generate embeddings';
          throw new Error(errorDetail);
        }

        totalProcessed += result?.processed || 0;
        remaining = result?.remaining || 0;
        totalKnown = result?.total || Math.max(totalKnown, totalProcessed + remaining);

        setEmbeddingProgress({
          processed: totalProcessed,
          total: totalKnown,
        });

        if ((result?.errors || 0) > 0) {
          toast.warning(result?.errorMessages?.[0] || `${result?.errors} embeddings failed`);
        }
      }

      toast.success(`Generated embeddings for ${totalProcessed} benchmarks`);
      setMissingEmbeddingsCount(0);
    } catch (error) {
      console.error('Embedding generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate embeddings');
    } finally {
      setIsGeneratingEmbeddings(false);
      setEmbeddingProgress(null);
      fetchMissingEmbeddingsCount();
    }
  };

  // Pre-filter by dropdown filters
  const dropdownFiltered = useMemo(() => benchmarks.filter((b) => {
    const matchesCountry = countryFilter === 'all' || b.country === countryFilter;
    const matchesCategory = categoryFilter === 'all' || b.category === categoryFilter;
    return matchesCountry && matchesCategory;
  }), [benchmarks, countryFilter, categoryFilter]);

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(() => new Fuse(dropdownFiltered, {
    keys: ['description', 'category'],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [dropdownFiltered]);

  // Filter benchmarks with fuzzy search
  const filteredBenchmarks = useMemo(() => {
    if (!searchQuery.trim()) return dropdownFiltered;
    return fuse.search(searchQuery).map((r) => r.item);
  }, [searchQuery, fuse, dropdownFiltered]);

  // Paginate
  const paginatedBenchmarks = filteredBenchmarks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const totalPages = Math.ceil(filteredBenchmarks.length / pageSize);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, countryFilter, categoryFilter]);

  if (showUploader) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setShowUploader(false)}>
          ← Back to Benchmark List
        </Button>
        <BenchmarkUploader
          onUploadComplete={() => {
            setShowUploader(false);
            fetchBenchmarks();
          }}
        />
      </div>
    );
  }

  if (showImporter) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => { setShowImporter(false); fetchBenchmarks(); }}>
          ← Back to Benchmark List
        </Button>
        <BenchmarkCsvImporter />
      </div>
    );
  }

  if (showDuplicates) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5" />
                Duplicate Detection
              </CardTitle>
              <CardDescription>
                Found {duplicateGroups.length} groups of duplicates (same item, different country codes)
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setShowDuplicates(false)}>
              ← Back
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 p-4 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium mr-2">Auto-select duplicates, keeping:</span>
            {countries.filter(c => c && c.trim() !== '').slice(0, 5).map((country) => (
              <Button
                key={country}
                variant="outline"
                size="sm"
                onClick={() => selectAllDuplicatesKeepOne(country)}
              >
                Keep {country}
              </Button>
            ))}
          </div>

          {/* Selection actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <span className="font-medium">{selectedIds.size} items selected</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear Selection
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} items?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the selected benchmark prices. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelected}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Duplicate groups */}
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {duplicateGroups.map((group) => (
              <div key={group.key} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium">{group.description}</p>
                    <p className="text-sm text-muted-foreground">
                      Unit: {group.unit} | Countries: {group.countries.join(', ')}
                    </p>
                  </div>
                  <Badge variant="secondary">{group.items.length} duplicates</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={group.items.every((i) => selectedIds.has(i.id))}
                          onCheckedChange={() => toggleSelectAll(group.items)}
                        />
                      </TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Min</TableHead>
                      <TableHead className="text-right">Avg</TableHead>
                      <TableHead className="text-right">Max</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((item) => (
                      <TableRow key={item.id} className={selectedIds.has(item.id) ? 'bg-destructive/10' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.country}</Badge>
                        </TableCell>
                        <TableCell>{item.currency}</TableCell>
                        <TableCell className="text-right">{item.min_price?.toLocaleString() || '-'}</TableCell>
                        <TableCell className="text-right font-medium">{item.avg_price.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{item.max_price?.toLocaleString() || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Benchmark Database
            </CardTitle>
            <CardDescription>
              {benchmarks.length.toLocaleString()} reference prices across{' '}
              {countries.length} countries
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={fetchBenchmarks}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {duplicateGroups.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowDuplicates(true)}
                className="border-warning text-warning hover:bg-warning/10"
              >
                <Copy className="h-4 w-4 mr-2" />
                {duplicateGroups.length} Duplicates
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={benchmarks.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button size="sm" onClick={() => setShowImporter(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <div className="flex items-center gap-2">
              {missingEmbeddingsCount !== null && missingEmbeddingsCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Missing: {missingEmbeddingsCount.toLocaleString()}
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateEmbeddings}
                disabled={isGeneratingEmbeddings || benchmarks.length === 0}
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                {isGeneratingEmbeddings ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Missing Embeddings
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Embedding generation progress */}
        {isGeneratingEmbeddings && embeddingProgress && (
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating embeddings...
              </span>
              <span className="text-muted-foreground">
                {embeddingProgress.processed} / {embeddingProgress.total}
              </span>
            </div>
            <Progress
              value={embeddingProgress.total > 0
                ? (embeddingProgress.processed / embeddingProgress.total) * 100
                : 0}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search descriptions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countries.filter((c) => c && c.trim() !== '').map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.filter((c) => c && c.trim() !== '').map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>

          {/* Selection actions */}
          {selectedIds.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete {selectedIds.size}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} items?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected benchmark prices. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSelected}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {benchmarks.length > 0 && selectedIds.size === 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear All ({benchmarks.length.toLocaleString()})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Entire Benchmark Database?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all <strong>{benchmarks.length.toLocaleString()}</strong> benchmark price records. 
                    This action cannot be undone. Import a new CSV after clearing to repopulate the database.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Delete All {benchmarks.length.toLocaleString()} Records
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredBenchmarks.length === 0 ? (
          <div className="text-center py-12">
            <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No benchmark data</h3>
            <p className="text-muted-foreground mb-4">
              {benchmarks.length === 0
                ? 'Upload a CSV file to get started with benchmark pricing data.'
                : 'No results match your current filters.'}
            </p>
            {benchmarks.length === 0 && (
              <Button onClick={() => setShowImporter(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={paginatedBenchmarks.length > 0 && paginatedBenchmarks.every((b) => selectedIds.has(b.id))}
                        onCheckedChange={() => toggleSelectAll(paginatedBenchmarks)}
                      />
                    </TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Avg</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBenchmarks.map((benchmark) => (
                    <TableRow 
                      key={benchmark.id}
                      className={selectedIds.has(benchmark.id) ? 'bg-destructive/10' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(benchmark.id)}
                          onCheckedChange={() => toggleSelect(benchmark.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{benchmark.category}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <span className="line-clamp-2">{benchmark.description}</span>
                      </TableCell>
                      <TableCell>{benchmark.unit}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{benchmark.country}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {benchmark.min_price?.toLocaleString() || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {benchmark.avg_price.toLocaleString()} {benchmark.currency}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {benchmark.max_price?.toLocaleString() || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {benchmark.source || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredBenchmarks.length > pageSize && (
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredBenchmarks.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
