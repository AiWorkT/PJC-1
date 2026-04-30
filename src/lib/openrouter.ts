// Safe OpenRouter client for generating structured geocoding candidates (LLM-assisted).
// - Reads API key from process.env.OPENROUTER_API_KEY (do NOT hardcode keys).
// - Uses a system prompt that asks the model to return JSON only.
// - Validates the response with zod (zod is already a dependency in the repo).
// - Returns an array of candidates: { id, name, latitude, longitude, country, admin1 }.
//
// Usage: import { geocodeCityViaOpenRouter } from '@/lib/openrouter'

import z from 'zod'

const OPENROUTER_URL = 'https://api.openrouter.ai/v1/chat/completions'
const MODEL = 'gpt-4o-mini' // pick a model you have access to; change if needed

const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  admin1: z.string().optional(), // state / region
})

const CandidatesSchema = z.array(CandidateSchema)

export type Candidate = z.infer<typeof CandidateSchema>

/** Helper: short timeout fetch wrapper */
async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

/** Call OpenRouter to get geocoding candidates for a free text place query.
 *  Returns validated Candidate[].
 */
export async function geocodeCityViaOpenRouter(query: string, maxCandidates = 6): Promise<Candidate[]> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set in environment')

  const system = `
You are a geocoder assistant. For any place query from the user, return a JSON array (only JSON, nothing else)
of up to ${maxCandidates} candidate objects with these keys:
  - id: unique string (can be "{lat}-{lon}")
  - name: human-friendly place name (city, town, or place)
  - latitude: decimal number
  - longitude: decimal number
  - country: 2-letter country code (optional)
  - admin1: top-level administrative region / state (optional)

If you are not sure of coordinates, return no candidates. Keep numbers as numbers (not strings).
Do not add explanations or surrounding text. Respond with a single JSON array.
`.trim()

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Return candidates for: "${query}"` },
    ],
    max_tokens: 700,
    temperature: 0.0,
  }

  const res = await fetchWithTimeout(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  }, 20000)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter request failed: ${res.status} ${res.statusText} ${text}`)
  }

  const json = await res.json().catch(() => null)
  // Response shape: { choices: [{ message: { content: "..." }}, ...], ... }
  const assistantText = json?.choices?.[0]?.message?.content ?? ''

  if (!assistantText) throw new Error('OpenRouter returned empty response content')

  // Try to parse JSON strictly; if it fails, try to extract a JSON substring.
  let parsed: unknown
  try {
    parsed = JSON.parse(assistantText)
  } catch (err) {
    // try to extract first JSON array substring
    const match = assistantText.match(/(\[.*\])/s)
    if (!match) {
      throw new Error('OpenRouter returned non-JSON output and no JSON substring could be found')
    }
    try {
      parsed = JSON.parse(match[1])
    } catch (err2) {
      throw new Error('Failed to parse JSON substring from OpenRouter response')
    }
  }

  const validation = CandidatesSchema.safeParse(parsed)
  if (!validation.success) {
    // include validation errors to help debugging
    const errMsg = validation.error.format ? JSON.stringify(validation.error.format(), null, 2) : String(validation.error)
    throw new Error(`OpenRouter returned JSON that does not match expected schema: ${errMsg}`)
  }

  return validation.data
}
