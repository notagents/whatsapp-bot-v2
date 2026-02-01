import { z } from "zod";

const kbConfigSchema = z.object({
  enabled: z.boolean().default(false),
  topK: z.number().int().min(1).max(50).default(4),
});

const kbMdConfigSchema = z.object({
  enabled: z.boolean().default(false),
  slugs: z.array(z.string()).optional(),
  topK: z.number().int().min(1).max(50).default(4),
});

const kbTablesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  tableKeys: z.array(z.string()).default(["products"]),
});

const kbV2ConfigSchema = z.object({
  md: kbMdConfigSchema.optional(),
  tables: kbTablesConfigSchema.optional(),
});

const humanModeSchema = z.object({
  respectCooldown: z.boolean().default(true),
});

const simpleFlowSchema = z.object({
  mode: z.literal("simple"),
  agent: z.string().default("default_assistant"),
  kb: kbConfigSchema.optional().default({ enabled: false, topK: 4 }),
  kbV2: kbV2ConfigSchema.optional(),
  humanMode: humanModeSchema.optional().default({ respectCooldown: true }),
});

const transitionMatchSchema = z.union([
  z.object({ any: z.literal(true) }),
  z.object({ keyword: z.string() }),
  z.object({ default: z.literal(true) }),
]);

const transitionSchema = z.object({
  match: transitionMatchSchema,
  next: z.string(),
});

const keywordRouteSchema = z.object({
  keyword: z.string().optional(),
  default: z.literal(true).optional(),
  next: z.string(),
});

const aiRouteSchema = z.object({
  next: z.string(),
  name: z.string().optional(),
  description: z.string(),
  examples: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

const keywordRouterSchema = z.object({
  type: z.literal("keyword"),
  routes: z.array(keywordRouteSchema),
});

const aiRouterSchema = z.object({
  type: z.literal("ai"),
  model: z.enum(["gpt-4o-mini", "gpt-4o"]).default("gpt-4o-mini"),
  temperature: z.number().min(0).max(1).default(0.3),
  routes: z.array(aiRouteSchema),
  defaultRoute: z.string().optional(),
});

const routerSchema = z.discriminatedUnion("type", [
  keywordRouterSchema,
  aiRouterSchema,
]);

const fsmStateSchema = z.object({
  reply: z.string().optional(),
  agent: z.string().optional(),
  kb: kbConfigSchema.optional(),
  kbV2: kbV2ConfigSchema.optional(),
  router: routerSchema.optional(),
  transitions: z.array(transitionSchema).optional(),
  end: z.boolean().optional(),
});

const fsmFlowSchema = z.object({
  mode: z.literal("fsm"),
  initialState: z.string(),
  states: z.record(z.string(), fsmStateSchema),
  humanMode: humanModeSchema.optional().default({ respectCooldown: true }),
});

export const flowConfigSchema = z.discriminatedUnion("mode", [
  simpleFlowSchema,
  fsmFlowSchema,
]);

export type KBConfig = z.infer<typeof kbConfigSchema>;
export type KbMdConfig = z.infer<typeof kbMdConfigSchema>;
export type KbTablesConfig = z.infer<typeof kbTablesConfigSchema>;
export type KbV2Config = z.infer<typeof kbV2ConfigSchema>;
export type HumanModeConfig = z.infer<typeof humanModeSchema>;
export type SimpleFlowConfig = z.infer<typeof simpleFlowSchema>;
export type TransitionMatch = z.infer<typeof transitionMatchSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type KeywordRoute = z.infer<typeof keywordRouteSchema>;
export type AIRoute = z.infer<typeof aiRouteSchema>;
export type KeywordRouterConfig = z.infer<typeof keywordRouterSchema>;
export type AIRouterConfig = z.infer<typeof aiRouterSchema>;
export type FSMRouterConfig = z.infer<typeof routerSchema>;
export type FSMStateConfig = z.infer<typeof fsmStateSchema>;
export type FSMFlowConfig = z.infer<typeof fsmFlowSchema>;
export type FlowConfig = z.infer<typeof flowConfigSchema>;

export type ResolvedFlow = {
  config: FlowConfig;
  flowPath: string;
};
