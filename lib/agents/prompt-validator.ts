const MAX_PROMPT_LENGTH = 20_000;
const ALLOWED_PLACEHOLDERS = ["{userID}", "{facts}", "{recap}", "{kbSection}"];
const VALID_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-5-mini",
  "gpt-5-nano",
] as const;

export type PromptValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validatePrompt(
  systemPromptTemplate: string,
  model: string,
  temperature: number,
  maxToolRounds?: number
): PromptValidationResult {
  if (systemPromptTemplate.length > MAX_PROMPT_LENGTH) {
    return {
      valid: false,
      error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)`,
    };
  }

  const usedPlaceholders = systemPromptTemplate.match(/\{[^}]+\}/g) ?? [];
  const invalid = usedPlaceholders.filter(
    (p) => !ALLOWED_PLACEHOLDERS.includes(p)
  );
  if (invalid.length > 0) {
    const unique = [...new Set(invalid)];
    return {
      valid: false,
      error: `Invalid placeholders: ${unique.join(
        ", "
      )}. Allowed: ${ALLOWED_PLACEHOLDERS.join(", ")}`,
    };
  }

  if (!VALID_MODELS.includes(model as (typeof VALID_MODELS)[number])) {
    return {
      valid: false,
      error: `Invalid model: ${model}. Allowed: ${VALID_MODELS.join(", ")}`,
    };
  }

  if (typeof temperature !== "number" || temperature < 0 || temperature > 1) {
    return {
      valid: false,
      error: "Temperature must be a number between 0 and 1",
    };
  }

  if (
    maxToolRounds !== undefined &&
    (typeof maxToolRounds !== "number" ||
      maxToolRounds < 1 ||
      maxToolRounds > 20)
  ) {
    return {
      valid: false,
      error: "maxToolRounds must be between 1 and 20",
    };
  }

  return { valid: true };
}
