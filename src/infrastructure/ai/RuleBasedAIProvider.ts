import type { AIGenerateInput, AIGenerateResult, AIProvider } from '../../domain/ports/AIProvider';

/**
 * Proveedor actual: la lógica vive en ConversationEngine.
 * Este adapter deja el puerto listo para OpenAI sin cambiar casos de uso.
 */
export class RuleBasedAIProvider implements AIProvider {
  async generate(input: AIGenerateInput): Promise<AIGenerateResult> {
    return {
      reply: input.conversation.messages.at(-1)?.content ?? '',
      usedFallback: true,
    };
  }
}
