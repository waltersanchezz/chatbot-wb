import type {
  WorkflowCreateInput,
  WorkflowDto,
  WorkflowRunDto,
  WorkflowRunStatus,
  WorkflowUpdateInput,
} from './workflowDto';

export interface WorkflowRepository {
  list(): WorkflowDto[];
  getById(id: string): WorkflowDto | null;
  create(input: WorkflowCreateInput): WorkflowDto;
  update(id: string, input: WorkflowUpdateInput): WorkflowDto | null;
  delete(id: string): boolean;
  duplicate(id: string): WorkflowDto | null;
  listEnabledByTrigger(trigger: string): WorkflowDto[];
  startRun(workflowId: string): WorkflowRunDto;
  finishRun(
    runId: string,
    status: WorkflowRunStatus,
  ): WorkflowRunDto | null;
  listRuns(options?: {
    workflowId?: string;
    limit?: number;
  }): WorkflowRunDto[];
}
