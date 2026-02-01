import "dotenv/config";
import { resolveFlow } from "../lib/flows/registry";
import { classifyWithAI } from "../lib/flows/ai-classifier";
import type { Context } from "../lib/context";
import type { AIRouterConfig } from "../lib/flows/types";

const SESSION_ID = "6801d871-3ad0-46cf-95ea-d4e88a952e90";
const CURRENT_STATE = "ROUTER";

const testCases: Array<{ input: string; expected: string }> = [
  { input: "hola que tal", expected: "SALUDO_HOLA" },
  { input: "hola cami", expected: "SALUDO_HOLA_CAMI" },
  { input: "buenos días", expected: "SALUDO_HOLA" },
  { input: "necesito semillas feminizadas", expected: "CAT1_SEMILLAS_P1" },
  { input: "que geneticas tienen?", expected: "CAT1_SEMILLAS_P1" },
  { input: "donde estan ubicados?", expected: "INFO_KB" },
  { input: "que horario tienen?", expected: "INFO_KB" },
  { input: "hacen envios a capital?", expected: "INFO_KB" },
  { input: "quiero algo para araña roja", expected: "CAT7_PLAGAS" },
  { input: "tengo trips en las plantas", expected: "CAT7_PLAGAS" },
  {
    input: "que sustrato me recomendas para coco?",
    expected: "CAT2_SUSTRATOS",
  },
  { input: "led para indoor 80x80", expected: "CAT4_ILUMINACION" },
  { input: "carpa de 1m", expected: "CAT5_CARPAS" },
  { input: "quiero empezar a cultivar", expected: "CAT9_SETUP" },
  { input: "mi planta tiene hojas amarillas", expected: "CAT11_ASESORAMIENTO" },
  { input: "vaporizador portatil", expected: "CAT12_VAPOS" },
  { input: "donde queda el local?", expected: "INFO_KB" },
  { input: "formas de pago?", expected: "INFO_KB" },
  { input: "tengo un pedido pendiente", expected: "ESCALATE" },
  { input: "necesito factura A", expected: "ESCALATE" },
  { input: "que bondi me deja?", expected: "OFFTOPIC" },
  { input: "que tal el clima hoy", expected: "OFFTOPIC" },
  { input: "xyz abc nada que ver", expected: "NO_CLARO" },
];

function buildMinimalContext(): Context {
  return {
    recentMessages: [],
    memory: {
      whatsappId: "",
      userID: "",
      facts: [],
      recap: { text: "", updatedAt: 0 },
    },
    state: {},
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const resolved = await resolveFlow(SESSION_ID);
  if (resolved.config.mode !== "fsm") {
    console.error("Flow is not FSM mode");
    process.exit(1);
  }

  const routerState = resolved.config.states["ROUTER"];
  if (!routerState?.router || routerState.router.type !== "ai") {
    console.error("ROUTER state does not have AI router");
    process.exit(1);
  }

  const router = routerState.router as AIRouterConfig;
  const context = buildMinimalContext();
  let passed = 0;
  let failed = 0;

  console.log("Running classifier test cases...\n");

  for (const { input, expected } of testCases) {
    const result = await classifyWithAI(router, input, context, CURRENT_STATE);
    const ok = result === expected;
    if (ok) passed++;
    else failed++;
    const symbol = ok ? "✓" : "✗";
    console.log(
      `${symbol} "${input.slice(0, 50)}${input.length > 50 ? "…" : ""}"`
    );
    if (!ok) {
      console.log(`  expected: ${expected}, got: ${result}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
