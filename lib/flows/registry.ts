import { readFile } from "fs/promises";
import { join } from "path";
import { flowConfigSchema, type FlowConfig, type ResolvedFlow } from "./types";

const FLOWS_BASE = "flows";
const FLOW_FILE = "flow.json";
const CACHE_TTL_MS = 5 * 60 * 1000;
const isDev = process.env.NODE_ENV !== "production";

const cache = new Map<string, { resolved: ResolvedFlow; expiresAt: number }>();

function getFlowDir(sessionId: string): string {
  return join(process.cwd(), FLOWS_BASE, `session_${sessionId}`);
}

function getDefaultFlowDir(): string {
  return join(process.cwd(), FLOWS_BASE, "default");
}

function getFlowPath(dir: string): string {
  return join(dir, FLOW_FILE);
}

export async function loadFlowFromPath(
  dir: string
): Promise<{ config: FlowConfig; flowPath: string } | null> {
  const flowPath = getFlowPath(dir);
  try {
    const raw = await readFile(flowPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const config = flowConfigSchema.parse(parsed);
    const flowPathRelative = flowPath
      .replace(process.cwd(), "")
      .replace(/\\/g, "/");
    return {
      config,
      flowPath: flowPathRelative || `/${FLOWS_BASE}/default/${FLOW_FILE}`,
    };
  } catch {
    return null;
  }
}

export function getFlowDirForSession(sessionId: string): string {
  return getFlowDir(sessionId);
}

export function getDefaultFlowDirPath(): string {
  return getDefaultFlowDir();
}

function getCached(sessionId: string): ResolvedFlow | null {
  if (isDev) return null;
  const entry = cache.get(sessionId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.resolved;
}

function setCache(sessionId: string, resolved: ResolvedFlow): void {
  if (isDev) return;
  cache.set(sessionId, {
    resolved,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export async function resolveFlow(sessionId: string): Promise<ResolvedFlow> {
  const cached = getCached(sessionId);
  if (cached) return cached;

  const sessionDir = getFlowDir(sessionId);
  const sessionFlow = await loadFlowFromPath(sessionDir);
  if (sessionFlow) {
    setCache(sessionId, sessionFlow);
    return sessionFlow;
  }

  const defaultDir = getDefaultFlowDir();
  const defaultFlow = await loadFlowFromPath(defaultDir);
  if (defaultFlow) {
    setCache(sessionId, defaultFlow);
    return defaultFlow;
  }

  const fallback: ResolvedFlow = {
    config: {
      mode: "simple",
      agent: "default_assistant",
      kb: { enabled: false, topK: 4 },
      humanMode: { respectCooldown: true },
    },
    flowPath: `/${FLOWS_BASE}/default/${FLOW_FILE}`,
  };
  setCache(sessionId, fallback);
  return fallback;
}

export function clearFlowCache(sessionId?: string): void {
  if (sessionId) cache.delete(sessionId);
  else cache.clear();
}

export async function loadFlowFromFilesystem(
  sessionId: string
): Promise<ResolvedFlow> {
  const sessionDir = getFlowDir(sessionId);
  const sessionFlow = await loadFlowFromPath(sessionDir);
  if (sessionFlow) return sessionFlow;
  const defaultDir = getDefaultFlowDir();
  const defaultFlow = await loadFlowFromPath(defaultDir);
  if (defaultFlow) return defaultFlow;
  return {
    config: {
      mode: "simple",
      agent: "default_assistant",
      kb: { enabled: false, topK: 4 },
      humanMode: { respectCooldown: true },
    },
    flowPath: `/${FLOWS_BASE}/default/${FLOW_FILE}`,
  };
}
