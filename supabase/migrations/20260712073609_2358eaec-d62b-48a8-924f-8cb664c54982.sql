ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS slip_type text
  CHECK (slip_type IN ('bank','wallet') OR slip_type IS NULL);