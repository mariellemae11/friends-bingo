# Friends Bingo — starter project

This is a React + Vite starter for a 75-ball bingo site, using Supabase as its backend and Vercel for hosting.

## Important status

This starter is **not production-ready multiplayer yet**. Before inviting real players, implement and test:
- Supabase Row Level Security (RLS) policies that authorize room members and hosts.
- Secure server-side room creation/joining, card generation, number calling and win verification (for example, Supabase Edge Functions or carefully designed PostgreSQL functions).
- A host identity model. The current starter schema's `host_player_id` is not yet assigned during room creation.
- Input validation, rate limits, and room-code collision handling.
- A join-link flow that reads the `?room=` query parameter.

Do not disable RLS or expose a Supabase service-role/secret key in browser code to make this prototype work.

## 1. Install Node.js

Install the current Node.js LTS release from https://nodejs.org.

## 2. Configure environment

Copy `.env.example` to `.env` and fill in your Supabase project URL and publishable key:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

The publishable key is meant for browser use, but it is safe only when database permissions are configured correctly. Never add secret/service-role keys here.

## 3. Install and run

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## 4. Deploy on Vercel

Push the project to a GitHub repository, import it at https://vercel.com, and set the same two environment variables under Project Settings → Environment Variables. Build command: `npm run build`; output directory: `dist`.

## Database

The four tables in the Supabase project are assumed to exist: `rooms`, `players`, `cards`, and `wins`. The columns expected by this starter match the initial SQL setup in the project guide. Realtime publication membership alone does not grant secure read/write access.
