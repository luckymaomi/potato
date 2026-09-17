import axios, { AxiosError } from 'axios'

interface ApiErrorBody { error?: { message?: string } }

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 600_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') return response.data
    const payload = response.data
    if (payload?.success === false) return Promise.reject(new Error(payload.error?.message || '请求失败'))
    return payload?.data !== undefined ? payload.data : payload
  },
  (error: AxiosError<ApiErrorBody>) => {
    const message = error.response?.data?.error?.message || error.message || '网络错误'
    return Promise.reject(new Error(message))
  },
)
