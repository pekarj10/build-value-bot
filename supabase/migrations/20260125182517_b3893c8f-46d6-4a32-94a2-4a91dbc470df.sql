-- Fix the cost_item_mutation trigger to use AFTER INSERT instead of BEFORE INSERT
-- This resolves the foreign key violation when inserting cost items

-- First, drop the existing trigger
DROP TRIGGER IF EXISTS trigger_log_cost_item_mutation ON public.cost_items;

-- Create separate trigger function for INSERT (AFTER) to avoid FK violation
CREATE OR REPLACE FUNCTION public.log_cost_item_mutation_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Log creation
  INSERT INTO public.cost_item_mutations (
    cost_item_id, user_id, field_name, old_value, new_value, change_type
  ) VALUES (
    NEW.id, v_user_id, 'item', NULL, NEW.original_description, 'create'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create separate trigger function for UPDATE (BEFORE) to set denormalized fields
CREATE OR REPLACE FUNCTION public.log_cost_item_mutation_update()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger function for DELETE (BEFORE)
CREATE OR REPLACE FUNCTION public.log_cost_item_mutation_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Log deletion (before the item is removed)
  INSERT INTO public.cost_item_mutations (
    cost_item_id, user_id, field_name, old_value, new_value, change_type
  ) VALUES (
    OLD.id, v_user_id, 'item', OLD.original_description, NULL, 'delete'
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the AFTER INSERT trigger (runs after row is committed)
CREATE TRIGGER trigger_log_cost_item_mutation_insert
  AFTER INSERT ON public.cost_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_cost_item_mutation_insert();

-- Create the BEFORE UPDATE trigger (to set denormalized fields)
CREATE TRIGGER trigger_log_cost_item_mutation_update
  BEFORE UPDATE ON public.cost_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_cost_item_mutation_update();

-- Create the BEFORE DELETE trigger
CREATE TRIGGER trigger_log_cost_item_mutation_delete
  BEFORE DELETE ON public.cost_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_cost_item_mutation_delete();

-- Also need to set denormalized fields on INSERT - create a separate BEFORE INSERT trigger
CREATE OR REPLACE FUNCTION public.set_cost_item_initial_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified_by := auth.uid();
  NEW.last_modified_at := now();
  NEW.mutation_count := 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_set_cost_item_initial_fields
  BEFORE INSERT ON public.cost_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_cost_item_initial_fields();