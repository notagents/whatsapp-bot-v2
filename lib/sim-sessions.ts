const BAILEYS_TIMEOUT_MS = 3000;

type BaileysSessionRaw = {
  sessionId?: string;
  id?: string;
  [key: string]: unknown;
};

async function getBaileysSessionsRaw(): Promise<BaileysSessionRaw[] | null> {
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

export async function getAvailableSessions(): Promise<string[]> {
  const list = await getBaileysSessionsRaw();
  if (!Array.isArray(list)) return [];
  const ids: string[] = [];
  for (const s of list) {
    const id = s.sessionId ?? s.id;
    if (typeof id === "string") ids.push(id);
  }
  return ids;
}
