/**
 * Tests for apiError utility.
 */

import { describe, it, expect, vi } from 'vitest'
import { getApiErrorMessage } from '../apiError'

type FakeAxiosError = Error & {
  isAxiosError: boolean
  response: {
    data: unknown
    status: number
  }
}

// Minimal AxiosError-like shape
function makeAxiosError(data: unknown, status?: number) {
  const error = new Error('Request failed') as FakeAxiosError
  error.isAxiosError = true
  error.response = { data, status: status ?? 400 }
  return error
}

// Patch axios.isAxiosError to recognise our fakes
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios')
  return {
    ...actual,
    default: {
      ...actual.default,
      isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean } | null)?.isAxiosError),
    },
  }
})

// Mock react-hot-toast so it doesn't break in Node
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe('getApiErrorMessage', () => {
  it('extracts detail string from AxiosError', () => {
    const err = makeAxiosError({ detail: 'Неверный пароль' })
    expect(getApiErrorMessage(err)).toBe('Неверный пароль')
  })

  it('extracts error string from AxiosError', () => {
    const err = makeAxiosError({ error: 'Not found' })
    expect(getApiErrorMessage(err)).toBe('Not found')
  })

  it('extracts message string from AxiosError', () => {
    const err = makeAxiosError({ message: 'Timeout' })
    expect(getApiErrorMessage(err)).toBe('Timeout')
  })

  it('handles FastAPI validation error array', () => {
    const err = makeAxiosError({
      detail: [{ loc: ['body', 'name'], msg: 'field required', type: 'value_error' }],
    })
    expect(getApiErrorMessage(err)).toBe('Проверьте правильность заполнения полей')
  })

  it('strips pydantic «Value error,» prefix from server validators', () => {
    const err = makeAxiosError(
      { detail: [{ loc: ['body'], msg: 'Value error, Конец периода раньше начала', type: 'value_error' }] },
      422,
    )
    expect(getApiErrorMessage(err)).toBe('Конец периода раньше начала')
  })

  it('returns status-based message for 403', () => {
    const err = makeAxiosError(null, 403)
    expect(getApiErrorMessage(err)).toBe('Недостаточно прав')
  })

  it('returns status-based message for 404', () => {
    const err = makeAxiosError(null, 404)
    expect(getApiErrorMessage(err)).toBe('Ресурс не найден')
  })

  it('returns status-based message for 429', () => {
    const err = makeAxiosError(null, 429)
    expect(getApiErrorMessage(err)).toBe('Слишком много запросов, попробуйте позже')
  })

  it('returns status-based message for 500', () => {
    const err = makeAxiosError(null, 500)
    expect(getApiErrorMessage(err)).toBe('Внутренняя ошибка сервера')
  })

  it('returns Error.message for plain Error', () => {
    expect(getApiErrorMessage(new Error('Something broke'))).toBe('Something broke')
  })

  it('returns fallback for unknown type', () => {
    expect(getApiErrorMessage('string error')).toBe('Произошла ошибка')
  })

  it('returns custom fallback', () => {
    expect(getApiErrorMessage(42, 'Custom fallback')).toBe('Custom fallback')
  })
})

describe('getApiErrorMessage: без технических текстов axios', () => {
  it('нет ответа сервера — про связь', () => {
    const error = Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined })
    expect(getApiErrorMessage(error)).toBe('Нет связи с сервером. Проверьте подключение')
  })

  it('редкий код без тела — запасной текст, не «Request failed…»', () => {
    expect(getApiErrorMessage(makeAxiosError(undefined, 418), 'Не получилось')).toBe('Не получилось')
  })

  it('5xx без тела — сервер недоступен', () => {
    expect(getApiErrorMessage(makeAxiosError(undefined, 503))).toBe('Сервер временно недоступен, попробуйте позже')
  })
})
