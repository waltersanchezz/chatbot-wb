import type { CopilotGeneratedResponse } from '../dashboard/copilotDto';

/**
 * Puerto de IA del Copilot (desacoplado del AIProvider del chatbot).
 * Intercambiable: LocalPromptProvider → OpenAI / Azure / Anthropic / Gemini.
 */
export interface AiProvider {
  generate(prompt: string): Promise<CopilotGeneratedResponse>;
}
