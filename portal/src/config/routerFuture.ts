/**
 * Поведение React Router v7 заранее: без предупреждений в консоли и без
 * сюрпризов при переходе на v7. Относительных ссылок внутри «/*»-маршрутов
 * в портале нет, так что v7_relativeSplatPath ничего не меняет.
 */
export const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const
