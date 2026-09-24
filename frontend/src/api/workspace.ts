import type {
  AssetKind,
  AssetOutputType,
  AssetTextProfile,
  Episode,
  Panel,
  PanelAudio,
  PanelCaption,
  ProjectAsset,
  ReferenceLockKind,
} from "../types/domain";
import type { MediaGenerationHistory } from "./media";
import { apiClient } from "./client";

export interface ScriptWorkspace {
  overview: StoryOverview;
  episode: Episode;
  episodes: Episode[];
}
export interface StoryOverview {
  story_hook: string;
  worldview: string;
  storyline: string;
  tone: string;
  reference_setting: string;
}
export interface EpisodeStoryPlan {
  episode_goal: string;
  conflict: string;
  turning_point: string;
  ending_hook: string;
  scene_notes: string;
}
export interface ScriptSceneDraft {
  title: string;
  content: string;
}
export interface PanelWorkspace {
  episode: Episode;
  items?: Array<Panel & { captions?: PanelCaption[] }>;
  panels?: Array<Panel & { captions?: PanelCaption[] }>;
}
export interface GenerateMediaInput {
  provider?: string;
  model?: string;
  aspect_ratio?: string;
}
export interface PanelReadiness {
  recipe: { ready: boolean; reason?: string };
  image: { ready: boolean; reason?: string };
}
export interface PageExportResult {
  id: number;
  publicUrl: string;
  localPath: string;
  width: number;
  height: number;
}
export interface TtsConfig {
  provider: string;
  base_url: string;
  role: string | null;
  style: string | null;
  configured: boolean;
}
export interface TtsOptions {
  roles: string[];
  styles: string[];
}
export interface TtsProvider {
  id: string;
  label: string;
}

