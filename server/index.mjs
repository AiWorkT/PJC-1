// Minimal OpenRouter proxy server (ESM) — server/index.mjs
// - Listens on port 4000 by default
// - Exposes POST /geocode expecting JSON { query: string }
// - Calls OpenRouter (server-side) using OPENROUTER_API_KEY from env
// - Validates output using zod and returns candidates as JSON

import http from 'http'
import { z } from 'zod'

const OPENROUTER_URL = 'https://api.openrouter.ai/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  admin1: z.string().optional(),
})
const CandidatesSchema = z.array(CandidateSchema)

function jsonResponse(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body)
}

async function callOpenRouter(query, maxCandidates = 6) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set')

  const system = `You are a geocoder assistant. For any place query from the user, return a JSON array (only JSON, nothing else) of up to ${maxCandidates} candidate objects with these keys:\n  - id: unique string (can be "{lat}-{lon}")\n  - name: human-friendly place name (city, town, or place)\n  - latitude: decimal number\n  - longitude: decimal number\n  - country: 2-letter country code (optional)\n  - admin1: top-level administrative region / state (optional)\n\nIf you are not sure of coordinates, return no candidates. Keep numbers as numbers (not strings). Do not add explanations or surrounding text. Respond with a single JSON array.`

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Return candidates for: "${query}"` },
    ],
    max_tokens: 700,
    temperature: 0.0,
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter request failed: ${res.status} ${res.statusText} ${text}`)
  }

  const json = await res.json().catch(() => null)
  const assistantText = json?.choices?.[0]?.message?.content ?? ''
  if (!assistantText) return []

  let parsed
  try {
    parsed = JSON.parse(assistantText)
  } catch (err) {
    const match = assistantText.match(/(\[.*\])/s)
    if (!match) throw new Error('OpenRouter returned non-JSON output')
    parsed = JSON.parse(match[1])
  }

  const validation = CandidatesSchema.safeParse(parsed)
  if (!validation.success) {
    throw new Error('OpenRouter returned JSON in unexpected shape')
  }

  return validation.data
}

const server = http.createServer(async (req, res) => {
  // Basic CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    return res.end()
  }

  if (req.url === '/geocode' && req.method === 'POST') {
    try {
      let body = ''
      for await (const chunk of req) body += chunk
      const data = JSON.parse(body || '{}')
      const query = data.query
      if (!query || typeof query !== 'string') return jsonResponse(res, 400, { error: 'Missing query string' })

      const candidates = await callOpenRouter(query)
      return jsonResponse(res, 200, { candidates })
    } catch (err) {
      console.error('Error in /geocode:', err)
      return jsonResponse(res, 500, { error: String(err?.message ?? err) })
    }
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log(`OpenRouter proxy listening at http://localhost:${PORT}/geocode`)
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('Warning: OPENROUTER_API_KEY is not set. Set it in the environment before using the proxy.')
  }
})
