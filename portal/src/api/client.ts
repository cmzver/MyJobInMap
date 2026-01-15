import axios from 'axios'

const API_BASE_URL = '/api'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor для добавления токена
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fieldworker-auth')
    if (token) {
      try {
        const authState = JSON.parse(token)
        if (authState.state?.token) {
          config.headers.Authorization = `Bearer ${authState.state.token}`
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor для обработки ошибок
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('fieldworker-auth')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
