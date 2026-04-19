/**
 * RAG product search client
 * --------------------------
 * Calls the search-products Edge Function which:
 *   1. Embeds the condition query using gte-small (free, server-side)
 *   2. Runs pgvector cosine similarity search against 2,420 skincare products
 *   3. Returns ranked results with Sephora purchase URLs
 *
 * Replaces tinyfishClient.js for product discovery.
 * No API keys are exposed to the browser.
 */

import { supabase } from './supabaseClient'

/**
 * Search for skincare products matching a detected condition.
 * @param {{ condition: string, skin_type?: string, match_count?: number }}
 * @returns {{ condition: string, products: Array }}
 */
export async function searchProductsForCondition({ condition, skin_type, match_count = 10 }) {
  console.log('[RAG] searchProductsForCondition:', { condition, skin_type, match_count })

  const { data, error } = await supabase.functions.invoke('search-products', {
    body: { condition, skin_type, match_count },
  })

  if (error) {
    console.error('[RAG] Edge Function error:', error)
    throw new Error(`Product search failed: ${error.message}`)
  }

  if (!data?.products?.length) {
    console.warn('[RAG] No products returned for condition:', condition)
    throw new Error('No products found for this condition')
  }

  console.log('[RAG] Received', data.products.length, 'products')

  // Shape into the format the pipeline expects (compatible with rankProducts input)
  return {
    condition: data.condition,
    products: data.products.map((p) => ({
      id:           p.product_id,
      name:         p.name,
      brand:        p.brand,
      price_usd:    p.price_usd,
      description:  p.highlights ?? p.category ?? '',
      url:          p.url,
      similarity:   p.similarity,
      reviews: {
        raw_summary:    p.review_summary ?? '',
        average_rating: p.avg_rating,
        review_count:   p.review_count,
        recommend_rate: p.recommend_rate,
        skin_type_rating: p.skin_type_rating,
      },
    })),
  }
}
