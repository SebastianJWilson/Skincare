/**
 * Edge Function: embed
 * --------------------
 * Accepts an array of texts and returns gte-small embeddings.
 * Used by the ingestion script (offline) and the search-products function (runtime).
 *
 * POST /functions/v1/embed
 * Body: { texts: string[] }
 * Returns: { embeddings: number[][] }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { texts } = await req.json()

    if (!Array.isArray(texts) || texts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'texts must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Supabase built-in AI — gte-small runs inside the Supabase infrastructure, no external API key needed
    const model = new Supabase.ai.Session('gte-small')

    const embeddings = await Promise.all(
      texts.map((text: string) =>
        model.run(text, { mean_pool: true, normalize: true })
      )
    )

    return new Response(
      JSON.stringify({ embeddings }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[embed] Error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
