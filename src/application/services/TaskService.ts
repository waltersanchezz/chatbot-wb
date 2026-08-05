import type { TasksDto } from '../../domain/dashboard/taskDto';
import type { TaskRepository } from '../../domain/dashboard/TaskRepository';

/**
 * Task Center API — tareas comerciales generadas desde SQLite.
 */
export class TaskService {
  constructor(private readonly repository: TaskRepository) {}

  getTasks(): TasksDto {
    return this.repository.getTasks();
  }
}
