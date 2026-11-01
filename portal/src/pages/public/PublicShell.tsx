import type { ReactNode } from 'react'

/** Каркас страниц без входа: клиент открывает их по ссылке с телефона. */
export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-gray-900 sm:py-10">
      <main className="mx-auto w-full max-w-2xl space-y-4">{children}</main>
    </div>
  )
}

/** Карточка публичной страницы — без двойных отступов общего Card. */
export function PublicCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6 ${className}`}
    >
      {children}
    </section>
  )
}
