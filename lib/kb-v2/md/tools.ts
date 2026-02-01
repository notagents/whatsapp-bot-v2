import OpenAI from "openai";
import { searchChunks } from "./retriever";
import { getMdDocBySlug } from "./loader";

export const KB_MD_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "kb_md_search",
      description:
        "Buscar información en la documentación (FAQ, políticas, info general)",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Búsqueda (ej: dirección local)",
          },
          slugs: {
            type: "array",
            items: { type: "string" },
            description: "Filtrar por KB (ej: ['faq'])",
          },
          limit: {
            type: "number",
            description: "Máximo de resultados (default 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kb_md_get",
      description: "Obtener el contenido completo de un documento por slug",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Slug del documento (ej: faq, info-general)",
          },
        },
        required: ["slug"],
      },
    },
  },
];

export async function executeKbMdTool(
  name: string,
  args: unknown,
  sessionId: string
): Promise<unknown> {
  const a = args as Record<string, unknown>;
  switch (name) {
    case "kb_md_search": {
      const query = String(a?.query ?? "").trim();
      const slugs = Array.isArray(a?.slugs)
        ? (a.slugs as string[]).filter((s) => typeof s === "string")
        : undefined;
      const limit =
        typeof a?.limit === "number" ? Math.min(Math.max(1, a.limit), 20) : 5;
      const results = await searchChunks({ sessionId, query, slugs, limit });
      return {
        results: results.map((r) => ({
          chunkId: r.chunkId,
          slug: r.slug,
          text: r.text,
          score: Math.round(r.score * 100) / 100,
        })),
      };
    }
    case "kb_md_get": {
      const slug = String(a?.slug ?? "").trim();
      if (!slug) return { error: "slug required" };
      const doc = await getMdDocBySlug(sessionId, slug);
      if (!doc) return { error: "not_found", slug };
      return { slug: doc.slug, title: doc.title, markdown: doc.markdown };
    }
    default:
      throw new Error(`Unknown KB MD tool: ${name}`);
  }
}
