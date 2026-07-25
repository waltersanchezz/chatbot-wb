import type { Conversation } from '../entities/Conversation';

export interface AIGenerateInput {
  conversation: Conversation;
  userMessage: string;
  systemPrompt: string;
}

export interface AIGenerateResult {
  reply: string;
  usedFallback: boolean;
}

/**
 * Puerto para proveedores de IA (OpenAI, etc.).
 * La implementación actual puede ser rule-based; OpenAI se enchufa después.
 */
export interface AIProvider {
  generate(input: AIGenerateInput): Promise<AIGenerateResult>;
}
