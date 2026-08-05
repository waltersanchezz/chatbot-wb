import type { PipelineDto } from './pipelineDto';

/**
 * Puerto Pipeline API (Kanban por SalesFlowState).
 */
export interface PipelineRepository {
  getPipeline(): PipelineDto;
}
