import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createAiGatewayProvider(apiKey: string) {
  const baseURL = process.env.AI_GATEWAY_URL;
  if (!baseURL) throw new Error("Missing AI_GATEWAY_URL");
  return createOpenAICompatible({
    name: "ai-gateway",
    baseURL,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}