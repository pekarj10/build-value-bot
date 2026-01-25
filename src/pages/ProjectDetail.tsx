import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { ClarificationsList } from '@/components/project/ClarificationsList';
import { ProjectNotes } from '@/components/project/ProjectNotes';

import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CostItem, CostItemStatus, PROJECT_TYPE_LABELS, SUPPORTED_COUNTRIES, Project } from '@/types/project';
import { useProject } from '@/hooks/useProject';
import { useCostAnalysis } from '@/hooks/useCostAnalysis';
import { useAuth } from '@/hooks/useAuth';
import { useViewMode } from '@/hooks/useViewMode';
import { supabase } from '@/integrations/supabase/client';
import { 
  MapPin,
  Calendar,
  LayoutDashboard,
  BarChart3,
  Table,
  Bot,
  Trash2,
  FileDown,
  StickyNote
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showAsAdmin } = useViewMode();
  const effectiveIsAdmin = isAdmin && showAsAdmin;
  const { getProject, getCostItems, updateCostItem, deleteCostItem, addCostItem, deleteProject, updateProjectNotes, syncProjectTotals } = useProject();
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

  // Project notes handler - must be before conditional returns
  const handleSaveProjectNotes = useCallback(async (notes: string) => {
    if (!id) return;
    await updateProjectNotes(id, notes);
    setProject(prev => prev ? { ...prev, projectNotes: notes } : prev);
  }, [id, updateProjectNotes]);

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
    if (id) await syncProjectTotals(id);
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
    if (id) await syncProjectTotals(id);
    toast.success('Price updated');
  };

  const handlePriceUpdate = async (itemId: string, price: number) => {
    await handleOverride(itemId, price);
  };

  const handleResetPrice = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    // Fall back to original price if no recommended price exists
    const resetPrice = item.recommendedUnitPrice ?? item.originalUnitPrice ?? 0;
    if (resetPrice === 0) return; // Don't reset if there's no price to reset to
    const totalPrice = item.quantity * resetPrice;
    
    // Determine the appropriate status after reset:
    // - If item has a valid recommended price, status stays as-is (ok is fine)
    // - If item only has original price (no recommendation), set to 'review' since it needs attention
    const hasRecommendation = item.recommendedUnitPrice !== null && item.recommendedUnitPrice !== undefined;
    const newStatus = hasRecommendation ? item.status : 'review';
    
    await updateCostItem(itemId, { 
      user_override_price: null, 
      total_price: totalPrice,
      status: newStatus
    });
    setItems(prev => prev.map(i => i.id === itemId ? { 
      ...i, 
      userOverridePrice: undefined, 
      totalPrice,
      status: newStatus as CostItemStatus
    } : i));
    if (id) await syncProjectTotals(id);
  };

  const handleMarkActual = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Update status to 'actual' 
    await updateCostItem(itemId, { status: 'actual' });
    setItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, status: 'actual' as const } : i
    ));
    if (id) await syncProjectTotals(id);

    // Collect actual cost data for learning (call edge function)
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session) {
        await supabase.functions.invoke('collect-actual-cost', {
          body: { costItemId: itemId },
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        });
      }
    } catch (error) {
      console.error('Failed to collect actual cost data:', error);
      // Don't show error to user - data collection is non-critical
    }

    toast.success('Item marked as actual (verified cost)');
  };

  const handleBulkAccept = async (itemIds: string[]) => {
    for (const itemId of itemIds) {
      await updateCostItem(itemId, { status: 'ok' });
    }
    setItems(prev => prev.map(item => 
      itemIds.includes(item.id) ? { ...item, status: 'ok' as const } : item
    ));
    if (id) await syncProjectTotals(id);
    toast.success(`${itemIds.length} items accepted`);
  };

  const handleBulkMarkReviewed = async (itemIds: string[]) => {
    for (const itemId of itemIds) {
      await updateCostItem(itemId, { status: 'review' });
    }
    setItems(prev => prev.map(item => 
      itemIds.includes(item.id) ? { ...item, status: 'review' as const } : item
    ));
    if (id) await syncProjectTotals(id);
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
      if (id) await syncProjectTotals(id);
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

    // Persist to database - INCLUDING all benchmark matching fields
    for (const { id: itemId, updates: itemUpdates } of updates) {
      await updateCostItem(itemId, {
        interpreted_scope: itemUpdates.interpretedScope,
        recommended_unit_price: itemUpdates.recommendedUnitPrice,
        benchmark_min: itemUpdates.benchmarkMin,
        benchmark_typical: itemUpdates.benchmarkTypical,
        benchmark_max: itemUpdates.benchmarkMax,
        status: itemUpdates.status,
        ai_comment: itemUpdates.aiComment,
        clarification_question: itemUpdates.clarificationQuestion,
        total_price: itemUpdates.totalPrice,
        // CRITICAL: Persist benchmark matching fields for consistency
        matched_benchmark_id: itemUpdates.matchedBenchmarkId || null,
        match_confidence: itemUpdates.matchConfidence || null,
        match_reasoning: itemUpdates.matchReasoning || null,
        price_source: itemUpdates.priceSource || null,
      });
    }

    // Sync project totals after AI updates
    if (id) await syncProjectTotals(id);
    toast.success(`${updates.length} items updated by AI`);
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    const success = await deleteProject(id);
    if (success) {
      navigate('/projects', { replace: true });
    }
  };

  // Clarification management handlers
  const handleUpdateClarification = async (itemId: string, clarification: string) => {
    await updateCostItem(itemId, { user_clarification: clarification });
    setItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, userClarification: clarification } : i
    ));
    toast.success('Clarification updated');
  };

  const handleResolveClarification = async (itemId: string) => {
    await updateCostItem(itemId, { status: 'ok' });
    setItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, status: 'ok' as const } : i
    ));
    if (id) await syncProjectTotals(id);
    toast.success('Item marked as resolved');
  };

  const handleDeleteClarification = async (itemId: string) => {
    await updateCostItem(itemId, { status: 'review' });
    setItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, status: 'review' as const } : i
    ));
    if (id) await syncProjectTotals(id);
    toast.success('Clarification status removed');
  };


  const handleDeleteItem = async (itemId: string): Promise<boolean> => {
    const success = await deleteCostItem(itemId);
    if (success) {
      setItems(prev => prev.filter(item => item.id !== itemId));
      if (id) await syncProjectTotals(id);
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
      
      // Persist analysis results to database - INCLUDING all benchmark matching fields
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
          // CRITICAL: Persist benchmark matching fields for consistency
          matched_benchmark_id: analyzed.matchedBenchmarkId || null,
          match_confidence: analyzed.matchConfidence || null,
          match_reasoning: analyzed.matchReasoning || null,
          price_source: analyzed.priceSource || null,
        });
      }

      // Single-item UX: show a detailed toast with what changed.
      if (itemIds.length === 1 && analyzedItems.length === 1) {
        const a = analyzedItems[0];
        const price = a.recommendedUnitPrice;
        if (price != null) {
          const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: project.currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(price);
          toast.success(`${a.originalDescription} - Updated: ${formatted}/${a.unit}`);
        } else {
          toast.success(`${a.originalDescription} - Updated`);
        }
      }
      
      const underpricedCount = analyzedItems.filter(i => i.status === 'underpriced').length;
      const reviewCount = analyzedItems.filter(i => i.status === 'review').length;
      const okCount = analyzedItems.filter(i => i.status === 'ok').length;
      
      // Sync project totals after re-analysis
      if (id) await syncProjectTotals(id);
      
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
      
      // Persist analysis results to database - INCLUDING all benchmark matching fields
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
          // CRITICAL: Persist benchmark matching fields for consistency
          matched_benchmark_id: analyzed.matchedBenchmarkId || null,
          match_confidence: analyzed.matchConfidence || null,
          match_reasoning: analyzed.matchReasoning || null,
          price_source: analyzed.priceSource || null,
        });
      }
      
      const underpricedCount = analyzedItems.filter(i => i.status === 'underpriced').length;
      const reviewCount = analyzedItems.filter(i => i.status === 'review').length;
      
      // Sync project totals after adding items
      if (id) await syncProjectTotals(id);
      
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
              <FileDown className="h-4 w-4 mr-2" />
              {effectiveIsAdmin ? 'Export' : 'Export PDF'}
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Project Info Bar */}
        <Card className="p-4 animate-enter wow-elevated">
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
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Notes
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
              onResetPrice={handleResetPrice}
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main AI Chat */}
              <div className="lg:col-span-2 h-[600px]">
                <AIChatPanel 
                  project={project}
                  items={items}
                  onItemsUpdate={handleAIItemsUpdate}
                />
              </div>
              
              {/* Clarifications Panel */}
              <div className="lg:col-span-1">
                <ClarificationsList
                  items={items}
                  onUpdateClarification={handleUpdateClarification}
                  onResolveClarification={handleResolveClarification}
                  onDeleteClarification={handleDeleteClarification}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notes">
            <ProjectNotes
              projectId={project.id}
              initialNotes={project.projectNotes || ''}
              onSave={handleSaveProjectNotes}
              lastUpdated={project.updatedAt}
            />
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
        onResetPrice={handleResetPrice}
        onMarkActual={handleMarkActual}
        isProcessingClarification={isProcessingClarification}
        isAdmin={isAdmin}
        projectCountry={project.country}
      />

      {/* View Mode Toggle is now in sidebar, Banner is in AppLayout */}

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
        isAdmin={isAdmin}
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