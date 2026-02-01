import type { ObjectId } from "mongodb";
import type { Turn } from "@/lib/models";
import type { Context } from "@/lib/context";
import type { AgentContext } from "@/lib/agents/types";
import type { AgentRun } from "@/lib/models";
import type { ResolvedFlow, SimpleFlowConfig } from "./types";
import { resolveFlow } from "./registry";
import { loadKB } from "@/lib/kb/loader";
import { retrieveChunks } from "@/lib/kb/retriever";
import { getAgent, executeAgentRun } from "@/lib/agents/runner";

export type FlowMeta = {
  mode: "simple" | "fsm";
  flowPath: string;
  state?: string;
  kbUsed?: boolean;
  kbChunks?: number;
};

export type FlowResult = {
  assistantText?: string;
  meta: FlowMeta;
  agentRun?: AgentRun;
};

export type ExecuteFlowParams = {
  sessionId: string;
  turn: Turn;
  context: Context;
  resolvedFlow?: ResolvedFlow;
};

export async function executeFlow(params: ExecuteFlowParams): Promise<FlowResult> {
  const { sessionId, turn, context, resolvedFlow: provided } = params;
  const resolved = provided ?? (await resolveFlow(sessionId));
  const { config, flowPath } = resolved;

  if (config.mode === "simple") {
    return executeSimpleFlow(turn, context, config, flowPath);
  }

  return executeFSMFlow(params, resolved);
}

async function executeSimpleFlow(
  turn: Turn,
  context: Context,
  config: SimpleFlowConfig,
  flowPath: string
): Promise<FlowResult> {
  let kbUsed = false;
  let kbChunksCount = 0;

  const contextWithKb: AgentContext = { ...context };
  if (config.kb?.enabled) {
    try {
      const chunks = await loadKB(turn.sessionId);
      const topK = config.kb.topK ?? 4;
      const retrieved = retrieveChunks(turn.text, chunks, topK);
      if (retrieved.length > 0) {
        contextWithKb.kbChunks = retrieved.map((c) => ({ text: c.text, source: c.source }));
        kbUsed = true;
        kbChunksCount = retrieved.length;
      }
    } catch (err) {
      console.warn("[flow-runtime] KB load/retrieve failed, continuing without KB:", err);
    }
  }

  const agent = getAgent(config.agent);
  const agentRun = await executeAgentRun({
    turnId: turn._id!,
    agentId: config.agent,
    turn,
    context: contextWithKb,
    agent,
  });

  const meta: FlowMeta = {
    mode: "simple",
    flowPath,
    kbUsed,
    kbChunks: kbChunksCount > 0 ? kbChunksCount : undefined,
  };

  return {
    assistantText: agentRun.output?.assistantText,
    meta,
    agentRun,
  };
}

const FSM_MAX_DEPTH = 10;

