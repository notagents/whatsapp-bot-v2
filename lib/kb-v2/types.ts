import type { ObjectId } from "mongodb";

export type KbMdDoc = {
  _id?: ObjectId;
  sessionId: string;
  slug: string;
  title: string;
  markdown: string;
  status: "active" | "archived";
  tags?: string[];
  updatedAt: number;
  updatedBy?: string;
  version: number;
};

export type KbMdChunk = {
  _id?: ObjectId;
  sessionId: string;
  docId: ObjectId;
  chunkId: string;
  text: string;
  meta: {
    slug: string;
    title: string;
    headingPath?: string;
  };
  embedding?: number[];
  updatedAt: number;
};

export type KbTable = {
  _id?: ObjectId;
  sessionId: string;
  tableKey: string;
  title: string;
  schema: {
    primaryKey: string;
    fields: Array<{
      key: string;
      type: "string" | "number" | "boolean" | "date" | "json";
    }>;
  };
  updatedAt: number;
};

export type KbRow = {
  _id?: ObjectId;
  sessionId: string;
  tableKey: string;
  pk: string;
  data: Record<string, unknown>;
  search?: {
    name?: string;
    nameTokens?: string[];
    category?: string;
  };
  updatedAt: number;
  source?: {
    provider: "n8n" | "manual" | "import";
    batchId?: string;
  };
};

export type KbSyncRun = {
  _id?: ObjectId;
  sessionId: string;
  tableKey: string;
  batchId: string;
  receivedAt: number;
  status: "running" | "success" | "error";
  stats: {
    upserted: number;
    deleted: number;
    unchanged: number;
  };
  error?: string;
};

export type KbSyncBatchPks = {
  _id?: ObjectId;
  sessionId: string;
  tableKey: string;
  batchId: string;
  batchIndex: number;
  pks: string[];
  receivedAt: number;
};
