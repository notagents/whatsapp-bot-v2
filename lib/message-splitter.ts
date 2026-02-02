export type SplitResult = {
  parts: Array<{ text: string }>;
  splitter: { type: "heuristic" | "llm"; version: string };
  notes?: string;
};

export type SplitConfig = {
  maxParts: number;
  minPartChars: number;
  maxPartChars: number;
  useLLM: boolean;
};

const HEURISTIC_VERSION = "1.0.0";
const LLM_VERSION = "1.0.0";

export async function splitMessage(
  text: string,
  config: SplitConfig
): Promise<SplitResult> {
  if (text.length <= config.maxPartChars) {
    return {
      parts: [{ text }],
      splitter: { type: "heuristic", version: HEURISTIC_VERSION },
    };
  }

  if (config.useLLM) {
    try {
      const llmResult = await splitWithLLM(text, config);
      if (validateSplitResult(llmResult, text, config)) {
        return {
          ...llmResult,
          splitter: { type: "llm", version: LLM_VERSION },
        };
      }
      console.warn("[splitter] LLM result invalid, falling back to heuristic");
    } catch (err) {
      console.warn("[splitter] LLM failed, falling back to heuristic:", err);
    }
  }

  return {
    ...splitWithHeuristic(text, config),
    splitter: { type: "heuristic", version: HEURISTIC_VERSION },
  };
}

function splitWithHeuristic(
  text: string,
  config: SplitConfig
): Omit<SplitResult, "splitter"> {
  const blocks = segmentIntoBlocks(text);
  const parts: Array<{ text: string }> = [];
  let currentPart = "";

  for (const block of blocks) {
    if (
      currentPart.length + block.length > config.maxPartChars &&
      currentPart.length > 0
    ) {
      parts.push({ text: currentPart.trim() });
      currentPart = block;
    } else {
      currentPart += (currentPart ? "\n\n" : "") + block;
    }
  }

  if (currentPart) {
    parts.push({ text: currentPart.trim() });
  }

  const refined = refinePartBoundaries(parts, config);
  return { parts: refined };
}

function segmentIntoBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  let currentBlock = "";
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentBlock += line + "\n";
      continue;
    }

    if (inCodeBlock) {
      currentBlock += line + "\n";
      continue;
    }

    if (!line.trim() && currentBlock.trim()) {
      blocks.push(currentBlock.trim());
      currentBlock = "";
    } else {
      currentBlock += line + "\n";
    }
  }

  if (currentBlock.trim()) {
    blocks.push(currentBlock.trim());
  }

  return blocks;
}

function refinePartBoundaries(
  parts: Array<{ text: string }>,
  config: SplitConfig
): Array<{ text: string }> {
  const refined: Array<{ text: string }> = [];
  const mutableParts = parts.map((p) => ({ text: p.text }));

  for (let i = 0; i < mutableParts.length; i++) {
    let text = mutableParts[i].text;

    if (text.endsWith(":") && i < mutableParts.length - 1) {
      const nextLines = mutableParts[i + 1].text.split("\n");
      if (nextLines.length > 1) {
        text += "\n" + nextLines[0];
        mutableParts[i + 1].text = nextLines.slice(1).join("\n");
      }
    }

    if (text.length < config.minPartChars && i < mutableParts.length - 1) {
      mutableParts[i + 1].text = text + "\n\n" + mutableParts[i + 1].text;
      continue;
    }

    refined.push({ text });
  }

  return refined;
}

async function splitWithLLM(
  text: string,
  config: SplitConfig
): Promise<Omit<SplitResult, "splitter">> {
  const systemPrompt = `Eres un asistente que divide textos largos en múltiples mensajes coherentes.

REGLAS ESTRICTAS:
1. Cada parte debe ser autocontenida y tener sentido por sí sola
2. Máximo ${config.maxParts} partes
3. Cada parte entre ${config.minPartChars} y ${config.maxPartChars} caracteres
4. NO cambies el contenido, solo segmenta
5. Respeta la estructura (listas, párrafos, código)
6. No cortes en medio de oraciones, listas o bloques de código

Devuelve JSON:
{
  "parts": [{"text": "..."}, {"text": "..."}],
  "notes": "opcional"
}`;

  const userPrompt = `Divide este texto:\n\n${text}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM split failed: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No LLM response");

  const parsed = JSON.parse(content) as {
    parts?: Array<{ text: string }>;
    notes?: string;
  };
  if (!parsed.parts || !Array.isArray(parsed.parts)) {
    throw new Error("Invalid LLM response: missing parts array");
  }
  return {
    parts: parsed.parts.map((p) => ({
      text: typeof p.text === "string" ? p.text : String(p.text),
    })),
    notes: parsed.notes,
  };
}

function validateSplitResult(
  result: Omit<SplitResult, "splitter">,
  originalText: string,
  config: SplitConfig
): boolean {
  if (result.parts.length > config.maxParts * 1.5) return false;

  for (const part of result.parts) {
    if (part.text.length < config.minPartChars * 0.7) return false;
    if (part.text.length > config.maxPartChars * 1.3) return false;
  }

  const concatenated = result.parts.map((p) => p.text).join("\n\n");
  const similarity = concatenated.length / originalText.length;
  if (similarity < 0.9 || similarity > 1.1) return false;

  return true;
}
