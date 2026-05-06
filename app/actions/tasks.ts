// Re-export from the canonical task actions file.
// This barrel exists so that components importing from "@/app/actions/tasks"
// continue to work without breaking change.

export type { Task } from "@/app/tasks/actions"
export {
  addTask,
  updateTask,
  deleteTask,
  toggleTask,
  getTasks,
  assignTask,
} from "@/app/tasks/actions"
