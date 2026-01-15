// Utility function for merging Tailwind classes
// Prevents conflicts and applies conditional classes properly
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
