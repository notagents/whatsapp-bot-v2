import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { KB_MD_DOCS_COLLECTION } from "@/lib/db";
import type { KbMdDoc } from "@/lib/kb-v2/types";

export async function listMdDocs(
  sessionId: string,
  status?: "active" | "archived"
): Promise<KbMdDoc[]> {
  const db = await getDb();
  const filter: { sessionId: string; status?: "active" | "archived" } = {
    sessionId,
  };
  if (status) filter.status = status;
  return db
    .collection<KbMdDoc>(KB_MD_DOCS_COLLECTION)
    .find(filter)
    .sort({ updatedAt: -1 })
    .toArray();
}

export async function getMdDocById(docId: ObjectId): Promise<KbMdDoc | null> {
  const db = await getDb();
  return db.collection<KbMdDoc>(KB_MD_DOCS_COLLECTION).findOne({ _id: docId });
}

export async function getMdDocBySlug(
  sessionId: string,
  slug: string
): Promise<KbMdDoc | null> {
  const db = await getDb();
  return db
    .collection<KbMdDoc>(KB_MD_DOCS_COLLECTION)
    .findOne({ sessionId, slug, status: "active" });
}

export async function createMdDoc(
  doc: Omit<KbMdDoc, "_id" | "version"> & { version?: number }
): Promise<ObjectId> {
  const db = await getDb();
  const now = Date.now();
  const insert: Omit<KbMdDoc, "_id"> = {
    ...doc,
    status: doc.status ?? "active",
    updatedAt: now,
    version: doc.version ?? 1,
  };
  const result = await db
    .collection<KbMdDoc>(KB_MD_DOCS_COLLECTION)
    .insertOne(insert as KbMdDoc);
  return result.insertedId;
}

export async function updateMdDoc(
  docId: ObjectId,
  updates: {
    markdown?: string;
    title?: string;
    tags?: string[];
    updatedBy?: string;
  },
  expectedVersion: number
): Promise<boolean> {
  const db = await getDb();
  const set: Partial<KbMdDoc> = {
    updatedAt: Date.now(),
    version: expectedVersion + 1,
  };
  if (updates.markdown !== undefined) set.markdown = updates.markdown;
  if (updates.title !== undefined) set.title = updates.title;
  if (updates.tags !== undefined) set.tags = updates.tags;
  if (updates.updatedBy !== undefined) set.updatedBy = updates.updatedBy;
  set.version = expectedVersion + 1;
  const result = await db
    .collection<KbMdDoc>(KB_MD_DOCS_COLLECTION)
    .updateOne({ _id: docId, version: expectedVersion }, { $set: set });
  return result.modifiedCount > 0;
}

export async function archiveMdDoc(docId: ObjectId): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<KbMdDoc>(KB_MD_DOCS_COLLECTION)
    .updateOne(
      { _id: docId },
      { $set: { status: "archived" as const, updatedAt: Date.now() } }
    );
  return result.modifiedCount > 0;
}
