import { useState } from 'react'
import { cn } from '@/utils/cn'

interface Props {
  fullName?: string | null
  avatarUrl?: string | null
  sizeClassName?: string
  textClassName?: string
  className?: string
}

export default function UserAvatar({
  fullName,
  avatarUrl,
  sizeClassName = 'h-10 w-10',
  textClassName = 'text-sm',
  className,
}: Props) {
  const [hasError, setHasError] = useState(false)
  const initials = getUserInitials(fullName)
  const canRenderImage = Boolean(avatarUrl) && !hasError

  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-400 to-primary-600 font-bold text-white shadow-sm',
        sizeClassName,
        textClassName,
        className,
      )}
    >
      {canRenderImage ? (
        <img
          src={avatarUrl ?? undefined}
          alt={fullName ?? 'Аватар пользователя'}
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}

export function getUserInitials(fullName?: string | null): string {
  const parts = (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return 'U'
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}