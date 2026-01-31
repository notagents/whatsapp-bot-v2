import { z } from "zod";

const kbConfigSchema = z.object({
  enabled: z.boolean().default(false),
  topK: z.number().int().min(1).max(50).default(4),
});

const humanModeSchema = z.object({
  respectCooldown: z.boolean().default(true),
});

const simpleFlowSchema = z.object({
  mode: z.literal("simple"),
  agent: z.string().default("default_assistant"),
  kb: kbConfigSchema.optional().default({ enabled: false, topK: 4 }),
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

const routerSchema = z.object({
  type: z.literal("keyword"),
  routes: z.array(keywordRouteSchema),
});

const fsmStateSchema = z.object({
  reply: z.string().optional(),
  agent: z.string().optional(),
  kb: kbConfigSchema.optional(),
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
export type HumanModeConfig = z.infer<typeof humanModeSchema>;
export type SimpleFlowConfig = z.infer<typeof simpleFlowSchema>;
export type TransitionMatch = z.infer<typeof transitionMatchSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type KeywordRoute = z.infer<typeof keywordRouteSchema>;
export type FSMRouterConfig = z.infer<typeof routerSchema>;
export type FSMStateConfig = z.infer<typeof fsmStateSchema>;
export type FSMFlowConfig = z.infer<typeof fsmFlowSchema>;
export type FlowConfig = z.infer<typeof flowConfigSchema>;

export type ResolvedFlow = {
  config: FlowConfig;
  flowPath: string;
};
