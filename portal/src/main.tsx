import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// После деплоя файлы прошлой сборки удаляются: открытая вкладка просит их
// при переходе на ещё не загруженный раздел. Перезагружаемся один раз —
// браузер возьмёт свежий index.html; повтор в течение минуты не зацикливает.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'fw:stale-build-reload-at'
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 60_000) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch {
    // sessionStorage недоступен — перезагрузиться всё равно лучше белого экрана
  }
  event.preventDefault()
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 минут
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
