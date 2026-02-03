# KB Synonyms (Query Expansion and Aliases)

Synonyms allow the agent to find products when the user uses different terms than those stored in the catalog (e.g. legal naming: "v4po", "v4porizador" vs user query "vaporizador").

## UI

Knowledge Base Manager at `/kb/[sessionId]` has a **Sinonimos** tab. You must be logged in to view or edit synonym groups. From the tab you can add groups (terms, optional category, enabled) and delete groups.

Two mechanisms:

1. **Query expansion**: When the user searches for a term that belongs to a synonym group, the search query is expanded with all terms in that group (e.g. "vaporizador" → "vaporizador v4po v4porizador vapo").
2. **Product aliases**: Rows can include an `aliases` field (array of strings). During sync, `search.aliases` is populated with normalized alias strings and used in search and scoring.

## API

Base path: `/api/kb/synonyms/[sessionId]`. All methods require `Authorization: Bearer <KB_SYNC_TOKEN>` (server-to-server). For the UI, use `/api/ui/kb/[sessionId]/synonyms` with cookie auth (login required).

| Method | Description                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | Get current synonyms config (returns `{ ok, data: { sessionId, synonymGroups, updatedAt } }`).                                    |
| POST   | Replace config. Body: `{ synonymGroups: [ { terms: string[], category?: string, enabled: boolean } ] }`.                          |
| PUT    | Add one group. Body: `{ terms: string[], category?: string, enabled?: boolean }`.                                                 |
| DELETE | Remove one group by index: query `?groupIndex=0` or body `{ groupIndex: number }`. With no groupIndex, deletes the entire config. |

## Initial config (vaporizadores)

Example for Astro Grow:

```json
{
  "sessionId": "<your-session-id>",
  "synonymGroups": [
    {
      "terms": ["vaporizador", "vapo", "vape", "v4po", "v4porizador"],
      "category": "products",
      "enabled": true
    }
  ]
}
```

### Via API

```bash
curl -X POST "https://<host>/api/kb/synonyms/<sessionId>" \
  -H "Authorization: Bearer $KB_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"synonymGroups":[{"terms":["vaporizador","vapo","vape","v4po","v4porizador"],"category":"products","enabled":true}]}'
```

### Via seed script

```bash
SESSION_ID=astro-grow npm run seed-synonyms
```

Or directly:

```bash
SESSION_ID=astro-grow npx tsx scripts/seed-synonyms-vaporizadores.ts
```

## Product aliases (data-level)

When syncing products, include an `aliases` array in each row to improve matching:

```json
{
  "id": "prod-1",
  "name": "V4porizador Mighty+",
  "category": "vaporizadores",
  "aliases": ["vaporizador mighty", "vapo mighty", "mighty vaporizer"]
}
```

Sync normalizes and stores these in `search.aliases` for search and scoring.
