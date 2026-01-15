import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-primary-500">404</h1>
        <p className="text-2xl font-semibold text-gray-900 mt-4">Страница не найдена</p>
        <p className="text-gray-600 mt-2 mb-8">
          К сожалению, запрашиваемая страница не существует
        </p>
        <Link
          to="/tasks"
          className="inline-flex items-center px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition"
        >
          <Home size={20} className="mr-2" />
          На главную
        </Link>
      </div>
    </div>
  )
}
