import { getDb, TURNS_COLLECTION, SESSIONS_COLLECTION } from "./db";
import type { Session } from "./models";
import { getAvailableSessions } from "./sim-sessions";

const BAILEYS_TIMEOUT_MS = 3000;

export type DashboardBaileys = {
  baseUrl: string;
  ok: boolean;
  latencyMs: number | null;
  lastCheckedAt: number;
  error: string | null;
};

export type DashboardMongo = {
  ok: boolean;
  host: string;
  dbName: string;
  lastCheckedAt: number;
  error: string | null;
};

export type DashboardSessionItem = {
  sessionId: string;
  status: "connected" | "disconnected" | "unknown";
  hasActiveConnection: boolean;
  phoneNumber?: string;
  device?: { platform?: string; model?: string };
  lastSeen?: number;
  conversationsCount: number;
  lastActivityAt: number | null;
  linkedToMongoDB: boolean;
};

export type DashboardOverview = {
  baileys: DashboardBaileys;
  mongodb: DashboardMongo;
  sessions: {
    warning: string | null;
    items: DashboardSessionItem[];
  };
};

function sanitizeBaileysUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.replace(/\/$/, "").split("/")[0] ?? url;
  }
}

function parseMongoUri(uri: string): { host: string; dbName: string } {
  try {
    const u = new URL(
      uri
        .replace("mongodb://", "https://")
        .replace("mongodb+srv://", "https://")
    );
    const host = u.hostname + (u.port ? `:${u.port}` : "");
    const path = u.pathname.replace(/^\//, "").split("?")[0];
    const dbName = path || "whatsapp_engine";
    return { host, dbName };
  } catch {
    return {
      host: "unknown",
      dbName: process.env.MONGODB_DB_NAME ?? "unknown",
    };
  }
}

export async function healthBaileys(): Promise<DashboardBaileys> {
  const baseUrl = process.env.BAILEYS_API_URL ?? process.env.BAILEYS_URL ?? "";
  const apiKey = process.env.BAILEYS_API_KEY ?? process.env.BAILEYS_KEY ?? "";
  const now = Math.floor(Date.now() / 1000);

  if (!baseUrl) {
    return {
      baseUrl: "",
      ok: false,
      latencyMs: null,
      lastCheckedAt: now,
      error: "BAILEYS_API_URL / BAILEYS_URL not set",
    };
  }

  const url = baseUrl.replace(/\/$/, "") + "/sessions";
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BAILEYS_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        baseUrl: sanitizeBaileysUrl(baseUrl),
        ok: false,
        latencyMs,
        lastCheckedAt: now,
        error: `${res.status} ${text.slice(0, 120)}`,
      };
    }
    return {
      baseUrl: sanitizeBaileysUrl(baseUrl),
      ok: true,
      latencyMs,
      lastCheckedAt: now,
      error: null,
    };
  } catch (err) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      baseUrl: sanitizeBaileysUrl(baseUrl),
      ok: false,
      latencyMs,
      lastCheckedAt: now,
      error: msg.slice(0, 120),
    };
  }
}

export async function healthMongo(): Promise<DashboardMongo> {
  const uri = process.env.MONGODB_URI ?? "";
  const dbNameEnv = process.env.MONGODB_DB_NAME;
  const now = Math.floor(Date.now() / 1000);

  if (!uri) {
    return {
      ok: false,
      host: "unknown",
      dbName: dbNameEnv ?? "unknown",
      lastCheckedAt: now,
      error: "MONGODB_URI not set",
    };
  }

  const { host, dbName } = parseMongoUri(uri);
  const finalDbName = dbNameEnv ?? dbName;

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return {
      ok: true,
      host,
      dbName: finalDbName,
      lastCheckedAt: now,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      host,
      dbName: finalDbName,
      lastCheckedAt: now,
      error: msg.slice(0, 120),
    };
  }
}

type BaileysSessionRaw = {
  sessionId?: string;
  connection?: unknown;
  phoneNumber?: string;
  device?: { platform?: string; model?: string };
  lastSeen?: number;
  [key: string]: unknown;
};

