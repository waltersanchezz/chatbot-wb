import type { PipelineDto } from '../../domain/dashboard/pipelineDto';
import type { PipelineRepository } from '../../domain/dashboard/PipelineRepository';

/**
 * Pipeline API — tablero comercial por estado SalesFlow.
 */
export class PipelineService {
  constructor(private readonly repository: PipelineRepository) {}

  getPipeline(): PipelineDto {
    return this.repository.getPipeline();
  }
}
