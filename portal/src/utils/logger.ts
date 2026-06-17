/**
 * Утилиты для безопасного логгирования в development
 */

/**
 * Логирует ошибку только в development режиме
 */
export function logError(message: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.error(message, ...args)
  }
}
