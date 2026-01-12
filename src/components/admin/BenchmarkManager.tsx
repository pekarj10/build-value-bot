import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Search, 
  Trash2, 
  Upload, 
  Database,
  Download,
  RefreshCw
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

export function BenchmarkManager() {
  const [benchmarks, setBenchmarks] = useState<BenchmarkPrice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showUploader, setShowUploader] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Get unique countries and categories for filters
  const countries = [...new Set(benchmarks.map((b) => b.country))].sort();
  const categories = [...new Set(benchmarks.map((b) => b.category))].sort();

  useEffect(() => {
    fetchBenchmarks();
  }, []);

  const fetchBenchmarks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('benchmark_prices')
        .select('*')
        .order('category', { ascending: true })
        .order('description', { ascending: true });

      if (error) throw error;
      setBenchmarks(data || []);
    } catch (error) {
      console.error('Error fetching benchmarks:', error);
      toast.error('Failed to load benchmark data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      const { error } = await supabase
        .from('benchmark_prices')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
      toast.success('All benchmark data deleted');
      setBenchmarks([]);
    } catch (error) {
      console.error('Error deleting benchmarks:', error);
      toast.error('Failed to delete benchmark data');
    }
  };

  const handleDeleteByCountry = async (country: string) => {
    try {
      const { error } = await supabase
        .from('benchmark_prices')
        .delete()
        .eq('country', country);

      if (error) throw error;
      toast.success(`Deleted all ${country} benchmarks`);
      fetchBenchmarks();
    } catch (error) {
      console.error('Error deleting benchmarks:', error);
      toast.error('Failed to delete benchmark data');
    }
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

  // Filter benchmarks
  const filteredBenchmarks = benchmarks.filter((b) => {
    const matchesSearch =
      b.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCountry = countryFilter === 'all' || b.country === countryFilter;
    const matchesCategory = categoryFilter === 'all' || b.category === categoryFilter;
    return matchesSearch && matchesCountry && matchesCategory;
  });

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchBenchmarks}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={benchmarks.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button size="sm" onClick={() => setShowUploader(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
              {countries.map((country) => (
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
              {categories.map((category) => (
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

          {benchmarks.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete All Benchmarks?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {benchmarks.length} benchmark prices. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll}>
                    Delete All
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
              <Button onClick={() => setShowUploader(true)}>
                <Upload className="h-4 w-4 mr-2" />
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
                    <TableRow key={benchmark.id}>
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
