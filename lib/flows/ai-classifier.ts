import OpenAI from "openai";
import type { Context } from "@/lib/context";
import { formatStructuredContextForPrompt } from "@/lib/context-extractor";
import type { AIRouterConfig } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODELS_SUPPORTING_CUSTOM_TEMPERATURE = new Set(["gpt-4o-mini", "gpt-4o"]);

const CLASSIFICATION_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    selectedRoute: { type: "string" as const },
    reasoning: { type: "string" as const },
    confidence: { type: "number" as const },
  },
  required: ["selectedRoute", "reasoning", "confidence"],
  additionalProperties: false,
};

export type ClassificationResult = {
  selectedRoute: string;
  reasoning: string;
  confidence: number;
};

function parseClassificationContent(
  content: string | null
): ClassificationResult | null {
  if (!content?.trim()) return null;
  try {
    const raw = JSON.parse(content) as unknown;
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).selectedRoute !== "string" ||
      typeof (raw as Record<string, unknown>).reasoning !== "string" ||
      typeof (raw as Record<string, unknown>).confidence !== "number"
    ) {
      return null;
    }
    const r = raw as {
      selectedRoute: string;
      reasoning: string;
      confidence: number;
    };
    return {
      selectedRoute: r.selectedRoute,
      reasoning: r.reasoning,
      confidence: Math.min(1, Math.max(0, r.confidence)),
    };
  } catch {
    return null;
  }
}

export async function classifyWithAI(
  router: AIRouterConfig,
  text: string,
  context: Context,
  currentState: string
): Promise<string> {
  const routeDescriptions = router.routes
    .map((route, idx) => {
      const name = route.name ?? route.next;
      const desc = route.description;
      const examples = route.examples?.length
        ? `\nEjemplos: ${route.examples.join(", ")}`
        : "";
      const keywords = route.keywords?.length
        ? `\nKeywords: ${route.keywords.join(", ")}`
        : "";
      return `${idx + 1}. **${name}** (next: ${route.next})
   ${desc}${examples}${keywords}`;
    })
    .join("\n\n");

  const recentPreview = context.recentMessages
    .slice(-3)
    .map((m) => `[${m.source}] ${m.messageText}`)
    .join(" → ");
  const structuredContextStr = formatStructuredContextForPrompt(
    context.memory.structuredContext
  );

  const systemPrompt = `Eres un clasificador de intenciones para un bot de WhatsApp de grow shop.

Tu tarea: analizar el mensaje del usuario y seleccionar la categoría más apropiada.

## Categorías disponibles:

${routeDescriptions}

## Contexto adicional:
- Datos ya capturados de la conversacion: ${structuredContextStr}
- Mensajes recientes: ${recentPreview || "(ninguno)"}
- Estado actual: ${currentState}

## Reglas:
1. Selecciona SOLO una categoría usando el valor exacto del campo "next"
2. Si ninguna categoría aplica, usa: ${router.defaultRoute ?? "NO_CLARO"}
3. Considera sinonimos, variaciones y contexto conversacional
4. Si los datos capturados muestran que el usuario ya eligio ambiente y tipo de semilla (recomendacion de semillas en curso) y el mensaje es una respuesta corta (presupuesto, espacio, cantidad de plantas), prioriza CAT1_SEMILLAS_FOLLOWUP sobre CAT9_SETUP
5. Prioriza la intencion sobre keywords exactos`;

  const userPrompt = `Mensaje del usuario: "${text}"

Clasifica este mensaje en la categoría correcta. Responde con el valor exacto de "next" de la categoría elegida.`;

  try {
    const completion = await openai.chat.completions.create({
      model: router.model as
        | "gpt-4o-mini"
        | "gpt-4o"
        | "gpt-5-mini"
        | "gpt-5-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "classification",
          strict: true,
          schema: CLASSIFICATION_JSON_SCHEMA,
        },
      },
      ...(MODELS_SUPPORTING_CUSTOM_TEMPERATURE.has(router.model)
        ? { temperature: router.temperature }
        : {}),
    });

    const content = completion.choices[0]?.message?.content ?? null;
    const result = parseClassificationContent(content);
    if (!result) {
      return (
        router.defaultRoute ?? router.routes[router.routes.length - 1]!.next
      );
    }

    const validNext = router.routes.find(
      (r) => r.next === result.selectedRoute
    );
    if (!validNext) {
      console.warn(
        `[AI Classifier] Invalid route selected: ${result.selectedRoute}, using default`
      );
      return (
        router.defaultRoute ?? router.routes[router.routes.length - 1]!.next
      );
    }

    return result.selectedRoute;
  } catch (error) {
    console.error("[AI Classifier] Error during classification:", error);
    return router.defaultRoute ?? router.routes[router.routes.length - 1]!.next;
  }
}

