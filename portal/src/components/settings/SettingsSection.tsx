import type { ReactNode, SelectHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check, Copy } from 'lucide-react'
import { Children, useState } from 'react'
import { cn } from '@/utils/cn'
import { SELECT_CLASS, settingsTokens } from './tokens'

export function SettingsSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(SELECT_CLASS, className)} {...props} />
}

/** Compact icon-only action button used in list/table rows. */
export function SettingsIconButton({
  title,
  onClick,
  disabled,
  tone = 'default',
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded p-1 text-gray-400 transition-colors disabled:opacity-50 dark:text-gray-500',
        tone === 'danger'
          ? 'hover:text-red-500 dark:hover:text-red-400'
          : 'hover:text-primary-500 dark:hover:text-primary-400'
      )}
    >
      {children}
    </button>
  )
}

/**
 * Wraps a list of rows (toggles / fields) with hairline dividers and
 * consistent vertical padding — so callers don't repeat the divider +
 * padding classes on every row.
 */
export function SettingsRows({ children }: { children: ReactNode }) {
  return (
    <div className={settingsTokens.divider}>
      {Children.toArray(children).map((child, i) => (
        <div key={i} className={settingsTokens.row}>
          {child}
        </div>
      ))}
    </div>
  )
}

/**
 * Settings primitives — card scheme (matches the reference design).
 *
 * A panel is built from `SettingsCard`s. Inside, form controls use
 * `SettingsField` (label above control) and `SettingsToggle` (title +
 * description with a switch). Read-only status rails use `StatRow`.
 */

export function SettingsCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/70',
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && (
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
              )}
              {description && (
                <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn('px-4', title || action ? 'pb-3' : 'py-3', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}

export function SettingsField({
  label,
  help,
  htmlFor,
  children,
  className,
}: {
  label: string
  help?: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-xs leading-snug text-gray-500 dark:text-gray-400">{help}</p>}
    </div>
  )
}

/**
 * A parameter row: title (+ optional description) on the left, a control
 * (switch, button, badge…) on the right. The shared base for every setting
 * line so they all look identical.
 */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function SettingsToggle({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <SettingRow title={title} description={description}>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </SettingRow>
  )
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        checked
          ? 'border-primary-500 bg-primary-500 dark:border-primary-400 dark:bg-primary-400'
          : 'border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-700'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

/** A read-only label/value row for status rails. */
export function StatRow({
  label,
  value,
  mono,
  copyText,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  /** When provided, shows a copy-to-clipboard button next to the value. */
  copyText?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-1 last:border-0 dark:border-gray-800">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-sm font-medium text-gray-900 dark:text-white',
            mono && 'font-mono text-xs'
          )}
        >
          {value}
        </span>
        {copyText && (
          <button
            type="button"
            onClick={handleCopy}
            title="Скопировать"
            className="text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}
