// Utility function for merging Tailwind classes
// Uses tailwind-merge to properly handle conflicting classes (e.g., p-4 vs p-6)
import { twMerge } from 'tailwind-merge'

export function cn(...classes: (string | undefined | null | false)[]): string {
  return twMerge(classes.filter(Boolean).join(' '))
}
