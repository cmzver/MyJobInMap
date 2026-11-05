import { useEffect } from 'react'

const BASE_TITLE = 'FieldWorker'

/**
 * Заголовок вкладки браузера: «<title> · FieldWorker». Без title — просто
 * «FieldWorker» (страница ещё грузится). При уходе со страницы
 * возвращается прежний заголовок.
 */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE
    return () => {
      document.title = previous
    }
  }, [title])
}
