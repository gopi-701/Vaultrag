# VaultRAG

A secure full-stack retrieval-augmented generation application.

## Tech stack

Next.js App Router, TypeScript, Tailwind CSS, Zod, Vercel AI SDK, Groq, Qdrant, Cohere, JSON Web Tokens, and Vitest.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Run validation with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Environment variables

Copy `.env.example` to `.env.local`, then provide the required API credentials, model names, Qdrant connection details, JWT secret, and embedding configuration. Never commit `.env.local` or expose secrets through `NEXT_PUBLIC_` variables.
