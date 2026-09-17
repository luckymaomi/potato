import axios, { AxiosError } from 'axios'
import { AppError, type StructuredFailure } from '../errors/appError'

interface ApiErrorBody { error?: { code?: string; message?: string; details?: Partial<StructuredFailure> } }

export class ApiRequestError extends AppError {
  constructor(
    message: string,
    status?: number,
    code = 'API_REQUEST_ERROR',
    details: Partial<StructuredFailure> = {},
  ) {
    super({
      code,
      message,
      status: details.status ?? status,
      retryable: details.retryable ?? Boolean(status && [408, 425, 429, 500, 502, 503, 504].includes(status)),
      provider: details.provider,
    })
    this.name = 'ApiRequestError'
  }
}

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 600_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') return response.data
    const payload = response.data
    if (payload?.success === false) {
      return Promise.reject(new ApiRequestError(
        payload.error?.message || '请求失败',
        response.status,
        payload.error?.code,
        payload.error?.details,
      ))
    }
    return payload?.data !== undefined ? payload.data : payload
  },
  (error: AxiosError<ApiErrorBody>) => {
    const message = error.response?.data?.error?.message || error.message || '网络错误'
    return Promise.reject(new ApiRequestError(
      message,
      error.response?.status,
      error.response?.data?.error?.code,
      error.response?.data?.error?.details,
    ))
  },
)
