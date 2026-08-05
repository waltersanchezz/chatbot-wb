import type { AiProvider } from '../../domain/copilot/AiProvider';
import type { PromptRepository } from '../../domain/dashboard/PromptRepository';
import type {
  CopilotApplyResult,
  CopilotGeneratedResponse,
  CopilotSessionDto,
  CopilotTemplateDto,
  CopilotTemplateType,
} from '../../domain/dashboard/copilotDto';
import {
  isCopilotTemplateType,
  summarizeCopilotResponse,
} from '../../domain/dashboard/copilotDto';
import type { TemplatePayload } from '../../domain/dashboard/templateDto';
import type { KnowledgeService } from './KnowledgeService';
import type { AutomationService } from './AutomationService';
import type { WorkflowService } from './WorkflowService';
import type { CompanyService } from './CompanyService';
import type { MarketplaceService } from './MarketplaceService';
import type { BillingService } from './BillingService';
import type { AutomationCreateInput } from '../../domain/dashboard/automationDto';
import type { WorkflowCreateInput } from '../../domain/dashboard/workflowDto';
import type { CompanyUpdateInput } from '../../domain/dashboard/companyDto';

export class CopilotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotValidationError';
  }
}

export interface CopilotDeps {
  knowledge?: KnowledgeService;
  automation?: AutomationService;
  workflow?: WorkflowService;
  company?: CompanyService;
  marketplace?: MarketplaceService;
  billing?: BillingService;
}

/**
 * AI Copilot — genera y aplica configuraciones vía APIs públicas.
 * No modifica motores del chatbot ni módulos existentes.
 */
export class CopilotService {
  constructor(
    private readonly repository: PromptRepository,
    private readonly ai: AiProvider,
    private readonly deps: CopilotDeps = {},
  ) {}

  async generate(prompt: string): Promise<CopilotSessionDto> {
    const trimmed = prompt?.trim() ?? '';
    if (!trimmed) {
      throw new CopilotValidationError('El prompt es obligatorio');
    }

    let response = await this.ai.generate(trimmed);
    response = this.enrichWithMarketplace(response);

    const session = this.repository.createSession({
      prompt: trimmed,
      response,
      status: 'ready',
    });

    this.trackUsage();
    return session;
  }

  apply(input: {
    sessionId: string;
    response?: CopilotGeneratedResponse;
    saveAsTemplate?: boolean;
    templateType?: string;
    installMarketplace?: boolean;
  }): CopilotApplyResult {
    const sessionId = input.sessionId?.trim();
    if (!sessionId) {
      throw new CopilotValidationError('sessionId es obligatorio');
    }

    let session = this.repository.getSession(sessionId);
    if (!session) {
      throw new CopilotValidationError(`Sesión no encontrada: ${sessionId}`);
    }

    const response = input.response ?? session.response;
    if (!response?.payload) {
      throw new CopilotValidationError('La respuesta no tiene payload válido');
    }

    session =
      this.repository.updateSession(sessionId, {
        response,
        status: 'ready',
      }) ?? session;

    let applied: CopilotApplyResult['applied'];
    try {
      applied = this.applyPayload(response.payload, {
        installMarketplace: Boolean(input.installMarketplace),
        marketplaceTemplateId: response.suggestedMarketplaceTemplateId,
        sessionId,
      });
      session =
        this.repository.updateSession(sessionId, { status: 'applied' }) ??
        session;
    } catch (err) {
      this.repository.updateSession(sessionId, { status: 'failed' });
      throw err;
    }

    let template: CopilotTemplateDto | null = null;
    if (input.saveAsTemplate) {
      const type = resolveTemplateType(input.templateType);
      template = this.repository.saveTemplate({ type, payload: response });
    }

    const billingWarning = this.trackUsage();

    return {
      session,
      applied,
      template,
      billingWarning,
    };
  }

  listHistory(limit?: number): {
    sessions: CopilotSessionDto[];
    templates: CopilotTemplateDto[];
  } {
    return {
      sessions: this.repository.listSessions(limit),
      templates: this.repository.listTemplates(limit),
    };
  }

