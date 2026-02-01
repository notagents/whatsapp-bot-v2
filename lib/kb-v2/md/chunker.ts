import { createHash } from "crypto";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { KB_MD_DOCS_COLLECTION, KB_MD_CHUNKS_COLLECTION } from "@/lib/db";
import type { KbMdDoc, KbMdChunk } from "@/lib/kb-v2/types";

const MAX_CHARS_PER_CHUNK = 3200;
const OVERLAP_CHARS = 400;

export type ChunkResult = {
  chunkId: string;
  text: string;
  meta: { slug: string; title: string; headingPath?: string };
};

function stableChunkId(
  docId: ObjectId,
  sectionPath: string,
  idx: number
): string {
  const input = `${docId.toString()}_${sectionPath}_${idx}`;
  return createHash("md5").update(input).digest("hex").slice(0, 16);
}

function splitByHeaders(
  markdown: string
): Array<{ heading: string; level: number; content: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; level: number; content: string }> =
    [];
  let current: { heading: string; level: number; content: string } | null =
    null;
  const headingPath: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      while (headingPath.length >= level) headingPath.pop();
      headingPath.length = level - 1;
      headingPath.push(title);
      if (current && (current.content.trim() || current.heading)) {
        sections.push(current);
      }
      current = {
        heading: title,
        level,
        content: "",
      };
    } else if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }
  if (current) sections.push(current);
  return sections;
}

function splitLongSection(
  text: string,
  headingPath: string | undefined
): string[] {
  if (text.length <= MAX_CHARS_PER_CHUNK)
    return text.trim() ? [text.trim()] : [];
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > MAX_CHARS_PER_CHUNK) {
    const slice = remaining.slice(0, MAX_CHARS_PER_CHUNK);
    const lastBreak = Math.max(
      slice.lastIndexOf("\n\n"),
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf(" ")
    );
    const cut =
      lastBreak > MAX_CHARS_PER_CHUNK / 2 ? lastBreak + 1 : MAX_CHARS_PER_CHUNK;
    parts.push(remaining.slice(0, cut).trim());
    const overlapStart = Math.max(0, cut - OVERLAP_CHARS);
    remaining = remaining.slice(overlapStart).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export function chunkMarkdown(
  docId: ObjectId,
  sessionId: string,
  slug: string,
  title: string,
  markdown: string
): ChunkResult[] {
  const sections = splitByHeaders(markdown);
  const results: ChunkResult[] = [];
  let idx = 0;

  if (sections.length === 0 && markdown.trim()) {
    const parts = splitLongSection(markdown, undefined);
    for (let i = 0; i < parts.length; i++) {
      results.push({
        chunkId: stableChunkId(docId, "body", i),
        text: parts[i],
        meta: { slug, title },
      });
    }
    return results;
  }

  for (const section of sections) {
    const pathStr = section.heading ? [section.heading].join(" > ") : "body";
    const fullContent =
      (section.heading ? `## ${section.heading}\n\n` : "") +
      section.content.trim();
    const parts = splitLongSection(fullContent, pathStr);
    for (let i = 0; i < parts.length; i++) {
      results.push({
        chunkId: stableChunkId(docId, pathStr, idx),
        text: parts[i],
        meta: {
          slug,
          title,
          headingPath: section.heading ? pathStr : undefined,
        },
      });
      idx++;
    }
  }
  return results;
}

export async function reindexMarkdownDoc(docId: ObjectId): Promise<void> {
  const db = await getDb();
  const doc = await db
    .collection<KbMdDoc>(KB_MD_DOCS_COLLECTION)
    .findOne({ _id: docId });
  if (!doc) return;
  await db.collection<KbMdChunk>(KB_MD_CHUNKS_COLLECTION).deleteMany({ docId });
  const chunks = chunkMarkdown(
    docId,
    doc.sessionId,
    doc.slug,
    doc.title,
    doc.markdown
  );
  if (chunks.length === 0) return;
  const now = Date.now();
  const docs: Omit<KbMdChunk, "_id">[] = chunks.map((c) => ({
    sessionId: doc.sessionId,
    docId,
    chunkId: c.chunkId,
    text: c.text,
    meta: c.meta,
    updatedAt: now,
  }));
  await db
    .collection<KbMdChunk>(KB_MD_CHUNKS_COLLECTION)
    .insertMany(docs as KbMdChunk[]);
}
