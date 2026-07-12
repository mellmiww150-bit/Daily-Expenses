ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS discord_webhook_bank_url text,
  ADD COLUMN IF NOT EXISTS discord_webhook_wallet_url text;