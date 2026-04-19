// API calls go through Vercel server-side routes (/api/diagnose, /api/rank)
// Keys are stored as server-only env vars in Vercel — never exposed to the browser.
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
 * Calls the Vercel API route which proxies to Featherless server-side.
 * API keys are never exposed to the browser.
 */
async function callDiagnoseRoute(payload, attempt = 1) {
  console.log(`[Featherless] /api/diagnose attempt ${attempt}`)
  let res
  try {
    res = await fetch('/api/diagnose', {
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
    console.error(`[Featherless] /api/diagnose non-OK on attempt ${attempt}:`, res.status, errText)
    if (attempt < 2) return callDiagnoseRoute(payload, attempt + 1)
    throw new Error(`Diagnose API error ${res.status}: ${errText}`)
  }

  const parsed = await res.json()
  console.log(`[Featherless] /api/diagnose result:`, parsed)
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
  return callRankRoute({ rawProductsAndReviews, condition })
}
