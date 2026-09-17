import type { Character, Prop, Scene } from '../types/domain'
import { apiClient } from './client'

export const charactersApi = {
  get: (id: number) => apiClient.get<never, { character: Character }>(`/characters/${id}`),
  update: (id: number, data: Partial<Character>) => apiClient.put(`/characters/${id}`, data),
  generateImage: (id: number, data: { model?: string; provider?: string; style?: string }) => apiClient.post<never, { image_generation?: { task_id?: string } }>(`/characters/${id}/generate-image`, data),
}

export const scenesApi = {
  get: (id: number) => apiClient.get<never, { scene: Scene }>(`/scenes/${id}`),
  update: (id: number, data: Partial<Scene>) => apiClient.put(`/scenes/${id}`, data),
  generateImage: (id: number, data: { model?: string; provider?: string; style?: string }) => apiClient.post<never, { image_generation?: { task_id?: string } }>('/scenes/generate-image', { scene_id: id, ...data }),
}

export const propsApi = {
  get: (id: number) => apiClient.get<never, { prop: Prop }>(`/props/${id}`),
  update: (id: number, data: Partial<Prop>) => apiClient.put(`/props/${id}`, data),
  generateImage: (id: number, data: { model?: string; provider?: string; style?: string } = {}) => apiClient.post<never, { task_id?: string }>(`/props/${id}/generate`, data),
}
