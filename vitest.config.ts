import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    env: {
      // Evita que buildContainer abra SQLite de disco durante la suite.
      SQLITE_PATH: ':memory:',
      AUTH_REQUIRED: 'false',
      WHATSAPP_SIGNATURE_REQUIRED: 'false',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: [
        'src/shared/result.ts',
        'src/shared/timeout.ts',
        'src/application/services/MetricsService.ts',
        'src/infrastructure/logging/logger.ts',
        'src/infrastructure/logging/turnContext.ts',
        'src/application/use-cases/HandleIncomingMessage.ts',
        'src/domain/knowledge/**/*.ts',
        'src/application/services/KnowledgeEngine.ts',
        'src/application/services/KnowledgeRepository.ts',
        'src/application/services/technicalQuestionDetector.ts',
      ],
    },
  },
});