  deleteHistory(id: string): boolean {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new CopilotValidationError('id es obligatorio');
    }
    return this.repository.deleteSession(trimmed);
  }

  getSession(id: string): CopilotSessionDto | null {
    return this.repository.getSession(id);
  }

  summarize(response: CopilotGeneratedResponse) {
    return summarizeCopilotResponse(response);
  }

  /** Verifica sugerencia contra catálogo Marketplace (API pública). */
  private enrichWithMarketplace(
    response: CopilotGeneratedResponse,
  ): CopilotGeneratedResponse {
    if (!this.deps.marketplace || !response.suggestedMarketplaceTemplateId) {
      return response;
    }
    const tpl = this.deps.marketplace.getTemplate(
      response.suggestedMarketplaceTemplateId,
    );
    if (!tpl) {
      return { ...response, suggestedMarketplaceTemplateId: null };
    }
    return {
      ...response,
      marketplaceTemplate: {
        name: tpl.name,
        category: tpl.category,
        description: tpl.description,
      },
    };
  }

  private applyPayload(
    payload: TemplatePayload,
    options: {
      installMarketplace: boolean;
      marketplaceTemplateId?: string | null;
      sessionId: string;
    },
  ): CopilotApplyResult['applied'] {
    const result: CopilotApplyResult['applied'] = {
      knowledge: 0,
      automations: 0,
      workflows: 0,
      company: false,
      marketplaceInstalled: false,
      pipeline: Boolean(payload.pipeline),
      widgets: payload.widgets?.length ?? 0,
    };

    /**
     * Si se pide instalar del Marketplace, se usa solo esa API pública
     * (evita duplicar Knowledge/Automation/Workflow/Company).
     */
    if (
      options.installMarketplace &&
      options.marketplaceTemplateId &&
      this.deps.marketplace
    ) {
      const installResult = this.deps.marketplace.install(
        options.marketplaceTemplateId,
        { force: false },
      );
      result.marketplaceInstalled = true;
      result.knowledge = installResult.created.knowledge;
      result.automations = installResult.created.automations;
      result.workflows = installResult.created.workflows;
      result.company = installResult.created.company;
      return result;
    }

    const tag = `copilot:${options.sessionId}`;

    if (this.deps.knowledge && payload.knowledge?.length) {
      for (const item of payload.knowledge) {
        this.deps.knowledge.create({
          category: item.category ?? 'FAQ',
          title: item.title,
          question: item.question,
          answer: item.answer,
          tags: [...(item.tags ?? []), tag],
          priority: item.priority ?? 0,
          enabled: true,
        });
        result.knowledge += 1;
      }
    }

    if (this.deps.automation && payload.automations?.length) {
      for (const rule of payload.automations) {
        this.deps.automation.create({
          name: rule.name,
          trigger: rule.trigger,
          enabled: rule.enabled !== false,
          priority: rule.priority ?? 0,
          condition: (rule.condition ??
            null) as AutomationCreateInput['condition'],
          action: {
            type: rule.action.type as AutomationCreateInput['action']['type'],
            label: rule.action.label,
            priority: rule.action.priority as
              | 'Alta'
              | 'Media'
              | 'Baja'
              | undefined,
            tag: rule.action.tag,
            eventName: rule.action.eventName,
          },
          config: {
            ...(rule.config ?? {}),
            copilotSessionId: options.sessionId,
          },
        });
        result.automations += 1;
      }
    }

    if (this.deps.workflow && payload.workflows?.length) {
      for (const wf of payload.workflows) {
        const input: WorkflowCreateInput = {
          name: wf.name,
          description: wf.description ?? `Copilot ${options.sessionId}`,
          trigger: wf.trigger,
          enabled: wf.enabled !== false,
          graph: wf.graph,
          steps: wf.steps,
        };
        this.deps.workflow.create(input);
        result.workflows += 1;
      }
    }

    if (this.deps.company && payload.company) {
      const update: CompanyUpdateInput = { ...payload.company };
      this.deps.company.updateCompany(update);
      result.company = true;
    }

    return result;
  }

  private trackUsage(): string | null {
    if (!this.deps.billing) return null;
    try {
      const { warning } = this.deps.billing.registerUsage('apiRequests', 1);
      return warning?.message ?? null;
    } catch {
      return null;
    }
  }
}

function resolveTemplateType(value?: string): CopilotTemplateType {
  if (value && isCopilotTemplateType(value)) return value;
  return 'full';
}
