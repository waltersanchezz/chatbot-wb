import type { TemplateRepository } from '../../domain/dashboard/TemplateRepository';
import type {
  TemplateDto,
  TemplateInstallDto,
  TemplateInstallResources,
  TemplateInstallResult,
  TemplateListFilters,
  TemplatePayload,
} from '../../domain/dashboard/templateDto';
import type { KnowledgeService } from './KnowledgeService';
import type { AutomationService } from './AutomationService';
import type { WorkflowService } from './WorkflowService';
import type { CompanyService } from './CompanyService';
import type { AutomationCreateInput } from '../../domain/dashboard/automationDto';
import type { WorkflowCreateInput } from '../../domain/dashboard/workflowDto';
import type { CompanyUpdateInput } from '../../domain/dashboard/companyDto';

export class MarketplaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketplaceValidationError';
  }
}

export interface MarketplaceDeps {
  knowledge?: KnowledgeService;
  automation?: AutomationService;
  workflow?: WorkflowService;
  company?: CompanyService;
}

/**
 * Marketplace de plantillas — solo consume APIs públicas de otros módulos.
 */
export class MarketplaceService {
  constructor(
    private readonly repository: TemplateRepository,
    private readonly deps: MarketplaceDeps = {},
  ) {
    this.repository.ensureSeedTemplates();
  }

  listTemplates(filters?: TemplateListFilters): TemplateDto[] {
    return this.repository.list(filters);
  }

  getTemplate(id: string): TemplateDto | null {
    return this.repository.getById(id);
  }

  listInstalls(): TemplateInstallDto[] {
    return this.repository.listInstalls();
  }

  /**
   * Instala o actualiza (si ya existe y cambia versión / force).
   */
  install(
    templateId: string,
    options: { force?: boolean } = {},
  ): TemplateInstallResult {
    const template = this.repository.getById(templateId);
    if (!template || !template.enabled) {
      throw new MarketplaceValidationError(
        `Plantilla no encontrada: ${templateId}`,
      );
    }

    const existing = this.repository.getInstall(templateId);
    const isUpdate =
      Boolean(existing) &&
      (options.force || existing!.version !== template.version);

    if (existing && !isUpdate && !options.force) {
      return {
        install: existing,
        template,
        created: {
          knowledge: 0,
          automations: 0,
          workflows: 0,
          company: false,
        },
        updated: false,
      };
    }

    if (existing) {
      this.rollbackResources(existing.resources);
    }

    const resources = this.applyPayload(template.id, template.payload);
    const install = this.repository.upsertInstall({
      templateId: template.id,
      version: template.version,
      resources,
    });

    return {
      install,
      template,
      created: {
        knowledge: resources.knowledgeIds.length,
        automations: resources.automationIds.length,
        workflows: resources.workflowIds.length,
        company: resources.companyApplied,
      },
      updated: Boolean(existing),
    };
  }

  uninstall(templateId: string): boolean {
    const existing = this.repository.getInstall(templateId);
    if (!existing) return false;
    this.rollbackResources(existing.resources);
    return this.repository.deleteInstall(templateId);
  }

  private applyPayload(
    templateId: string,
    payload: TemplatePayload,
  ): TemplateInstallResources {
    const resources: TemplateInstallResources = {
      knowledgeIds: [],
      automationIds: [],
      workflowIds: [],
      companyApplied: false,
      pipeline: payload.pipeline,
      tasks: payload.tasks,
      widgets: payload.widgets,
    };

    const tag = `template:${templateId}`;

    if (this.deps.knowledge && payload.knowledge?.length) {
      for (const item of payload.knowledge) {
        const created = this.deps.knowledge.create({
          category: item.category ?? 'FAQ',
          title: item.title,
          question: item.question,
          answer: item.answer,
          tags: [...(item.tags ?? []), tag],
          priority: item.priority ?? 0,
          enabled: true,
        });
        resources.knowledgeIds.push(created.id);
      }
    }

    if (this.deps.automation && payload.automations?.length) {
      for (const rule of payload.automations) {
        const created = this.deps.automation.create({
          name: rule.name,
          trigger: rule.trigger,
          enabled: rule.enabled !== false,
          priority: rule.priority ?? 0,
          condition: (rule.condition ?? null) as AutomationCreateInput['condition'],
          action: {
            type: rule.action.type as AutomationCreateInput['action']['type'],
            label: rule.action.label,
            priority: rule.action.priority as 'Alta' | 'Media' | 'Baja' | undefined,
            tag: rule.action.tag,
            eventName: rule.action.eventName,
          },
          config: { ...(rule.config ?? {}), templateId },
        });
        resources.automationIds.push(created.id);
      }
    }

    if (this.deps.workflow && payload.workflows?.length) {
      for (const wf of payload.workflows) {
        const input: WorkflowCreateInput = {
          name: wf.name,
          description: wf.description ?? `Plantilla ${templateId}`,
          trigger: wf.trigger,
          enabled: wf.enabled !== false,
          graph: wf.graph,
          steps: wf.steps,
        };
        const created = this.deps.workflow.create(input);
        resources.workflowIds.push(created.id);
      }
    }

    if (this.deps.company && payload.company) {
      const update: CompanyUpdateInput = { ...payload.company };
      this.deps.company.updateCompany(update);
      resources.companyApplied = true;
    }

    return resources;
  }

  private rollbackResources(resources: TemplateInstallResources): void {
    if (this.deps.knowledge) {
      for (const id of resources.knowledgeIds ?? []) {
        try {
          this.deps.knowledge.delete(id);
        } catch {
          /* ignore */
        }
      }
    }
    if (this.deps.automation) {
      for (const id of resources.automationIds ?? []) {
        try {
          this.deps.automation.delete(id);
        } catch {
          /* ignore */
        }
      }
    }
    if (this.deps.workflow) {
      for (const id of resources.workflowIds ?? []) {
        try {
          this.deps.workflow.delete(id);
        } catch {
          /* ignore */
        }
      }
    }
  }
}
