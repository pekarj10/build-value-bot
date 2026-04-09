
-- Drop the existing permissive SELECT policy
DROP POLICY IF EXISTS "Benchmark prices are readable by everyone" ON public.benchmark_prices;

-- Create a new admin-only SELECT policy
CREATE POLICY "Only admins can read benchmark prices"
  ON public.benchmark_prices
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
