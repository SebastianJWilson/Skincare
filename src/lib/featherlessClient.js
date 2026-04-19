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
 * Step 1 — Vision diagnosis
 * @param {{ imageBase64: string, mediaType: string, demographics: object, caseTitle: string }}
 * @returns {{ conditions: Array<{ rank, name, confidence }> }}
 */
export async function diagnoseSkin({ imageBase64, mediaType = 'image/jpeg', demographics, caseTitle }) {
  const { age, weight_kg, skin_type, location, race_ethnicity, biological_sex } = demographics

  console.log('[Featherless] diagnoseSkin called:', {
    mediaType,
    base64Length: imageBase64?.length,
    demographics,
    caseTitle,
  })

  const userPrompt = `Analyze the skin condition visible in this image. The patient's information is:
- Age: ${age ?? 'unknown'}
- Weight: ${weight_kg ? `${weight_kg} kg` : 'unknown'}
- Skin type: ${skin_type ?? 'unknown'}
- Location: ${location ?? 'unknown'}
- Race/Ethnicity: ${race_ethnicity ?? 'not specified'}
- Biological sex: ${biological_sex ?? 'unknown'}
- Patient's description: "${caseTitle}"

Return your analysis as a JSON object in exactly this format:
{
  "conditions": [
    { "rank": 1, "name": "<condition name>", "confidence": <0.00-1.00> },
    { "rank": 2, "name": "<condition name>", "confidence": <0.00-1.00> },
    { "rank": 3, "name": "<condition name>", "confidence": <0.00-1.00> }
  ]
}

Confidence values reflect relative likelihood given visual and demographic context.
Return exactly 3 conditions. Do not include any text outside the JSON object.`

  const payload = {
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content:
          '/no_think\nYou are a dermatological AI assistant. Identify the top 3 most likely skin conditions from the image and patient info. Respond with valid JSON only — no preamble, no markdown code fences, no trailing text.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${imageBase64}` },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    chat_template_kwargs: { enable_thinking: false },
  }

  return callFeatherless(payload)
}

/**
 * Step 3 — Review synthesis & product ranking
 * @param {{ rawProductsAndReviews: object, condition: string }}
 * @returns {Array<RankedProduct>}
 */
export async function rankProducts({ rawProductsAndReviews, condition }) {
  console.log('[Featherless] rankProducts called:', { condition, productCount: rawProductsAndReviews?.products?.length })

  const userPrompt = `/no_think\nBelow is a JSON object containing skincare products and their collected review data for the condition: "${condition}".

${JSON.stringify(rawProductsAndReviews)}

Analyze the review data for each product. Consider:
1. Overall customer sentiment (positive vs. negative experiences)
2. Effectiveness specifically for "${condition}"
3. Review consistency (avoid polarizing products; favor consistent praise)
4. Review volume (more reviews = more reliable signal)

Return ONLY a ranked JSON array ordered from best (#1) to lowest.
No text outside the JSON:
[
  {
    "rank": 1,
    "product_id": "<id from input>",
    "name": "<product name>",
    "brand": "<brand name>",
    "description": "<one sentence description>",
    "url": "<url or null>",
    "review_summary": "<2-3 sentence synthesis of why this product ranked here>",
    "sentiment_score": <float 0.0-1.0>,
    "review_count": <integer or null>,
    "ranking_rationale": "<one sentence comparing this product to its competitors>"
  }
]

Include every product from the input. Do not omit any.`

  const payload = {
    model: TEXT_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a product analyst specializing in skincare. You read collected review data for multiple products and rank them objectively based on sentiment quality, review volume, and relevance to a specific skin condition. Respond with valid JSON only — no preamble, no markdown code fences, no trailing text.',
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    chat_template_kwargs: { enable_thinking: false },
  }

  return callFeatherless(payload)
}
