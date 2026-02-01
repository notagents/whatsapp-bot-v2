# WhatsApp Agentic Engine

Sistema agentic conversacional profesional construido en **Next.js + MongoDB** que permite orquestar agentes LLM con memoria, tools, flows configurables y testing integrado.

## Visión general

Motor agentic que:

- ✅ Ingesta mensajes desde WhatsApp (Baileys) o simulador interno
- ✅ Consolida inputs en turns con debouncing
- ✅ Ejecuta flows configurables por sesión
- ✅ Orquesta agentes LLM con function calling
- ✅ Mantiene memoria conversacional (facts + recap)
- ✅ Soporta modo humano con cooldown automático
- ✅ Testing harness integrado (chat simulator)
- ✅ Totalmente trazable y observable

**Arquitectura orientada a:** determinismo + observabilidad + extensibilidad

---

## Arquitectura

### Pipeline completo

```
message → debounceTurn → turn
turn → executeFlow → agent + tools + KB
agent → sendReply → outbound
→ memoryUpdate → facts + recap
```

### Diagrama de flujo

```
┌─────────────────────────────────────────────────────────────┐
│                    Inbound (WhatsApp / Sim)                  │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  messages collection (processed: false)                      │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  debounceTurn job (15s)                                      │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  turn creation (consolidate messages)                        │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  resolveFlow(sessionId) → flow.json                          │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  executeFlow (simple/FSM mode)                               │
│    - load KB chunks                                          │
│    - inject context                                          │
│    - run agent + tools                                       │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  sendReply (if responses enabled)                            │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  memoryUpdate (facts + recap)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack tecnológico

- **Framework**: Next.js 16 (App Router)
- **Base de datos**: MongoDB
- **LLM**: OpenAI (gpt-4o-mini / gpt-4o)
- **UI**: React 19 + shadcn/ui + Tailwind CSS 4
- **WhatsApp**: Baileys API (webhook + send)
- **Worker**: tsx (local) + Vercel Cron
- **TypeScript**: strict mode

---

## Fase 1 — Message Gateway + Persistencia

### Objetivo

Infraestructura propia para reemplazar n8n.

### Flujo

**Inbound:**

```
Webhook → messages (processed=false)
```

**Outbound:**

```
sendReply → Baileys API → messages (source=bot)
```

### Modelo: `messages`

```ts
{
  whatsappId: string        // conversation key
  sessionId: string         // bot connection
  userID: string
  channel: "whatsapp" | "simulator"
  messageText: string
  messageTime: number
  source: "user" | "bot"
  processed: boolean
  botMessageId?: string
}
```

**Índices:** por conversación + estado.

### Endpoints

- `POST /api/whatsapp/webhook` — recibe mensajes de Baileys
- `POST /api/whatsapp/send` — envía mensajes via Baileys
- `POST /api/conversations/[whatsappId]/responses-enabled` — control de modo humano

---

## Fase 2 — Agentic Runtime

### Modelos clave

#### `turns` (input estable)

```ts
{
  whatsappId: string
  sessionId: string
  userID: string
  text: string
  messageIds: ObjectId[]
  status: "queued" | "running" | "done" | "failed" | "blocked"
  router?: string
  response?: string
  channel: "whatsapp" | "simulator"
  meta?: Record<string, unknown>
  createdAt: Date
}
```

#### `agent_runs` (traza completa)

```ts
{
  turnId: ObjectId
  agentId: string
  input: {
    systemPrompt: string
    context: string
    messages: Array<{role, content}>
  }
  output?: {
    assistantText?: string
    toolCalls?: ToolCall[]
  }
  status: "pending" | "running" | "done" | "failed"
  error?: string
  createdAt: Date
  updatedAt: Date
}
```

#### `memory`

```ts
{
  whatsappId: string
  facts: Array<{
    key: string
    value: string
    confidence: number
  }>
  recap: {
    text: string
    updatedAt: Date
  }
  updatedAt: Date
}
```

#### `conversation_state`

Estado estructural por conversación (FSM, pasos, datos personalizados).

```ts
{
  whatsappId: string
  sessionId: string
  state?: string
  data?: Record<string, unknown>
  updatedAt: Date
}
```

#### `jobs`

Cola interna (MongoDB) con:

- `debounceTurn` — consolida mensajes
- `runAgent` — ejecuta agente
- `sendReply` — envía respuesta
- `memoryUpdate` — actualiza memoria

```ts
{
  type: string
  status: "pending" | "running" | "done" | "failed"
  payload: Record<string, unknown>
  retries: number
  maxRetries: number
  scheduledAt: Date
  lockedBy?: string
  lockedAt?: Date
  error?: string
}
```

### Router de agentes

Orden de resolución:

1. **Reglas determinísticas** (keywords, comandos)
2. **Fallback LLM** (JSON classifier con GPT-4o-mini)

Agentes disponibles:

- `default_assistant` — asistente general
- `cami_default` — agente Cami base
- `cami_recommender` — recomendador especializado

### Tools disponibles

Function calling integrado:

- `send_message` — envía mensaje al usuario
- `set_responses_enabled` — activa/desactiva respuestas automáticas
- `get_recent_messages` — obtiene contexto reciente
- `http_fetch` — HTTP GET (safe, con timeout)

### Modo humano

Control por conversación:

```ts
responsesEnabled = {
  enabled: boolean
  disabledUntilUTC?: string  // cooldown hasta timestamp
}
```

- Se activa automáticamente cuando entra mensaje `fromMe`
- Cooldown por defecto: 2 horas
- Respetado antes de toda respuesta automática

**Endpoints:**

- `GET /api/conversations/[whatsappId]/responses-enabled`
- `POST /api/conversations/[whatsappId]/responses-enabled`

---

## Fase 3 — Flows por sesión

> `sessionId` = una conexión/bot
> múltiples conversaciones por sesión

Flows definidos en archivos del repo, no en DB.

### Estructura

```
/flows
  /default
    flow.json
    kb/*.md | *.csv
  /session_<id>
    flow.json
    kb/*
```

### Resolución

```
if exists /flows/session_<sessionId> → use it
else → /flows/default
```

### Modos de flow (MVP)

#### 1. Simple

```json
{
  "mode": "simple",
  "agent": "default_assistant",
  "kb": {
    "enabled": true,
    "topK": 4
  }
}
```

#### 2. FSM (Finite State Machine)

```json
{
  "mode": "fsm",
  "initialState": "greeting",
  "states": {
    "greeting": {
      "reply": "¡Hola! ¿En qué puedo ayudarte?",
      "transitions": {
        "menu": ["menu", "opciones"],
        "help": ["ayuda", "help"]
      }
    },
    "menu": {
      "agent": "default_assistant",
      "kb": { "enabled": true, "topK": 3 }
    }
  }
}
```

Estado persistido en `conversation_state`.

### Knowledge Base por sesión

**Fuentes:**

- `.md` — markdown
- `.csv` — tabular data

**Carga:** en memoria al startup.

**Retrieval MVP:**

- Keyword scoring (TF-IDF style)
- topK chunks
- Inyectados al agente como contexto

> Embeddings vectoriales: opcional (roadmap futuro)

---

## Chat Simulator (testing real)

### Principio clave

No es otro sistema → es otro **canal**.

Todo pasa por el mismo pipeline:

```
messages → turns → agents → flows → memory → reply
```

### Identidad de conversación

Reutiliza `whatsappId`:

```
sim:<sessionId>:<testUserId>
```

Ejemplo:

```
sim:default:user_1
```

Aísla estado/memoria sin tocar lógica core.

### Endpoints

- `POST /api/sim/conversations` — crear conversación simulada
- `POST /api/sim/conversations/[simWhatsappId]/messages` — enviar mensaje
- `GET /api/sim/conversations/[simWhatsappId]/messages` — timeline

Reutiliza endpoints de debug:

- `GET /api/conversations/[whatsappId]/turns`
- `GET /api/turns/[turnId]`
- `GET /api/agent-runs/[runId]`

### sendReply

Branch por canal:

- `whatsapp` → Baileys API
- `simulator` → persist only (no HTTP)

### UI `/sim`

Interfaz Next.js en `/sim`:

- Selector de `sessionId`
- Lista de conversaciones simuladas
- Chat window
- Debug panel:
  - Turn actual
  - Agent ejecutado
  - Tool calls
  - Estado de cooldown
  - Flow usado
  - KB chunks

---

## Instalación

### Requisitos

- Node.js 20+
- MongoDB 6+
- OpenAI API Key
- Baileys API (opcional, para WhatsApp real)

### Setup

1. Clonar repo:

```bash
git clone <repo-url>
cd whatsapp-bot-v2
npm install
```

2. Configurar `.env`:

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=whatsapp_agentic

# OpenAI
OPENAI_API_KEY=sk-...

# Baileys (opcional, para WhatsApp real)
BAILEYS_API_URL=http://localhost:3001
BAILEYS_API_KEY=your-secret-key

# Cron (opcional, para Vercel)
CRON_SECRET=your-cron-secret

# Login (opcional)
LOGIN_USERNAME=admin
LOGIN_PASSWORD=secret
```

3. Iniciar desarrollo:

```bash
npm run dev
```

4. Iniciar worker (local):

```bash
npm run worker
```

---

## Uso

### Testing con Simulator

1. Ir a `http://localhost:3000/sim`
2. Seleccionar `sessionId` (ej: `default`)
3. Crear conversación de prueba
4. Enviar mensajes
5. Ver debug panel en tiempo real

### Producción con WhatsApp

1. Configurar Baileys API
2. Configurar webhook en Baileys → `https://your-domain.com/api/whatsapp/webhook`
3. Enviar header `Authorization: Bearer <BAILEYS_API_KEY>`
4. Configurar Vercel Cron (opcional):

```json
{
  "crons": [
    {
      "path": "/api/cron/jobs",
      "schedule": "* * * * *"
    }
  ]
}
```

5. Deploy a Vercel:

```bash
vercel --prod
```

---

## Scripts

- `npm run dev` — desarrollo con Turbo
- `npm run build` — build producción
- `npm start` — servidor producción
- `npm run worker` — worker local (procesa jobs)
- `npm run lint` — linter

---

## Endpoints principales

### WhatsApp

- `POST /api/whatsapp/webhook` — recibe mensajes
- `POST /api/whatsapp/send` — envía mensajes

### Conversaciones

- `GET /api/conversations` — lista conversaciones
- `GET /api/conversations/[whatsappId]/turns` — historial de turns
- `GET /api/conversations/[whatsappId]/messages` — mensajes
- `GET/POST /api/conversations/[whatsappId]/responses-enabled` — modo humano

### Debug

- `GET /api/turns/[turnId]` — detalle de turn
- `GET /api/agent-runs/[runId]` — detalle de ejecución

### Simulator

- `POST /api/sim/conversations` — crear conversación
- `POST /api/sim/conversations/[simWhatsappId]/messages` — enviar mensaje
- `GET /api/sim/conversations/[simWhatsappId]/messages` — historial

### Cron

- `GET /api/cron/jobs` — procesa hasta 10 jobs (header: `Authorization: Bearer CRON_SECRET`)

---

## Estructura del proyecto

```
whatsapp-bot-v2/
├── app/
│   ├── api/
│   │   ├── whatsapp/        # Gateway WhatsApp
│   │   ├── conversations/   # Gestión conversaciones
│   │   ├── turns/           # Debug turns
│   │   ├── agent-runs/      # Debug agent runs
│   │   ├── sim/             # Simulator endpoints
│   │   └── cron/            # Worker cron
│   ├── sim/                 # Simulator UI
│   ├── conversations/       # Conversaciones UI
│   └── login/               # Auth (opcional)
├── lib/
│   ├── agents/              # Agentes + tools
│   ├── flows/               # Flow engine
│   ├── kb/                  # Knowledge base
│   ├── jobs.ts              # Job queue
│   ├── memory.ts            # Memoria conversacional
│   ├── router.ts            # Router de agentes
│   └── turns.ts             # Turn management
├── flows/
│   ├── default/             # Flow por defecto
│   │   ├── flow.json
│   │   └── kb/
│   └── session_<id>/        # Flows por sesión
├── components/              # React components
├── scripts/
│   └── worker.ts            # Worker local
└── docs/                    # Documentación
```

---

## Principios arquitectónicos

✅ **Determinismo** — turns con locks, sin race conditions
✅ **Observabilidad** — toda ejecución en `agent_runs`
✅ **Extensibilidad** — flows sin redeploy
✅ **Testabilidad** — simulator con mismo pipeline
✅ **Multi-sesión** — múltiples bots en un deploy
✅ **Human-in-the-loop** — cooldown automático
✅ **Knowledge Base** — por sesión, file-driven
✅ **Escalabilidad** — lista para multi-agent / planners

---

## Roadmap

### ✅ Completado

- [x] Gateway propio (reemplazo n8n)
- [x] Agentic runtime
- [x] Memoria conversacional (facts + recap)
- [x] Router híbrido (rules + LLM)
- [x] Flows por sesión (simple + FSM)
- [x] Simulator con debug panel
- [x] Knowledge Base file-driven
- [x] Modo humano con cooldown

### 🚀 Próximos pasos

- [ ] Versionado de flows
- [ ] Replay automático de conversaciones
- [ ] Métricas de calidad de respuesta
- [ ] A/B testing por flow
- [ ] Embeddings vectoriales (Pinecone/Qdrant)
- [ ] Planner multi-step
- [ ] Multi-agent orchestration
- [ ] Streaming responses
- [ ] Voice message support
- [ ] Media handling (images/docs)

---

## Variables de entorno

### Requeridas

| Variable | Descripción |
|----------|-------------|
| `MONGODB_URI` | Conexión MongoDB |
| `MONGODB_DB_NAME` | Nombre de base de datos |
| `OPENAI_API_KEY` | API key de OpenAI |

### Opcionales

| Variable | Descripción | Default |
|----------|-------------|---------|
| `BAILEYS_API_URL` | URL Baileys API | - |
| `BAILEYS_API_KEY` | Auth Baileys | - |
| `CRON_SECRET` | Auth Vercel Cron | - |
| `LOGIN_USERNAME` | Usuario admin | - |
| `LOGIN_PASSWORD` | Password admin | - |

---

## Debug y troubleshooting

### Ver logs de un turn

```bash
curl http://localhost:3000/api/turns/<turnId>
```

### Ver agent run

```bash
curl http://localhost:3000/api/agent-runs/<runId>
```

### Ver memoria de conversación

Inspeccionar colección `memory` en MongoDB:

```js
db.memory.findOne({ whatsappId: "..." })
```

### Ver estado de jobs

```js
db.jobs.find({ status: "pending" }).sort({ scheduledAt: 1 })
```

### Forzar procesamiento de jobs

Local:

```bash
npm run worker
```

Vercel:

```bash
curl https://your-domain.com/api/cron/jobs \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## Contribuir

1. Fork el repo
2. Crear branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m "feat: descripción"`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abrir Pull Request

---

## Licencia

Privado / Propietario

---

## Soporte

Para preguntas o issues, contactar al equipo de desarrollo.

---

**Construido con** ❤️ **usando Next.js + MongoDB + OpenAI**
