-- Amazon Storefronts Manager - Supabase Schema
-- Run this SQL in your Supabase SQL Editor

-- Storefronts table
CREATE TABLE IF NOT EXISTS storefronts (
    id TEXT PRIMARY KEY,
    url TEXT,
    username TEXT,
    name TEXT,
    bio TEXT,
    image TEXT,
    is_top BOOLEAN DEFAULT false,
    likes INTEGER DEFAULT 0,
    lists INTEGER DEFAULT 0,
    total_list_likes INTEGER DEFAULT 0,
    marketplace TEXT DEFAULT 'US',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lists table
CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    storefront_id TEXT REFERENCES storefronts(id),
    name TEXT,
    url TEXT,
    likes INTEGER DEFAULT 0,
    products INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    asin TEXT,
    title TEXT,
    url TEXT,
    price DECIMAL(10, 2),
    currency TEXT DEFAULT 'USD',
    image TEXT,
    list_id TEXT REFERENCES lists(id),
    storefront_id TEXT REFERENCES storefronts(id),
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(asin, list_id)
);

-- Stats table for dashboard
CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_storefronts INTEGER DEFAULT 0,
    top_creators INTEGER DEFAULT 0,
    total_lists INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    total_products INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_lists_storefront ON lists(storefront_id);
CREATE INDEX IF NOT EXISTS idx_products_list ON products(list_id);
CREATE INDEX IF NOT EXISTS idx_products_storefront ON products(storefront_id);
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin);
CREATE INDEX IF NOT EXISTS idx_storefronts_likes ON storefronts(total_list_likes DESC);

-- Enable Row Level Security (optional - disable for public read)
-- ALTER TABLE storefronts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (if RLS is enabled)
-- CREATE POLICY "Public read access" ON storefronts FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON lists FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON products FOR SELECT USING (true);

-- Function to update stats
CREATE OR REPLACE FUNCTION update_stats()
RETURNS void AS $$
BEGIN
    INSERT INTO stats (id, total_storefronts, top_creators, total_lists, total_likes, total_products, last_updated)
    VALUES (
        1,
        (SELECT COUNT(*) FROM storefronts),
        (SELECT COUNT(*) FROM storefronts WHERE is_top = true),
        (SELECT COUNT(*) FROM lists),
        (SELECT COALESCE(SUM(total_list_likes), 0) FROM storefronts),
        (SELECT COUNT(*) FROM products),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        total_storefronts = EXCLUDED.total_storefronts,
        top_creators = EXCLUDED.top_creators,
        total_lists = EXCLUDED.total_lists,
        total_likes = EXCLUDED.total_likes,
        total_products = EXCLUDED.total_products,
        last_updated = EXCLUDED.last_updated;
END;
$$ LANGUAGE plpgsql;
