import { App, Form } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiConfigsApi } from "../../api/aiConfigs";
import { mediaHistoryApi, type MediaGenerationHistory } from "../../api/media";
import { uploadsApi } from "../../api/media";
import { workspaceApi, type PanelReadiness } from "../../api/workspace";
import { notifyAppError, notifyAppSuccess } from "../../errors/appError";
import {
  panelImageKey,
  useGenerationTracker,
} from "../generation/useGenerationTracker";
import { useAnnounceGenerationOutcomes } from "../generation/useAnnounceGenerationOutcomes";
import type {
  AssetKind,
  Panel,
  ProjectAsset,
  ProviderModel,
} from "../../types/domain";
import { useProjectWorkspace } from "./workspaceContext";
import { useDebouncedAutoSave } from "./useDebouncedAutoSave";
import { PanelHeader, PanelTrack } from "./panels/PanelTrack";
import { PanelPreview } from "./panels/PanelPreview";
import { ModelSummary, PanelInspector } from "./panels/PanelInspector";
import {
  filterAssetIds,
  panelPayload,
  type PanelFormValues,
} from "./panels/panelForm";

export function PanelWorkspace() {
  const { message, modal } = App.useApp();
  const { project, episode, setHeaderTools } = useProjectWorkspace();
  const [form] = Form.useForm<PanelFormValues>();
  const [items, setItems] = useState<Panel[]>([]);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [readiness, setReadiness] = useState<Record<number, PanelReadiness>>(
    {},
  );
  const [history, setHistory] = useState<
    Record<number, MediaGenerationHistory[]>
  >({});
  const [selectedId, setSelectedId] = useState<number>();
  const [imageModel, setImageModel] = useState<ProviderModel>();
  const [imageModelLabel, setImageModelLabel] = useState("读取中…");
  const [duplicating, setDuplicating] = useState(false);
  const hydratingPanel = useRef(false);
  const skipPanelHydrate = useRef(false);
  const [assembling, setAssembling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [activeCollapse, setActiveCollapse] = useState([
    "spec",
    "assets",
    "recipe",
    "generation",
  ]);
  const tracker = useGenerationTracker(project.id);
  useAnnounceGenerationOutcomes(tracker.tracks);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId],
  );
  const selectedIndex = selected
    ? items.findIndex((item) => item.id === selected.id)
    : -1;
  const selectedReadiness = selected ? readiness[selected.id] : undefined;
  const imageTrack = selected
    ? tracker.get(panelImageKey(selected.id))
    : undefined;
  const imageBusy =
    imageTrack?.status === "pending" || imageTrack?.status === "processing";
  const aspectRatio = Form.useWatch("aspect_ratio", form);
  const aspectOptions = imageModel?.capabilities.aspectRatios ?? [];
  const characterAssetIds = Form.useWatch("character_asset_ids", {
    form,
    preserve: true,
  }) ?? [];
  const sceneAssetIds = Form.useWatch("scene_asset_ids", {
    form,
    preserve: true,
  }) ?? [];
  const propAssetIds = Form.useWatch("prop_asset_ids", {
    form,
    preserve: true,
  }) ?? [];
  const selectedAssetIds = [
    ...characterAssetIds,
    ...sceneAssetIds,
    ...propAssetIds,
  ];

  const loadPanels = useCallback(async () => {
    try {
      const [panelResult, assetResult] = await Promise.all([
        workspaceApi.panels(project.id, episode.id),
        workspaceApi.assets(project.id),
      ]);
      setItems(panelResult.items ?? []);
      setAssets(assetResult.items);
      setSelectedId((current) =>
        panelResult.items?.some((item) => item.id === current)
          ? current
          : panelResult.items?.[0]?.id,
      );
      const states = await Promise.all(
        (panelResult.items ?? []).map(async (panel) => {
          const state = await workspaceApi.panelReadiness(project.id, panel.id);
          return [panel.id, state] as const;
        }),
      );
      setReadiness(Object.fromEntries(states));
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  }, [episode.id, message, modal, project.id]);

  const loadHistory = useCallback(
    async (panelId: number) => {
      try {
        const result = await workspaceApi.panelHistory(project.id, panelId);
        setHistory((current) => ({ ...current, [panelId]: result.items }));
      } catch {
        setHistory((current) => ({ ...current, [panelId]: [] }));
      }
    },
    [project.id],
  );

  useEffect(() => {
    void loadPanels();
  }, [loadPanels]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      aiConfigsApi.models({ service_type: "image" }),
      aiConfigsApi.modelPresets(),
    ])
      .then(([models, presets]) => {
        if (!active) return;
        const preset = presets.image;
        const model = preset
          ? models.find(
              (entry) =>
                entry.provider === preset.provider && entry.id === preset.model,
            )
          : undefined;
        setImageModel(model);
        setImageModelLabel(
          model ? `${model.provider} / ${model.id}` : "未选择图片模型",
        );
      })
      .catch((reason) => {
        if (!active) return;
        setImageModel(undefined);
        setImageModelLabel("未读取到图片预设");
        notifyAppError({ message, modal }, reason);
      });
    return () => {
      active = false;
    };
  }, [message, modal]);

  useEffect(() => {
    if (!selected) {
      form.resetFields();
      return;
    }
    if (skipPanelHydrate.current) {
      skipPanelHydrate.current = false;
      return;
    }
    hydratingPanel.current = true;
    form.setFieldsValue({
      ...selected,
      action:
        selected.action ||
        selected.description ||
        selected.image_prompt ||
        "",
      character_asset_ids: filterAssetIds(
        selected.project_asset_ids,
        assets,
        "character",
      ),
      scene_asset_ids: filterAssetIds(
        selected.project_asset_ids,
        assets,
        "scene",
      ),
      prop_asset_ids: filterAssetIds(
        selected.project_asset_ids,
        assets,
        "prop",
      ),
      aspect_ratio: null,
      include_previous_panel: true,
    });
    hydratingPanel.current = false;
    void loadHistory(selected.id);
  }, [assets, form, loadHistory, selected]);

  const save = useCallback(async () => {
    if (!selected) return;
    try {
      const updated = await workspaceApi.updatePanel(
        project.id,
        selected.id,
        panelPayload(form.getFieldsValue(true)),
      );
      skipPanelHydrate.current = true;
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      const ready = await workspaceApi.panelReadiness(project.id, updated.id);
      setReadiness((current) => ({ ...current, [updated.id]: ready }));
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
      throw reason;
    }
  }, [form, message, modal, project.id, selected]);

  const {
    status: autoSaveStatus,
    schedule,
    flush,
    reset,
    saving,
  } = useDebouncedAutoSave(save, { enabled: Boolean(selected) });

  useEffect(() => {
    reset();
  }, [reset, selected?.id]);

  const selectPanel = useCallback(
    (id: number | undefined) => {
      if (id === selectedId) return;
      void flush()
        .catch(() => undefined)
        .finally(() => setSelectedId(id));
    },
    [flush, selectedId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush().catch(() => undefined);
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    setHeaderTools(<ModelSummary model={imageModel} label={imageModelLabel} />);
    return () => setHeaderTools(null);
  }, [imageModel, imageModelLabel, setHeaderTools]);

  const assembleRecipe = async () => {
    if (!selected || assembling) return;
    setAssembling(true);
    try {
      await flush().catch(() => undefined);
      const values = form.getFieldsValue(true) as PanelFormValues;
      await workspaceApi.assemblePanelRecipe(project.id, selected.id, {
        ...panelPayload(values),
        include_previous_panel: Boolean(values.include_previous_panel),
      });
      await loadPanels();
      notifyAppSuccess(message, "图片配方已组装并保存");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setAssembling(false);
    }
  };

  const generateImage = async () => {
    if (!selected) return;
    if (!imageModel) {
      notifyAppError(
        { message, modal },
        new Error("请先在 AI 配置中选择图片模型"),
      );
      return;
    }
    if (!aspectOptions.length) {
      notifyAppError(
        { message, modal },
        new Error("当前图片模型没有声明可选画幅"),
      );
      return;
    }
    if (!aspectRatio) {
      notifyAppError({ message, modal }, new Error("请手动选择画幅后再生成"));
      return;
    }
    try {
      await flush().catch(() => undefined);
      const values = form.getFieldsValue(true) as PanelFormValues;
      const generation = await workspaceApi.generatePanelImage(
        project.id,
        selected.id,
        {
          ...panelPayload(values),
          include_previous_panel: Boolean(values.include_previous_panel),
          provider: imageModel.provider,
          model: imageModel.id,
          aspect_ratio: aspectRatio,
        },
      );
      if (!generation.task_id) throw new Error("生成任务没有返回任务号");
      await loadPanels();
      tracker.watch({
        key: panelImageKey(selected.id),
        taskId: generation.task_id,
        generationId: generation.id,
        kind: "image",
        label: selected.title || `分镜 ${selected.panel_number}`,
        startedAt: generation.created_at,
      });
      notifyAppSuccess(message, "已提交底板生成任务");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  };

  const createPanel = async () => {
    try {
      await flush().catch(() => undefined);
      const created = await workspaceApi.createPanel(project.id, {
        episode_id: episode.id,
      });
      await loadPanels();
      setSelectedId(created.id);
      notifyAppSuccess(message, "已新增分镜");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  };

  const duplicatePanel = async () => {
    if (!selected || duplicating) return;
    setDuplicating(true);
    try {
      const copy = await workspaceApi.createPanel(project.id, {
        ...panelPayload(form.getFieldsValue(true)),
        episode_id: episode.id,
        title: `${selected.title || `分镜 ${selected.panel_number}`} - 副本`,
        image_url: undefined,
        current_image_generation_id: undefined,
        image_needs_review: false,
        recipe_needs_reassembly: true,
      });
      await loadPanels();
      setSelectedId(copy.id);
      notifyAppSuccess(message, "已复制分镜规格，新的底板需要重新生成");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setDuplicating(false);
    }
  };

  const deletePanel = async () => {
    if (!selected) return;
    try {
      await workspaceApi.deletePanel(project.id, selected.id);
      await loadPanels();
      notifyAppSuccess(message, "分镜已删除，阅读序已重新整理");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  };

  const uploadPanel = async (file: File) => {
    if (!selected) return false;
    setUploading(true);
    try {
      await workspaceApi.uploadPanelImage(project.id, selected.id, file);
      await loadPanels();
      notifyAppSuccess(message, "底板已上传并归档");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const uploadReference = async (file: File) => {
    setReferenceUploading(true);
    try {
      const uploaded = await uploadsApi.image(file, project.id);
      const current = form.getFieldValue("extra_reference_images") ?? [];
      const next = [...new Set([...current, uploaded.url])];
      form.setFieldsValue({ extra_reference_images: next });
      schedule();
      notifyAppSuccess(message, "额外参考图已加入，下次组装会并入配方");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setReferenceUploading(false);
    }
    return false;
  };

  const clearImage = async () => {
    if (!selected) return;
    try {
      await workspaceApi.clearPanelImage(project.id, selected.id);
      await loadPanels();
      notifyAppSuccess(message, "当前底板已清除，历史记录仍保留");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  };

  const selectHistory = async (generation: MediaGenerationHistory) => {
    try {
      await mediaHistoryApi.selectImage(generation.id);
      await loadPanels();
      if (selected) await loadHistory(selected.id);
      notifyAppSuccess(message, "已选用历史底板");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  };

  const toggleAsset = (kind: AssetKind, id: number) => {
    const field = `${kind}_asset_ids` as
      | "character_asset_ids"
      | "scene_asset_ids"
      | "prop_asset_ids";
    const current = form.getFieldValue(field) ?? [];
    form.setFieldValue(
      field,
      current.includes(id)
        ? current.filter((item: number) => item !== id)
        : [...current, id],
    );
    if (!hydratingPanel.current) schedule();
  };

  const moveSelection = (offset: number) => {
    const next = items[selectedIndex + offset];
    if (next) selectPanel(next.id);
  };

  const gateReason = !imageModel
    ? "请先在 AI 配置中选择图片模型"
    : !aspectOptions.length
      ? "当前模型未声明画幅，生成已禁用"
      : !aspectRatio
        ? "请手动选择当前模型声明的画幅"
        : undefined;

  return (
    <div className="panel-workbench">
      <PanelHeader
        episodeNumber={episode.episode_number}
        count={items.length}
      />
      <div className="panel-workbench-grid">
        <PanelTrack
          items={items}
          selectedId={selectedId}
          onSelect={selectPanel}
          onCreate={() => void createPanel()}
        />
        <PanelPreview
          selected={selected}
          selectedIndex={selectedIndex}
          total={items.length}
          historyCount={selected ? (history[selected.id] ?? []).length : 0}
          imageTrack={imageTrack}
          onPrevious={() => moveSelection(-1)}
          onNext={() => moveSelection(1)}
        />
        <PanelInspector
          form={form}
          selected={selected}
          assets={assets}
          selectedAssetIds={selectedAssetIds}
          activeCollapse={activeCollapse}
          setActiveCollapse={setActiveCollapse}
          autoSaveStatus={autoSaveStatus}
          saving={saving}
          assembling={assembling}
          uploading={uploading}
          referenceUploading={referenceUploading}
          imageModel={imageModel}
          imageTrack={imageTrack}
          aspectRatio={aspectRatio}
          aspectOptions={aspectOptions}
          gateReason={gateReason}
          imageBusy={imageBusy}
          readiness={selectedReadiness}
          history={selected ? (history[selected.id] ?? []) : []}
          onValuesChange={(changed) => {
            if (
              !hydratingPanel.current &&
              !("aspect_ratio" in changed && Object.keys(changed).length === 1)
            ) {
              schedule();
            }
          }}
          onToggleAsset={toggleAsset}
          onAssemble={() => void assembleRecipe()}
          onGenerate={() => void generateImage()}
          onStop={() => {
            if (!selected) return;
            void tracker.cancel(panelImageKey(selected.id));
          }}
          onUpload={uploadPanel}
          onUploadReference={uploadReference}
          onClear={() => void clearImage()}
          onSelectHistory={(item) => void selectHistory(item)}
          onDelete={() => void deletePanel()}
          onDuplicate={() => void duplicatePanel()}
          duplicating={duplicating}
        />
      </div>
    </div>
  );
}