export const workspaceApi = {
  getScript: (projectId: number, episodeId?: number) =>
    apiClient.get<never, ScriptWorkspace>(`/dramas/${projectId}/script`, {
      params: { episode_id: episodeId },
    }),
  saveScript: (
    projectId: number,
    input: {
      episode_id: number;
      overview: StoryOverview;
      episode_plan: EpisodeStoryPlan;
      script_content: string;
    },
  ) =>
    apiClient.put<never, ScriptWorkspace>(`/dramas/${projectId}/script`, input),
  assembleScript: (
    projectId: number,
    input: { episode_id: number; scenes: ScriptSceneDraft[] },
  ) =>
    apiClient.post<never, { script_content: string }>(
      `/dramas/${projectId}/script/assemble`,
      input,
    ),
  assets: (projectId: number, kind?: AssetKind) =>
    apiClient.get<never, { items: ProjectAsset[] }>(
      `/dramas/${projectId}/assets`,
      { params: { kind } },
    ),
  createAsset: (
    projectId: number,
    input: Partial<ProjectAsset> & { kind: AssetKind },
  ) =>
    apiClient.post<never, ProjectAsset>(`/dramas/${projectId}/assets`, input),
  assembleAssetOutputPrompt: (
    projectId: number,
    input: {
      kind: AssetKind;
      name?: string;
      text_profile?: AssetTextProfile;
      output_type?: AssetOutputType;
      reference_lock?: ReferenceLockKind | null;
    },
  ) =>
    apiClient.post<
      never,
      {
        output_type: AssetOutputType;
        reference_lock: ReferenceLockKind | null;
        output_prompt: string;
      }
    >(`/dramas/${projectId}/assets/assemble-output-prompt`, input),
  updateAsset: (projectId: number, id: number, input: Partial<ProjectAsset>) =>
    apiClient.patch<never, ProjectAsset>(
      `/dramas/${projectId}/assets/${id}`,
      input,
    ),
  removeAsset: (projectId: number, id: number) =>
    apiClient.delete<never, { removed: boolean }>(
      `/dramas/${projectId}/assets/${id}`,
    ),
  generateAssetImage: (
    projectId: number,
    id: number,
    input: GenerateMediaInput,
  ) =>
    apiClient.post<never, MediaGenerationHistory>(
      `/dramas/${projectId}/assets/${id}/generate-image`,
      input,
    ),
  uploadAssetImage: (projectId: number, id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<never, MediaGenerationHistory>(
      `/dramas/${projectId}/assets/${id}/upload-image`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },
  panels: (projectId: number, episodeId?: number) =>
    apiClient.get<never, PanelWorkspace>(`/dramas/${projectId}/panels`, {
      params: { episode_id: episodeId },
    }),
  createPanel: (
    projectId: number,
    input: Partial<Panel> & { episode_id: number },
  ) => apiClient.post<never, Panel>(`/dramas/${projectId}/panels`, input),
  updatePanel: (projectId: number, id: number, input: Partial<Panel>) =>
    apiClient.patch<never, Panel>(`/dramas/${projectId}/panels/${id}`, input),
  deletePanel: (projectId: number, id: number) =>
    apiClient.delete<never, { removed: boolean }>(
      `/dramas/${projectId}/panels/${id}`,
    ),
  panelReadiness: (projectId: number, id: number) =>
    apiClient.get<never, PanelReadiness>(
      `/dramas/${projectId}/panels/${id}/readiness`,
    ),
  confirmPanelReview: (projectId: number, id: number) =>
    apiClient.post<never, Panel>(
      `/dramas/${projectId}/panels/${id}/confirm-review`,
    ),
  assemblePanelRecipe: (projectId: number, id: number, input: Partial<Panel>) =>
    apiClient.post<never, Panel>(
      `/dramas/${projectId}/panels/${id}/assemble-recipe`,
      input,
    ),
  generatePanelImage: (
    projectId: number,
    id: number,
    input: GenerateMediaInput = {},
  ) =>
    apiClient.post<never, MediaGenerationHistory>(
      `/dramas/${projectId}/panels/${id}/generate-image`,
      input,
    ),
  uploadPanelImage: (projectId: number, id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<never, MediaGenerationHistory>(
      `/dramas/${projectId}/panels/${id}/upload-image`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },
  clearPanelImage: (projectId: number, id: number) =>
    apiClient.delete<never, { cleared: boolean; panel: Panel }>(
      `/dramas/${projectId}/panels/${id}/current-image`,
    ),
  panelHistory: (projectId: number, id: number) =>
    apiClient.get<never, { items: MediaGenerationHistory[] }>(
      `/dramas/${projectId}/panels/${id}/history`,
    ),
  savePanelCaptions: (
    projectId: number,
    id: number,
    captions: PanelCaption[],
  ) =>
    apiClient.put<never, { captions: PanelCaption[] }>(
      `/dramas/${projectId}/panels/${id}/captions`,
      { captions },
    ),
  panelTts: (
    projectId: number,
    id: number,
    input: { text: string; role?: string; style?: string },
  ) =>
    apiClient.post<never, PanelAudio>(
      `/dramas/${projectId}/panels/${id}/tts`,
      input,
    ),
  compose: (projectId: number, episodeId?: number) =>
    apiClient.get<never, PanelWorkspace>(`/dramas/${projectId}/compose`, {
      params: { episode_id: episodeId },
    }),
  ttsConfig: () => apiClient.get<never, TtsConfig>("/tts/config"),
  ttsProviders: () => apiClient.get<never, TtsProvider[]>("/tts/providers"),
  ttsOptions: (params?: {
    provider?: string;
    base_url?: string;
    api_key?: string;
  }) => apiClient.get<never, TtsOptions>("/tts/options", { params }),
  saveTtsConfig: (input: {
    provider: string;
    base_url: string;
    api_key: string;
    role?: string;
    style?: string;
  }) => apiClient.put<never, TtsConfig>("/tts/config", input),
  exportPage: (
    projectId: number,
    episodeId: number,
    template: "single" | "grid_2x2" | "vertical_4",
    panelIds?: number[],
  ) =>
    apiClient.post<never, PageExportResult>(
      `/dramas/${projectId}/episodes/${episodeId}/pages/export`,
      { template, panel_ids: panelIds },
    ),
  downloadPackage: (
    projectId: number,
    episodeId: number,
    template: "single" | "grid_2x2" | "vertical_4",
    panelIds?: number[],
  ) =>
    apiClient.get<never, Blob>(`/dramas/${projectId}/compose/package`, {
      params: {
        episode_id: episodeId,
        template,
        panel_ids: panelIds?.join(","),
      },
      responseType: "blob",
    }),
};
