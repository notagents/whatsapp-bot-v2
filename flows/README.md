# Flows por sesión (Fase 3)

Cada **sessionId** puede usar un flow distinto. El runtime resuelve:

1. Si existe `/flows/session_<sessionId>/flow.json` → lo usa.
2. Si no → usa `/flows/default/flow.json`.

Sin UI ni draft/publish: solo archivos en el repo.

---

## Estructura

```
/flows
  /default
    flow.json       # Flow por defecto para todas las sesiones
    kb/
      *.md
      *.csv
  /session_<sessionId>
    flow.json       # Flow específico para esa sesión
    kb/
      ...
```

---

## Modos del flow

### 1. Modo `simple`

Un solo agente, KB opcional.

```json
{
  "mode": "simple",
  "agent": "default_assistant",
  "kb": {
    "enabled": true,
    "topK": 4
  },
  "humanMode": {
    "respectCooldown": true
  }
}
```

- **agent**: ID del agente (p. ej. `default_assistant`).
- **kb.enabled**: si está en true, se cargan archivos de `/flows/<session>/kb/` y se hace retrieval por keywords sobre el mensaje del usuario.
- **kb.topK**: cantidad de chunks a inyectar en el contexto del agente (1–50).
- **humanMode.respectCooldown**: respetar cooldown/modo humano (por defecto true).

### 2. Modo `fsm`

Máquina de estados: estados, respuestas fijas o agente por estado, transiciones por keyword o catch-all.

```json
{
  "mode": "fsm",
  "initialState": "START",
  "states": {
    "START": {
      "reply": "Hola, ¿en qué te puedo ayudar?",
      "transitions": [
        { "match": { "any": true }, "next": "ROUTER" }
      ]
    },
    "ROUTER": {
      "router": {
        "type": "keyword",
        "routes": [
          { "keyword": "precio", "next": "PRICING" },
          { "keyword": "soporte", "next": "SUPPORT" },
          { "default": true, "next": "GENERIC" }
        ]
      }
    },
    "PRICING": {
      "agent": "default_assistant",
      "kb": { "enabled": true, "topK": 4 },
      "transitions": [
        { "match": { "any": true }, "next": "END" }
      ]
    },
    "SUPPORT": {
      "agent": "support_ops",
      "kb": { "enabled": false },
      "transitions": [
        { "match": { "any": true }, "next": "END" }
      ]
    },
    "GENERIC": {
      "agent": "default_assistant",
      "kb": { "enabled": true, "topK": 4 },
      "transitions": [
        { "match": { "any": true }, "next": "END" }
      ]
    },
    "END": {
      "end": true
    }
  }
}
```

- **initialState**: estado inicial de la FSM.
- **states**: mapa de nombre de estado → configuración.
- Por estado:
  - **reply**: respuesta fija (no se llama al agente).
  - **agent**: agente a ejecutar (p. ej. `default_assistant`, `support_ops`).
  - **kb**: mismo formato que en modo simple (opcional).
  - **router**: solo tipo `keyword`; lista de **routes** con `keyword` (opcional) y `next`. Una ruta con `"default": true` es el fallback.
  - **transitions**: lista de `{ "match": ..., "next": "ESTADO" }`.
    - `{ "any": true }`: cualquier mensaje.
    - `{ "keyword": "palabra" }`: mensaje contiene la palabra (case-insensitive).
    - `{ "default": true }`: fallback si no matchea ninguna otra.
  - **end**: true indica estado final (no se avanza).

El estado FSM se persiste por **whatsappId** en `conversation_state.state.fsmState` (y opcionalmente `fsmData`).

---

## KB (Knowledge Base)

- Archivos en `/flows/<session>/kb/`:
  - **.md**: un chunk por archivo (texto plano).
  - **.csv**: primera fila = headers; cada fila siguiente = un chunk (campos concatenados).
- Retrieval: por keywords sobre el mensaje del usuario (sin embeddings en MVP).
- Si no hay carpeta `kb` o no hay archivos, el agente corre sin KB.

---

## Ejemplo por sesión

Para que la sesión `mi_canal` use un flow propio:

1. Crear carpeta `flows/session_mi_canal/`.
2. Crear `flows/session_mi_canal/flow.json` con el JSON del flow (simple o fsm).
3. Opcional: crear `flows/session_mi_canal/kb/` y añadir `.md` o `.csv`.

El runtime usará ese flow para esa sesión; el resto sigue usando `default`.
