import type { KBChunk } from "./types";

const STOPWORDS = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "a",
  "al",
  "en",
  "y",
  "o",
  "pero",
  "si",
  "no",
  "que",
  "es",
  "son",
  "se",
  "lo",
  "le",
  "te",
  "me",
  "por",
  "para",
  "con",
  "sin",
  "sobre",
  "entre",
  "hasta",
  "desde",
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function scoreChunk(queryTokens: string[], chunk: KBChunk): number {
  const textTokens = tokenize(chunk.text);
  const textLower = normalize(chunk.text);
  const queryLower = normalize(queryTokens.join(" "));
  let score = 0;
  for (const qt of queryTokens) {
    const count = textTokens.filter((t) => t === qt || t.includes(qt) || qt.includes(t)).length;
    score += count;
  }
  if (queryLower.length >= 3 && textLower.includes(queryLower)) {
    score += 5;
  }
  return score;
}

export function retrieveChunks(query: string, chunks: KBChunk[], topK: number): KBChunk[] {
  if (chunks.length === 0 || topK <= 0) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return chunks.slice(0, topK);

  const scored = chunks.map((chunk) => ({
    chunk,
    score: scoreChunk(queryTokens, chunk),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => s.chunk);
}
