import type { TasksDto } from './taskDto';

/**
 * Puerto Task Center API (tareas comerciales desde SQLite).
 */
export interface TaskRepository {
  getTasks(): TasksDto;
}
