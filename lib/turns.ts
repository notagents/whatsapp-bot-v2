import { getDb } from "./db";
import { TURNS_COLLECTION } from "./db";
import type { Turn } from "./models";

export async function getRecentTurns(whatsappId: string, limit: number): Promise<Turn[]> {
  const db = await getDb();
  return db
    .collection<Turn>(TURNS_COLLECTION)
    .find({ whatsappId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getTurn(turnId: string): Promise<Turn | null> {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  return db.collection<Turn>(TURNS_COLLECTION).findOne({ _id: new ObjectId(turnId) });
}
