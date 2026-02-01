import { readdir } from "fs/promises";
import { join } from "path";

const FLOWS_BASE = "flows";

export async function getAvailableSessions(): Promise<string[]> {
  const base = join(process.cwd(), FLOWS_BASE);
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return ["default"];
  }
  const sessionIds: string[] = [];
  const hasDefault = entries.some(
    (e) => e.isDirectory() && e.name === "default"
  );
  if (hasDefault) sessionIds.push("default");
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith("session_")) {
      sessionIds.push(e.name.slice("session_".length));
    }
  }
  return sessionIds.length > 0 ? sessionIds : ["default"];
}