async function getBaileysSessions(): Promise<BaileysSessionRaw[] | null> {
  const baseUrl = process.env.BAILEYS_API_URL ?? process.env.BAILEYS_URL ?? "";
  const apiKey = process.env.BAILEYS_API_KEY ?? process.env.BAILEYS_KEY ?? "";
  if (!baseUrl) return null;
  const url = baseUrl.replace(/\/$/, "") + "/sessions";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BAILEYS_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as
      | BaileysSessionRaw[]
      | { sessions?: BaileysSessionRaw[] };
    if (Array.isArray(data)) return data;
    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as { sessions?: BaileysSessionRaw[] }).sessions)
    ) {
      return (data as { sessions: BaileysSessionRaw[] }).sessions;
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function getMongoSessions(): Promise<Session[]> {
  try {
    const db = await getDb();
    const col = db.collection<Session>(SESSIONS_COLLECTION);
    return col.find({}).toArray();
  } catch {
    return [];
  }
}

type SessionMetrics = {
  conversationsCount: number;
  lastActivityAt: number | null;
};

async function getSessionMetrics(
  sessionIds: string[]
): Promise<Map<string, SessionMetrics>> {
  const out = new Map<string, SessionMetrics>();
  for (const id of sessionIds) {
    out.set(id, { conversationsCount: 0, lastActivityAt: null });
  }
  if (sessionIds.length === 0) return out;

  try {
    const db = await getDb();
    const turns = db.collection(TURNS_COLLECTION);
    const countAgg = await turns
      .aggregate<{ _id: string; count: number }>([
        { $match: { sessionId: { $in: sessionIds }, channel: "whatsapp" } },
        {
          $group: {
            _id: "$sessionId",
            whatsappIds: { $addToSet: "$whatsappId" },
          },
        },
        { $project: { _id: 1, count: { $size: "$whatsappIds" } } },
      ])
      .toArray();
    for (const row of countAgg) {
      const cur = out.get(row._id) ?? {
        conversationsCount: 0,
        lastActivityAt: null,
      };
      out.set(row._id, { ...cur, conversationsCount: row.count });
    }
    const lastAgg = await turns
      .aggregate<{ _id: string; lastActivityAt: number }>([
        { $match: { sessionId: { $in: sessionIds }, channel: "whatsapp" } },
        {
          $group: { _id: "$sessionId", lastActivityAt: { $max: "$createdAt" } },
        },
      ])
      .toArray();
    for (const row of lastAgg) {
      const cur = out.get(row._id) ?? {
        conversationsCount: 0,
        lastActivityAt: null,
      };
      out.set(row._id, { ...cur, lastActivityAt: row.lastActivityAt });
    }
  } catch {
    // leave defaults
  }
  return out;
}

export async function buildOverview(): Promise<DashboardOverview> {
  const [baileys, mongodb, baileysList, mongoSessions] = await Promise.all([
    healthBaileys(),
    healthMongo(),
    getBaileysSessions(),
    getMongoSessions(),
  ]);

  const mongoSessionIds = new Set(mongoSessions.map((s) => s.sessionId));
  const baileysMap = new Map<string, BaileysSessionRaw>();
  if (Array.isArray(baileysList)) {
    for (const s of baileysList) {
      const id = s.sessionId ?? (s as { id?: string }).id;
      if (typeof id === "string") baileysMap.set(id, s);
    }
  }

  const fsSessions = await getAvailableSessions();
  const allSessionIds = new Set<string>([
    ...mongoSessionIds,
    ...baileysMap.keys(),
    ...fsSessions,
  ]);
  const metrics = await getSessionMetrics([...allSessionIds]);

  const items: DashboardSessionItem[] = [];
  for (const sessionId of allSessionIds) {
    const b = baileysMap.get(sessionId);
    const inMongo = mongoSessionIds.has(sessionId);
    const hasConnection = Boolean(b?.connection);
    const status: DashboardSessionItem["status"] =
      b == null
        ? mongodb.ok
          ? "disconnected"
          : "unknown"
        : hasConnection
        ? "connected"
        : "disconnected";
    const m = metrics.get(sessionId) ?? {
      conversationsCount: 0,
      lastActivityAt: null,
    };
    items.push({
      sessionId,
      status,
      hasActiveConnection: hasConnection,
      phoneNumber: b?.phoneNumber,
      device: b?.device,
      lastSeen: b?.lastSeen,
      conversationsCount: m.conversationsCount,
      lastActivityAt: m.lastActivityAt,
      linkedToMongoDB: inMongo,
    });
  }
  items.sort((a, b) => a.sessionId.localeCompare(b.sessionId));

  let warning: string | null = null;
  if (!baileys.ok && items.length > 0) {
    warning = "Baileys API unavailable, showing MongoDB sessions only";
  }

  return {
    baileys,
    mongodb,
    sessions: { warning, items },
  };
}
