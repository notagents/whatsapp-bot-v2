# KB Tables Sync API (n8n)

Endpoint para que n8n (u otro cliente) actualice tablas KB (productos, precios, etc.) con idempotencia y modo mirror.

## Endpoint

```
POST /api/kb/tables/:sessionId/:tableKey/sync
```

- `sessionId`: ID de sesión (ej: `default`, `6801d871-3ad0-46cf-95ea-d4e88a952e90`)
- `tableKey`: Clave de tabla (ej: `products`, `prices`, `links`)

## Autenticación

Header obligatorio:

```
Authorization: Bearer <KB_SYNC_TOKEN>
```

`KB_SYNC_TOKEN` se configura por entorno (`.env` o Vercel). Generar un token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Payload (JSON)

| Campo       | Tipo    | Obligatorio | Descripción                                                                   |
| ----------- | ------- | ----------- | ----------------------------------------------------------------------------- |
| batchId     | string  | Sí          | ID único del batch (idempotencia). Ej: `2026-02-01T00:00:00Z`                 |
| mode        | string  | Sí          | Solo `"mirror"`                                                               |
| primaryKey  | string  | Sí          | Campo que identifica cada fila (ej: `sku`, `id`)                              |
| rows        | array   | Sí          | Array de objetos; cada uno debe incluir el campo `primaryKey`                 |
| batchIndex  | number  | No          | Índice del chunk (1, 2, 3…). Usado en modo multi-batch.                       |
| isLastBatch | boolean | No          | Si es `false`, no se hace mirror delete; si es `true`, se aplica al terminar. |

- **Mirror**: upsert por `primaryKey` y borra las filas que no vengan en el batch (catálogo = fuente de verdad).
- Máximo 10.000 filas por request.
- Si `batchId` ya fue procesado con éxito, se devuelve 200 con las stats guardadas sin re-procesar.

### Multi-batch (tablas grandes)

Para tablas que no caben en un solo request (p. ej. >10k filas o body >4MB):

1. Usa el **mismo** `batchId` en todos los requests.
2. Envía cada chunk con `batchIndex` (1, 2, 3…) y `isLastBatch: false` salvo en el último request.
3. En el **último** request envía `isLastBatch: true`. Solo entonces se hace el mirror delete (se borran filas cuya PK no esté en ningún chunk).
4. Los requests intermedios solo hacen upsert; el delete se ejecuta una vez al recibir el último batch.

Ejemplo: 25.000 filas en 3 requests de ~8.333 filas cada uno, mismo `batchId`, `batchIndex` 1/2/3 y `isLastBatch: true` solo en el tercero.

## Ejemplo (curl)

```bash
curl -X POST "https://tu-dominio.com/api/kb/tables/default/products/sync" \
  -H "Authorization: Bearer TU_KB_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "batchId": "2026-02-01T10:00:00Z",
    "mode": "mirror",
    "primaryKey": "sku",
    "rows": [
      { "sku": "A1", "name": "Producto X", "price": 123, "url": "https://...", "category": "tazas" },
      { "sku": "A2", "name": "Producto Y", "price": 456, "url": "https://...", "category": "tazas" }
    ]
  }'
```

## Respuesta 200

```json
{
  "success": true,
  "stats": {
    "upserted": 2,
    "deleted": 0,
    "unchanged": 0
  }
}
```

## Errores

- **401 Unauthorized**: Token ausente o inválido.
- **400 Bad Request**: Faltan `batchId`, `primaryKey` o `rows` no es un array; o alguna fila no tiene el campo `primaryKey`.
- **413 Payload Too Large**: Más de 10.000 filas.
- **500 Internal Server Error**: Error en sync; ver body para `error` y `stats`.

## n8n (cada 6h)

1. Nodo HTTP Request: método POST, URL del endpoint, header `Authorization: Bearer {{ $env.KB_SYNC_TOKEN }}`.
2. Body: JSON con `batchId` (ej. timestamp ISO del cron), `mode: "mirror"`, `primaryKey` y `rows` desde tu fuente (TiendaNube, CSV, etc.).
3. Idempotencia: usar el mismo `batchId` para el mismo dataset; si se re-ejecuta, no duplica trabajo.
4. Para tablas grandes: dividir en chunks (≤10k filas), mismo `batchId`, enviar cada chunk con `batchIndex` y `isLastBatch: true` solo en el último request; puede usar un loop en n8n que envíe cada chunk y marque `isLastBatch` en la última iteración.
