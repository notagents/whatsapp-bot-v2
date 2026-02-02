# Manual de Administrador

Guía para operar sesiones, knowledge bases y prompts del sistema WhatsApp Agentic Engine desde la interfaz web.

---

## 1. Introducción

### Qué es el sistema

El sistema es un **motor conversacional** que atiende conversaciones por WhatsApp (o por un simulador interno). Para cada mensaje del usuario:

1. Se agrupan mensajes en **turns** (turnos).
2. Se resuelve el **flow** de la sesión (simple o FSM).
3. Un **agente** (LLM) genera la respuesta usando **tools** y opcionalmente una **Knowledge Base** (KB).
4. La respuesta se envía al usuario y se actualiza la **memoria** de la conversación.

Todo esto es configurable por **sesión** desde la interfaz de administración.

### Concepto de sesiones

- Una **sesión** = un bot / una conexión WhatsApp.
- Puedes tener **varias sesiones** en un mismo deploy (varios bots).
- Cada sesión tiene su propio **flow**, **prompts** de agentes y **Knowledge Base**.
- Una sesión tiene muchas **conversaciones** (una por contacto o por usuario de prueba).

Identificadores de sesión típicos: `default`, `iutopyBusiness`, o un UUID como `6801d871-3ad0-46cf-95ea-d4e88a952e90`.

### Acceso al sistema

1. Abre la URL del sistema (ej: `https://tu-dominio.com` o `http://localhost:3000`).
2. Si está configurado el login, serás redirigido a **`/login`**.
3. Ingresa **usuario** y **contraseña** (configurados en `LOGIN_USERNAME` y `LOGIN_PASSWORD` en el servidor).
4. Tras iniciar sesión podrás acceder al dashboard y a la configuración de sesiones, KB y prompts.

---

## 2. Dashboard principal (`/`)

Desde la raíz del sitio verás:

- **Monitor de salud**: estado de la API de WhatsApp (Baileys) y de la base de datos (MongoDB). Si algo falla, se indica aquí.
- **Tabla de sesiones**: lista de sesiones conocidas con:
  - Estado (activa, etc.)
  - Cantidad de conversaciones
  - Última actividad
- **Enlaces rápidos** por sesión:
  - **Simulador**: ir a `/sim/[sessionId]` para probar el bot sin WhatsApp.
  - **Configuración**: ir a `/ui/sessions/[sessionId]` para editar flows, prompts y runtime config.

Usa el dashboard para ver el estado global y entrar a configurar o probar cada sesión.

---

## 3. Gestión de sesiones

### 3.1 Conceptos básicos

- **Sesión**: un bot con su flow, agentes y KB.
- **sessionId**: identificador único (ej: `default`, `iutopyBusiness`).
- **Una sesión → muchas conversaciones**: cada chat con un contacto (o cada conversación de simulador) es una conversación distinta dentro de la misma sesión.

### 3.2 Crear una nueva sesión

Las sesiones que ves en el dashboard se basan en la configuración del servidor y, opcionalmente, en carpetas bajo `flows/`. Para añadir una sesión nueva desde filesystem:

1. En el repositorio, crea la carpeta `flows/session_<id>/` (ej: `flows/session_mi_bot/`).
2. Dentro, crea un archivo `flow.json`. Puedes copiarlo de `flows/default/flow.json` o `flows/session_example/flow.json`.
3. Ajusta el `flow.json` (modo simple o FSM; ver más adelante).
4. Reinicia el servidor o espera a que cargue los flows desde disco (según tu despliegue).

La nueva sesión debería aparecer en el dashboard y podrás configurarla desde `/ui/sessions/<id>` y probarla en `/sim/<id>`.

---

## 4. Configuración de flows (`/ui/sessions/[sessionId]`)

En la página de configuración de una sesión tienes: **editor de flow**, **editor de prompts** por agente y **configuración de runtime**.

### 4.1 Conceptos de flows

- **Flow simple**: un solo agente responde a todo, con o sin KB. Ideal para bots sencillos.
- **Flow FSM** (máquina de estados): varios estados con transiciones (saludos, menús, categorías, escalación). El usuario “navega” por estados según lo que escribe.

### 4.2 Editor de flows

- **Monaco Editor**: editor de JSON con coloreado de sintaxis. Escribes o pegas el `flow.json` aquí.
- **Draft vs Published**:
  - **Draft**: versión en borrador. Los cambios no afectan a producción hasta que publiques.
  - **Published**: versión activa en producción (WhatsApp y, por defecto, simulador).
- **Flujo recomendado**: Validar → Guardar draft → Probar en simulador (con runtime en `force_draft` si quieres) → Ver diff → Publicar.
- **Runtime config** (selector en la misma página):
  - **auto**: usa la versión published si existe; si no, usa el flow del filesystem.
  - **force_draft**: fuerza el uso del draft (útil para probar cambios en el simulador).
  - **force_published**: fuerza la versión published.

