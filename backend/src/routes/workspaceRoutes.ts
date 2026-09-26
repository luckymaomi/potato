import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { NotFoundError, ValidationError } from "../errors";
import { created, success } from "../response";
import type { ServiceContainer } from "../services/container";
import { assembleAssetOutputPrompt, normalizeBanImageText, normalizeReferenceLock } from "../services/assetOutputPromptAssembler";
import { assemblePanelRecipe } from "../services/storyboardPromptAssembler";
import {
  normalizeOutputType,
  normalizeStringArray,
  normalizeTextProfile,
} from "../services/assetRepository";
import { assembleScriptScenes } from "../services/scriptAssembler";
import type { AppConfig } from "../types/core";
import type { AssetKind, EpisodeRow, PanelRow } from "../types/domain";
import { asyncRoute, bodyRecord, idParam } from "./http";

type WorkspaceServices = Pick<
  ServiceContainer,
  "projects" | "assets" | "images"
>;

export function workspaceRoutes(
  services: WorkspaceServices,
  config: AppConfig,
): Router {
  const router = Router();
  const upload = createImageUpload(config);

  registerScriptRoutes(router, services);
  registerAssetRoutes(router, services, upload);
  registerPanelRoutes(router, services, upload);
  return router;
}

function registerScriptRoutes(
  router: Router,
  services: WorkspaceServices,
): void {
  router.get("/dramas/:id/script", (req, res) => {
    const project = services.projects.require(idParam(req));
    const episode = selectEpisode(project.episodes ?? [], req.query.episode_id);
    success(res, {
      overview: overview(project),
      episode,
      episodes: project.episodes ?? [],
    });
  });

  router.put("/dramas/:id/script", (req, res) => {
    const projectId = idParam(req);
    const project = services.projects.require(projectId);
    const body = bodyRecord(req);
    const episode = selectEpisode(project.episodes ?? [], body.episode_id);
    const story = record(body.overview);
    services.projects.update(projectId, {
      story_hook: text(story.story_hook) ?? "",
      worldview: text(story.worldview) ?? "",
      storyline: text(story.storyline) ?? "",
      tone: text(story.tone) ?? "",
      reference_setting: text(story.reference_setting) ?? "",
    });
    const episodes = services.projects.saveEpisodes(projectId, [
      {
        ...episode,
        script_content: text(body.script_content) ?? "",
        ...record(body.episode_plan),
      },
    ]);
    success(res, {
      overview: overview(services.projects.require(projectId)),
      episode: episodes.find((item) => item.id === episode.id) ?? episode,
      episodes,
    });
  });

  router.post("/dramas/:id/script/assemble", (req, res) => {
    services.projects.require(idParam(req));
    const scenes = bodyRecord(req).scenes;
    success(res, {
      script_content: assembleScriptScenes(Array.isArray(scenes) ? scenes : []),
    });
  });
}

function registerAssetRoutes(
  router: Router,
  services: WorkspaceServices,
  upload: multer.Multer,
): void {
  router.get("/dramas/:id/assets", (req, res) => {
    success(res, {
      items: services.assets.listProjectAssets(
        idParam(req),
        assetKindQuery(req.query.kind),
      ),
    });
  });

  router.post("/dramas/:id/assets", (req, res) => {
    created(res, services.assets.createProjectAsset(idParam(req), req.body));
  });

  router.patch("/dramas/:id/assets/:assetId", (req, res) => {
    const asset = requireAsset(
      services,
      idParam(req),
      positive(req.params.assetId),
    );
    success(res, services.assets.updateProjectAsset(asset.id, req.body));
  });

  router.delete("/dramas/:id/assets/:assetId", (req, res) => {
    const asset = requireAsset(
      services,
      idParam(req),
      positive(req.params.assetId),
    );
    success(res, { removed: services.assets.deleteProjectAsset(asset.id) });
  });

  router.post("/dramas/:id/assets/assemble-output-prompt", (req, res) => {
    const body = bodyRecord(req);
    const kind = requiredKind(body.kind);
    const outputType = normalizeOutputType(kind, body.output_type);
    const referenceLock = normalizeReferenceLock(kind, body.reference_lock);
    const banImageText = normalizeBanImageText(body.ban_image_text);
    const outputPrompt = assembleAssetOutputPrompt({
      kind,
      name: text(body.name) || "未命名资产",
      text_profile: normalizeTextProfile(kind, body.text_profile),
      output_type: outputType,
      reference_lock: referenceLock,
      ban_image_text: banImageText,
    });
    success(res, {
      output_type: outputType,
      reference_lock: referenceLock,
      ban_image_text: banImageText,
      output_prompt: outputPrompt,
    });
  });

  router.post("/dramas/:id/assets/:assetId/generate-image", (req, res) => {
    const projectId = idParam(req);
    const asset = requireAsset(
      services,
      projectId,
      positive(req.params.assetId),
    );
    if (!asset.output_prompt.trim())
      throw new ValidationError("请先组装并保存最终生成提示词");
    const body = bodyRecord(req);
    created(
      res,
      services.images.create({
        dramaId: projectId,
        projectAssetId: asset.id,
        prompt: asset.output_prompt,
        provider: text(body.provider),
        model: text(body.model),
        aspectRatio: text(body.aspect_ratio),
        referenceImages: asset.input_reference_images,
      }),
    );
  });

  router.post(
    "/dramas/:id/assets/:assetId/upload-image",
    upload.single("file"),
    asyncRoute(async (req, res) => {
      const projectId = idParam(req);
      const asset = requireAsset(
        services,
        projectId,
        positive(req.params.assetId),
      );
      if (!req.file) throw new ValidationError("请选择图片");
      try {
        created(
          res,
          await services.images.importLocal({
            dramaId: projectId,
            projectAssetId: asset.id,
            sourcePath: req.file.path,
            prompt: "人工上传定妆资产图",
          }),
        );
      } finally {
        await fs.promises.rm(req.file.path, { force: true });
      }
    }),
  );
}

