import type { AIGenerateInput, AIGenerateResult, AIProvider } from '../../domain/ports/AIProvider';

/**
 * Stub preparado para OpenAI.
 * Activar con AI_PROVIDER=openai y OPENAI_API_KEY cuando se integre.
 */
export class OpenAIProviderStub implements AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(input: AIGenerateInput): Promise<AIGenerateResult> {
    if (!this.apiKey) {
      return {
        reply:
          'Un asesor confirmará tu solicitud en breve. Mientras tanto, cuéntame marca, modelo y año del vehículo.',
        usedFallback: true,
      };
    }

    // Integración real pendiente: fetch a OpenAI Chat Completions / Responses API.
    void input;
    void this.model;
    return {
      reply:
        'La integración con OpenAI está preparada en la arquitectura. Por ahora uso el motor de reglas de Rodacenter AI.',
      usedFallback: true,
    };
  }
}
