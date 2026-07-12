
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  slip_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO anon, authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "public insert expenses" ON public.expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "public update expenses" ON public.expenses FOR UPDATE USING (true);
CREATE POLICY "public delete expenses" ON public.expenses FOR DELETE USING (true);

CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  discord_webhook_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "public write settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
