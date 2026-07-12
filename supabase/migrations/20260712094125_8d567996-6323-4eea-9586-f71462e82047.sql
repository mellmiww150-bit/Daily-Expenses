
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS discord_webhook_login_url text;
