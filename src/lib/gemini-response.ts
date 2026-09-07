type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { thought?: boolean; text?: string }[] };
  }[];
};

// GenerateContent can include thought summaries before the final answer.
// Never render those summaries or a response cut off by the token limit.
export function geminiAnswer(data: GeminiResponse): string {
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason !== "STOP") return "";
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

export function geminiGenerationConfig(model: string) {
  return {
    // Thinking and final output share the generation allowance. A 400-token
    // cap can end the response before the athlete's answer is complete.
    maxOutputTokens: 4096,
    ...(model.startsWith("gemini-3")
      ? { thinkingConfig: { thinkingLevel: "low", includeThoughts: false } }
      : model.startsWith("gemini-2.5")
        ? { thinkingConfig: { thinkingBudget: 1024, includeThoughts: false } }
        : {}),
  };
}
