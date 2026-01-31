This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## WhatsApp Engine (Fase 2)

- **Webhook** `POST /api/whatsapp/webhook`: recibe mensajes de Baileys, guarda con `processed: false`, encola job `debounceTurn` (15s). Si el mensaje es `fromMe` (humano), activa cooldown de 2h.
- **Jobs (MongoDB polling)**: `debounceTurn` → consolida mensajes en un turn → `runAgent` → router + agente OpenAI → `sendReply` (si respuestas habilitadas) y `memoryUpdate` (facts + recap).
- **Modo humano**: `GET/POST /api/conversations/[whatsappId]/responses-enabled` para habilitar/deshabilitar respuestas automáticas y cooldown (`disabledUntilUTC`).
- **Worker**: local `npm run worker` (tsx) o Vercel Cron `GET /api/cron/jobs` (header `Authorization: Bearer CRON_SECRET`). Cron procesa hasta 10 jobs por invocación.
- **Debug**: `GET /api/conversations/[whatsappId]/turns?limit=50`, `GET /api/turns/[turnId]`, `GET /api/agent-runs/[runId]`.

Env: `MONGODB_URI`, `MONGODB_DB_NAME`, `BAILEYS_API_URL`, `BAILEYS_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET` (opcional, para cron).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
