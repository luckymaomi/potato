import { apiClient } from './client'

export const uploadsApi = {
  image: (file: File, projectId?: number) => {
    const form = new FormData()
    form.append('file', file)
    if (projectId) form.append('drama_id', String(projectId))
    return apiClient.post<never, { url: string; path?: string; local_path?: string }>('/upload/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}