### 4.3 Flow simple

Ejemplo mínimo: un agente responde todo con KB markdown (topK 4).

```json
{
  "mode": "simple",
  "agent": "cami_default",
  "kbV2": {
    "md": { "enabled": true, "topK": 4 }
  }
}
```

Puedes usar `default_assistant`, `cami_default` o `cami_recommender` según el agente que quieras. Si no quieres KB, omite `kbV2` o pon `"md": { "enabled": false }`.

### 4.4 Flow FSM básico

Estructura típica: estado inicial → router (keyword o AI) → estados de categoría o respuestas fijas → agente + KB cuando haga falta.

Ejemplo con router por palabras clave:

```json
{
  "mode": "fsm",
  "initialState": "START",
  "states": {
    "START": {
      "reply": "¡Hola! ¿En qué puedo ayudarte?",
      "transitions": [{ "match": { "any": true }, "next": "ROUTER" }]
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
      "kbV2": { "md": { "enabled": true, "topK": 4 } },
      "transitions": [{ "match": { "any": true }, "next": "END" }]
    },
    "SUPPORT": {
      "agent": "default_assistant",
      "kbV2": { "md": { "enabled": false } },
      "transitions": [{ "match": { "any": true }, "next": "END" }]
    },
    "GENERIC": {
      "agent": "default_assistant",
      "kbV2": { "md": { "enabled": true, "topK": 4 } },
      "transitions": [{ "match": { "any": true }, "next": "END" }]
    },
    "END": {
      "end": true
    }
  }
}
```

- Cada estado puede tener: `reply` (respuesta fija), `router`, `agent` (+ opcionalmente `kbV2`), o `end: true`.
- `transitions`: array de `{ "match": { "any": true } | { "keyword": "palabra" } | { "default": true }, "next": "NOMBRE_ESTADO" }`.

### 4.5 Routers en FSM

**Router por keywords**

El mensaje del usuario se compara con las palabras clave; la primera que coincida define el siguiente estado. `default: true` es el caso “ninguna coincidencia”.

```json
{
  "router": {
    "type": "keyword",
    "routes": [
      { "keyword": "hola", "next": "SALUDO" },
      { "keyword": "pedido", "next": "ESCALATE" },
      { "keyword": "semilla", "next": "CAT_SEMILLAS" },
      { "default": true, "next": "NO_CLARO" }
    ]
  }
}
```

**Router por AI (LLM)**

Un modelo clasifica la intención del usuario y elige una de las rutas según la descripción.

```json
{
  "router": {
    "type": "ai",
    "routes": [
      {
        "name": "comprar",
        "description": "Usuario quiere comprar o ver precios",
        "next": "COMPRA"
      },
      {
        "name": "consulta",
        "description": "Pregunta sobre productos o uso",
        "next": "FAQ"
      }
    ]
  }
}
```

Opcionalmente puedes definir `defaultRoute` y, en cada ruta, `examples` o `keywords` para mejorar la clasificación.

### 4.6 Workflow recomendado al editar flows

1. Editar el JSON en el editor (draft).
2. Pulsar **Validate** para comprobar sintaxis y referencias.
3. Guardar draft.
4. (Opcional) Poner runtime config en **force_draft** y probar en `/sim/[sessionId]`.
5. Ver **Diff** entre draft y published.
6. Cuando esté listo, pulsar **Publish** para que la versión publicada sea la que use producción.

---

## 5. Gestión de prompts (`/ui/sessions/[sessionId]`)

En la misma página de configuración de la sesión tienes pestañas o bloques por agente para editar su **prompt** y parámetros del modelo.

### 5.1 Qué son los prompts

- **System prompt** (plantilla): instrucciones que definen el rol y el estilo del agente (tono, idioma, qué puede y no puede hacer).
- **Configuración del modelo**: modelo OpenAI, temperature, máximo de rondas de tools.

Los placeholders se sustituyen en tiempo de ejecución: `{userID}`, `{facts}`, `{recap}`, `{kbSection}` (y otros que el sistema soporte).

### 5.2 Agentes disponibles

- **default_assistant**: asistente genérico.
- **cami_default**: Cami (ej: Astro Grow), tono conversacional.
- **cami_recommender**: Cami en modo recomendación (productos, categorías).

Elige el agente en el flow (`"agent": "cami_default"`, etc.) y edita su prompt en la pestaña correspondiente.

### 5.3 Editar prompts

- Mismo esquema **draft / published**: guardas borrador, pruebas y luego publicas.
- **Placeholders** útiles:
  - `{userID}`: identificador del usuario.
  - `{facts}`: hechos extraídos de la conversación.
  - `{recap}`: resumen reciente de la conversación.
  - `{kbSection}`: fragmentos de KB inyectados (si el flow usa KB).
