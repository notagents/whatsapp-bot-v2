import "dotenv/config";
import { readFile } from "fs/promises";
import { join } from "path";
import { getDb, FLOW_DOCUMENTS_COLLECTION } from "../lib/db";
import type { FlowDocument } from "../lib/models";
import { getAvailableSessions } from "../lib/sim-sessions";
import {
  loadFlowFromPath,
  getFlowDirForSession,
  getDefaultFlowDirPath,
} from "../lib/flows/registry";
import { validateFlow } from "../lib/flows/validator";
import { ensureIndexes } from "../lib/models";

const FLOW_FILE = "flow.json";
const FLOW_NAME = "main";
const FLOW_TYPE = "flow";
const SCHEMA_VERSION = 1;
const MIGRATION_USER = "migration";

async function main() {
  await ensureIndexes();
  const sessions = await getAvailableSessions();
  const db = await getDb();
  const col = db.collection<FlowDocument>(FLOW_DOCUMENTS_COLLECTION);
  let migrated = 0;
  let skipped = 0;

  for (const sessionId of sessions) {
    const sessionDir = getFlowDirForSession(sessionId);
    let flow = await loadFlowFromPath(sessionDir);
    if (!flow) {
      const defaultDir = getDefaultFlowDirPath();
      flow = await loadFlowFromPath(defaultDir);
    }
    if (!flow) {
      const defaultPath = join(getDefaultFlowDirPath(), FLOW_FILE);
      let raw: string;
      try {
        raw = await readFile(defaultPath, "utf-8");
      } catch {
        console.warn(`[migrate-flows] No flow for ${sessionId}, skipping`);
        skipped++;
        continue;
      }
      const validation = validateFlow(raw);
      if (!validation.valid) {
        console.warn(
          `[migrate-flows] Invalid flow for ${sessionId}: ${validation.error}`
        );
        skipped++;
        continue;
      }
      flow = { config: validation.parsed, flowPath: defaultPath };
    }

    const text = JSON.stringify(flow.config, null, 2);
    const validation = validateFlow(text);
    if (!validation.valid) {
      console.warn(
        `[migrate-flows] Invalid flow for ${sessionId}: ${validation.error}`
      );
      skipped++;
      continue;
    }

    const now = Date.now();
    const doc: Omit<FlowDocument, "_id"> = {
      sessionId,
      type: FLOW_TYPE,
      name: FLOW_NAME,
      status: "published",
      format: "json",
      text,
      parsed: validation.parsed,
      schemaVersion: SCHEMA_VERSION,
      version: 1,
      updatedAt: now,
      updatedBy: MIGRATION_USER,
      lastValidAt: now,
    };

    await col.updateOne(
      { sessionId, type: FLOW_TYPE, name: FLOW_NAME, status: "published" },
      { $set: doc },
      { upsert: true }
    );
    await col.updateOne(
      { sessionId, type: FLOW_TYPE, name: FLOW_NAME, status: "draft" },
      { $set: { ...doc, status: "draft" } },
      { upsert: true }
    );
    migrated++;
    console.log(`[migrate-flows] Migrated ${sessionId}`);
  }

  console.log(`[migrate-flows] Done. Migrated ${migrated}, skipped ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
