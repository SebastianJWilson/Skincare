/**
 * Vercel API Route: /api/rank
 * ----------------------------
 * Server-side proxy for the Featherless product ranking call.
 * The FEATHERLESS_API_KEY env var is server-only — never sent to the browser.
 *
 * POST /api/rank
 * Body: { rawProductsAndReviews, condition }
 * Returns: Array of ranked products
 */

const BASE_URL    = process.env.FEATHERLESS_BASE_URL
const API_KEY     = process.env.FEATHERLESS_API_KEY
const TEXT_MODEL  = process.env.FEATHERLESS_TEXT_MODEL

function stripMarkdownFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

function extractJson(text) {
  const stripped = stripMarkdownFences(text)
  try { JSON.parse(stripped); return stripped } catch { /* continue */ }
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { rawProductsAndReviews, condition } = req.body

  if (!rawProductsAndReviews || !condition) {
    return res.status(400).json({ error: 'rawProductsAndReviews and condition are required' })
  }

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
        content: 'You are a product analyst specializing in skincare. You read collected review data for multiple products and rank them objectively based on sentiment quality, review volume, and relevance to a specific skin condition. Respond with valid JSON only — no preamble, no markdown code fences, no trailing text.',
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    chat_template_kwargs: { enable_thinking: false },
  }

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => upstream.statusText)
      console.error('[/api/rank] Featherless error:', upstream.status, errText)
      return res.status(upstream.status).json({ error: errText })
    }

    const data = await upstream.json()
    const message = data.choices?.[0]?.message ?? {}
    const content = message.content || message.reasoning_content || message.reasoning || ''
    const cleaned = extractJson(content)
    const parsed  = JSON.parse(cleaned)

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('[/api/rank] Error:', err)
    return res.status(500).json({ error: String(err) })
  }
}
