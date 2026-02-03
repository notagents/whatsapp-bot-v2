import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = process.env.MONGODB_DB_NAME ?? undefined;
let cached: Db | null = null;

export async function getDb(): Promise<Db> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  if (cached) {
    return cached;
  }
  const client = new MongoClient(uri);
  const db = client.db(dbName);
  cached = db;
  return db;
}

export const MESSAGES_COLLECTION = "messages";
export const RESPONSES_ENABLED_COLLECTION = "responsesEnabled";
export const TURNS_COLLECTION = "turns";
export const AGENT_RUNS_COLLECTION = "agent_runs";
export const MEMORY_COLLECTION = "memory";
export const JOBS_COLLECTION = "jobs";
export const CONVERSATION_STATE_COLLECTION = "conversation_state";
export const CONVERSATION_SESSIONS_COLLECTION = "conversation_sessions";
export const LOCKS_COLLECTION = "locks";
export const KB_MD_DOCS_COLLECTION = "kb_md_docs";
export const KB_MD_CHUNKS_COLLECTION = "kb_md_chunks";
export const KB_TABLES_COLLECTION = "kb_tables";
export const KB_ROWS_COLLECTION = "kb_rows";
export const KB_SYNC_RUNS_COLLECTION = "kb_sync_runs";
export const KB_SYNC_BATCH_PKS_COLLECTION = "kb_sync_batch_pks";
export const KB_SYNONYMS_CONFIG_COLLECTION = "kb_synonyms_config";
export const FLOW_DOCUMENTS_COLLECTION = "flow_documents";
export const AGENT_PROMPT_DOCUMENTS_COLLECTION = "agent_prompt_documents";
export const SESSION_RUNTIME_CONFIG_COLLECTION = "session_runtime_config";
export const SESSION_CONTEXT_CONFIG_COLLECTION = "session_context_config";
export const SESSIONS_COLLECTION = "sessions";
export const SESSION_RESET_RUNS_COLLECTION = "session_reset_runs";
