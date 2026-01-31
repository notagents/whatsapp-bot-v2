import { getDb, RESPONSES_ENABLED_COLLECTION } from "./db";
import type { ResponsesEnabled } from "./models";
import { getSessionIdFromComposite, getActualJid } from "./conversation";

export type ResponsesEnabledResult = {
  enabled: boolean;
  disabledUntilUTC: string | null;
};

export async function getResponsesEnabled(whatsappId: string): Promise<ResponsesEnabledResult> {
  const db = await getDb();
  const col = db.collection<ResponsesEnabled>(RESPONSES_ENABLED_COLLECTION);
  const doc = await col.findOne({ whatsappId });
  const enabled = doc?.enabled ?? true;
  const disabledUntilUTC = doc?.disabledUntilUTC ?? null;
  return { enabled, disabledUntilUTC };
}

export function isInCooldown(config: ResponsesEnabledResult): boolean {
  if (!config.disabledUntilUTC) return false;
  return new Date(config.disabledUntilUTC) > new Date();
}

export async function updateResponsesEnabled(
  whatsappId: string,
  options: { enabled?: boolean; disabledUntilUTC?: string }
): Promise<void> {
  const db = await getDb();
  const col = db.collection<ResponsesEnabled>(RESPONSES_ENABLED_COLLECTION);
  const sessionId = getSessionIdFromComposite(whatsappId) ?? "default";
  const userID = getActualJid(whatsappId);
  const now = Date.now();
  await col.updateOne(
    { whatsappId },
    {
      $set: {
        whatsappId,
        sessionId,
        userID,
        updatedAt: now,
        ...(options.enabled !== undefined && { enabled: options.enabled }),
        ...(options.disabledUntilUTC !== undefined && { disabledUntilUTC: options.disabledUntilUTC }),
      },
    },
    { upsert: true }
  );
}
