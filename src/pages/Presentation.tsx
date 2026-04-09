import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ExecutiveSummary } from '@/components/project/ExecutiveSummary';
import { CostItemsTable } from '@/components/project/CostItemsTable';
import { CostItem, Project } from '@/types/project';
import { useProjectTerminology } from '@/hooks/useProjectTerminology';
import { Loader2, BarChart3, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Presentation() {
  const { token } = useParams<{ token: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<CostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    loadPresentation();
  }, [token]);

  const loadPresentation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Look up the share token
      const { data: tokenData, error: tokenError } = await supabase
        .from('project_share_tokens')
        .select('project_id')
        .eq('token', token!)
        .eq('is_active', true)
        .maybeSingle();

      if (tokenError) throw tokenError;
      if (!tokenData) {
        setError('This presentation link is invalid or has expired.');
        return;
      }

      const projectId = tokenData.project_id;

      // Fetch project
      const { data: proj, error: projError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      if (projError) throw projError;
      if (!proj) {
        setError('Project not found.');
        return;
      }

      setProject({
        id: proj.id,
        name: proj.name,
        country: proj.country,
        currency: proj.currency,
        projectType: proj.project_type as Project['projectType'],
        status: proj.status as Project['status'],
        totalItems: proj.total_items || 0,
        totalValue: proj.total_value || 0,
        issuesCount: proj.issues_count || 0,
        createdAt: new Date(proj.created_at),
        updatedAt: new Date(proj.updated_at),
        notes: proj.notes,
        userId: proj.user_id,
      });

      // Fetch cost items
      const { data: costItems, error: itemsError } = await supabase
        .from('cost_items')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      setItems(
        (costItems || []).map((ci) => ({
          id: ci.id,
          projectId: ci.project_id,
          originalDescription: ci.original_description,
          interpretedScope: ci.interpreted_scope,
          trade: ci.trade,
          quantity: ci.quantity,
          unit: ci.unit,
          originalUnitPrice: ci.original_unit_price,
          recommendedUnitPrice: ci.recommended_unit_price,
          userOverridePrice: ci.user_override_price,
          totalPrice: ci.total_price,
          benchmarkMin: ci.benchmark_min,
          benchmarkMax: ci.benchmark_max,
          benchmarkTypical: ci.benchmark_typical,
          matchConfidence: ci.match_confidence,
          aiComment: ci.ai_comment,
          status: ci.status as CostItem['status'],
          clarificationQuestion: ci.clarification_question,
          userClarification: ci.user_clarification,
          sheetName: ci.sheet_name,
          createdAt: ci.created_at,
          updatedAt: ci.updated_at,
          priceSource: ci.price_source,
          matchedBenchmarkId: ci.matched_benchmark_id,
          matchReasoning: ci.match_reasoning,
          userExplanation: ci.user_explanation,
          mutationCount: ci.mutation_count,
          lastModifiedBy: ci.last_modified_by,
          lastModifiedAt: ci.last_modified_at,
        }))
      );
    } catch (err) {
      console.error('Presentation load error:', err);
      setError('Something went wrong loading this presentation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleInclude = useCallback((itemId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const t = useProjectTerminology(project?.projectType || 'new_construction_residential');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading presentation…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-6">
          <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-2xl font-bold">Presentation Unavailable</h1>
          <p className="text-muted-foreground">{error || 'This link is no longer valid.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">{project.name}</h1>
              <p className="text-xs text-muted-foreground">
                {project.country} • {project.currency}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            Interactive Presentation • Read Only
          </Badge>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* What-If info banner */}
        <div className="rounded-lg border bg-accent/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
          <span className="text-base">💡</span>
          Use the <strong className="text-foreground">"Include in Budget"</strong> toggle on each item to explore different budget scenarios. Changes are local to your session only.
        </div>

        <ExecutiveSummary
          items={items}
          currency={project.currency}
          excludedIds={excludedIds}
          projectType={project.projectType}
        />

        <CostItemsTable
          items={items}
          currency={project.currency}
          onItemSelect={() => {}} // no-op in presentation
          excludedIds={excludedIds}
          onToggleInclude={handleToggleInclude}
          isLoading={false}
        />
      </main>

      {/* Footer */}
      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-muted-foreground">
          Powered by CostWise • Interactive Presentation View
        </div>
      </footer>
    </div>
  );
}
