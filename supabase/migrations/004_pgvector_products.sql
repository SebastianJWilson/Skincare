-- Migration 004: pgvector extension + skincare products table for RAG
-- Run in Supabase SQL Editor after 003_storage_policies.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Skincare products table
-- Populated once by the ingestion script, queried at runtime by the search-products Edge Function
CREATE TABLE IF NOT EXISTS skincare_products (
  id                  SERIAL PRIMARY KEY,
  product_id          TEXT UNIQUE NOT NULL,        -- Sephora product ID e.g. "P504322"
  product_name        TEXT NOT NULL,
  brand_name          TEXT NOT NULL,
  price_usd           NUMERIC(8,2),
  secondary_category  TEXT,                        -- e.g. "Moisturizers", "Cleansers"
  tertiary_category   TEXT,                        -- e.g. "Face Moisturizers"
  highlights          TEXT,                        -- pipe-separated highlight tags
  ingredients         TEXT,
  avg_rating          NUMERIC(3,2),
  review_count        INTEGER DEFAULT 0,
  recommend_rate      NUMERIC(5,2),               -- 0-100 percentage
  skin_type_ratings   JSONB,                       -- { "dry": 4.5, "oily": 3.8, ... }
  top_reviews         JSONB,                       -- array of { skin_type, text, rating }
  sephora_url         TEXT,                        -- constructed purchase link
  embedding_text      TEXT,                        -- the text that was embedded (for debugging)
  embedding           vector(384),                 -- gte-small produces 384-dim vectors
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for fast approximate nearest-neighbour search
-- lists=30 is appropriate for ~2500 rows; increase to 100 if dataset grows past 100k
CREATE INDEX IF NOT EXISTS skincare_products_embedding_idx
  ON skincare_products
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 30);

-- Index on product_id for fast lookups
CREATE INDEX IF NOT EXISTS skincare_products_product_id_idx
  ON skincare_products (product_id);

-- RLS: products are public read (no auth required for search)
ALTER TABLE skincare_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are publicly readable"
  ON skincare_products FOR SELECT
  USING (true);

-- Match function used by the Edge Function
-- Returns top k products by cosine similarity to a query embedding
CREATE OR REPLACE FUNCTION match_skincare_products(
  query_embedding   vector(384),
  match_count       INT DEFAULT 10,
  min_rating        NUMERIC DEFAULT 3.5
)
RETURNS TABLE (
  product_id          TEXT,
  product_name        TEXT,
  brand_name          TEXT,
  price_usd           NUMERIC,
  secondary_category  TEXT,
  tertiary_category   TEXT,
  highlights          TEXT,
  avg_rating          NUMERIC,
  review_count        INT,
  recommend_rate      NUMERIC,
  skin_type_ratings   JSONB,
  top_reviews         JSONB,
  sephora_url         TEXT,
  similarity          FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.product_id,
    p.product_name,
    p.brand_name,
    p.price_usd,
    p.secondary_category,
    p.tertiary_category,
    p.highlights,
    p.avg_rating,
    p.review_count,
    p.recommend_rate,
    p.skin_type_ratings,
    p.top_reviews,
    p.sephora_url,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM skincare_products p
  WHERE p.avg_rating >= min_rating OR p.avg_rating IS NULL
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
