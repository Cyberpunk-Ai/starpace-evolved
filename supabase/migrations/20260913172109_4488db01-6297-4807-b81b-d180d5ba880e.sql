-- Real payout records backed by the payment provider
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS recipient_code text,
  ADD COLUMN IF NOT EXISTS transfer_code text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS payouts_reference_key ON public.payouts (reference) WHERE reference IS NOT NULL;

ALTER TABLE public.monetization_settings
  ADD COLUMN IF NOT EXISTS paystack_details jsonb NOT NULL DEFAULT '{}'::jsonb;