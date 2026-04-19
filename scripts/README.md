# RAG Ingestion Setup

## Overview

This script loads the Sephora skincare dataset, aggregates reviews, generates
embeddings using Supabase's built-in `gte-small` model, and populates the
`skincare_products` table in Supabase.

Run this **once**. After that, the Edge Function handles all searches.

---

## Step 1 — Run the DB migration

In Supabase Dashboard → SQL Editor, run:

```
supabase/migrations/004_pgvector_products.sql
```

This enables `pgvector`, creates the `skincare_products` table, the IVFFlat
index, and the `match_skincare_products` RPC function.

---

## Step 2 — Deploy the Edge Functions

```bash
npx supabase functions deploy embed
npx supabase functions deploy search-products
```

---

## Step 3 — Add your service role key to .env

The ingestion script needs the `service_role` key (not the anon key) to bulk
insert rows. Find it in Supabase Dashboard → Settings → API.

Add to your `.env`:

```
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

> ⚠️  Never commit this key. It's already covered by .gitignore.

---

## Step 4 — Install Python dependencies

```bash
pip install pandas requests python-dotenv tqdm
```

---

## Step 5 — Run the ingestion script

```bash
python scripts/ingest_products.py
```

Expected output:
- Loads ~2,420 skincare products
- Aggregates 600k+ reviews
- Generates 384-dim embeddings in batches of 32
- Upserts all rows into Supabase
- Takes ~5–10 minutes total

---

## Step 6 — Verify

In Supabase Dashboard → Table Editor → `skincare_products`, you should see
~2,420 rows with embeddings populated.

Test the search function:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/search-products \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"condition": "eczema", "skin_type": "dry"}'
```

---

## How it fits in the pipeline

```
Before (TinyFish):  condition → web scrape → 3-5 min
After  (RAG):       condition → vector search → ~200ms
```

The `search-products` Edge Function is called from `src/lib/ragClient.js`,
which is used by `src/hooks/useCasePipeline.js` in Step 2.
