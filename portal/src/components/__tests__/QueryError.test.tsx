// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import QueryError from '../QueryError'

describe('QueryError', () => {
  afterEach(cleanup)

  it('shows Russian text instead of axios "Network Error"', () => {
    render(<QueryError error={new AxiosError('Network Error', 'ERR_NETWORK')} />)
    expect(screen.getByText('Нет связи с сервером. Проверьте подключение')).toBeTruthy()
    expect(screen.queryByText('Network Error')).toBeNull()
  })

  it('shows server detail when the response has one', () => {
    const error = new AxiosError('Request failed with status code 403', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 403,
      statusText: 'Forbidden',
      data: { detail: 'Нет доступа к заявке' },
      headers: {},
      config: { headers: new AxiosHeaders() } as InternalAxiosRequestConfig,
    })
    render(<QueryError error={error} />)
    expect(screen.getByText('Нет доступа к заявке')).toBeTruthy()
  })
})
