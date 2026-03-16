import axios from 'axios'
import toast from 'react-hot-toast'

/**
 * Извлекает человекочитаемое сообщение об ошибке из ответа API.
 *
 * Порядок приоритета:
 * 1. AxiosError → response.data.detail (строка)
 * 2. AxiosError → response.data.error (строка)
 * 3. AxiosError → response.data.message (строка)
 * 4. Error → error.message
 * 5. fallback (по умолчанию "Произошла ошибка")
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Произошла ошибка'
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data) {
      if (typeof data.detail === 'string') return data.detail
      if (typeof data.error === 'string') return data.error
      if (typeof data.message === 'string') return data.message
      // FastAPI может вернуть detail как массив (validation errors)
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0]
        if (typeof first === 'object' && first.msg) {
          return first.msg
        }
      }
    }
    // HTTP статус-коды без тела
    if (error.response?.status === 403) return 'Недостаточно прав'
    if (error.response?.status === 404) return 'Ресурс не найден'
    if (error.response?.status === 409) return 'Конфликт данных'
    if (error.response?.status === 413) return 'Файл слишком большой'
    if (error.response?.status === 429) return 'Слишком много запросов, попробуйте позже'
    if (error.response?.status === 500) return 'Внутренняя ошибка сервера'
    if (error.message) return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

/**
 * Показывает toast с ошибкой API.
 * Извлекает сообщение из AxiosError / Error автоматически.
 */
export function showApiError(error: unknown, fallback?: string): void {
  toast.error(getApiErrorMessage(error, fallback))
}

/**
 * Показывает toast с успешным результатом.
 */
export function showApiSuccess(message: string): void {
  toast.success(message)
}

/**
 * Конфигурация onError/onSuccess для React Query мутаций.
 * Используется для централизации обработки результатов.
 *
 * @example
 * ```tsx
 * mutation.mutate(data, mutationToast({
 *   success: 'Заявка создана',
 *   error: 'Ошибка создания заявки',
 *   onSuccess: (data) => navigate(`/tasks/${data.id}`),
 * }))
 * ```
 */
export function mutationToast<TData = unknown>(options: {
  success?: string
  error?: string
  onSuccess?: (data: TData) => void
  onError?: (error: unknown) => void
}) {
  return {
    onSuccess: (data: TData) => {
      if (options.success) showApiSuccess(options.success)
      options.onSuccess?.(data)
    },
    onError: (error: unknown) => {
      showApiError(error, options.error)
      options.onError?.(error)
    },
  }
}
