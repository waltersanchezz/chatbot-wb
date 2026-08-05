import type {
  CopilotGeneratedResponse,
  CopilotSessionDto,
  CopilotSessionStatus,
  CopilotTemplateDto,
  CopilotTemplateType,
} from './copilotDto';

export interface PromptRepository {
  createSession(input: {
    prompt: string;
    response: CopilotGeneratedResponse;
    status?: CopilotSessionStatus;
  }): CopilotSessionDto;

  getSession(id: string): CopilotSessionDto | null;

  listSessions(limit?: number): CopilotSessionDto[];

  updateSession(
    id: string,
    patch: {
      response?: CopilotGeneratedResponse;
      status?: CopilotSessionStatus;
    },
  ): CopilotSessionDto | null;

  deleteSession(id: string): boolean;

  saveTemplate(input: {
    type: CopilotTemplateType;
    payload: CopilotGeneratedResponse;
  }): CopilotTemplateDto;

  listTemplates(limit?: number): CopilotTemplateDto[];

  getTemplate(id: string): CopilotTemplateDto | null;

  deleteTemplate(id: string): boolean;
}
