# PRD — WhatsApp Engine (Fase 1 – Infraestructura base sin IA)

## 1. Objetivo

Construir una infraestructura propia en **Next.js** que permita:

- Recibir mensajes de WhatsApp vía webhook (Baileys API)
- Normalizar y persistir eventos en **MongoDB**
- Enviar mensajes salientes vía API
- Mantener estado por conversación
- Preparar la base para futuros agentes de IA (sin ejecutarlos aún)

Esta fase debe reemplazar completamente la capa n8n de ingesta + persistencia.

---

## 2. Alcance funcional

### Incluido

✅ Webhook de entrada de mensajes
✅ Persistencia en MongoDB
✅ Envío de mensajes a WhatsApp
✅ Estado de conversación (responses enabled)
✅ Preparación para debounce/consolidación
✅ Observabilidad básica (logs + queries)

### Excluido (fases posteriores)

❌ IA / agentes
❌ audio → texto
❌ límites de uso
❌ lógica de negocio conversacional

---

## 3. Arquitectura técnica

### Stack

- Next.js (App Router + API Routes o Server Actions)
- MongoDB (driver nativo o Mongoose)
- Baileys API (servicio externo)
- Runtime recomendado: **no serverless** (Docker / VPS / EasyPanel)

> Motivo: timers, colas y consolidación de mensajes requieren procesos persistentes.

---

## 4. Flujo principal (Inbound)

```
WhatsApp → Baileys API → POST /api/whatsapp/webhook
                         ↓
                   Normalización
                         ↓
                    MongoDB.messages
                         ↓
               (job diferido opcional)
                         ↓
                  processed = true
```

---

## 5. Endpoints

### 5.1 Webhook de entrada

`POST /api/whatsapp/webhook`

#### Responsabilidades:

- Validar evento relevante (messages.upsert)
- Ignorar mensajes fromMe = true
- Extraer texto (conversation | extendedTextMessage.text)
- Normalizar userID y whatsappId
- Guardar mensaje entrante

#### Output DB:

```json
{
  "whatsappId": "session@jid",
  "sessionId": "default",
  "userID": "54911xxxx",
  "channel": "whatsapp",
  "messageText": "Hola",
  "messageTime": 1700000000,
  "source": "user",
  "processed": false
}
```

---

### 5.2 Envío de mensajes

`POST /api/whatsapp/send`

```json
{
  "sessionId": "default",
  "jid": "54911xxx@s.whatsapp.net",
  "text": "Mensaje"
}
```

#### Acciones:

1. Llamar Baileys API
2. Guardar mensaje como bot

```json
{
  "source": "bot",
  "processed": true
}
```

---

### 5.3 Estado de conversación

`GET /api/conversations/:whatsappId/responses-enabled`
`POST /api/conversations/:whatsappId/responses-enabled`

```json
{
  "enabled": true,
  "disabledUntilUTC": "2026-01-31T18:00:00Z"
}
```

---

## 6. Modelos de datos

### messages

```ts
{
  _id: ObjectId
  whatsappId: string
  sessionId: string
  userID: string
  channel: "whatsapp"
  messageText: string
  messageTime: number
  source: "user" | "bot"
  processed: boolean
  botMessageId?: string
}
```

#### Índices críticos

- (whatsappId, messageTime desc)
- (whatsappId, processed, source)

---

### responsesEnabled

```ts
{
  whatsappId: string (unique)
  sessionId: string
  userID: string
  enabled: boolean
  updatedAt: number
  disabledUntilUTC?: string
}
```

---

## 7. Consolidación de mensajes (opcional pero recomendada)

Objetivo: evitar procesar mensajes parciales.

### Estrategia

Al recibir un mensaje:

- guardar con processed=false
- disparar job diferido (~10–15s)

Job:

1. buscar últimos mensajes no procesados por whatsappId
2. si no llegaron nuevos → marcarlos processed=true
3. (opcional) generar snapshot concatenado

Esto deja la DB lista para agentes en Fase 2.

---

## 8. Requisitos no funcionales

- Webhook debe responder < 200ms
- Persistencia transaccional simple
- Logging de eventos entrantes y errores de Baileys
- Reintento simple en envío fallido

---

## 9. Definition of Done

✔ Mensajes entrantes llegan a Mongo correctamente
✔ Mensajes salientes se envían y se guardan
✔ Estado de conversación consultable/modificable
✔ Queries por conversación funcionan
✔ No dependencia de n8n

---

## 10. Evolución prevista (Fase 2+)

- Agent router
- Context builder
- memory embeddings
- human-in-the-loop
- rate limits
- audio handling
