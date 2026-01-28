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

/**
 * Логирует предупреждение только в development режиме  
 */
export function logWarn(message: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(message, ...args)
  }
}

/**
 * Логирует информацию только в development режиме
 */
export function logInfo(message: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.info(message, ...args)
  }
}
