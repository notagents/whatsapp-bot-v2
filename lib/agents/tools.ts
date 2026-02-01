import OpenAI from "openai";
import { getDb, MESSAGES_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";
import { getActualJid } from "@/lib/conversation";
import { sendWhatsAppMessage } from "@/lib/send-whatsapp";
import { updateResponsesEnabled } from "@/lib/conversation-state";
import { KB_MD_TOOLS, executeKbMdTool } from "@/lib/kb-v2/md/tools";
import { KB_TABLE_TOOLS, executeKbTableTool } from "@/lib/kb-v2/tables/tools";
import type { ToolSet } from "./types";

const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Enviar mensaje adicional a WhatsApp",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_responses_enabled",
      description: "Activar o desactivar respuestas automáticas del bot",
      parameters: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          disabledUntilUTC: {
            type: "string",
            description: "ISO date string for cooldown end",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_messages",
      description: "Obtener los últimos mensajes de la conversación",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_fetch",
      description: "Realizar una petición HTTP (solo URLs permitidas)",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string" },
          body: { type: "string" },
        },
        required: ["url"],
      },
    },
  },
];

export { TOOL_DEFINITIONS };

export type KbToolConfig = { md?: boolean; tables?: boolean };

export function createToolSet(
  whatsappId: string,
  sessionId: string,
  kbConfig?: KbToolConfig
): ToolSet {
  const definitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    ...TOOL_DEFINITIONS,
  ];
  if (kbConfig?.md) definitions.push(...KB_MD_TOOLS);
  if (kbConfig?.tables) definitions.push(...KB_TABLE_TOOLS);

  return {
    definitions,
    async execute(name: string, args: unknown): Promise<unknown> {
      const a = args as Record<string, unknown>;
      if (name.startsWith("kb_md_")) {
        return executeKbMdTool(name, args, sessionId);
      }
      if (name.startsWith("kb_table_")) {
        return executeKbTableTool(name, args, sessionId);
      }
      switch (name) {
        case "send_message":
          return sendWhatsAppMessage({
            sessionId,
            jid: getActualJid(whatsappId),
            text: String(a?.text ?? ""),
            whatsappId,
          });
        case "set_responses_enabled":
          return updateResponsesEnabled(whatsappId, {
            enabled: a?.enabled as boolean | undefined,
            disabledUntilUTC: a?.disabledUntilUTC as string | undefined,
          });
        case "get_recent_messages": {
          const db = await getDb();
          const limit =
            typeof a?.limit === "number" ? Math.min(a.limit, 50) : 10;
          const messages = await db
            .collection<Message>(MESSAGES_COLLECTION)
            .find({ whatsappId })
            .sort({ messageTime: -1 })
            .limit(limit)
            .toArray();
          return messages.map((m) => ({
            role: m.source,
            text: m.messageText,
            time: m.messageTime,
          }));
        }
        case "http_fetch": {
          const url = String(a?.url ?? "");
          if (
            !url.startsWith("https://") &&
            !url.startsWith("http://localhost")
          ) {
            return { error: true, message: "URL not allowed" };
          }
          try {
            const res = await fetch(url, {
              method: (a?.method as string) || "GET",
              body: a?.body ? String(a.body) : undefined,
              signal: AbortSignal.timeout(15000),
            });
            const text = await res.text();
            return { status: res.status, body: text };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { error: true, message: `fetch failed: ${message}` };
          }
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}
