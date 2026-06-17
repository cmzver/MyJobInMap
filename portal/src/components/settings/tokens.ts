/**
 * Shared style tokens for the settings UI. Edit these in one place to
 * restyle every panel at once.
 */
export const settingsTokens = {
  /** Hairline divider used between rows inside a card. */
  divider: 'divide-y divide-gray-100 dark:divide-gray-800',
  /** Vertical padding for a single row inside a divided list. */
  row: 'py-1.5 first:pt-0 last:pb-0',
  /** Field grids. */
  grid2: 'grid gap-3 sm:grid-cols-2',
  grid3: 'grid gap-3 sm:grid-cols-3',
  /** Stack gap between cards within a panel. */
  stack: 'space-y-3',
}

/** Native <select> styled to match the shared Input. */
export const SELECT_CLASS =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
