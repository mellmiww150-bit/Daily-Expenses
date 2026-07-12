ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS ocr_raw text,
  ADD COLUMN IF NOT EXISTS ocr_amount numeric,
  ADD COLUMN IF NOT EXISTS ocr_status text,
  ADD COLUMN IF NOT EXISTS ocr_at timestamptz;