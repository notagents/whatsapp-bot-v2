import type { FSMFlowConfig } from "./flows/types";

export type ContextField = {
  key: string;
  type: "string" | "number" | "boolean" | "enum";
  enumValues?: string[];
  description: string;
  optional?: boolean;
};

export type ContextSchema = {
  sessionId: string;
  domainDescription: string;
  fields: ContextField[];
  derivedFrom: "fsm" | "manual" | "hybrid";
  version: number;
  updatedAt: number;
};

const DEFAULT_DOMAIN_DESCRIPTION =
  "Tienda de cultivo de cannabis. Vendemos semillas (automaticas y fotoperiodicas), sustratos, fertilizantes, iluminacion LED, carpas, extractores y accesorios de cultivo.";

const FSM_FIELD_MAP: Array<{
  pattern: RegExp | string;
  fields: ContextField[];
}> = [
  {
    pattern: /^CAT1_SEMILLAS/,
    fields: [
      {
        key: "environment",
        type: "enum",
        enumValues: ["interior", "exterior"],
        description: "Ambiente donde el usuario va a cultivar",
      },
      {
        key: "seedType",
        type: "enum",
        enumValues: ["automatica", "fotoperiodica"],
        description:
          "Tipo de semilla elegida. IMPORTANTE: automaticas son semillas autoflorecientes, NO tienen relacion con automoviles",
      },
      {
        key: "budget",
        type: "number",
        description: "Presupuesto del usuario en pesos argentinos",
      },
    ],
  },
  {
    pattern: /^CAT1_SEMILLAS_FOLLOWUP/,
    fields: [
      {
        key: "space",
        type: "string",
        description:
          "Espacio fisico disponible (placard, habitacion, balcon, carpa, etc)",
      },
      {
        key: "plantCount",
        type: "number",
        description: "Cantidad de plantas que quiere cultivar",
      },
      {
        key: "hasEquipment",
        type: "boolean",
        description: "Si el usuario ya tiene equipo comprado o arranca de cero",
      },
    ],
  },
  {
    pattern: /^CAT9_SETUP/,
    fields: [
      {
        key: "space",
        type: "string",
        description: "Espacio de cultivo (placard, habitacion, balcon, etc)",
      },
      {
        key: "plantCount",
        type: "number",
        description: "Cantidad de plantas para empezar",
      },
      {
        key: "hasEquipment",
        type: "boolean",
        description: "Si tiene algo comprado o arranca de cero",
      },
    ],
  },
  {
    pattern: /^CAT2_SUSTRATOS/,
    fields: [
      {
        key: "substratePreference",
        type: "string",
        description:
          "Preferencia de sustrato (completo, fertilizantes, growmix, liviano)",
      },
    ],
  },
  {
    pattern: /^CAT3_FERTILIZANTES/,
    fields: [
      {
        key: "cultivationPhase",
        type: "enum",
        enumValues: ["vegetativo", "floracion", "ambos"],
        description: "Fase de cultivo (vege o flora)",
      },
    ],
  },
  {
    pattern: /^CAT4_ILUMINACION/,
    fields: [
      {
        key: "spaceSize",
        type: "string",
        description: "Tamano del espacio (60x60, 80x80, 100x100, etc)",
      },
      {
        key: "plantCount",
        type: "number",
        description: "Cantidad de plantas para iluminacion",
      },
    ],
  },
];

function routeNextMatches(next: string, pattern: RegExp | string): boolean {
  if (typeof pattern === "string") {
    return next === pattern || next.startsWith(pattern);
  }
  return pattern.test(next);
}

function deduplicateFields(fields: ContextField[]): ContextField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });
}

function analyzeRouterStates(flowConfig: FSMFlowConfig): ContextField[] {
  const fields: ContextField[] = [];
  const routerState = flowConfig.states["ROUTER"];
  if (!routerState?.router) return fields;

  const router = routerState.router;
  const routes =
    router.type === "ai"
      ? router.routes
      : router.type === "keyword"
      ? router.routes
      : [];

  for (const route of routes) {
    const next = "next" in route ? route.next : "";
    if (!next) continue;

    for (const { pattern, fields: mappedFields } of FSM_FIELD_MAP) {
      if (routeNextMatches(next, pattern)) {
        for (const f of mappedFields) {
          fields.push({ ...f });
        }
        break;
      }
    }
  }

  return deduplicateFields(fields);
}

export function deriveSchemaFromFSM(
  sessionId: string,
  flowConfig: FSMFlowConfig
): ContextSchema {
  const fields = analyzeRouterStates(flowConfig);
  const now = Date.now();
  return {
    sessionId,
    domainDescription: DEFAULT_DOMAIN_DESCRIPTION,
    fields: fields.length > 0 ? fields : getDefaultAstroFields(),
    derivedFrom: "fsm",
    version: 1,
    updatedAt: now,
  };
}

function getDefaultAstroFields(): ContextField[] {
  return [
    {
      key: "environment",
      type: "enum",
      enumValues: ["interior", "exterior"],
      description: "Ambiente donde el usuario va a cultivar",
    },
    {
      key: "seedType",
      type: "enum",
      enumValues: ["automatica", "fotoperiodica"],
      description:
        "Tipo de semilla. automaticas = autoflorecientes, NO automoviles",
    },
    {
      key: "budget",
      type: "number",
      description: "Presupuesto en pesos",
    },
    {
      key: "space",
      type: "string",
      description: "Espacio (placard, habitacion, balcon)",
    },
    {
      key: "plantCount",
      type: "number",
      description: "Cantidad de plantas",
    },
    {
      key: "hasEquipment",
      type: "boolean",
      description: "Si tiene equipo o arranca de cero",
    },
  ];
}

export function buildExtractionPrompt(
  schema: ContextSchema,
  conversation: string
): string {
  const fieldsDesc = schema.fields
    .map((f) => {
      const typeStr =
        f.type === "enum" && f.enumValues?.length
          ? `"${f.enumValues.join('" | "')}"`
          : f.type;
      return `- ${f.key}: ${typeStr} - ${f.description}`;
    })
    .join("\n");

  return `Analiza esta conversacion de WhatsApp.
Contexto del negocio: ${schema.domainDescription}

Extrae SOLO informacion que el USUARIO haya dicho explicitamente.
Responde con JSON valido usando estas claves (null si no aplica):

${fieldsDesc}

IMPORTANTE: NO confundas terminos del dominio con otros significados.
Por ejemplo, "automaticas" se refiere a semillas autoflorecientes, NO automoviles.

Conversacion:
${conversation}`;
}

export function parseBySchema(
  raw: string,
  schema: ContextSchema
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const field of schema.fields) {
      const val = parsed[field.key];
      if (val === undefined || val === null) continue;
      if (field.type === "enum" && field.enumValues?.length) {
        if (typeof val === "string" && field.enumValues.includes(val)) {
          out[field.key] = val;
        }
        continue;
      }
      if (field.type === "number" && typeof val === "number") {
        out[field.key] = val;
        continue;
      }
      if (field.type === "boolean" && typeof val === "boolean") {
        out[field.key] = val;
        continue;
      }
      if (field.type === "string" && typeof val === "string") {
        out[field.key] = val.trim();
      }
    }
  } catch {
    // ignore parse errors
  }
  return out;
}