export async function classifyWithAIWithResult(
  router: AIRouterConfig,
  text: string,
  context: Context,
  currentState: string
): Promise<{ nextState: string; result: ClassificationResult | null }> {
  const routeDescriptions = router.routes
    .map((route, idx) => {
      const name = route.name ?? route.next;
      const desc = route.description;
      const examples = route.examples?.length
        ? `\nEjemplos: ${route.examples.join(", ")}`
        : "";
      const keywords = route.keywords?.length
        ? `\nKeywords: ${route.keywords.join(", ")}`
        : "";
      return `${idx + 1}. **${name}** (next: ${route.next})
   ${desc}${examples}${keywords}`;
    })
    .join("\n\n");

  const recentPreview = context.recentMessages
    .slice(-3)
    .map((m) => `[${m.source}] ${m.messageText}`)
    .join(" → ");
  const structuredContextStr = formatStructuredContextForPrompt(
    context.memory.structuredContext
  );

  const systemPrompt = `Eres un clasificador de intenciones para un bot de WhatsApp de grow shop.

Tu tarea: analizar el mensaje del usuario y seleccionar la categoría más apropiada.

## Categorías disponibles:

${routeDescriptions}

## Contexto adicional:
- Datos ya capturados de la conversacion: ${structuredContextStr}
- Mensajes recientes: ${recentPreview || "(ninguno)"}
- Estado actual: ${currentState}

## Reglas:
1. Selecciona SOLO una categoría usando el valor exacto del campo "next"
2. Si ninguna categoría aplica, usa: ${router.defaultRoute ?? "NO_CLARO"}
3. Considera sinonimos, variaciones y contexto conversacional
4. Si los datos capturados muestran que el usuario ya eligio ambiente y tipo de semilla (recomendacion de semillas en curso) y el mensaje es una respuesta corta (presupuesto, espacio, cantidad de plantas), prioriza CAT1_SEMILLAS_FOLLOWUP sobre CAT9_SETUP
5. Prioriza la intencion sobre keywords exactos`;

  const userPrompt = `Mensaje del usuario: "${text}"

Clasifica este mensaje en la categoría correcta. Responde con el valor exacto de "next" de la categoría elegida.`;

  const fallbackNext =
    router.defaultRoute ?? router.routes[router.routes.length - 1]!.next;

  try {
    const completion = await openai.chat.completions.create({
      model: router.model as
        | "gpt-4o-mini"
        | "gpt-4o"
        | "gpt-5-mini"
        | "gpt-5-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "classification",
          strict: true,
          schema: CLASSIFICATION_JSON_SCHEMA,
        },
      },
      ...(MODELS_SUPPORTING_CUSTOM_TEMPERATURE.has(router.model)
        ? { temperature: router.temperature }
        : {}),
    });

    const content = completion.choices[0]?.message?.content ?? null;
    const result = parseClassificationContent(content);
    if (!result) {
      return { nextState: fallbackNext, result: null };
    }

    const validNext = router.routes.find(
      (r) => r.next === result.selectedRoute
    );
    if (!validNext) {
      console.warn(
        `[AI Classifier] Invalid route selected: ${result.selectedRoute}, using default`
      );
      return { nextState: fallbackNext, result: null };
    }

    return {
      nextState: result.selectedRoute,
      result: {
        selectedRoute: result.selectedRoute,
        reasoning: result.reasoning,
        confidence: result.confidence,
      },
    };
  } catch (error) {
    console.error("[AI Classifier] Error during classification:", error);
    return { nextState: fallbackNext, result: null };
  }
}
