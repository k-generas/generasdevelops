-- P2/P1: owner validation plan stored on a business (opportunity). Nullable so
-- existing rows stay valid. Powers the low-cost validation planner.
ALTER TABLE public.businesses ADD COLUMN validation_plan jsonb;
