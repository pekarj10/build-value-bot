import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProjectType, CostItem, CostItemStatus } from '@/types/project';

interface CreateProjectData {
  name: string;
  country: string;
  currency: string;
  projectType: ProjectType;
  notes?: string;
}

interface DbProject {
  id: string;
  name: string;
  country: string;
  currency: string;
  project_type: string;
  notes: string | null;
  status: string;
  total_items: number | null;
  total_value: number | null;
  issues_count: number | null;
  created_at: string;
  updated_at: string;
}

interface DbCostItem {
  id: string;
  project_id: string;
  sheet_name: string | null;
  trade: string | null;
  original_description: string;
  interpreted_scope: string | null;
  quantity: number;
  unit: string;
  original_unit_price: number | null;
  recommended_unit_price: number | null;
  benchmark_min: number | null;
  benchmark_typical: number | null;
  benchmark_max: number | null;
  total_price: number | null;
  status: string;
  ai_comment: string | null;
  clarification_question: string | null;
  user_clarification: string | null;
  user_override_price: number | null;
}

export function useProject() {
  const [isLoading, setIsLoading] = useState(false);

  const createProject = useCallback(async (data: CreateProjectData): Promise<string | null> => {
    setIsLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in to create a project');
        return null;
      }

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name: data.name,
          country: data.country,
          currency: data.currency,
          project_type: data.projectType,
          notes: data.notes || null,
          status: 'draft',
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return project.id;
    } catch (error) {
      console.error('Create project error:', error);
      toast.error('Failed to create project');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadFile = useCallback(async (
    projectId: string,
    file: File
  ): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${projectId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Record file in database
      await supabase
        .from('uploaded_files')
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: filePath,
          status: 'uploaded',
        });

      return filePath;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${file.name}`);
      return null;
    }
  }, []);

  const parseExcelFile = useCallback(async (
    projectId: string,
    storagePath: string
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('parse-excel', {
        body: { projectId, storagePath },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(`Parsed ${data.itemCount} cost items`);
      return true;
    } catch (error) {
      console.error('Parse error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to parse file');
      return false;
    }
  }, []);

  const getProject = useCallback(async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      
      const project = data as DbProject;
      return {
        id: project.id,
        name: project.name,
        country: project.country,
        currency: project.currency,
        projectType: project.project_type as ProjectType,
        notes: project.notes || undefined,
        status: project.status as 'draft' | 'processing' | 'ready' | 'exported',
        totalItems: project.total_items || 0,
        totalValue: project.total_value || 0,
        issuesCount: project.issues_count || 0,
        createdAt: new Date(project.created_at),
        updatedAt: new Date(project.updated_at),
      };
    } catch (error) {
      console.error('Get project error:', error);
      return null;
    }
  }, []);

  const getAllProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return (data as DbProject[]).map((project) => ({
        id: project.id,
        name: project.name,
        country: project.country,
        currency: project.currency,
        projectType: project.project_type as ProjectType,
        notes: project.notes || undefined,
        status: project.status as 'draft' | 'processing' | 'ready' | 'exported',
        totalItems: project.total_items || 0,
        totalValue: project.total_value || 0,
        issuesCount: project.issues_count || 0,
        createdAt: new Date(project.created_at),
        updatedAt: new Date(project.updated_at),
      }));
    } catch (error) {
      console.error('Get all projects error:', error);
      return [];
    }
  }, []);

  const getCostItems = useCallback(async (projectId: string): Promise<CostItem[]> => {
    try {
      const { data, error } = await supabase
        .from('cost_items')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at');

      if (error) throw error;

      return (data as DbCostItem[]).map((item) => ({
        id: item.id,
        projectId: item.project_id,
        sheetName: item.sheet_name || undefined,
        trade: item.trade || undefined,
        originalDescription: item.original_description,
        interpretedScope: item.interpreted_scope || item.original_description,
        quantity: Number(item.quantity),
        unit: item.unit,
        originalUnitPrice: item.original_unit_price ? Number(item.original_unit_price) : undefined,
        recommendedUnitPrice: Number(item.recommended_unit_price || 0),
        benchmarkMin: Number(item.benchmark_min || 0),
        benchmarkTypical: Number(item.benchmark_typical || 0),
        benchmarkMax: Number(item.benchmark_max || 0),
        totalPrice: Number(item.total_price || 0),
        status: item.status as CostItemStatus,
        aiComment: item.ai_comment || '',
        clarificationQuestion: item.clarification_question || undefined,
        userClarification: item.user_clarification || undefined,
        userOverridePrice: item.user_override_price ? Number(item.user_override_price) : undefined,
      }));
    } catch (error) {
      console.error('Get cost items error:', error);
      return [];
    }
  }, []);

  const updateCostItem = useCallback(async (
    itemId: string,
    updates: Partial<{
      recommended_unit_price: number;
      benchmark_min: number;
      benchmark_typical: number;
      benchmark_max: number;
      status: string;
      ai_comment: string;
      clarification_question: string;
      interpreted_scope: string;
      user_clarification: string;
      user_override_price: number;
      total_price: number;
    }>
  ) => {
    try {
      const { error } = await supabase
        .from('cost_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update cost item error:', error);
      return false;
    }
  }, []);

  const updateProjectStatus = useCallback(async (
    projectId: string,
    status: string,
    additionalData?: { total_value?: number; issues_count?: number }
  ) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status, ...additionalData })
        .eq('id', projectId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update project status error:', error);
      return false;
    }
  }, []);

  return {
    isLoading,
    createProject,
    uploadFile,
    parseExcelFile,
    getProject,
    getAllProjects,
    getCostItems,
    updateCostItem,
    updateProjectStatus,
  };
}
