import type {
  TemplateDto,
  TemplateInstallDto,
  TemplateInstallResources,
  TemplateListFilters,
} from './templateDto';

export interface TemplateRepository {
  ensureSeedTemplates(): void;
  list(filters?: TemplateListFilters): TemplateDto[];
  getById(id: string): TemplateDto | null;
  listInstalls(): TemplateInstallDto[];
  getInstall(templateId: string): TemplateInstallDto | null;
  upsertInstall(input: {
    templateId: string;
    version: string;
    resources: TemplateInstallResources;
  }): TemplateInstallDto;
  deleteInstall(templateId: string): boolean;
}
