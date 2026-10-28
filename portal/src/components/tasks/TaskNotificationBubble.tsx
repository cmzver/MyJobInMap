interface TaskNotificationBubbleProps {
  count: number
}

export default function TaskNotificationBubble({ count }: TaskNotificationBubbleProps) {
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
      {count > 9 ? '9+' : count}
    </span>
  )
}
