/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_NAME?: string
  readonly VITE_LOGIN_PRODUCT_LABEL?: string
  readonly VITE_LOGIN_HEADLINE?: string
  readonly VITE_LOGIN_DESCRIPTION?: string
  readonly VITE_LOGIN_ORG_NAME?: string
  readonly VITE_SUPPORT_EMAIL?: string
  readonly VITE_SUPPORT_PHONE?: string
  readonly VITE_SUPPORT_HOURS?: string
}

/** Время и коммит сборки — подставляет vite.config.ts (в dev-сервере без define их нет). */
declare const __BUILD_TIME__: string
declare const __BUILD_SHA__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}
