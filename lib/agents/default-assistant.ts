import OpenAI from "openai";
import type { Agent, AgentRunParams, AgentRunResult, ToolCall } from "./types";
import { TOOL_DEFINITIONS } from "./tools";
import { formatStructuredContextForPrompt } from "../context-extractor";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `Eres un asistente de WhatsApp amigable y útil.

Contexto actual:
- Conversación con: {userID}
- Datos ya capturados: {structuredContext}
- Hechos conocidos: {facts}
- Resumen reciente: {recap}
{kbSection}

Responde de forma natural, concisa y en español.`;

function buildSystemPrompt(
  context: AgentRunParams["context"],
  template: string
): string {
  const factsStr =
    context.memory.facts.length > 0
      ? context.memory.facts.map((f) => `${f.key}: ${f.value}`).join("; ")
      : "ninguno";
  const recapStr = context.memory.recap?.text ?? "";
  const structuredContextStr = formatStructuredContextForPrompt(
    context.memory.structuredContext
  );
  const kbSection =
    context.kbChunks && context.kbChunks.length > 0
      ? "- Documentación relevante:\n" +
        context.kbChunks.map((c) => `[${c.source}]\n${c.text}`).join("\n\n")
      : "";
  return template
    .replace("{userID}", context.memory.userID)
    .replace("{facts}", factsStr)
    .replace("{recap}", recapStr)
    .replace("{structuredContext}", structuredContextStr)
    .replace("{kbSection}", kbSection ? kbSection + "\n" : "");
}

function buildMessages(
  turn: AgentRunParams["turn"],
  context: AgentRunParams["context"]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  const recent = context.recentMessages.slice(-10);
  for (const m of recent) {
    if (m.source === "user") {
      messages.push({ role: "user", content: m.messageText });
    } else {
      messages.push({ role: "assistant", content: m.messageText });
    }
  }
  messages.push({ role: "user", content: turn.text });
  return messages;
}

export type CreateAssistantAgentConfig = {
  id: string;
  version: string;
  systemPromptTemplate: string;
};

export function createAssistantAgent(
  config: CreateAssistantAgentConfig
): Agent {
  const { id, version, systemPromptTemplate } = config;
  return {
    id,
    version,
    systemPrompt: systemPromptTemplate,
    async run(params): Promise<AgentRunResult> {
      const { turn, context, tools, agentConfig } = params;
      const template =
        agentConfig?.systemPromptTemplate ?? systemPromptTemplate;
      const model = agentConfig?.model ?? "gpt-5-mini";
      const temperature = agentConfig?.temperature ?? 0.7;
      const maxRounds = agentConfig?.maxToolRounds ?? 5;
      const systemContent = buildSystemPrompt(context, template);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemContent },
        ...buildMessages(turn, context),
      ];
      const toolCalls: ToolCall[] = [];
      let assistantText = "";
      let currentMessages = [...messages];
      let round = 0;

      while (round < maxRounds) {
        const toolDefs = tools.definitions ?? TOOL_DEFINITIONS;
        const completion = await openai.chat.completions.create({
          model,
          messages: currentMessages,
          tools: toolDefs,
          temperature,
        });
        const choice = completion.choices[0];
        if (!choice?.message) {
          break;
        }
        const content = choice.message.content;
        if (typeof content === "string" && content.trim()) {
          assistantText = content.trim();
        }
        const toolCallsFromApi = choice.message.tool_calls;
        if (toolCallsFromApi && toolCallsFromApi.length > 0) {
          currentMessages.push(choice.message);
          for (const tc of toolCallsFromApi) {
            const name = tc.function.name;
            const args = JSON.parse(tc.function.arguments || "{}");
            const result = await tools.execute(name, args);
            toolCalls.push({ name, args, result });
            currentMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
          }
          round++;
          continue;
        }
        break;
      }

      if (!assistantText && toolCalls.length > 0) {
        assistantText = "Listo.";
      }

      const mdChunks: Array<{ docId?: string; chunkId: string; slug: string }> =
        [];
      const tableRows: Array<{ tableKey: string; pk: string }> = [];
      for (const tc of toolCalls) {
        const args = tc.args as Record<string, unknown>;
        const result = tc.result as Record<string, unknown> | undefined;
        if (
          tc.name === "kb_md_search" &&
          result?.results &&
          Array.isArray(result.results)
        ) {
          for (const r of result.results as Array<{
            chunkId?: string;
            slug?: string;
          }>) {
            if (r?.chunkId && r?.slug) {
              mdChunks.push({ chunkId: r.chunkId, slug: r.slug });
            }
          }
        }
        if (tc.name === "kb_md_get" && typeof args?.slug === "string") {
          mdChunks.push({ chunkId: "", slug: args.slug });
        }
        if (tc.name === "kb_table_get" && typeof args?.pk === "string") {
          const tk =
            typeof args?.tableKey === "string" ? args.tableKey : "products";
          tableRows.push({ tableKey: tk, pk: args.pk });
        }
        if (
          (tc.name === "kb_table_lookup" || tc.name === "kb_table_query") &&
          result?.results &&
          Array.isArray(result.results)
        ) {
          const tk =
            typeof args?.tableKey === "string" ? args.tableKey : "products";
          for (const r of result.results as Array<{ pk?: string }>) {
            if (r?.pk) tableRows.push({ tableKey: tk, pk: String(r.pk) });
          }
        }
      }
      const kbUsage =
        mdChunks.length > 0 || tableRows.length > 0
          ? {
              mdChunks: mdChunks.length > 0 ? mdChunks : undefined,
              tableRows: tableRows.length > 0 ? tableRows : undefined,
            }
          : undefined;

      return {
        assistantText: assistantText || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        kbUsage,
      };
    },
  };
}

export const defaultAssistant = createAssistantAgent({
  id: "default_assistant",
  version: "1.0",
  systemPromptTemplate: DEFAULT_SYSTEM_PROMPT_TEMPLATE,
});
