import type { Task } from '@/types/task'

export interface TaskListGroup {
  key: string
  label: string
  items: Task[]
}
