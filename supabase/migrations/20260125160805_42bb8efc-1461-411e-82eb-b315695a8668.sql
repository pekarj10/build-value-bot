-- Create enum for mutation change types
CREATE TYPE public.mutation_change_type AS ENUM (
  'create',
  'update',
  'status_change',
  'price_override',
  'note_added',
  'delete',
  'restore'
);

-- Create the cost_item_mutations audit table
CREATE TABLE public.cost_item_mutations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cost_item_id UUID NOT NULL REFERENCES public.cost_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_type public.mutation_change_type NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraint: both old_value and new_value cannot be null simultaneously (unless it's a create/delete)
  CONSTRAINT valid_values CHECK (
    change_type IN ('create', 'delete', 'restore') OR 
    old_value IS NOT NULL OR 
    new_value IS NOT NULL
  )
);

-- Create indexes for fast lookups
CREATE INDEX idx_cost_item_mutations_cost_item_id ON public.cost_item_mutations(cost_item_id);
CREATE INDEX idx_cost_item_mutations_user_id ON public.cost_item_mutations(user_id);
CREATE INDEX idx_cost_item_mutations_created_at ON public.cost_item_mutations(created_at DESC);
CREATE UNIQUE INDEX idx_cost_item_mutations_unique ON public.cost_item_mutations(cost_item_id, created_at, field_name);

-- Add denormalized fields to cost_items for performance
ALTER TABLE public.cost_items
ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS mutation_count INTEGER NOT NULL DEFAULT 0;

-- Create index on last_modified_at for sorting
CREATE INDEX IF NOT EXISTS idx_cost_items_last_modified_at ON public.cost_items(last_modified_at DESC);

-- Enable RLS for cost_item_mutations
ALTER TABLE public.cost_item_mutations ENABLE ROW LEVEL SECURITY;

-- Users can view mutations for cost items in their projects
CREATE POLICY "Users can view mutations of their project cost items"
ON public.cost_item_mutations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.cost_items ci
    JOIN public.projects p ON p.id = ci.project_id
    WHERE ci.id = cost_item_mutations.cost_item_id
    AND (p.user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
);

-- Users can create mutations for cost items in their projects
CREATE POLICY "Users can create mutations for their project cost items"
ON public.cost_item_mutations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cost_items ci
    JOIN public.projects p ON p.id = ci.project_id
    WHERE ci.id = cost_item_mutations.cost_item_id
    AND (p.user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
);

-- Mutations are immutable - no updates allowed
-- (No UPDATE policy = no updates possible with RLS enabled)

-- Only admins can delete mutations (for compliance, this should be rarely used)
CREATE POLICY "Only admins can delete mutations"
ON public.cost_item_mutations
FOR DELETE
USING (public.is_admin(auth.uid()));

-- Create function to automatically log mutations and update denormalized fields
CREATE OR REPLACE FUNCTION public.log_cost_item_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_change_type mutation_change_type;
  v_field_name TEXT;
  v_old_value TEXT;
  v_new_value TEXT;
BEGIN
  -- Get current user (may be null for system operations)
  v_user_id := auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    -- Log creation
    INSERT INTO public.cost_item_mutations (
      cost_item_id, user_id, field_name, old_value, new_value, change_type
    ) VALUES (
      NEW.id, v_user_id, 'item', NULL, NEW.original_description, 'create'
    );
    
    -- Set initial denormalized values
    NEW.last_modified_by := v_user_id;
    NEW.last_modified_at := now();
    NEW.mutation_count := 1;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Track changes to specific fields
    
    -- Status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'status', OLD.status, NEW.status, 'status_change'
      );
    END IF;
    
    -- Price override changes
    IF OLD.user_override_price IS DISTINCT FROM NEW.user_override_price THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'user_override_price', 
        OLD.user_override_price::TEXT, 
        NEW.user_override_price::TEXT, 
        'price_override'
      );
    END IF;
    
    -- Recommended price changes
    IF OLD.recommended_unit_price IS DISTINCT FROM NEW.recommended_unit_price THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'recommended_unit_price', 
        OLD.recommended_unit_price::TEXT, 
        NEW.recommended_unit_price::TEXT, 
        'update'
      );
    END IF;
    
    -- Description changes
    IF OLD.original_description IS DISTINCT FROM NEW.original_description THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'original_description', OLD.original_description, NEW.original_description, 'update'
      );
    END IF;
    
    -- Quantity changes
    IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'quantity', OLD.quantity::TEXT, NEW.quantity::TEXT, 'update'
      );
    END IF;
    
    -- Unit changes
    IF OLD.unit IS DISTINCT FROM NEW.unit THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'unit', OLD.unit, NEW.unit, 'update'
      );
    END IF;
    
    -- User clarification changes
    IF OLD.user_clarification IS DISTINCT FROM NEW.user_clarification THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'user_clarification', OLD.user_clarification, NEW.user_clarification, 'note_added'
      );
    END IF;
    
    -- Interpreted scope changes
    IF OLD.interpreted_scope IS DISTINCT FROM NEW.interpreted_scope THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'interpreted_scope', OLD.interpreted_scope, NEW.interpreted_scope, 'update'
      );
    END IF;
    
    -- AI comment changes
    IF OLD.ai_comment IS DISTINCT FROM NEW.ai_comment THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'ai_comment', OLD.ai_comment, NEW.ai_comment, 'update'
      );
    END IF;
    
    -- Total price changes
    IF OLD.total_price IS DISTINCT FROM NEW.total_price THEN
      INSERT INTO public.cost_item_mutations (
        cost_item_id, user_id, field_name, old_value, new_value, change_type
      ) VALUES (
        NEW.id, v_user_id, 'total_price', OLD.total_price::TEXT, NEW.total_price::TEXT, 'update'
      );
    END IF;
    
    -- Update denormalized fields
    NEW.last_modified_by := v_user_id;
    NEW.last_modified_at := now();
    NEW.mutation_count := COALESCE(OLD.mutation_count, 0) + 1;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Log deletion (before the item is removed)
    INSERT INTO public.cost_item_mutations (
      cost_item_id, user_id, field_name, old_value, new_value, change_type
    ) VALUES (
      OLD.id, v_user_id, 'item', OLD.original_description, NULL, 'delete'
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create trigger for automatic mutation logging
DROP TRIGGER IF EXISTS trigger_log_cost_item_mutation ON public.cost_items;
CREATE TRIGGER trigger_log_cost_item_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.cost_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_cost_item_mutation();

-- Add comments for documentation
COMMENT ON TABLE public.cost_item_mutations IS 'Immutable audit trail of all changes to cost items';
COMMENT ON COLUMN public.cost_item_mutations.field_name IS 'Name of the field that was changed';
COMMENT ON COLUMN public.cost_item_mutations.old_value IS 'Value before the change (null for creates)';
COMMENT ON COLUMN public.cost_item_mutations.new_value IS 'Value after the change (null for deletes)';
COMMENT ON COLUMN public.cost_item_mutations.reason IS 'Optional reason provided by user for the change';
COMMENT ON COLUMN public.cost_item_mutations.ip_address IS 'IP address for security audit (optional)';