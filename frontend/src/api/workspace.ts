import type {
  AssetKind,
  AssetOutputType,
  AssetTextProfile,
  Episode,
  ImageTextBanKind,
  Panel,
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
  items?: Panel[];
  panels?: Panel[];
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
      ban_image_text?: ImageTextBanKind | null;
    },
  ) =>
    apiClient.post<
      never,
      {
        output_type: AssetOutputType;
        reference_lock: ReferenceLockKind | null;
        ban_image_text: ImageTextBanKind | null;
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
  assemblePanelRecipe: (
    projectId: number,
    id: number,
    input: Partial<Panel> & { include_previous_panel?: boolean },
  ) =>
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
};
