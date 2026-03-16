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

interface ImportMeta {
  readonly env: ImportMetaEnv
}
