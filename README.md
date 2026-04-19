# Skincare

AI-assisted skincare case workflow built with React + Supabase for Origin House Hackthon.

## What it does

- Authenticated users can create a case with a skin photo and short description.
- A pipeline runs per case: diagnosis, product search, and product ranking.
- Results are saved to Supabase and shown in a case detail view.

## Tech stack

- Frontend: React (Vite), React Router, Tailwind CSS
- Backend services: Supabase Auth, Postgres, Storage, Edge Functions
- Server routes: Vercel API routes (`/api/diagnose`, `/api/rank`)

## Local development

1. Install dependencies:

```bash
npm install
```

2. Add environment variables in `.env`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

3. Start the app:

```bash
npm run dev
```

## Deployment notes

- Frontend is configured for Vercel (`vercel.json`).
- Server-side AI calls require Vercel env vars such as:
  - `FEATHERLESS_BASE_URL`
  - `FEATHERLESS_API_KEY`
  - `FEATHERLESS_VISION_MODEL`
  - `FEATHERLESS_TEXT_MODEL`
