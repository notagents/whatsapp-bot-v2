import { flowConfigSchema, type FlowConfig, type FSMFlowConfig } from "./types";
import { getRegisteredAgentIds } from "@/lib/agents/registry";

export type FlowValidationResult =
  | { valid: true; parsed: FlowConfig }
  | { valid: false; error: string };

function collectAgentIds(config: FlowConfig): string[] {
  const ids: string[] = [];
  if (config.mode === "simple") {
    ids.push(config.agent);
    return ids;
  }
  const states = (config as FSMFlowConfig).states;
  for (const state of Object.values(states)) {
    if (state.agent) ids.push(state.agent);
  }
  return ids;
}

function collectStateNames(config: FSMFlowConfig): Set<string> {
  return new Set(Object.keys(config.states));
}

function collectReferencedStates(config: FSMFlowConfig): Set<string> {
  const refs = new Set<string>();
  refs.add(config.initialState);
  for (const state of Object.values(config.states)) {
    if (state.transitions) {
      for (const t of state.transitions) refs.add(t.next);
    }
    if (state.router) {
      const r = state.router;
      if (r.type === "keyword") {
        for (const route of r.routes) refs.add(route.next);
      } else {
        for (const route of r.routes) refs.add(route.next);
        if (r.defaultRoute) refs.add(r.defaultRoute);
      }
    }
  }
  return refs;
}

export function validateFlow(text: string): FlowValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    return { valid: false, error: message };
  }

  const result = flowConfigSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.length ? first.path.join(".") : "root";
    return {
      valid: false,
      error: `${path}: ${first?.message ?? result.error.message}`,
    };
  }

  const config = result.data;
  const registeredIds = new Set(getRegisteredAgentIds());

  const agentIds = collectAgentIds(config);
  for (const id of agentIds) {
    if (!registeredIds.has(id)) {
      return { valid: false, error: `Unknown agentId: ${id}` };
    }
  }

  if (config.mode === "fsm") {
    const stateNames = collectStateNames(config);
    const referenced = collectReferencedStates(config);
    for (const ref of referenced) {
      if (!stateNames.has(ref)) {
        return {
          valid: false,
          error: `State "${ref}" is referenced but not defined`,
        };
      }
    }
    const routerStates = (config as FSMFlowConfig).states;
    for (const [name, state] of Object.entries(routerStates)) {
      if (state.router?.type === "ai" && state.router.routes.length > 0) {
        const defaultRoute = state.router.defaultRoute;
        if (!defaultRoute) {
          return {
            valid: false,
            error: `State "${name}" (ai router) must define defaultRoute`,
          };
        }
        if (!stateNames.has(defaultRoute)) {
          return {
            valid: false,
            error: `State "${name}" defaultRoute "${defaultRoute}" is not a defined state`,
          };
        }
      }
    }
  }

  return { valid: true, parsed: config };
}