- La interfaz suele validar longitud y placeholders; si algo no es válido, no dejará publicar hasta corregir.

### 5.4 Configuración de modelo

- **gpt-4o-mini**: rápido y económico; recomendado para la mayoría de los casos.
- **gpt-4o**: más capaz, mayor costo.
- **gpt-5-mini**, **gpt-5-nano**: modelos recientes (si están disponibles en tu entorno).
- **Temperature**: 0 = más determinista; 1 = más creativo. Valores típicos: 0.3–0.7 para soporte, algo más alto para tono más natural.

Ajusta modelo y temperature en el editor de prompt del agente y guarda/publica igual que el flow.

---

## 6. Knowledge Base (`/kb/[sessionId]`)

La KB se gestiona por sesión en **`/kb/[sessionId]`**. Hay dos tipos: **documentos Markdown** y **tablas** (datos estructurados, típicamente sincronizados desde n8n).

### 6.1 Tab Markdown

- **Crear documento**: slug (identificador único), título y contenido en Markdown. Ejemplo de slug: `faq-semillas`, `guia-cultivo`.
- **Preview**: la interfaz suele mostrar una vista previa del Markdown.
- **Reindexación**: al guardar, el sistema trocea el documento y actualiza los chunks que el agente usa para buscar (no hace falta hacer nada más).
- **Estados**: **active** (visible para los agentes), **archived** (oculto). Archivar sirve para desactivar un doc sin borrarlo.

Los agentes usan tools como `kb_md_search` y `kb_md_get` para consultar estos documentos según el flow y el topK configurado.

### 6.2 Tab Tables

- **Visualización**: listado de tablas de la sesión y sus filas (ej: productos, precios). Puedes filtrar/buscar por texto.
- **Solo lectura en UI**: las tablas no se editan desde aquí; se rellenan vía **API de sincronización** (por ejemplo desde n8n). Ver [docs/KB_SYNC_API.md](docs/KB_SYNC_API.md) para el endpoint y el formato.

### 6.3 Tools KB que usan los agentes

- **kb_md_search**: buscar en documentos Markdown.
- **kb_md_get**: obtener un documento completo por slug.
- **kb_table_lookup**: buscar en tablas por texto.
- **kb_table_get**: obtener una fila por clave primaria.
- **kb_table_query**: consulta estructurada con filtros.

No hace falta configurar estos tools a mano; el agente los usa según el flow (por ejemplo con `kbV2.tables` habilitado). Lo que tú controlas es el contenido de la KB (Markdown y datos de tablas) y el `topK` en el flow.

---

## 7. Simulador de testing (`/sim/[sessionId]`)

Sirve para probar el bot sin WhatsApp, usando el mismo pipeline (flow, agentes, KB).

### 7.1 Crear conversación de prueba

- Entra en `/sim/[sessionId]`.
- Crea una nueva conversación indicando un **testUserId** (ej: `user_1`, `test_maria`).
- La conversación queda identificada como `sim:<sessionId>:<testUserId>` (estado y memoria aislados).

### 7.2 Enviar mensajes y probar

- En la ventana de chat escribe y envía mensajes.
- Las respuestas del bot aparecen como en WhatsApp (mismo flujo y mismo agente).
- Un **badge de config** indica si estás usando Draft o Published (según runtime config o override por URL).

### 7.3 Panel de debug

En la misma pantalla del simulador suele mostrarse un panel con:

- **Turn**: último turno procesado (status, agentId, duración).
- **AI Classification**: si el flow usa router AI, confidence y reasoning de la clasificación.
- **KB Usage**: qué chunks de Markdown o filas de tabla usó el agente en ese turno.
- **Cooldown**: si las respuestas automáticas están activas o en pausa.
- **Flow**: estado actual del FSM (nombre del estado).

Útil para ver por qué el bot respondió algo o si está usando la KB que esperas.

### 7.4 Acciones

- **Reset conversación**: borra memoria y estado de esa conversación de prueba; empiezas de cero.
- **Clear cooldown**: vuelve a activar las respuestas del bot si estaban en cooldown.
- **Export JSON**: descarga el historial de la conversación (mensajes y metadatos) para revisión.

### 7.5 Override de config

Puedes forzar draft o published en esa conversación de simulador añadiendo en la URL: `?config=draft` o `?config=published`. Así puedes comparar comportamiento entre draft y published sin cambiar el runtime config global.

---

## 8. Gestión de conversaciones (`/conversations`)

### 8.1 Lista de conversaciones

- En **`/conversations`** ves todas las conversaciones (WhatsApp y, si aplica, simulador).
- Filtro por **sesión** para ver solo las de un bot.
- Columnas típicas: último mensaje, fecha, estado de respuestas (habilitadas / cooldown).
- Clic en una fila para ir al detalle.

