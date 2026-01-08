import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { CostItemsTable } from '@/components/project/CostItemsTable';
import { CostItemDrawer } from '@/components/project/CostItemDrawer';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CostItem, PROJECT_TYPE_LABELS, SUPPORTED_COUNTRIES, Project } from '@/types/project';
import { useProject } from '@/hooks/useProject';
import { useCostAnalysis } from '@/hooks/useCostAnalysis';
import { 
  FileSpreadsheet, 
  FileText,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { id } = useParams();
  const { getProject, getCostItems, updateCostItem } = useProject();
  const { processClarification } = useCostAnalysis();

  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<CostItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CostItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingClarification, setIsProcessingClarification] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    const loadData = async () => {
      setIsLoading(true);
      const [projectData, itemsData] = await Promise.all([
        getProject(id),
        getCostItems(id),
      ]);
      setProject(projectData);
      setItems(itemsData);
      setIsLoading(false);
    };

    loadData();
  }, [id, getProject, getCostItems]);

  const country = SUPPORTED_COUNTRIES.find(c => c.code === project?.country);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 space-y-8">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Project not found.</p>
          <Link to="/projects">
            <Button variant="outline" className="mt-4">Back to Projects</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: project.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleAccept = async (itemId: string) => {
    await updateCostItem(itemId, { status: 'ok' });
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, status: 'ok' as const } : item
    ));
  };

  const handleOverride = async (itemId: string, price: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const totalPrice = item.quantity * price;
    await updateCostItem(itemId, { 
      user_override_price: price, 
      status: 'ok',
      total_price: totalPrice 
    });
    setItems(prev => prev.map(i => 
      i.id === itemId 
        ? { ...i, userOverridePrice: price, status: 'ok' as const, totalPrice } 
        : i
    ));
  };

  const handlePriceUpdate = async (itemId: string, price: number) => {
    await handleOverride(itemId, price);
    toast.success('Price updated');
  };

  const handleClarify = async (itemId: string, text: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !project) return;

    setIsProcessingClarification(true);
    try {
      const updatedFields = await processClarification(item, text, {
        country: project.country,
        currency: project.currency,
        projectType: project.projectType,
      });

      await updateCostItem(itemId, {
        interpreted_scope: updatedFields.interpretedScope,
        recommended_unit_price: updatedFields.recommendedUnitPrice,
        benchmark_min: updatedFields.benchmarkMin,
        benchmark_typical: updatedFields.benchmarkTypical,
        benchmark_max: updatedFields.benchmarkMax,
        total_price: updatedFields.totalPrice,
        status: updatedFields.status,
        ai_comment: updatedFields.aiComment,
        user_clarification: text,
      });

      setItems(prev => prev.map(i => 
        i.id === itemId ? { ...i, ...updatedFields } : i
      ));
      setSelectedItem(null);
    } catch (error) {
      console.error('Clarification failed:', error);
    } finally {
      setIsProcessingClarification(false);
    }
  };

  const statusCounts = {
    ok: items.filter(i => i.status === 'ok').length,
    review: items.filter(i => i.status === 'review').length,
    clarification: items.filter(i => i.status === 'clarification').length,
  };

  const totalValue = items.reduce((sum, i) => sum + i.totalPrice, 0);

  return (
    <AppLayout>
      <PageHeader
        title={project.name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Projects', href: '/projects' },
          { label: project.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-8">
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{country?.name}</span>
              <span className="text-border">•</span>
              <span>{project.currency}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{PROJECT_TYPE_LABELS[project.projectType]}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Updated {format(project.updatedAt, 'MMM d, yyyy')}</span>
            </div>
            <div className="ml-auto">
              <StatusBadge status={project.status} size="md" />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Total Items" value={items.length.toString()} />
          <MetricCard title="Total Value" value={formatCurrency(totalValue)} />
          <MetricCard title="Items OK" value={statusCounts.ok.toString()} trend="up" />
          <MetricCard title="Need Attention" value={(statusCounts.review + statusCounts.clarification).toString()} trend={statusCounts.review + statusCounts.clarification > 0 ? 'down' : 'neutral'} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{statusCounts.ok}</p>
              <p className="text-sm text-muted-foreground">Items OK</p>
            </div>
          </Card>
          <Card className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{statusCounts.review}</p>
              <p className="text-sm text-muted-foreground">Need Review</p>
            </div>
          </Card>
          <Card className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <HelpCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{statusCounts.clarification}</p>
              <p className="text-sm text-muted-foreground">Need Clarification</p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Cost Items</h2>
          <CostItemsTable
            items={items}
            currency={project.currency}
            onItemSelect={setSelectedItem}
            onPriceUpdate={handlePriceUpdate}
          />
        </div>
      </div>

      <CostItemDrawer
        item={selectedItem}
        currency={project.currency}
        open={!!selectedItem}
        onClose={() => !isProcessingClarification && setSelectedItem(null)}
        onAccept={handleAccept}
        onOverride={handleOverride}
        onClarify={handleClarify}
        isProcessingClarification={isProcessingClarification}
      />
    </AppLayout>
  );
}
