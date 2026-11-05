// @vitest-environment jsdom
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cabinetApi, http, useCabinetSession, type CabinetAct } from '@/api/cabinet'
import CabinetLoginPage from '../CabinetLoginPage'
import { actTitle } from '../cabinetLabels'

const me = {
  id: 1,
  login: 'uk-smirnova',
  full_name: 'Смирнова О. П.',
  counterparty_id: 7,
  counterparty_name: 'УК Наша',
  organization_name: 'Техно',
}

beforeEach(() => {
  localStorage.clear()
  useCabinetSession.setState({ token: null, me: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/client/login']}>
      <Routes>
        <Route path="/client/login" element={<CabinetLoginPage />} />
        <Route path="/client" element={<p>Заявки кабинета</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('cabinet login', () => {
  it('stores the cabinet session and opens the cabinet', async () => {
    const login = vi
      .spyOn(cabinetApi, 'login')
      .mockResolvedValue({ access_token: 'client-token', token_type: 'bearer', expires_in: 3600, account: me })
    renderLogin()
    await userEvent.type(screen.getByLabelText('Логин'), 'uk-smirnova')
    await userEvent.type(screen.getByLabelText('Пароль'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Заявки кабинета')).toBeTruthy()
    expect(login).toHaveBeenCalledWith('uk-smirnova', 'secret-pass')
    expect(useCabinetSession.getState()).toMatchObject({ token: 'client-token', me })
  })

  it('shows the server error and keeps the user on the login form', async () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
    vi.spyOn(cabinetApi, 'login').mockRejectedValue(
      new AxiosError('401', 'ERR_BAD_REQUEST', config, undefined, {
        config,
        data: { detail: 'Неверный логин или пароль' },
        status: 401,
        statusText: '',
        headers: new AxiosHeaders(),
      }),
    )
    renderLogin()
    await userEvent.type(screen.getByLabelText('Логин'), 'x')
    await userEvent.type(screen.getByLabelText('Пароль'), 'y')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Неверный логин или пароль')
    expect(useCabinetSession.getState().token).toBeNull()
  })
})

describe('cabinet session', () => {
  it('drops the session when the server rejects the token', async () => {
    useCabinetSession.setState({ token: 'revoked', me })
    let sentToken: unknown
    http.defaults.adapter = async (config) => {
      sentToken = config.headers.Authorization
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, undefined, {
        config,
        data: {},
        status: 401,
        statusText: '',
        headers: new AxiosHeaders(),
      })
    }
    await expect(cabinetApi.me()).rejects.toBeTruthy()
    expect(sentToken).toBe('Bearer revoked')
    await waitFor(() => expect(useCabinetSession.getState().token).toBeNull())
  })
})

describe('act titles', () => {
  const act = (fields: Partial<CabinetAct>) =>
    ({ id: 1, number: 'А-1', kind: 'task', status: 'signed', total_amount: '0', ...fields }) as CabinetAct

  it('names summary acts by month and task acts by task number', () => {
    expect(actTitle(act({ kind: 'summary', period_start: '2026-11-01' }))).toBe('Сводный акт за ноябрь 2026')
    expect(actTitle(act({ task_number: 'Z-00042' }))).toBe('Акт по заявке Z-00042')
  })
})
