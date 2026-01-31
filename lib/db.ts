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