function registerPanelRoutes(
  router: Router,
  services: WorkspaceServices,
  upload: multer.Multer,
): void {
  router.get("/dramas/:id/panels", (req, res) => {
    const project = services.projects.require(idParam(req));
    const episode = selectEpisode(project.episodes ?? [], req.query.episode_id);
    success(res, {
      episode,
      items: services.assets.listPanels(episode.id),
    });
  });

  router.post("/dramas/:id/panels", (req, res) => {
    const projectId = idParam(req);
    const body = bodyRecord(req);
    const episode = selectEpisode(
      services.projects.require(projectId).episodes ?? [],
      body.episode_id,
    );
    created(
      res,
      services.assets.createPanel({ ...body, episode_id: episode.id }),
    );
  });

  router.put("/dramas/:id/panels", (req, res) => {
    const projectId = idParam(req);
    const body = bodyRecord(req);
    const episode = selectEpisode(
      services.projects.require(projectId).episodes ?? [],
      body.episode_id,
    );
    const panels = Array.isArray(body.panels) ? body.panels : [];
    success(res, { items: services.assets.syncPanels(episode.id, panels) });
  });

  router.patch("/dramas/:id/panels/:panelId", (req, res) => {
    const panel = requirePanel(
      services,
      idParam(req),
      positive(req.params.panelId),
    );
    success(res, services.assets.updatePanel(panel.id, req.body));
  });

  router.delete("/dramas/:id/panels/:panelId", (req, res) => {
    const panel = requirePanel(
      services,
      idParam(req),
      positive(req.params.panelId),
    );
    success(res, { removed: services.assets.deletePanel(panel.id) });
  });

  router.post("/dramas/:id/panels/:panelId/assemble-recipe", (req, res) => {
    const projectId = idParam(req);
    const panel = requirePanel(
      services,
      projectId,
      positive(req.params.panelId),
    );
    const body = bodyRecord(req);
    const updated = services.assets.updatePanel(
      panel.id,
      panelFieldsFromBody(body),
    );
    success(res, saveAssembledPanelRecipe(services, projectId, updated));
  });

  router.get("/dramas/:id/panels/:panelId/readiness", (req, res) => {
    const panel = requirePanel(
      services,
      idParam(req),
      positive(req.params.panelId),
    );
    const imageReason = !panel.image_url ? "尚未生成或上传底板" : undefined;
    success(res, {
      recipe: { ready: true },
      image: {
        ready: !imageReason,
        ...(imageReason ? { reason: imageReason } : {}),
      },
    });
  });

  router.post("/dramas/:id/panels/:panelId/generate-image", (req, res) => {
    const projectId = idParam(req);
    let panel = requirePanel(
      services,
      projectId,
      positive(req.params.panelId),
    );
    const body = bodyRecord(req);
    const fields = panelFieldsFromBody(body);
    if (Object.keys(fields).length > 0) {
      panel = services.assets.updatePanel(panel.id, fields);
    }
    if (panel.recipe_needs_reassembly || !panel.image_recipe_prompt.trim()) {
      panel = saveAssembledPanelRecipe(services, projectId, panel);
    }
    created(
      res,
      services.images.create({
        dramaId: projectId,
        panelId: panel.id,
        prompt: panel.image_recipe_prompt,
        provider: text(body.provider),
        model: text(body.model),
        aspectRatio: text(body.aspect_ratio),
        referenceImages: panel.image_recipe_references,
      }),
    );
  });

  router.post(
    "/dramas/:id/panels/:panelId/upload-image",
    upload.single("file"),
    asyncRoute(async (req, res) => {
      const projectId = idParam(req);
      const panel = requirePanel(
        services,
        projectId,
        positive(req.params.panelId),
      );
      if (!req.file) throw new ValidationError("请选择图片");
      try {
        created(
          res,
          await services.images.importLocal({
            dramaId: projectId,
            panelId: panel.id,
            sourcePath: req.file.path,
            prompt: "人工上传分镜底板",
          }),
        );
      } finally {
        await fs.promises.rm(req.file.path, { force: true });
      }
    }),
  );

  router.delete("/dramas/:id/panels/:panelId/current-image", (req, res) => {
    const panel = requirePanel(
      services,
      idParam(req),
      positive(req.params.panelId),
    );
    services.images.clearPanelImage(panel.id);
    success(res, { cleared: true, panel: services.assets.getPanel(panel.id) });
  });

  router.get("/dramas/:id/panels/:panelId/history", (req, res) => {
    const projectId = idParam(req);
    const panel = requirePanel(
      services,
      projectId,
      positive(req.params.panelId),
    );
    success(res, {
      items: services.images
        .list(projectId)
        .filter((item) => item.panel_id === panel.id),
    });
  });
}

