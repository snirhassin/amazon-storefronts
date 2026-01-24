-- Scraping Status Table
-- Tracks live scraping progress for UI display

CREATE TABLE IF NOT EXISTS public.scraping_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_active BOOLEAN DEFAULT false,
  started_at TIMESTAMP WITH TIME ZONE,
  total_storefronts INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  success INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  lists_scraped INTEGER DEFAULT 0,
  current_storefront TEXT,
  eta_seconds INTEGER,
  last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  logs JSONB DEFAULT '[]'::jsonb
);

-- Insert default row
INSERT INTO public.scraping_status (id, is_active)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Disable RLS
ALTER TABLE public.scraping_status DISABLE ROW LEVEL SECURITY;

-- Grant access
GRANT ALL ON public.scraping_status TO anon;
GRANT ALL ON public.scraping_status TO authenticated;
