import { useNavigate } from 'react-router-dom'
import { FileQuestion, Home } from 'lucide-react'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <EmptyState
        icon={FileQuestion}
        title="Страница не найдена"
        description="Ссылка устарела или страница была удалена. Ошибка 404."
        action={
          <Button onClick={() => navigate('/tasks')}>
            <Home className="mr-2 h-4 w-4" />
            На главную
          </Button>
        }
      />
    </div>
  )
}
