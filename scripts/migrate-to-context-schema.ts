import "dotenv/config";
import { getDb, SESSION_CONTEXT_CONFIG_COLLECTION } from "../lib/db";
import type { SessionContextConfig } from "../lib/models";
import { getAvailableSessions } from "../lib/sim-sessions";
import { resolveFlow } from "../lib/flows/resolver";
import { deriveSchemaFromFSM } from "../lib/context-schema";
import type { FSMFlowConfig } from "../lib/flows/types";
import { ensureIndexes } from "../lib/models";

const MIGRATION_USER = "migration";

async function main() {
  await ensureIndexes();
  const sessions = await getAvailableSessions();
  const db = await getDb();
  const col = db.collection<SessionContextConfig>(
    SESSION_CONTEXT_CONFIG_COLLECTION
  );
  let migrated = 0;
  let skipped = 0;

  for (const sessionId of sessions) {
    try {
      const resolved = await resolveFlow(sessionId, "whatsapp");
      if (resolved.config.mode !== "fsm") {
        skipped++;
        continue;
      }
      const schema = deriveSchemaFromFSM(
        sessionId,
        resolved.config as FSMFlowConfig
      );
      const now = Date.now();
      const config: SessionContextConfig = {
        sessionId,
        schema,
        enabled: true,
        updatedAt: now,
        updatedBy: MIGRATION_USER,
      };
      await col.updateOne({ sessionId }, { $set: config }, { upsert: true });
      migrated++;
      console.log(`[migrate-context-schema] ${sessionId}: schema saved`);
    } catch (err) {
      console.warn(
        `[migrate-context-schema] ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      skipped++;
    }
  }

  console.log(
    `[migrate-context-schema] done: ${migrated} migrated, ${skipped} skipped`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
