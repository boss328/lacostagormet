# lacostagourmet

Next.js 14 rebuild of [lacostagourmet.com](https://lacostagourmet.com) — a 22-year-old café-supply store selling bulk chai, cocoa, syrups, and frappé mixes to independent coffee shops and home users. Stack: Next.js App Router + TypeScript + Tailwind + Supabase + Authorize.net Accept.js + Resend + Gmail API, deployed to Orange VPS.

## Local dev

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase / Auth.net / Resend keys
pnpm dev                     # runs on http://localhost:3001
```

## Spec

Full build spec — architecture, data model, feature specs, design system, migration plan — lives in [`lcg-spec/`](./lcg-spec/). Start with `lcg-spec/CLAUDE.md`.
