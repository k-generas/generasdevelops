CREATE TABLE public.discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  query text NOT NULL,
  location text,
  results_count int NOT NULL DEFAULT 0,
  new_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_runs TO authenticated;
GRANT ALL ON public.discovery_runs TO service_role;
ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.discovery_runs FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  place_id text NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  website text,
  maps_url text,
  category text,
  rating numeric,
  review_count int,
  business_status text,
  latitude double precision,
  longitude double precision,
  source text NOT NULL DEFAULT 'google_places',
  discovery_run_id uuid,
  status text NOT NULL DEFAULT 'discovered',
  score int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, place_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own businesses" ON public.businesses FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  website_reachable boolean,
  website_status int,
  website_https boolean,
  website_load_ms int,
  website_title text,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb,
  score int,
  recommended_offer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigations TO authenticated;
GRANT ALL ON public.investigations TO service_role;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own investigations" ON public.investigations FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.investigations (business_id, created_at DESC);