async function executeFSMFlow(
  params: ExecuteFlowParams,
  resolved: ResolvedFlow,
  depth = 0,
  turnEntryState?: string
): Promise<FlowResult> {
  const { getConversationState, setConversationState } = await import("@/lib/conversation-state");
  const { config, flowPath } = resolved;
  if (config.mode !== "fsm") {
    const simpleConfig: SimpleFlowConfig = {
      mode: "simple",
      agent: "default_assistant",
      kb: { enabled: false, topK: 4 },
      humanMode: { respectCooldown: true },
    };
    return executeSimpleFlow(params.turn, params.context, simpleConfig, flowPath);
  }

  if (depth >= FSM_MAX_DEPTH) {
    const meta: FlowMeta = { mode: "fsm", flowPath };
    return { meta };
  }

  const stateDoc = await getConversationState(params.turn.whatsappId);
  const currentStateName =
    (stateDoc?.state?.fsmState as string) ?? config.initialState;
  const entryState = turnEntryState ?? currentStateName;
  const states = config.states;
  const stateConfig = states[currentStateName];

  if (!stateConfig) {
    await setConversationState(params.turn.whatsappId, {
      ...(stateDoc?.state as Record<string, unknown>),
      fsmState: config.initialState,
    });
    return executeFSMFlow(params, resolved, depth + 1, entryState);
  }

  if (stateConfig.reply) {
    const nextState = resolveTransition(stateConfig, params.turn.text);
    const effectiveNext = nextState ?? currentStateName;
    await setConversationState(params.turn.whatsappId, {
      ...(stateDoc?.state as Record<string, unknown>),
      fsmState: effectiveNext,
    });
    if (effectiveNext !== currentStateName) {
      return executeFSMFlow(params, resolved, depth + 1, entryState);
    }
    const meta: FlowMeta = {
      mode: "fsm",
      flowPath,
      state: currentStateName,
    };
    return {
      assistantText: stateConfig.reply,
      meta,
    };
  }

  if (stateConfig.end) {
    const meta: FlowMeta = { mode: "fsm", flowPath, state: currentStateName };
    return { meta };
  }

  if (stateConfig.router) {
    let nextStateName = resolveKeywordRouter(stateConfig.router, params.turn.text) ?? config.initialState;
    const nextStateConfig = states[nextStateName];
    if (
      nextStateConfig?.reply &&
      nextStateName === entryState
    ) {
      const defaultRoute = stateConfig.router.routes.find((r) => r.default === true);
      if (defaultRoute) {
        nextStateName = defaultRoute.next;
      }
    }
    await setConversationState(params.turn.whatsappId, {
      ...(stateDoc?.state as Record<string, unknown>),
      fsmState: nextStateName,
    });
    const resolvedNextConfig = states[nextStateName];
    if (resolvedNextConfig?.reply) {
      const meta: FlowMeta = { mode: "fsm", flowPath, state: nextStateName };
      return { assistantText: resolvedNextConfig.reply, meta };
    }
    if (resolvedNextConfig?.end) {
      const meta: FlowMeta = { mode: "fsm", flowPath, state: nextStateName };
      return { meta };
    }
    if (resolvedNextConfig?.agent) {
      const agent = getAgent(resolvedNextConfig.agent);
      const contextWithKb: AgentContext = { ...params.context };
      if (resolvedNextConfig.kb?.enabled) {
        try {
          const chunks = await loadKB(params.turn.sessionId);
          const retrieved = retrieveChunks(
            params.turn.text,
            chunks,
            resolvedNextConfig.kb.topK ?? 4
          );
          if (retrieved.length > 0) {
            contextWithKb.kbChunks = retrieved.map((c) => ({ text: c.text, source: c.source }));
          }
        } catch {
          // continue without KB
        }
      }
      const agentRun = await executeAgentRun({
        turnId: params.turn._id!,
        agentId: resolvedNextConfig.agent,
        turn: params.turn,
        context: contextWithKb,
        agent,
      });
      const transitionNext = resolvedNextConfig.transitions
        ? resolveTransition(resolvedNextConfig, params.turn.text)
        : nextStateName;
      await setConversationState(params.turn.whatsappId, {
        ...(stateDoc?.state as Record<string, unknown>),
        fsmState: transitionNext ?? nextStateName,
      });
      const meta: FlowMeta = {
        mode: "fsm",
        flowPath,
        state: nextStateName,
        kbUsed: (resolvedNextConfig.kb?.enabled ?? false) && (contextWithKb.kbChunks?.length ?? 0) > 0,
        kbChunks: contextWithKb.kbChunks?.length,
      };
      return {
        assistantText: agentRun.output?.assistantText,
        meta,
        agentRun,
      };
    }
  }

  if (stateConfig.agent) {
    const contextWithKb: AgentContext = { ...params.context };
    if (stateConfig.kb?.enabled) {
      try {
        const chunks = await loadKB(params.turn.sessionId);
        const retrieved = retrieveChunks(
          params.turn.text,
          chunks,
          stateConfig.kb.topK ?? 4
        );
        if (retrieved.length > 0) {
          contextWithKb.kbChunks = retrieved.map((c) => ({ text: c.text, source: c.source }));
        }
      } catch {
        // continue without KB
      }
    }
    const agent = getAgent(stateConfig.agent);
    const agentRun = await executeAgentRun({
      turnId: params.turn._id!,
      agentId: stateConfig.agent,
      turn: params.turn,
      context: contextWithKb,
      agent,
    });
    const nextState = stateConfig.transitions
      ? resolveTransition(stateConfig, params.turn.text)
      : currentStateName;
    await setConversationState(params.turn.whatsappId, {
      ...(stateDoc?.state as Record<string, unknown>),
      fsmState: nextState ?? currentStateName,
    });
    const meta: FlowMeta = {
      mode: "fsm",
      flowPath,
      state: currentStateName,
      kbUsed: (stateConfig.kb?.enabled ?? false) && (contextWithKb.kbChunks?.length ?? 0) > 0,
      kbChunks: contextWithKb.kbChunks?.length,
    };
    return {
      assistantText: agentRun.output?.assistantText,
      meta,
      agentRun,
    };
  }

  const meta: FlowMeta = { mode: "fsm", flowPath, state: currentStateName };
  return { meta };
}

function resolveTransition(
  stateConfig: { transitions?: Array<{ match: unknown; next: string }> },
  text: string
): string | null {
  const transitions = stateConfig.transitions;
  if (!transitions?.length) return null;
  const lower = text.toLowerCase().trim();
  for (const t of transitions) {
    const m = t.match as Record<string, unknown>;
    if (m?.any === true) return t.next;
    if (typeof m?.keyword === "string" && lower.includes((m.keyword as string).toLowerCase()))
      return t.next;
  }
  const defaultTransition = transitions.find((t) => (t.match as Record<string, unknown>)?.default === true);
  return defaultTransition?.next ?? null;
}

function resolveKeywordRouter(
  router: { routes: Array<{ keyword?: string; default?: boolean; next: string }> },
  text: string
): string | null {
  const lower = text.toLowerCase().trim();
  for (const route of router.routes) {
    if (route.default === true) continue;
    if (typeof route.keyword === "string" && lower.includes(route.keyword.toLowerCase()))
      return route.next;
  }
  const defaultRoute = router.routes.find((r) => r.default === true);
  return defaultRoute?.next ?? null;
}
