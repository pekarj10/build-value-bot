import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Target,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PendingBenchmarkCost {
  id: string;
  item_description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  total_cost: number;
  country_code: string;
  category: string | null;
  trust_score: number | null;
  created_at: string;
  data_source: string;
}

export function DataQualityPanel() {
  const [pendingItems, setPendingItems] = useState<PendingBenchmarkCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const fetchPendingItems = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('benchmark_costs')
        .select('*')
        .eq('approved', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Type assertion for the data
      setPendingItems((data || []) as unknown as PendingBenchmarkCost[]);
    } catch (error) {
      console.error('Failed to fetch pending items:', error);
      toast.error('Failed to load pending items');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingItems();
  }, []);

  const handleApprove = async (id: string) => {
    setProcessingIds(prev => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from('benchmark_costs')
        .update({ approved: true })
        .eq('id', id);

      if (error) throw error;

      setPendingItems(prev => prev.filter(item => item.id !== id));
      toast.success('Item approved and added to learning database');
    } catch (error) {
      console.error('Failed to approve item:', error);
      toast.error('Failed to approve item');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReject = async (id: string) => {
    setProcessingIds(prev => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from('benchmark_costs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPendingItems(prev => prev.filter(item => item.id !== id));
      toast.success('Item rejected and removed');
    } catch (error) {
      console.error('Failed to reject item:', error);
      toast.error('Failed to reject item');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const getTrustScoreBadge = (score: number | null) => {
    if (score === null) return <Badge variant="secondary">N/A</Badge>;
    
    if (score >= 80) {
      return <Badge className="bg-success/10 text-success border-success/20">{score}%</Badge>;
    }
    if (score >= 60) {
      return <Badge className="bg-warning/10 text-warning border-warning/20">{score}%</Badge>;
    }
    return <Badge className="bg-destructive/10 text-destructive border-destructive/20">{score}%</Badge>;
  };

  const formatCurrency = (value: number, countryCode: string) => {
    const currencyMap: Record<string, string> = {
      'SE': 'SEK', 'CZ': 'CZK', 'DE': 'EUR', 'AT': 'EUR',
      'PL': 'PLN', 'GB': 'GBP', 'US': 'USD',
    };
    const currency = currencyMap[countryCode] || 'SEK';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value) + ' ' + currency;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Data Quality Review
          </CardTitle>
          <CardDescription>Review outstanding items before adding to learning database</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Data Quality Review
              {pendingItems.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingItems.length} pending
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Review outstanding items before adding to learning database
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPendingItems}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pendingItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success/50" />
            <p className="font-medium">No items pending review</p>
            <p className="text-sm">All submitted actual costs have been processed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Unit Rate</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Trust Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm line-clamp-2">{item.item_description}</p>
                        {item.category && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {item.category}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.unit}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(item.unit_rate, item.country_code)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(item.total_cost, item.country_code)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.country_code}</Badge>
                    </TableCell>
                    <TableCell>
                      {getTrustScoreBadge(item.trust_score)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-success hover:text-success hover:bg-success/10"
                          onClick={() => handleApprove(item.id)}
                          disabled={processingIds.has(item.id)}
                        >
                          {processingIds.has(item.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleReject(item.id)}
                          disabled={processingIds.has(item.id)}
                        >
                          {processingIds.has(item.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Flagging reason explanation */}
        {pendingItems.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Why items are flagged for review:</p>
                <ul className="mt-1 text-muted-foreground space-y-0.5">
                  <li>• Trust score below 50%</li>
                  <li>• Unusual unit rate (very low or very high)</li>
                  <li>• Unrecognized unit type</li>
                  <li>• Price patterns that differ significantly from existing data</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
