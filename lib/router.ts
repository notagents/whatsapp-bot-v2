import OpenAI from "openai";
import type { Context } from "./context";
import type { TurnRouter } from "./models";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ROUTER_SYSTEM_PROMPT = `Eres un clasificador de intenciones. Dado un mensaje de usuario, selecciona el agente apropiado.

Agentes disponibles:
- default_assistant: conversación general, preguntas, ayuda
- support_ops: comandos internos (pausar/reanudar respuestas automáticas)
- handoff_human: cuando el usuario quiere hablar con una persona

Responde SOLO con JSON válido:
{
  "agentId": "default_assistant",
  "reason": "general conversation",
  "confidence": 0.85
}`;

function rulesBasedRouter(text: string, _context: Context): TurnRouter | null {
  const lower = text.toLowerCase().trim();
  if (
    lower.includes("pausar bot") ||
    lower.includes("stop auto") ||
    lower.includes("desactivar respuestas")
  ) {
    return { agentId: "support_ops", reason: "admin_command", confidence: 1 };
  }
  if (
    lower.includes("hablar con persona") ||
    lower.includes("agente humano") ||
    lower.includes("persona real") ||
    lower.includes("operador")
  ) {
    return {
      agentId: "handoff_human",
      reason: "explicit_handoff",
      confidence: 1,
    };
  }
  return null;
}

async function llmRouter(text: string, _context: Context): Promise<TurnRouter> {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return { agentId: "default_assistant", reason: "fallback", confidence: 0 };
  }
  try {
    const parsed = JSON.parse(content) as {
      agentId?: string;
      reason?: string;
      confidence?: number;
    };
    return {
      agentId: parsed.agentId ?? "default_assistant",
      reason: parsed.reason ?? "llm_router",
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
    };
  } catch {
    return {
      agentId: "default_assistant",
      reason: "parse_fallback",
      confidence: 0,
    };
  }
}

export async function routeToAgent(
  text: string,
  context: Context
): Promise<TurnRouter> {
  const rulesResult = rulesBasedRouter(text, context);
  if (rulesResult) return rulesResult;
  return llmRouter(text, context);
}
