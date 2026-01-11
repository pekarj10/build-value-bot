import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { ExecutiveSummary } from '@/components/project/ExecutiveSummary';
import { InsightsPanel } from '@/components/project/InsightsPanel';
import { CostItemsTable } from '@/components/project/CostItemsTable';
import { CostItemDrawer } from '@/components/project/CostItemDrawer';
import { AIChatPanel } from '@/components/project/AIChatPanel';
import { AIFloatingButton } from '@/components/project/AIFloatingButton';
import { ExportDialog } from '@/components/project/ExportDialog';
import { DeleteProjectDialog } from '@/components/project/DeleteProjectDialog';
import { AddCostItemDialog } from '@/components/project/AddCostItemDialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CostItem, PROJECT_TYPE_LABELS, SUPPORTED_COUNTRIES, Project } from '@/types/project';
import { useProject } from '@/hooks/useProject';
import { useCostAnalysis } from '@/hooks/useCostAnalysis';
import { 
  FileSpreadsheet, 
  FileText,
  MapPin,
  Calendar,
  LayoutDashboard,
  BarChart3,
  Table,
  Bot,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getProject, getCostItems, updateCostItem, deleteCostItem, addCostItem, deleteProject } = useProject();
  const { processClarification, analyzeItems, isAnalyzing } = useCostAnalysis();

  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<CostItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CostItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isProcessingClarification, setIsProcessingClarification] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tradeFilter, setTradeFilter] = useState<string>('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('items');

  // Get unique trades for the add item dialog
  const trades = useMemo(() => 
    [...new Set(items.map(item => item.trade).filter(Boolean))] as string[],
    [items]
  );

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
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
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

  const handleAccept = async (itemId: string) => {
    await updateCostItem(itemId, { status: 'ok' });
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, status: 'ok' as const } : item
    ));
    toast.success('Item accepted');
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
    toast.success('Price updated');
  };

  const handlePriceUpdate = async (itemId: string, price: number) => {
    await handleOverride(itemId, price);
  };

  const handleBulkAccept = async (itemIds: string[]) => {
    for (const itemId of itemIds) {
      await updateCostItem(itemId, { status: 'ok' });
    }
    setItems(prev => prev.map(item => 
      itemIds.includes(item.id) ? { ...item, status: 'ok' as const } : item
    ));
    toast.success(`${itemIds.length} items accepted`);
  };

  const handleBulkMarkReviewed = async (itemIds: string[]) => {
    for (const itemId of itemIds) {
      await updateCostItem(itemId, { status: 'review' });
    }
    setItems(prev => prev.map(item => 
      itemIds.includes(item.id) ? { ...item, status: 'review' as const } : item
    ));
    toast.success(`${itemIds.length} items marked for review`);
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
        i.id === itemId ? { ...i, ...updatedFields, userClarification: text } : i
      ));
      setSelectedItem(null);
      toast.success('Item re-analyzed with clarification');
    } catch (error) {
      console.error('Clarification failed:', error);
      toast.error('Failed to process clarification');
    } finally {
      setIsProcessingClarification(false);
    }
  };

  const handleFilterByStatus = (status: string) => {
    setStatusFilter(status);
    setActiveTab('items');
  };

  const handleFilterByTrade = (trade: string) => {
    setTradeFilter(trade);
    setActiveTab('items');
  };

  const handleAIItemsUpdate = async (updates: { id: string; updates: Partial<CostItem> }[]) => {
    // Update local state
    setItems(prev => prev.map(item => {
      const update = updates.find(u => u.id === item.id);
      if (update) {
        return { ...item, ...update.updates };
      }
      return item;
    }));

    // Persist to database
    for (const { id, updates: itemUpdates } of updates) {
      await updateCostItem(id, {
        interpreted_scope: itemUpdates.interpretedScope,
        recommended_unit_price: itemUpdates.recommendedUnitPrice,
        benchmark_min: itemUpdates.benchmarkMin,
        benchmark_typical: itemUpdates.benchmarkTypical,
        benchmark_max: itemUpdates.benchmarkMax,
        status: itemUpdates.status,
        ai_comment: itemUpdates.aiComment,
        clarification_question: itemUpdates.clarificationQuestion,
        total_price: itemUpdates.totalPrice,
      });
    }

    toast.success(`${updates.length} items updated by AI`);
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    const success = await deleteProject(id);
    if (success) {
      navigate('/projects', { replace: true });
    }
  };

  const handleDeleteItem = async (itemId: string): Promise<boolean> => {
    const success = await deleteCostItem(itemId);
    if (success) {
      setItems(prev => prev.filter(item => item.id !== itemId));
    }
    return success;
  };

  const handleReanalyzeItems = async (itemIds: string[]) => {
    if (!project) return;
    
    setIsReanalyzing(true);
    
    try {
      const itemsToAnalyze = items
        .filter(item => itemIds.includes(item.id))
        .map(item => ({
          id: item.id,
          originalDescription: item.originalDescription,
          quantity: item.quantity,
          unit: item.unit,
          originalUnitPrice: item.originalUnitPrice,
          trade: item.trade,
          sheetName: item.sheetName,
        }));
      
      if (itemsToAnalyze.length === 0) return;
      
      toast.info(`Re-analyzing ${itemsToAnalyze.length} item(s)...`);
      
      const analyzedItems = await analyzeItems(itemsToAnalyze, {
        country: project.country,
        currency: project.currency,
        projectType: project.projectType,
        name: project.name,
      });
      
      // Update local state with analysis results
      setItems(prev => prev.map(item => {
        const analyzed = analyzedItems.find(a => a.id === item.id);
        if (analyzed) {
          return { ...item, ...analyzed, projectId: item.projectId };
        }
        return item;
      }));
      
      // Persist analysis results to database
      for (const analyzed of analyzedItems) {
        await updateCostItem(analyzed.id, {
          interpreted_scope: analyzed.interpretedScope,
          recommended_unit_price: analyzed.recommendedUnitPrice,
          benchmark_min: analyzed.benchmarkMin,
          benchmark_typical: analyzed.benchmarkTypical,
          benchmark_max: analyzed.benchmarkMax,
          total_price: analyzed.totalPrice,
          status: analyzed.status,
          ai_comment: analyzed.aiComment,
        });
      }
      
      const underpricedCount = analyzedItems.filter(i => i.status === 'underpriced').length;
      const reviewCount = analyzedItems.filter(i => i.status === 'review').length;
      const okCount = analyzedItems.filter(i => i.status === 'ok').length;
      
      if (underpricedCount > 0 || reviewCount > 0) {
        toast.warning(`Analysis complete: ${okCount} OK, ${underpricedCount} underpriced, ${reviewCount} need review`);
      } else {
        toast.success(`${analyzedItems.length} item(s) re-analyzed successfully`);
      }
    } catch (error) {
      console.error('Re-analysis failed:', error);
      toast.error('Re-analysis failed. Please try again.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleAddItems = async (newItems: { 
    description: string; 
    quantity: number; 
    unit: string; 
    originalPrice?: number;
    trade?: string;
  }[]) => {
    if (!id || !project) return;
    
    const addedItems: CostItem[] = [];
    
    for (const item of newItems) {
      const itemId = await addCostItem(id, {
        originalDescription: item.description,
        quantity: item.quantity,
        unit: item.unit,
        originalUnitPrice: item.originalPrice,
        trade: item.trade,
      });
      
      if (itemId) {
        const newItem: CostItem = {
          id: itemId,
          projectId: id,
          originalDescription: item.description,
          interpretedScope: item.description,
          quantity: item.quantity,
          unit: item.unit,
          originalUnitPrice: item.originalPrice,
          recommendedUnitPrice: 0,
          benchmarkMin: 0,
          benchmarkTypical: 0,
          benchmarkMax: 0,
          totalPrice: (item.originalPrice || 0) * item.quantity,
          status: 'clarification',
          aiComment: 'Analyzing...',
          trade: item.trade || 'Manual Entry',
          sheetName: 'Manual',
        };
        addedItems.push(newItem);
        setItems(prev => [...prev, newItem]);
      }
    }
    
    if (addedItems.length === 0) return;
    
    // Automatically run AI analysis on new items
    toast.info(`Analyzing ${addedItems.length} new item(s)...`);
    
    try {
      const itemsToAnalyze = addedItems.map(item => ({
        id: item.id,
        originalDescription: item.originalDescription,
        quantity: item.quantity,
        unit: item.unit,
        originalUnitPrice: item.originalUnitPrice,
        trade: item.trade,
        sheetName: item.sheetName,
      }));
      
      const analyzedItems = await analyzeItems(itemsToAnalyze, {
        country: project.country,
        currency: project.currency,
        projectType: project.projectType,
        name: project.name,
      });
      
      // Update local state with analysis results
      setItems(prev => prev.map(item => {
        const analyzed = analyzedItems.find(a => a.id === item.id);
        if (analyzed) {
          return { ...item, ...analyzed, projectId: id };
        }
        return item;
      }));
      
      // Persist analysis results to database
      for (const analyzed of analyzedItems) {
        await updateCostItem(analyzed.id, {
          interpreted_scope: analyzed.interpretedScope,
          recommended_unit_price: analyzed.recommendedUnitPrice,
          benchmark_min: analyzed.benchmarkMin,
          benchmark_typical: analyzed.benchmarkTypical,
          benchmark_max: analyzed.benchmarkMax,
          total_price: analyzed.totalPrice,
          status: analyzed.status,
          ai_comment: analyzed.aiComment,
        });
      }
      
      const underpricedCount = analyzedItems.filter(i => i.status === 'underpriced').length;
      const reviewCount = analyzedItems.filter(i => i.status === 'review').length;
      
      if (underpricedCount > 0 || reviewCount > 0) {
        toast.warning(`Analysis complete: ${underpricedCount} underpriced, ${reviewCount} need review`);
      } else {
        toast.success(`${addedItems.length} item(s) analyzed successfully`);
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      toast.error('AI analysis failed. Items added but not analyzed.');
    }
  };

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
            <Button 
              variant="outline" 
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => setShowExportDialog(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Project Info Bar */}
        <Card className="p-4">
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

        {/* Executive Summary */}
        <ExecutiveSummary items={items} currency={project.currency} />

        {/* Tabs for different views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="items" className="flex items-center gap-2">
              <Table className="h-4 w-4" />
              Cost Items
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Overview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            <CostItemsTable
              items={items}
              currency={project.currency}
              onItemSelect={setSelectedItem}
              onPriceUpdate={handlePriceUpdate}
              onBulkAccept={handleBulkAccept}
              onBulkMarkReviewed={handleBulkMarkReviewed}
              onDeleteItem={handleDeleteItem}
              onAddItem={() => setShowAddItemDialog(true)}
              onReanalyzeItems={handleReanalyzeItems}
              isReanalyzing={isReanalyzing || isAnalyzing}
              statusFilter={statusFilter}
              tradeFilter={tradeFilter}
            />
          </TabsContent>

          <TabsContent value="ai">
            <div className="h-[600px]">
              <AIChatPanel 
                project={project}
                items={items}
                onItemsUpdate={handleAIItemsUpdate}
              />
            </div>
          </TabsContent>

          <TabsContent value="insights">
            <InsightsPanel 
              items={items} 
              currency={project.currency}
              onFilterByStatus={handleFilterByStatus}
              onFilterByTrade={handleFilterByTrade}
            />
          </TabsContent>

          <TabsContent value="overview">
            <div className="grid grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Project Notes</h3>
                <p className="text-muted-foreground">
                  {project.notes || 'No notes added for this project.'}
                </p>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Analysis Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Items</span>
                    <span className="font-medium">{items.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items with Original Price</span>
                    <span className="font-medium">
                      {items.filter(i => i.originalUnitPrice).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items Analyzed</span>
                    <span className="font-medium">
                      {items.filter(i => i.recommendedUnitPrice).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User Overrides</span>
                    <span className="font-medium">
                      {items.filter(i => i.userOverridePrice).length}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
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

      {/* Floating AI Button */}
      <AIFloatingButton 
        project={project}
        items={items}
        onItemsUpdate={handleAIItemsUpdate}
      />

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        project={project}
        items={items}
      />

      {/* Delete Dialog */}
      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        projectName={project.name}
        onConfirm={handleDeleteProject}
      />

      {/* Add Cost Item Dialog */}
      <AddCostItemDialog
        open={showAddItemDialog}
        onOpenChange={setShowAddItemDialog}
        onSubmit={handleAddItems}
        trades={trades}
        isAnalyzing={isAnalyzing}
      />
    </AppLayout>
  );
}