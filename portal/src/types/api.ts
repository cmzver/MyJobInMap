/**
 * Стандартные типы для API ответов.
 * Используются для типизации данных, приходящих от сервера.
 */

/**
 * Обёртка для успешного API-ответа.
 * Используется для эндпоинтов, возвращающих `{ message: "..." }`.
 */
export interface ApiMessage {
  message: string
}

/**
 * Ответ с деталями ошибки от FastAPI.
 */
export interface ApiErrorResponse {
  error?: string
  detail?: string | Array<{ loc: string[]; msg: string; type: string }>
  request_id?: string
}

/**
 * Ответ от health endpoint.
 */
export interface HealthResponse {
  status: 'ok' | 'error'
  version: string
  database: string
  uptime_seconds?: number
}

/**
 * Стандартный ответ от операций удаления/seed/cleanup.
 */
export interface ApiOperationResult {
  status: string
  message: string
  [key: string]: unknown
}
