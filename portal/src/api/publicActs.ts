import apiClient from './client'
import type { components } from '@/types/api.generated'

// Акт для клиента по ссылке и проверка подлинности — без входа.
export type PublicAct = components['schemas']['PublicActView']
export type ActVerification = components['schemas']['ActVerification']

export interface PublicSignature {
  png: Blob
  strokes: number[][][]
  signerName: string
}

const path = (token: string) => `/public/acts/${encodeURIComponent(token)}`

export const publicActsApi = {
  async get(token: string): Promise<PublicAct> {
    const { data } = await apiClient.get<PublicAct>(path(token))
    return data
  },

  /** Прямая ссылка: PDF по токену отдаётся без авторизации. */
  pdfUrl: (token: string) => `/api${path(token)}/pdf`,

  async sign(token: string, signature: PublicSignature): Promise<PublicAct> {
    const form = new FormData()
    form.append('signature', signature.png, 'signature.png')
    form.append('signer_name', signature.signerName)
    form.append('consent', 'true')
    form.append('strokes', JSON.stringify(signature.strokes))
    const { data } = await apiClient.post<PublicAct>(`${path(token)}/sign`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async verify(number: string, hash: string): Promise<ActVerification> {
    const { data } = await apiClient.get<ActVerification>('/public/acts/verify', {
      params: { number, h: hash },
    })
    return data
  },
}
