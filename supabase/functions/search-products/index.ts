/**
 * Edge Function: search-products
 * --------------------------------
 * Replaces the TinyFish product search step in the pipeline.
 *
 * 1. Receives a detected skin condition + optional user skin type
 * 2. Embeds the query using gte-small (free, in-process)
 * 3. Runs pgvector cosine similarity search against skincare_products
 * 4. Returns top 10 ranked products with Sephora purchase URLs
 *
 * POST /functions/v1/search-products
 * Body: { condition: string, skin_type?: string, match_count?: number }
 * Returns: { condition, products: Product[] }
 *
 * API keys (Featherless, TinyFish) are stored as Supabase secrets — never exposed to the browser.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { condition, skin_type, match_count = 10 } = await req.json()

    if (!condition || typeof condition !== 'string') {
      return new Response(
        JSON.stringify({ error: 'condition is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build a rich query string — include skin type context if available
    // This improves semantic matching (e.g. "eczema dry skin" finds barrier-repair products)
    const queryText = skin_type
      ? `${condition} ${skin_type} skin treatment skincare`
      : `${condition} treatment skincare`

    console.log('[search-products] Query:', queryText)

    // ── Step 1: Embed the query using gte-small ──────────────────────────────
    const model = new Supabase.ai.Session('gte-small')
    const queryEmbedding = await model.run(queryText, {
      mean_pool: true,
      normalize: true,
    })

    console.log('[search-products] Embedding generated, dims:', (queryEmbedding as number[]).length)

    // ── Step 2: Vector similarity search via pgvector ────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: products, error } = await supabase.rpc('match_skincare_products', {
      query_embedding: queryEmbedding,
      match_count,
      min_rating: 3.5,
    })

    if (error) {
      console.error('[search-products] RPC error:', error)
      throw new Error(`Vector search failed: ${error.message}`)
    }

    console.log('[search-products] Found', products?.length ?? 0, 'products')

    // ── Step 3: Shape the response ───────────────────────────────────────────
    // Pick the best review snippet for the user's skin type if available
    const shaped = (products ?? []).map((p: any, idx: number) => {
      const reviews: any[] = p.top_reviews ?? []

      // Prefer a review matching the user's skin type
      const matchingReview = skin_type
        ? reviews.find((r) => r.skin_type === skin_type)
        : null
      const bestReview = matchingReview ?? reviews[0] ?? null

      // Per-skin-type rating if available
      const skinTypeRating = skin_type && p.skin_type_ratings
        ? p.skin_type_ratings[skin_type] ?? null
        : null

      return {
        rank:               idx + 1,
        product_id:         p.product_id,
        name:               p.product_name,
        brand:              p.brand_name,
        price_usd:          p.price_usd,
        category:           [p.secondary_category, p.tertiary_category].filter(Boolean).join(' › '),
        highlights:         p.highlights ?? null,
        avg_rating:         p.avg_rating,
        skin_type_rating:   skinTypeRating,
        review_count:       p.review_count,
        recommend_rate:     p.recommend_rate,
        review_summary:     bestReview?.text ?? null,
        url:                p.sephora_url,
        similarity:         Math.round(p.similarity * 1000) / 1000,
      }
    })

    return new Response(
      JSON.stringify({ condition, skin_type: skin_type ?? null, products: shaped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[search-products] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
