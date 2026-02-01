import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { getDb } from "../lib/db";
import { KB_MD_DOCS_COLLECTION } from "../lib/db";
import type { KbMdDoc } from "../lib/kb-v2/types";
import { reindexMarkdownDoc } from "../lib/kb-v2/md/chunker";
import { ensureIndexes } from "../lib/models";

const FLOWS_BASE = "flows";
const KB_DIR = "kb";

function sessionIdFromFlowDir(dirName: string): string {
  if (dirName === "default") return "default";
  if (dirName.startsWith("session_")) return dirName.slice(8);
  return dirName;
}

async function main() {
  await ensureIndexes();
  const flowsPath = join(process.cwd(), FLOWS_BASE);
  const entries = await readdir(flowsPath, { withFileTypes: true });
  const db = await getDb();
  const col = db.collection<KbMdDoc>(KB_MD_DOCS_COLLECTION);
  let created = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionId = sessionIdFromFlowDir(entry.name);
    const kbPath = join(flowsPath, entry.name, KB_DIR);
    let files: string[];
    try {
      files = await readdir(kbPath);
    } catch {
      continue;
    }
    const mdFiles = files.filter((f) => /\.md$/i.test(f));
    for (const file of mdFiles) {
      const slug =
        file.replace(/\.md$/i, "").replace(/\W/g, "-").toLowerCase() || "doc";
      const existing = await col.findOne({ sessionId, slug, status: "active" });
      if (existing) continue;
      const fullPath = join(kbPath, file);
      const markdown = await readFile(fullPath, "utf-8").then((s) => s.trim());
      const title =
        markdown.split(/\r?\n/)[0]?.replace(/^#\s*/, "").trim() || slug;
      const now = Date.now();
      const doc: Omit<KbMdDoc, "_id"> = {
        sessionId,
        slug,
        title,
        markdown,
        status: "active",
        updatedAt: now,
        version: 1,
      };
      const result = await col.insertOne(doc as KbMdDoc);
      await reindexMarkdownDoc(result.insertedId!);
      created++;
      console.log(
        `Created KB: sessionId=${sessionId} slug=${slug} docId=${result.insertedId}`
      );
    }
  }

  console.log(`Done. Created ${created} KB docs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