### 8.2 Detalle de conversación (`/conversations/[whatsappId]`)

- Historial completo de mensajes.
- **Toggle de respuestas**: activar o desactivar las respuestas automáticas del bot en esa conversación.
- (Si está disponible) formulario para enviar un mensaje manual desde el panel de admin.

### 8.3 Modo humano (cooldown)

- Si un humano responde por la misma cuenta de WhatsApp, el sistema puede poner la conversación en **cooldown**: el bot deja de responder un tiempo (por defecto unas 2 horas) para no pisar al operador.
- En el detalle de la conversación puedes ver el estado y, si la UI lo permite, activar o desactivar respuestas manualmente.

---

## 9. Casos de uso comunes

### 9.1 Crear un bot desde cero

1. Crear sesión en `flows/session_<id>/` con un `flow.json` simple (ver 4.3).
2. En `/ui/sessions/<id>` publicar el flow (o dejarlo en draft y usar force_draft en simulador).
3. En `/kb/<id>` crear al menos un documento Markdown (slug, título, contenido) y dejarlo active.
4. Probar en `/sim/<id>` y ajustar prompt o flow según necesidad.
5. Publicar flow y prompts cuando estén listos.

### 9.2 Agregar una categoría a un FSM existente

1. Abrir el flow en draft.
2. En el estado router (keyword o AI), añadir una nueva ruta (keyword o descripción + `next`).
3. Crear el nuevo estado (ej: respuesta fija o agente + KB) y transiciones hacia `END` o de vuelta al router.
4. Validar, guardar draft, probar en simulador y publicar.

### 9.3 Actualizar información de productos

- **Opción A**: editar o crear documentos en la pestaña Markdown de `/kb/[sessionId]` (guías, FAQs, descripciones).
- **Opción B**: si los datos vienen de un catálogo externo, usar la API de sincronización de tablas desde n8n u otro sistema; ver [docs/KB_SYNC_API.md](docs/KB_SYNC_API.md).

### 9.4 Cambiar la personalidad del agente

1. En `/ui/sessions/[sessionId]` abrir el editor del agente que usa el flow (ej: cami_default).
2. Modificar el system prompt (tono, idioma, instrucciones).
3. Guardar draft, probar en simulador y publicar.

### 9.5 Troubleshooting básico

- **El bot no responde**: revisar en el detalle de la conversación si las respuestas están deshabilitadas o en cooldown; activar si corresponde.
- **Respuesta incorrecta o desactualizada**: revisar contenido de la KB (Markdown y tablas) y el topK del flow; revisar el prompt del agente.
- **Error al guardar el flow**: usar Validate en el editor; corregir JSON (comas, llaves, nombres de estados/agentes).
- **Ver qué hizo el agente**: usar el panel de debug del simulador (KB usage, estado FSM, AI classification).

---

## 10. Buenas prácticas

- Probar siempre en el **simulador** antes de publicar cambios de flow o prompt.
- Usar **draft/published** para evitar dejar a medias la versión en producción.
- **Validar** el flow antes de guardar y antes de publicar.
- Documentar cambios (comentarios en JSON no están soportados; usar notas externas o control de versiones).
- Mantener la KB ordenada: **slugs** descriptivos y documentos bien titulados.
- Revisar **KB usage** en el debug del simulador para ajustar `topK` si el agente usa poco o demasiado contexto.

---

## 11. Referencia rápida

### Rutas principales

| Ruta                          | Uso                                            |
| ----------------------------- | ---------------------------------------------- |
| `/`                           | Dashboard                                      |
| `/ui/sessions/[sessionId]`    | Configuración (flows, prompts, runtime config) |
| `/kb/[sessionId]`             | Knowledge Base (Markdown y tablas)             |
| `/sim/[sessionId]`            | Simulador                                      |
| `/conversations`              | Lista de conversaciones                        |
| `/conversations/[whatsappId]` | Detalle y toggle de respuestas                 |

### Estados draft / published

- **Draft**: cambios en progreso; no afectan producción hasta publicar.
- **Published**: versión en producción (y por defecto en simulador si runtime está en auto).
- Si no hay versión en base de datos, el sistema usa el `flow.json` del filesystem.

### Comandos útiles (con acceso a terminal)

- `npm run worker`: procesar cola de jobs (turns, envío, memoria).
- `npm run seed-kb`: seed inicial de KB desde archivos en `flows/*/kb/`.

---

## 12. Recursos adicionales

- **README.md**: documentación técnica completa, arquitectura y APIs.
- **docs/KB_SYNC_API.md**: sincronización de tablas KB desde n8n (o otro cliente).
- **flows/session_example/**: ejemplo de flow FSM con router keyword.
- **flows/session_iutopyBusiness/**: ejemplo de FSM complejo con muchas categorías y escalación.
