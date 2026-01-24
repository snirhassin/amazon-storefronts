-- Discovery Queue Table
-- Stores newly discovered storefronts pending scraping

CREATE TABLE IF NOT EXISTS public.discovery_queue (
  username TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, completed, failed
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  source TEXT DEFAULT 'serpapi'   -- serpapi, manual, etc.
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_discovery_queue_status
ON public.discovery_queue(status, discovered_at);

-- Disable RLS for simplicity (POC)
ALTER TABLE public.discovery_queue DISABLE ROW LEVEL SECURITY;

-- Grant public access
GRANT ALL ON public.discovery_queue TO anon;
GRANT ALL ON public.discovery_queue TO authenticated;
