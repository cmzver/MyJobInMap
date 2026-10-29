import type { TaskStatus } from '@/types/task'

export const STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  NEW: 'border-blue-200 border-l-blue-500 bg-blue-50 text-blue-800 dark:border-blue-800 dark:border-l-blue-400 dark:bg-blue-950/40 dark:text-blue-200',
  IN_PROGRESS:
    'border-orange-200 border-l-orange-500 bg-orange-50 text-orange-800 dark:border-orange-800 dark:border-l-orange-400 dark:bg-orange-950/40 dark:text-orange-200',
  DONE: 'border-emerald-200 border-l-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:border-l-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200',
  CANCELLED:
    'border-gray-200 border-l-gray-400 bg-gray-50 text-gray-600 dark:border-gray-600 dark:border-l-gray-400 dark:bg-gray-800 dark:text-gray-300',
}

export const STATUS_TEXT_CLASSES: Record<TaskStatus, string> = {
  NEW: 'text-blue-700 dark:text-blue-300',
  IN_PROGRESS: 'text-orange-700 dark:text-orange-300',
  DONE: 'text-emerald-700 dark:text-emerald-300',
  CANCELLED: 'text-gray-500 dark:text-gray-400',
}
