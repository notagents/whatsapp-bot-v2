import { ensureIndexes } from "./models";

let initialized = false;

export async function initializeApp(): Promise<void> {
  if (initialized) return;
  await ensureIndexes();
  initialized = true;
  console.log("[init] Database indexes created");
}
