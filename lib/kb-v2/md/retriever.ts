import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { KB_MD_CHUNKS_COLLECTION } from "@/lib/db";
import type { KbMdChunk } from "@/lib/kb-v2/types";

export type KBSearchParams = {
  sessionId: string;
  query: string;
  slugs?: string[];
  limit: number;
};

export type KBSearchResult = {
  chunkId: string;
  docId: ObjectId;
  slug: string;
  text: string;
  score: number;
};

export async function searchChunks(
  params: KBSearchParams
): Promise<KBSearchResult[]> {
  const { sessionId, query, slugs, limit } = params;
  if (!query?.trim()) return [];
  const db = await getDb();
  const col = db.collection<KbMdChunk>(KB_MD_CHUNKS_COLLECTION);

  const filter: Record<string, unknown> = {
    sessionId,
    $text: { $search: query },
  };
  if (slugs && slugs.length > 0) {
    filter["meta.slug"] = { $in: slugs };
  }

  try {
    const cursor = col
      .find(filter)
      .project({
        chunkId: 1,
        docId: 1,
        "meta.slug": 1,
        text: 1,
        score: { $meta: "textScore" },
      })
      .sort({ score: { $meta: "textScore" } })
      .limit(Math.min(limit, 50));

    const docs = await cursor.toArray();
    return docs.map((d) => ({
      chunkId: d.chunkId,
      docId: d.docId,
      slug: (d.meta?.slug as string) ?? "",
      text: d.text,
      score: (d as { score?: number }).score ?? 0,
    }));
  } catch {
    return [];
  }
}
