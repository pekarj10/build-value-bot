-- Add INSERT policy for profiles table (users can only create their own profile)
CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Add restrictive policies for benchmark_prices (only admins can modify)
CREATE POLICY "Only admins can insert benchmark prices"
ON public.benchmark_prices
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can update benchmark prices"
ON public.benchmark_prices
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can delete benchmark prices"
ON public.benchmark_prices
FOR DELETE
USING (public.is_admin(auth.uid()));