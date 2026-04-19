const BASE_URL = import.meta.env.VITE_FEATHERLESS_BASE_URL
const API_KEY = import.meta.env.VITE_FEATHERLESS_API_KEY
const VISION_MODEL = import.meta.env.VITE_FEATHERLESS_VISION_MODEL
const TEXT_MODEL = import.meta.env.VITE_FEATHERLESS_TEXT_MODEL

console.log('[Featherless] Config loaded:', {
  BASE_URL,
  API_KEY: API_KEY ? `${API_KEY.slice(0, 8)}…` : 'MISSING',
  VISION_MODEL,
  TEXT_MODEL,
})

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

async function callFeatherless(payload, attempt = 1) {
  const url = `${BASE_URL}/chat/completions`
  console.log(`[Featherless] attempt ${attempt} → POST ${url}`, {
    model: payload.model,
    messageCount: payload.messages?.length,
    max_tokens: payload.max_tokens,
  })

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (networkErr) {
    console.error(`[Featherless] Network error on attempt ${attempt}:`, networkErr)
    throw networkErr
  }

  console.log(`[Featherless] attempt ${attempt} HTTP status:`, res.status, res.statusText)

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    console.error(`[Featherless] Non-OK response on attempt ${attempt}:`, {
      status: res.status,
      statusText: res.statusText,
      body: errText,
    })
    if (attempt < 2) {
      console.log('[Featherless] Retrying after non-OK response…')
      return callFeatherless(payload, attempt + 1)
    }
    throw new Error(`Featherless API error ${res.status}: ${errText}`)
  }

  let data
  try {
    data = await res.json()
  } catch (jsonErr) {
    console.error(`[Featherless] Failed to parse response body as JSON on attempt ${attempt}:`, jsonErr)
    throw jsonErr
  }

  console.log(`[Featherless] attempt ${attempt} raw response:`, JSON.stringify(data).slice(0, 500))

  const message = data.choices?.[0]?.message ?? {}
  // Reasoning models (e.g. Kimi-K2.5) put chain-of-thought in `reasoning` / `reasoning_content`
  // and the actual answer in `content`. If content is empty, fall back to reasoning field.
  const content = message.content || message.reasoning_content || message.reasoning || ''
  const cleaned = extractJson(content)

  console.log(`[Featherless] attempt ${attempt} content field (${(message.content ?? '').length} chars), reasoning field (${(message.reasoning ?? message.reasoning_content ?? '').length} chars)`)
  console.log(`[Featherless] attempt ${attempt} using source:`, message.content ? 'content' : 'reasoning fallback')
  console.log(`[Featherless] attempt ${attempt} cleaned for JSON parse:`, cleaned.slice(0, 300))

  try {
    const parsed = JSON.parse(cleaned)
    console.log(`[Featherless] attempt ${attempt} JSON parse succeeded:`, parsed)
    return parsed
  } catch (parseErr) {
    console.error(`[Featherless] JSON parse failed on attempt ${attempt}:`, {
      error: parseErr.message,
      cleaned,
    })
    if (attempt < 2) {
      console.log('[Featherless] Retrying after JSON parse failure…')
      return callFeatherless(payload, attempt + 1)
    }
    throw new Error(`Failed to parse Featherless response as JSON: ${cleaned.slice(0, 200)}`)
  }
}

/**
 * Resize a base64 image so its longest side is at most maxPx pixels.
 * Returns a JPEG base64 string (no data-URL prefix).
 * Vision models charge per image token — smaller images = fewer tokens = faster responses.
 */
async function resizeBase64Image(base64, mimeType, maxPx = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      // Export as JPEG at 85% quality — sufficient for dermatology feature detection
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      resolve(dataUrl.split(',')[1])
    }
    img.onerror = reject
    img.src = `data:${mimeType};base64,${base64}`
  })
}

/**
 * Step 1 — Vision diagnosis
 * @param {{ imageBase64: string, mediaType: string, demographics: object, caseTitle: string }}
 * @returns {{ conditions: Array<{ rank, name, confidence }> }}
 */
export async function diagnoseSkin({ imageBase64, mediaType = 'image/jpeg', demographics, caseTitle }) {
  const { age, skin_type, race_ethnicity, biological_sex } = demographics

  console.log('[Featherless] diagnoseSkin called:', {
    mediaType,
    base64Length: imageBase64?.length,
    demographics,
    caseTitle,
  })

  // Resize to 512px max — cuts image token count dramatically for large uploads
  const resizedBase64 = await resizeBase64Image(imageBase64, mediaType, 512)
  console.log('[Featherless] resized base64 length:', resizedBase64.length, '(was', imageBase64.length, ')')

  const userPrompt = `Patient: age ${age ?? '?'}, ${biological_sex ?? '?'}, ${skin_type ?? '?'} skin, ${race_ethnicity ?? '?'}. Description: "${caseTitle}".

Identify the top 5 most likely skin conditions shown. Reply with ONLY this JSON, no other text:
{"conditions":[{"rank":1,"name":"...","confidence":0.00},{"rank":2,"name":"...","confidence":0.00},{"rank":3,"name":"...","confidence":0.00},{"rank":4,"name":"...","confidence":0.00},{"rank":5,"name":"...","confidence":0.00}]}`

  const payload = {
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Dermatology image classifier. Output valid JSON only, no preamble.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${resizedBase64}` },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    // Stop the moment the outer JSON object closes — prevents post-JSON prose
    stop: [']}'],
    include_stop_str_in_output: true,
    // Enforce JSON output mode (OpenAI-compatible — ignored if unsupported)
    response_format: { type: 'json_object' },
  }

  return callFeatherless(payload)
}

/**
 * Step 3 — Review synthesis & product ranking
 * @param {{ rawProductsAndReviews: object, condition: string }}
 * @returns {Array<RankedProduct>}
 */
// Condense product data before sending to reduce input tokens.
function condenseProducts(rawProductsAndReviews) {
  const products = rawProductsAndReviews?.products ?? []
  return products.map(p => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    rating: p.reviews?.average_rating ?? null,
    review_count: p.reviews?.review_count ?? null,
    // Truncate long review summaries to keep input small
    sentiment: (p.reviews?.raw_summary ?? '').slice(0, 200),
  }))
}

export async function rankProducts({ rawProductsAndReviews, condition }) {
  console.log('[Featherless] rankProducts called:', { condition, productCount: rawProductsAndReviews?.products?.length })

  const condensed = condenseProducts(rawProductsAndReviews)

  const userPrompt = `Rank these skincare products for treating "${condition}" best to worst. Base ranking on rating, review count, and sentiment.

Products: ${JSON.stringify(condensed)}

Reply with ONLY a JSON array, no other text:
[{"rank":1,"product_id":"...","name":"...","brand":"...","review_summary":"<1 sentence>","sentiment_score":0.0,"review_count":0}]`

  const payload = {
    model: TEXT_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Skincare product ranker. Output valid JSON only, no preamble.',
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 1200,
    // Stop the moment the JSON array closes — prevents post-JSON prose
    stop: ['\n]', '\n]\n'],
    include_stop_str_in_output: true,
    // Enforce JSON output mode (OpenAI-compatible — ignored if unsupported)
    response_format: { type: 'json_object' },
  }

  return callFeatherless(payload)
}
