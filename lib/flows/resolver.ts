import type { ResolvedFlow } from "./types";
import type { FlowDocument, SessionRuntimeConfig } from "@/lib/models";
import {
  getDb,
  FLOW_DOCUMENTS_COLLECTION,
  SESSION_RUNTIME_CONFIG_COLLECTION,
} from "@/lib/db";
import { loadFlowFromFilesystem } from "./registry";

const CACHE_TTL_MS = 5_000;
const FLOW_NAME = "main";
const FLOW_TYPE = "flow";

type Channel = "whatsapp" | "simulator";
type Status = "draft" | "published";
type ConfigMode = SessionRuntimeConfig["configMode"];

const cache = new Map<string, { resolved: ResolvedFlow; expiresAt: number }>();

function cacheKey(sessionId: string, status: Status): string {
  return `flow:${sessionId}:${status}`;
}

function getCached(sessionId: string, status: Status): ResolvedFlow | null {
  const entry = cache.get(cacheKey(sessionId, status));
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.resolved;
}

function setCached(
  sessionId: string,
  status: Status,
  resolved: ResolvedFlow
): void {
  cache.set(cacheKey(sessionId, status), {
    resolved,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function resolveStatus(
  channel: Channel,
  configMode: ConfigMode,
  override?: Status
): Status {
  if (override) return override;
  if (configMode === "force_draft") return "draft";
  if (configMode === "force_published") return "published";
  return channel === "simulator" ? "draft" : "published";
}

export async function resolveFlow(
  sessionId: string,
  channel: Channel,
  override?: Status
): Promise<ResolvedFlow> {
  const db = await getDb();
  const configCol = db.collection<SessionRuntimeConfig>(
    SESSION_RUNTIME_CONFIG_COLLECTION
  );
  const configDoc = await configCol.findOne({ sessionId });
  const configMode: ConfigMode = configDoc?.configMode ?? "auto";
  const status = resolveStatus(channel, configMode, override);

  const cached = getCached(sessionId, status);
  if (cached) return cached;

  const flowCol = db.collection<FlowDocument>(FLOW_DOCUMENTS_COLLECTION);
  const draftDoc = await flowCol.findOne({
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "draft",
  });
  const publishedDoc = await flowCol.findOne({
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "published",
  });

  let doc: FlowDocument | null = null;
  if (
    status === "draft" &&
    draftDoc &&
    !draftDoc.lastError &&
    draftDoc.parsed
  ) {
    doc = draftDoc;
  } else if (
    status === "draft" &&
    draftDoc?.lastError &&
    publishedDoc?.parsed
  ) {
    doc = publishedDoc;
  } else if (status === "published" && publishedDoc?.parsed) {
    doc = publishedDoc;
  } else if (status === "draft" && draftDoc?.parsed) {
    doc = draftDoc;
  }

  if (doc?.parsed) {
    const resolved: ResolvedFlow = {
      config: doc.parsed,
      flowPath: `db:${sessionId}:${doc.status}`,
    };
    setCached(sessionId, status, resolved);
    return resolved;
  }

  const fromFs = await loadFlowFromFilesystem(sessionId);
  setCached(sessionId, status, fromFs);
  return fromFs;
}

export function clearFlowResolverCache(sessionId?: string): void {
  if (sessionId) {
    cache.delete(cacheKey(sessionId, "draft"));
    cache.delete(cacheKey(sessionId, "published"));
  } else {
    cache.clear();
  }
}
