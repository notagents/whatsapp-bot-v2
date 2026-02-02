import OpenAI from "openai";
import { lookupRows, getRowByPk, queryRows } from "./query";

export const KB_TABLE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "kb_table_lookup",
      description: "Buscar productos por nombre o descripcion",
      parameters: {
        type: "object",
        properties: {
          tableKey: {
            type: "string",
            description: "Tabla (ej: products)",
            default: "products",
          },
          query: { type: "string", description: "Texto a buscar" },
          limit: {
            type: "number",
            description: "Max resultados (default 10)",
            default: 10,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kb_table_get",
      description: "Obtener detalles completos de un producto por SKU o id",
      parameters: {
        type: "object",
        properties: {
          tableKey: {
            type: "string",
            description: "Tabla (ej: products)",
            default: "products",
          },
          pk: { type: "string", description: "Valor del primaryKey (SKU, id)" },
        },
        required: ["pk"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kb_table_query",
      description: "Filtrar productos por categoria u otros criterios",
      parameters: {
        type: "object",
        properties: {
          tableKey: {
            type: "string",
            description: "Tabla (ej: products)",
            default: "products",
          },
          filter: {
            type: "object",
            description: "Filtros (ej: { category: 'tazas' })",
          },
          limit: {
            type: "number",
            description: "Max resultados (default 20)",
            default: 20,
          },
        },
      },
    },
  },
];

export async function executeKbTableTool(
  name: string,
  args: unknown,
  sessionId: string
): Promise<unknown> {
  const a = args as Record<string, unknown>;
  const tableKey = (
    typeof a?.tableKey === "string" ? a.tableKey : "products"
  ).trim();
  const limit =
    typeof a?.limit === "number" ? Math.min(Math.max(1, a.limit), 50) : 20;

  switch (name) {
    case "kb_table_lookup": {
      const query = String(a?.query ?? "").trim();
      if (!query) return { error: "query required", results: [] };
      const lookupFilter =
        tableKey === "products" ? { publicado: true } : undefined;
      const rows = await lookupRows({
        sessionId,
        tableKey,
        query,
        limit: typeof a?.limit === "number" ? Math.min(a.limit, 50) : 10,
        filter: lookupFilter,
      });
      return {
        results: rows.map((r) => ({ pk: r.pk, data: r.data })),
      };
    }
    case "kb_table_get": {
      const pk = String(a?.pk ?? "").trim();
      if (!pk) return { error: "pk required" };
      const row = await getRowByPk({ sessionId, tableKey, pk });
      if (!row) return { error: "not_found", tableKey, pk };
      return { pk: row.pk, data: row.data };
    }
    case "kb_table_query": {
      const filter =
        a?.filter && typeof a.filter === "object" && !Array.isArray(a.filter)
          ? (a.filter as Record<string, unknown>)
          : undefined;
      const mergedFilter =
        tableKey === "products"
          ? { publicado: true, ...filter }
          : filter ?? undefined;
      const rows = await queryRows({
        sessionId,
        tableKey,
        filter: mergedFilter,
        limit,
      });
      return {
        results: rows.map((r) => ({ pk: r.pk, data: r.data })),
      };
    }
    default:
      throw new Error(`Unknown KB table tool: ${name}`);
  }
}