function createImageUpload(config: AppConfig): multer.Multer {
  const uploadDir = path.join(
    path.resolve(config.storage?.local_path ?? "./data/storage"),
    "uploads",
  );
  fs.mkdirSync(uploadDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) =>
        cb(null, `${randomUUID()}${imageExt(file)}`),
    }),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
      cb(null, /^image\/(?:jpeg|png|gif|webp)$/u.test(file.mimetype)),
  });
}

function selectEpisode(episodes: EpisodeRow[], raw: unknown): EpisodeRow {
  const id = Number(raw);
  const episode =
    Number.isInteger(id) && id > 0
      ? episodes.find((item) => item.id === id)
      : episodes[0];
  if (!episode) throw new NotFoundError("话不存在");
  return episode;
}

function overview(project: {
  story_hook: string;
  worldview: string;
  storyline: string;
  tone: string;
  reference_setting: string;
}) {
  return {
    story_hook: project.story_hook ?? "",
    worldview: project.worldview ?? "",
    storyline: project.storyline ?? "",
    tone: project.tone ?? "",
    reference_setting: project.reference_setting ?? "",
  };
}

function requireAsset(
  services: Pick<ServiceContainer, "assets">,
  projectId: number,
  id: number,
) {
  const asset = services.assets.getProjectAsset(id);
  if (!asset || asset.drama_id !== projectId)
    throw new NotFoundError("项目资产不存在");
  return asset;
}

function requirePanel(
  services: Pick<ServiceContainer, "assets">,
  projectId: number,
  id: number,
): PanelRow {
  const panel = services.assets.getPanel(id);
  const episode = panel ? services.assets.episode(panel.episode_id) : undefined;
  if (!panel || !episode || episode.drama_id !== projectId)
    throw new NotFoundError("分镜不存在");
  return panel;
}

const GENERATION_BODY_KEYS = new Set([
  "provider",
  "model",
  "aspect_ratio",
  "recipe_reassembled",
]);

function panelFieldsFromBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !GENERATION_BODY_KEYS.has(key)),
  );
}

function saveAssembledPanelRecipe(
  services: WorkspaceServices,
  projectId: number,
  panel: PanelRow,
): PanelRow {
  const recipe = assemblePanelRecipe({
    shot: panel,
    assets: services.assets.listProjectAssets(projectId),
  });
  return services.assets.updatePanel(panel.id, {
    image_recipe_prompt: recipe.panelRecipe.prompt,
    image_recipe_references: recipe.panelRecipe.references,
    recipe_reassembled: true,
  });
}

function assetKindQuery(value: unknown): AssetKind | undefined {
  return value === undefined ? undefined : requiredKind(value);
}
function requiredKind(value: unknown): AssetKind {
  if (value === "character" || value === "scene" || value === "prop")
    return value;
  throw new ValidationError("资产类型无效");
}
function positive(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new ValidationError("ID 无效");
  return n;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function imageExt(file: Express.Multer.File): string {
  return (
    (
      {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
      } as Record<string, string>
    )[file.mimetype] ?? ".png"
  );
}
