import { readFile, readdir } from "fs/promises";
import { join } from "path";
import type { KBChunk } from "./types";

const FLOWS_BASE = "flows";
const KB_DIR = "kb";
const MAX_CHUNKS_PER_SESSION = 1000;

const cache = new Map<string, KBChunk[]>();

function getFlowDir(sessionId: string): string {
  return join(process.cwd(), FLOWS_BASE, `session_${sessionId}`);
}

function getDefaultFlowDir(): string {
  return join(process.cwd(), FLOWS_BASE, "default");
}

async function listKbFiles(dir: string): Promise<{ name: string; path: string }[]> {
  const kbPath = join(dir, KB_DIR);
  try {
    const entries = await readdir(kbPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (/\.md$/i.test(e.name) || /\.csv$/i.test(e.name)))
      .map((e) => ({ name: e.name, path: join(kbPath, e.name) }));
  } catch {
    return [];
  }
}

async function parseMd(path: string, source: string, sessionId: string, fileIndex: number): Promise<KBChunk> {
  const raw = await readFile(path, "utf-8");
  const text = raw.trim();
  const id = `md_${sessionId}_${fileIndex}_${source.replace(/\W/g, "_")}`;
  return { id, sessionId, text, source };
}

async function parseCsv(path: string, source: string, sessionId: string): Promise<KBChunk[]> {
  const raw = await readFile(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim());
  const chunks: KBChunk[] = [];
  for (let i = 1; i < lines.length && chunks.length < MAX_CHUNKS_PER_SESSION; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const parts = headers.map((h, idx) => `${h}: ${values[idx] ?? ""}`);
    const text = parts.join(" ");
    const id = `csv_${sessionId}_${i}_${source.replace(/\W/g, "_")}`;
    chunks.push({ id, sessionId, text, source });
  }
  return chunks;
}

async function loadFromDir(dir: string, sessionId: string): Promise<KBChunk[]> {
  const files = await listKbFiles(dir);
  const allChunks: KBChunk[] = [];
  let mdIndex = 0;
  for (const { name, path } of files) {
    const source = name;
    if (/\.md$/i.test(name)) {
      const chunk = await parseMd(path, source, sessionId, mdIndex++);
      allChunks.push(chunk);
    } else if (/\.csv$/i.test(name)) {
      const chunks = await parseCsv(path, source, sessionId);
      allChunks.push(...chunks);
    }
    if (allChunks.length >= MAX_CHUNKS_PER_SESSION) break;
  }
  return allChunks;
}

export async function loadKB(sessionId: string): Promise<KBChunk[]> {
  const cached = cache.get(sessionId);
  if (cached) return cached;

  const sessionDir = getFlowDir(sessionId);
  let chunks = await loadFromDir(sessionDir, sessionId);
  if (chunks.length === 0) {
    const defaultDir = getDefaultFlowDir();
    chunks = await loadFromDir(defaultDir, sessionId);
  }
  cache.set(sessionId, chunks);
  return chunks;
}

export function clearKBCache(sessionId?: string): void {
  if (sessionId) cache.delete(sessionId);
  else cache.clear();
}
