import React, { useState } from 'react'

export type Candidate = {
  id: string
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
}

type Props = {
  onSelect?: (c: Candidate) => void
  placeholder?: string
}

export default function PlaceSearch({ onSelect, placeholder = 'Search for a place (city, town, ...)' }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  async function doSearch() {
    setError(null)
    setCandidates([])
    if (!query.trim()) return setError('Please enter a place name')
    setLoading(true)
    try {
      // Proxy server is expected to run on localhost:4000 — see README instructions
      const res = await fetch('http://localhost:4000/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to fetch candidates')
      setCandidates(json.candidates || [])
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="place-search">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="border rounded px-2 py-1 flex-1"
        />
        <button onClick={doSearch} className="btn px-3 py-1" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div className="text-red-600 mt-2">{error}</div>}

      {candidates.length > 0 && (
        <ul className="mt-2 border rounded p-2 space-y-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-muted-foreground">{c.admin1 ?? ''} {c.country ? `· ${c.country}` : ''}</div>
                <div className="text-sm">{c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}</div>
              </div>
              <div>
                <button
                  onClick={() => onSelect?.(c)}
                  className="btn-sm bg-slate-100 px-3 py-1 rounded"
                >
                  Select
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
