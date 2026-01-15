import { AlertCircle, RefreshCw } from 'lucide-react'
import Button from './Button'

interface QueryErrorProps {
  error: Error | null
  onRetry?: () => void
  message?: string
  className?: string
}

export default function QueryError({ 
  error, 
  onRetry, 
  message = 'Не удалось загрузить данные',
  className = ''
}: QueryErrorProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-red-500" />
      </div>
      
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
        {message}
      </h3>
      
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4 max-w-md">
        {error?.message || 'Произошла ошибка при загрузке. Проверьте соединение и попробуйте снова.'}
      </p>

      {onRetry && (
        <Button onClick={onRetry} variant="secondary" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Попробовать снова
        </Button>
      )}
    </div>
  )
}
