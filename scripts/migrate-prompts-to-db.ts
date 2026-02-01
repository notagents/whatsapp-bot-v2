import "dotenv/config";
import { getDb, AGENT_PROMPT_DOCUMENTS_COLLECTION } from "../lib/db";
import type { AgentPromptDocument } from "../lib/models";
import { getAvailableSessions } from "../lib/sim-sessions";
import { getRegisteredAgentIds } from "../lib/agents/registry";
import { getFallbackConfig } from "../lib/agents/prompt-resolver";
import { ensureIndexes } from "../lib/models";

const MIGRATION_USER = "migration";

async function main() {
  await ensureIndexes();
  const sessions = await getAvailableSessions();
  const agentIds = getRegisteredAgentIds();
  const db = await getDb();
  const col = db.collection<AgentPromptDocument>(
    AGENT_PROMPT_DOCUMENTS_COLLECTION
  );
  let migrated = 0;

  for (const sessionId of sessions) {
    for (const agentId of agentIds) {
      const config = getFallbackConfig(agentId);
      const now = Date.now();
      const doc: Omit<AgentPromptDocument, "_id"> = {
        sessionId,
        agentId,
        status: "published",
        format: "text",
        systemPromptTemplate: config.systemPromptTemplate,
        model: config.model,
        temperature: config.temperature,
        maxToolRounds: config.maxToolRounds,
        toolsPolicy: config.toolsPolicy,
        version: 1,
        updatedAt: now,
        updatedBy: MIGRATION_USER,
        lastValidAt: now,
      };
      await col.updateOne(
        { sessionId, agentId, status: "published" },
        { $set: doc },
        { upsert: true }
      );
      await col.updateOne(
        { sessionId, agentId, status: "draft" },
        { $set: { ...doc, status: "draft" } },
        { upsert: true }
      );
      migrated++;
    }
    console.log(`[migrate-prompts] Migrated session ${sessionId}`);
  }

  console.log(
    `[migrate-prompts] Done. Migrated ${migrated} prompt documents (${sessions.length} sessions × ${agentIds.length} agents).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
