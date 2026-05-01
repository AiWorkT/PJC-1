## LLM Geocoding (OpenRouter) integration

This repository now includes a minimal server-side proxy and a React UI component to perform LLM-assisted geocoding using OpenRouter. The design keeps your API key on a server (not in the browser).

Files added
- server/index.mjs — Minimal Node ESM HTTP server exposing POST /geocode. It reads OPENROUTER_API_KEY from environment and calls OpenRouter securely.
- src/lib/openrouter.ts — TypeScript OpenRouter client (already added) which validates responses with zod.
- src/components/PlaceSearch.tsx — React component that calls the local proxy at http://localhost:4000/geocode and displays candidate places for users to pick.

How to run (development)
1. Rotate/revoke the leaked key you accidentally posted earlier. Create a fresh key.
2. In your shell, export the key:

   export OPENROUTER_API_KEY=sk-REPLACE_WITH_YOUR_KEY

3. Start the proxy server (it listens on port 4000):

   node server/index.mjs

4. In another terminal, run the Vite dev server (from the repo root):

   npm run dev

5. Open your app at http://localhost:5173 (default Vite) and use the PlaceSearch component.

How to use the component

Import the component and display it somewhere in your UI (for example, in App.tsx):

```tsx
import PlaceSearch from '@/components/PlaceSearch'

function App() {
  const onSelect = (candidate) => {
    // candidate contains latitude and longitude — call your weather API here
    console.log('Selected candidate', candidate)
  }

  return (
    <div>
      <h1>Weather App</h1>
      <PlaceSearch onSelect={onSelect} />
    </div>
  )
}
```

Notes & recommendations
- The OpenRouter LLM may hallucinate coordinates. Treat results as "candidates": show them to users and require a selection before calling your authoritative weather API (Open-Meteo/OpenWeather).
- For production deployments, run the proxy as a secure service (VPS, serverless function, or platform that supports environment secrets) and restrict CORS to your domain.
- Keep OPENROUTER_API_KEY in environment variables or secret stores, not in code.
