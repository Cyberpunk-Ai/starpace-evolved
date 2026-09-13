CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'paystack',
  plan text NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  email text,
  authorization_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_user_idx ON public.payments (user_id, created_at DESC);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = public.current_profile_id());

CREATE TRIGGER touch_payments BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();