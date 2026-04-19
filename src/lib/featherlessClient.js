// API calls go through server-side routes — keys never exposed to the browser.
// - diagnoseSkin → Supabase Edge Function diagnose-condition (150s timeout, no Vercel plan limit)
// - rankProducts → Supabase Edge Function rank-products (150s timeout, no Vercel plan limit)
console.log('[Featherless] Client initialised — using server-side API routes')

function stripMarkdownFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

// Pull out the last JSON object or array from a block of text.
// Needed when a reasoning model embeds prose before the final JSON answer.
function extractJson(text) {
  const stripped = stripMarkdownFences(text)
  // Fast path: the whole string is already valid JSON
  try { JSON.parse(stripped); return stripped } catch { /* continue */ }
  // Find the last { or [ and walk forward to find a balanced closing bracket
  for (const open of ['{', '[']) {
    const start = stripped.lastIndexOf(open)
    if (start === -1) continue
    const close = open === '{' ? '}' : ']'
    let depth = 0
    for (let i = start; i < stripped.length; i++) {
      if (stripped[i] === open) depth++
      else if (stripped[i] === close) { depth--; if (depth === 0) return stripped.slice(start, i + 1) }
    }
  }
  return stripped
}

/**
 * Calls the Supabase Edge Function which proxies to Featherless server-side.
 * API keys are never exposed to the browser. 150s timeout vs Vercel Hobby's 60s.
 */
async function callDiagnoseRoute(payload, attempt = 1) {
  console.log(`[Featherless] diagnose-condition attempt ${attempt}`)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  let res
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/diagnose-condition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (networkErr) {
    console.error(`[Featherless] Network error on attempt ${attempt}:`, networkErr)
    throw networkErr
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    console.error(`[Featherless] diagnose-condition non-OK on attempt ${attempt}:`, res.status, errText)
    if (attempt < 2) return callDiagnoseRoute(payload, attempt + 1)
    throw new Error(`Diagnose API error ${res.status}: ${errText}`)
  }

  const parsed = await res.json()
  console.log(`[Featherless] diagnose-condition result:`, parsed)
  return parsed
}

async function callRankRoute(payload, attempt = 1) {
  console.log(`[Featherless] /api/rank attempt ${attempt}`)
  let res
  try {
    res = await fetch('/api/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (networkErr) {
    console.error(`[Featherless] Network error on attempt ${attempt}:`, networkErr)
    throw networkErr
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    console.error(`[Featherless] /api/rank non-OK on attempt ${attempt}:`, res.status, errText)
    if (attempt < 2) return callRankRoute(payload, attempt + 1)
    throw new Error(`Rank API error ${res.status}: ${errText}`)
  }

  const parsed = await res.json()
  console.log(`[Featherless] /api/rank result:`, parsed)
  return parsed
}

/**
 * Step 1 — Vision diagnosis
 * @param {{ imageBase64: string, mediaType: string, demographics: object, caseTitle: string }}
 * @returns {{ conditions: Array<{ rank, name, confidence }> }}
 */
export async function diagnoseSkin({ imageBase64, mediaType = 'image/jpeg', demographics, caseTitle }) {
  console.log('[Featherless] diagnoseSkin called:', {
    mediaType,
    base64Length: imageBase64?.length,
    demographics,
    caseTitle,
  })

  return callDiagnoseRoute({ imageBase64, mediaType, demographics, caseTitle })
}

/**
 * Step 3 — Review synthesis & product ranking
 * @param {{ rawProductsAndReviews: object, condition: string }}
 * @returns {Array<RankedProduct>}
 */
export async function rankProducts({ rawProductsAndReviews, condition }) {
  console.log('[Featherless] rankProducts called:', { condition, productCount: rawProductsAndReviews?.products?.length })

  // Use Supabase Edge Function — 150s timeout vs Vercel Hobby's 10s
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const res = await fetch(`${supabaseUrl}/functions/v1/rank-products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ rawProductsAndReviews, condition }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    console.error('[Featherless] rank-products Edge Function error:', res.status, errText)
    throw new Error(`Rank Edge Function error ${res.status}: ${errText}`)
  }

  const parsed = await res.json()
  console.log('[Featherless] rank-products result:', parsed)
  return parsed
}
