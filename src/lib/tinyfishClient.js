const BASE_URL = import.meta.env.VITE_TINYFISH_BASE_URL
const API_KEY = import.meta.env.VITE_TINYFISH_API_KEY

/**
 * Parse a TinyFish SSE stream and return the result from the COMPLETE event.
 * Events arrive as:
 *   data: {"type":"STARTED", ...}
 *   data: {"type":"PROGRESS", ...}
 *   data: {"type":"COMPLETE", "status":"...", "result":"..."}
 */
async function readSseResult(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE lines are separated by '\n'. A blank line separates events.
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep any incomplete trailing line

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw) continue

      let event
      try {
        event = JSON.parse(raw)
      } catch {
        continue
      }

      if (event.type === 'COMPLETE') {
        // result may be a JSON string or already an object
        const result = event.result
        if (typeof result === 'object' && result !== null) return result
        try {
          return JSON.parse(result)
        } catch {
          throw new Error(`TinyFish COMPLETE result is not valid JSON: ${String(result).slice(0, 200)}`)
        }
      }

      if (event.type === 'ERROR' || event.status === 'error') {
        throw new Error(`TinyFish reported an error: ${JSON.stringify(event)}`)
      }
    }
  }

  throw new Error('TinyFish SSE stream ended without a COMPLETE event')
}

async function callTinyfish(url, goal, attempt = 1) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({ url, goal }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    if (attempt < 2) {
      return callTinyfish(url, goal, attempt + 1)
    }
    throw new Error(`TinyFish API error ${res.status}: ${errText}`)
  }

  try {
    return await readSseResult(res)
  } catch (err) {
    if (attempt < 2) {
      return callTinyfish(url, goal, attempt + 1)
    }
    throw err
  }
}

/**
 * Step 2 — Combined product + review data collection via TinyFish web automation.
 * @param {{ condition: string }}
 * @returns {{ condition: string, products: Array<Product> }}
 */
export async function findProductsAndReviews({ condition }) {
  const searchUrl = `https://www.google.com/search?q=best+skincare+products+for+${encodeURIComponent(condition)}`

  const goal = `You are a skincare research assistant. Perform the following two-part research task and return ONLY a JSON object. No preamble, no markdown fences, no text outside the JSON.

Condition to research: "${condition}"

Part 1: Search for 5 to 10 over-the-counter skincare products commonly recommended for treating or improving "${condition}".

Part 2: For each product found, search for customer reviews across major retail sites (Amazon, Sephora, Ulta, the brand's own website, etc.). Collect as much review data as possible: overall sentiment, notable customer comments, average ratings, and review counts.

Return ONLY this JSON structure:
{
  "condition": "${condition}",
  "products": [
    {
      "id": "prod_001",
      "name": "<product name>",
      "brand": "<brand name>",
      "description": "<one sentence about what it does for this condition>",
      "url": "<direct product URL or null>",
      "reviews": {
        "raw_summary": "<paragraph combining collected review quotes, common themes, and overall sentiment>",
        "average_rating": <float 1.0-5.0 or null>,
        "review_count": <integer or null>
      }
    }
  ]
}

Minimum 5 products, maximum 10. Do not include any text outside the JSON object.`

  return callTinyfish(searchUrl, goal)
}
