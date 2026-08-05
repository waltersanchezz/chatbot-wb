import type {
  AutomationCreateInput,
  AutomationLogDto,
  AutomationRuleDto,
  AutomationUpdateInput,
} from './automationDto';

export interface AutomationRepository {
  listRules(): AutomationRuleDto[];
  getRule(id: string): AutomationRuleDto | null;
  createRule(input: AutomationCreateInput): AutomationRuleDto;
  updateRule(id: string, input: AutomationUpdateInput): AutomationRuleDto | null;
  deleteRule(id: string): boolean;
  duplicateRule(id: string): AutomationRuleDto | null;
  listEnabledByTrigger(trigger: string): AutomationRuleDto[];
  appendLog(input: {
    ruleId: string;
    trigger: string;
    result: string;
  }): AutomationLogDto;
  listLogs(options?: { ruleId?: string; limit?: number }): AutomationLogDto[];
}
