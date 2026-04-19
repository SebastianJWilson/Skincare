/**
 * Vercel API Route: /api/diagnose
 * --------------------------------
 * Server-side proxy for the Featherless vision diagnosis call.
 * The FEATHERLESS_API_KEY env var is server-only — never sent to the browser.
 *
 * POST /api/diagnose
 * Body: { imageBase64, mediaType, demographics, caseTitle }
 * Returns: { conditions: [{ rank, name, confidence }] }
 */

const BASE_URL     = process.env.FEATHERLESS_BASE_URL
const API_KEY      = process.env.FEATHERLESS_API_KEY
const VISION_MODEL = process.env.FEATHERLESS_VISION_MODEL

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

  const { imageBase64, mediaType = 'image/jpeg', demographics, caseTitle } = req.body

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' })
  }

  const { age, weight_kg, skin_type, location, race_ethnicity, biological_sex } = demographics ?? {}

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
        content: '/no_think\nYou are a dermatological AI assistant. Identify the top 3 most likely skin conditions from the image and patient info. Respond with valid JSON only — no preamble, no markdown code fences, no trailing text.',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
          { type: 'text', text: userPrompt },
        ],
      },
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
      console.error('[/api/diagnose] Featherless error:', upstream.status, errText)
      return res.status(upstream.status).json({ error: errText })
    }

    const data = await upstream.json()
    const message = data.choices?.[0]?.message ?? {}
    const content = message.content || message.reasoning_content || message.reasoning || ''
    const cleaned = extractJson(content)
    const parsed  = JSON.parse(cleaned)

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('[/api/diagnose] Error:', err)
    return res.status(500).json({ error: String(err) })
  }
}
