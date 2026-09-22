import {
  BuildOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  HistoryOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SaveOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  Empty,
  Form,
  Image,
  Input,
  List,
  Popconfirm,
  Popover,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { aiConfigsApi } from "../../api/aiConfigs";
import { mediaHistoryApi, type MediaGenerationHistory } from "../../api/media";
import { uploadsApi } from "../../api/media";
import { workspaceApi, type PanelReadiness } from "../../api/workspace";
import { notifyAppError, notifyAppSuccess } from "../../errors/appError";
import {
  panelImageKey,
  useGenerationTracker,
} from "../generation/useGenerationTracker";
import { GenerationElapsedTime } from "../generation/GenerationElapsedTime";
import { modelCapabilitySummary } from "../providers/catalog";
import type {
  AssetKind,
  Panel,
  ProjectAsset,
  ProviderModel,
} from "../../types/domain";
import { mediaUrl } from "../../utils/mediaUrl";
import { useProjectWorkspace } from "./workspaceContext";

interface PanelFormValues extends Partial<Panel> {
  character_asset_ids?: number[];
  scene_asset_ids?: number[];
  prop_asset_ids?: number[];
  aspect_ratio?: string;
}

const assetLabels: Record<AssetKind, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

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
  const [checkedTrackIds, setCheckedTrackIds] = useState<number[]>([]);
  const [imageModel, setImageModel] = useState<ProviderModel>();
  const [imageModelLabel, setImageModelLabel] = useState("读取中…");
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [trackFilter, setTrackFilter] = useState<
    "all" | "missing" | "review" | "recipe"
  >("all");
  const [activeCollapse, setActiveCollapse] = useState([
    "spec",
    "assets",
    "recipe",
    "generation",
  ]);
  const tracker = useGenerationTracker(project.id);

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
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (trackFilter === "missing") return !item.image_url;
        if (trackFilter === "review") return item.image_needs_review;
        if (trackFilter === "recipe") return item.recipe_needs_reassembly;
        return true;
      }),
    [items, trackFilter],
  );

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
    form.setFieldsValue({
      ...selected,
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
      aspect_ratio: undefined,
    });
    void loadHistory(selected.id);
  }, [assets, form, loadHistory, selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(1);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    setHeaderTools(<ModelSummary model={imageModel} label={imageModelLabel} />);
    return () => setHeaderTools(null);
  }, [imageModel, imageModelLabel, setHeaderTools]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await workspaceApi.updatePanel(
        project.id,
        selected.id,
        panelPayload(form.getFieldsValue(true)),
      );
      await loadPanels();
      notifyAppSuccess(message, "分格规格已保存");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setSaving(false);
    }
  };

  const assembleRecipe = async () => {
    if (!selected || assembling) return;
    setAssembling(true);
    try {
      await workspaceApi.assemblePanelRecipe(
        project.id,
        selected.id,
        panelPayload(form.getFieldsValue(true)),
      );
      await loadPanels();
      notifyAppSuccess(message, "图片配方已按资产 ID 组装并保存");
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
      await workspaceApi.updatePanel(
        project.id,
        selected.id,
        panelPayload(form.getFieldsValue(true)),
      );
      const generation = await workspaceApi.generatePanelImage(
        project.id,
        selected.id,
        {
          provider: imageModel.provider,
          model: imageModel.id,
          aspect_ratio: aspectRatio,
        },
      );
      if (!generation.task_id) throw new Error("生成任务没有返回任务号");
      tracker.watch({
        key: panelImageKey(selected.id),
        taskId: generation.task_id,
        generationId: generation.id,
        kind: "image",
        label: selected.title || `分格 ${selected.panel_number}`,
        startedAt: generation.created_at,
      });
      notifyAppSuccess(message, "已提交底板生成任务");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  };

  const createPanel = async () => {
    try {
      const created = await workspaceApi.createPanel(project.id, {
        episode_id: episode.id,
      });
      await loadPanels();
      setSelectedId(created.id);
      notifyAppSuccess(message, "已新增分格");
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
        title: `${selected.title || `分格 ${selected.panel_number}`} - 副本`,
        image_url: undefined,
        current_image_generation_id: undefined,
        image_needs_review: false,
        recipe_needs_reassembly: true,
      });
      await loadPanels();
      setSelectedId(copy.id);
      notifyAppSuccess(message, "已复制分格规格，新的底板需要重新生成");
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
      notifyAppSuccess(message, "分格已删除，阅读序已重新整理");
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
      form.setFieldValue("extra_reference_images", [
        ...new Set([...current, uploaded.url]),
      ]);
      notifyAppSuccess(message, "参考图已加入当前分格配方");
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

  const confirmReview = async () => {
    if (!selected) return;
    try {
      await workspaceApi.confirmPanelReview(project.id, selected.id);
      await loadPanels();
      notifyAppSuccess(message, "底板已确认通过");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  };

  const toggleTrackCheck = (panelId: number) => {
    setCheckedTrackIds((current) =>
      current.includes(panelId)
        ? current.filter((id) => id !== panelId)
        : [...current, panelId],
    );
  };

  const checkVisibleTracks = () => {
    setCheckedTrackIds((current) => [
      ...new Set([...current, ...visibleItems.map((item) => item.id)]),
    ]);
  };

  const clearTrackChecks = () => setCheckedTrackIds([]);

  const confirmCheckedReviews = async () => {
    const reviewIds = checkedTrackIds.filter((id) =>
      items.some((item) => item.id === id && item.image_needs_review),
    );
    if (!reviewIds.length) {
      notifyAppError({ message, modal }, new Error("请先勾选待复核底板"));
      return;
    }
    try {
      await Promise.all(
        reviewIds.map((id) => workspaceApi.confirmPanelReview(project.id, id)),
      );
      clearTrackChecks();
      await loadPanels();
      notifyAppSuccess(message, `已确认 ${reviewIds.length} 张底板`);
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
  };

  const moveSelection = (offset: number) => {
    const next = items[selectedIndex + offset];
    if (next) setSelectedId(next.id);
  };

  const gateReason = !imageModel
    ? "请先在 AI 配置中选择图片模型"
    : !aspectOptions.length
      ? "当前模型未声明画幅，生成已禁用"
      : !aspectRatio
        ? "请手动选择当前模型声明的画幅"
        : selectedReadiness?.recipe.reason;

  return (
    <div className="panel-workbench">
        <PanelHeader
          episodeNumber={episode.episode_number}
          count={items.length}
          completed={items.filter((item) => Boolean(item.image_url)).length}
          missing={items.filter((item) => !item.image_url).length}
          review={items.filter((item) => item.image_needs_review).length}
          recipe={items.filter((item) => item.recipe_needs_reassembly).length}
        />
        <div className="panel-workbench-grid">
          <PanelTrack
          items={visibleItems}
          allItems={items}
          totalItems={items.length}
          filter={trackFilter}
          onFilterChange={setTrackFilter}
          checkedIds={checkedTrackIds}
          onToggleCheck={toggleTrackCheck}
          onCheckVisible={checkVisibleTracks}
          onClearChecks={clearTrackChecks}
          onConfirmChecked={() => void confirmCheckedReviews()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={() => void createPanel()}
        />
        <PanelPreview
          selected={selected}
          selectedIndex={selectedIndex}
          total={items.length}
          readiness={selected ? selectedReadiness : undefined}
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
          onToggleAsset={toggleAsset}
          onSave={() => void save()}
          onAssemble={() => void assembleRecipe()}
          onGenerate={() => void generateImage()}
          onUpload={uploadPanel}
          onUploadReference={uploadReference}
          onClear={() => void clearImage()}
          onSelectHistory={(item) => void selectHistory(item)}
          onConfirmReview={() => void confirmReview()}
          onDelete={() => void deletePanel()}
          onDuplicate={() => void duplicatePanel()}
          duplicating={duplicating}
        />
      </div>
    </div>
  );
}

function PanelHeader(props: {
  episodeNumber: number;
  count: number;
  completed: number;
  missing: number;
  review: number;
  recipe: number;
}) {
  return (
    <div className="workspace-section-heading director-heading">
      <div>
        <Typography.Title level={2}>分格台</Typography.Title>
        <Typography.Text type="secondary">
          话 {props.episodeNumber} · 逐格生产单张底板
        </Typography.Text>
      </div>
      <Space wrap>
        <Tag color="blue">
          {props.completed}/{props.count} 已有底板
        </Tag>
        <Tag color={props.missing ? "warning" : "success"}>
          {props.missing} 缺底板
        </Tag>
        <Tag color={props.review ? "gold" : "default"}>
          {props.review} 待复核
        </Tag>
        <Tag color={props.recipe ? "error" : "default"}>
          {props.recipe} 待重装
        </Tag>
      </Space>
    </div>
  );
}

function PanelTrack(props: {
  items: Panel[];
  allItems: Panel[];
  totalItems: number;
  filter: "all" | "missing" | "review" | "recipe";
  onFilterChange: (filter: "all" | "missing" | "review" | "recipe") => void;
  checkedIds: number[];
  onToggleCheck: (id: number) => void;
  onCheckVisible: () => void;
  onClearChecks: () => void;
  onConfirmChecked: () => void;
  selectedId?: number;
  onSelect: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <Card
      className="panel-track"
      title="分格轨道"
      extra={
        <Typography.Text type="secondary">
          {props.items.length}/{props.totalItems} 格 · 按阅读序排列
        </Typography.Text>
      }
    >
      <div className="panel-track-summary" role="tablist" aria-label="分格状态筛选">
        {(
          [
            ["all", `全部 ${props.totalItems}`],
            ["missing", `缺底板 ${props.allItems.filter((item) => !item.image_url).length}`],
            ["review", `待复核 ${props.allItems.filter((item) => item.image_needs_review).length}`],
            ["recipe", `待重装 ${props.allItems.filter((item) => item.recipe_needs_reassembly).length}`],
          ] as Array<[typeof props.filter, string]>
        ).map(([filter, label]) => (
          <Button
            key={filter}
            size="small"
            type={props.filter === filter ? "primary" : "text"}
            role="tab"
            aria-selected={props.filter === filter}
            onClick={() => props.onFilterChange(filter)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="panel-track-bulkbar">
        <Checkbox
          checked={props.items.length > 0 && props.items.every((item) => props.checkedIds.includes(item.id))}
          indeterminate={props.items.some((item) => props.checkedIds.includes(item.id)) && !props.items.every((item) => props.checkedIds.includes(item.id))}
          onChange={(event) => event.target.checked ? props.onCheckVisible() : props.onClearChecks()}
        >
          勾选当前轨道
        </Checkbox>
        <Space size={4} wrap>
          <Typography.Text type="secondary">已选 {props.checkedIds.length} 格</Typography.Text>
          <Button size="small" disabled={!props.checkedIds.length} onClick={props.onClearChecks}>
            清除选择
          </Button>
          <Button
            size="small"
            type="primary"
            disabled={!props.checkedIds.length}
            onClick={props.onConfirmChecked}
          >
            批量确认复核
          </Button>
        </Space>
      </div>
      {props.items.length ? (
        <>
          <div className="panel-track-list">
            {props.items.map((item) => (
              <div className="panel-track-row" key={item.id}>
                <Checkbox
                  checked={props.checkedIds.includes(item.id)}
                  onChange={() => props.onToggleCheck(item.id)}
                  aria-label={`勾选分格 ${item.panel_number}`}
                />
                <button
                  type="button"
                  className={`panel-track-item${item.id === props.selectedId ? " is-active" : ""}`}
                  onClick={() => props.onSelect(item.id)}
                >
                <div className="panel-track-thumb">
                  {item.image_url ? (
                    <img src={mediaUrl(item.image_url)} alt="" />
                  ) : (
                    <span>{item.panel_number}</span>
                  )}
                </div>
                <div className="panel-track-copy">
                  <strong>分格 {item.panel_number}</strong>
                  <small>{item.title || item.description || "未命名分格"}</small>
                  <span className="panel-track-tags">
                    {item.image_needs_review ? <Tag color="warning">待复核</Tag> : null}
                    {item.recipe_needs_reassembly ? <Tag color="error">待重装</Tag> : null}
                    {item.image_url ? <Tag color="success">有底板</Tag> : <Tag>缺底板</Tag>}
                  </span>
                </div>
                </button>
              </div>
            ))}
          </div>
          <div className="panel-track-add">
            <Button
              type="text"
              icon={<PlusOutlined />}
              aria-label="新增分格"
              title="新增分格"
              onClick={props.onCreate}
            />
          </div>
        </>
      ) : props.filter === "all" ? (
        <Empty description="还没有分格">
          <Button icon={<PlusOutlined />} onClick={props.onCreate}>
            新增第一格
          </Button>
        </Empty>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前筛选没有匹配分格"
        >
          <Button onClick={() => props.onFilterChange("all")}>显示全部</Button>
        </Empty>
      )}
    </Card>
  );
}

function PanelPreview(props: {
  selected?: Panel;
  selectedIndex: number;
  total: number;
  readiness?: PanelReadiness;
  historyCount: number;
  imageTrack?: { status: string; message?: string };
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <Card
      className="panel-preview"
      title={
        props.selected
          ? `分格 ${props.selected.panel_number} · 底板预览`
          : "底板预览"
      }
      extra={
        props.selected ? (
          <Space>
            <Tooltip title="上一格">
              <Button
                icon={<LeftOutlined />}
                disabled={props.selectedIndex <= 0}
                onClick={props.onPrevious}
              />
            </Tooltip>
            <Tooltip title="下一格">
              <Button
                icon={<RightOutlined />}
                disabled={
                  props.selectedIndex < 0 ||
                  props.selectedIndex >= props.total - 1
                }
                onClick={props.onNext}
              />
            </Tooltip>
          </Space>
        ) : null
      }
    >
      {props.selected?.image_url ? (
        <Image
          src={mediaUrl(props.selected.image_url)}
          alt={props.selected.title || "分格底板"}
          className="panel-preview-image"
          preview={{
            toolbarRender: (originalNode) => (
              <>
                {originalNode}
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  href={mediaUrl(props.selected?.image_url ?? "")}
                  download={`${props.selected?.title || `panel-${props.selected?.panel_number}`}-底板`}
                  aria-label="下载底板"
                  title="下载底板"
                />
              </>
            ),
          }}
        />
      ) : (
        <div className="panel-preview-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无底板" />
          <Typography.Text type="secondary">
            在右侧保存规格、组装配方后生成，或上传本地文件
          </Typography.Text>
        </div>
      )}
      {props.selected ? (
        <div className="panel-preview-meta" aria-label="底板状态摘要">
          <div>
            <span>取景</span>
            <strong>{props.selected.framing || "未填写"}</strong>
          </div>
          <div>
            <span>资产</span>
            <strong>{props.selected.project_asset_ids?.length ?? 0} 项</strong>
          </div>
          <div>
            <span>配方</span>
            <strong>
              {props.selected.recipe_needs_reassembly
                ? "待重装"
                : props.readiness?.recipe?.ready
                  ? "已就绪"
                  : "待检查"}
            </strong>
          </div>
          <div>
            <span>历史</span>
            <strong>{props.historyCount} 个版本</strong>
          </div>
        </div>
      ) : null}
      {props.imageTrack ? (
        <div className="panel-task-status">
          {props.imageTrack.status === "processing" ? (
            <Tag icon={<ReloadOutlined spin />} color="processing">
              {props.imageTrack.message || "生成中"}
            </Tag>
          ) : null}
          {props.imageTrack.status === "failed" ? (
            <Tag icon={<StopOutlined />} color="error">
              {props.imageTrack.message || "生成失败"}
            </Tag>
          ) : null}
          {props.imageTrack.status === "completed" ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              生成完成
            </Tag>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function PanelInspector(props: {
  form: ReturnType<typeof Form.useForm<PanelFormValues>>[0];
  selected?: Panel;
  assets: ProjectAsset[];
  selectedAssetIds: number[];
  activeCollapse: string[];
  setActiveCollapse: (keys: string[]) => void;
  saving: boolean;
  assembling: boolean;
  uploading: boolean;
  referenceUploading: boolean;
  imageModel?: ProviderModel;
  imageTrack?: {
    status: string;
    message?: string;
    startedAt?: string;
    finishedAt?: string;
    progress?: number;
  };
  aspectRatio?: string;
  aspectOptions: string[];
  gateReason?: string;
  imageBusy: boolean;
  readiness?: PanelReadiness;
  history: MediaGenerationHistory[];
  onToggleAsset: (kind: AssetKind, id: number) => void;
  onSave: () => void;
  onAssemble: () => void;
  onGenerate: () => void;
  onUpload: (file: File) => Promise<boolean>;
  onUploadReference: (file: File) => Promise<boolean>;
  onClear: () => void;
  onSelectHistory: (item: MediaGenerationHistory) => void;
  onConfirmReview: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
}) {
  return (
    <Card
      className="panel-inspector"
      title="分格检查器"
      extra={
        props.selected ? (
          <Popconfirm
            title="删除这一格？"
            description="会重新整理阅读序，历史媒体仍保留。"
            onConfirm={props.onDelete}
            okButtonProps={{ danger: true }}
          >
            <Button danger type="text" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        ) : null
      }
    >
      {props.selected ? (
        <Form
          form={props.form}
          layout="vertical"
          className="panel-inspector-form"
        >
          <Collapse
            activeKey={props.activeCollapse}
            onChange={(keys) => props.setActiveCollapse(keys as string[])}
            items={[
              {
                key: "spec",
                label: "漫画格规格",
                children: <PanelSpecFields />,
              },
              {
                key: "assets",
                label: `出场资产 (${props.selectedAssetIds.length})`,
                children: (
                  <AssetSelector
                    assets={props.assets}
                    selectedIds={props.selectedAssetIds}
                    onToggle={props.onToggleAsset}
                  />
                ),
              },
              {
                key: "recipe",
                label: "显式图片配方快照",
                children: (
                  <RecipeEditor
                    form={props.form}
                    model={props.imageModel}
                    onUploadReference={props.onUploadReference}
                    uploading={props.referenceUploading}
                  />
                ),
              },
              {
                key: "generation",
                label: "画幅、生成与归档",
                children: <GenerationControls {...props} />,
              },
            ]}
          />
          <PanelReadinessSummary readiness={props.readiness} />
          <div className="panel-inspector-actions">
            <Button
              icon={<SaveOutlined />}
              loading={props.saving}
              onClick={props.onSave}
            >
              保存规格
            </Button>
            <Button
              icon={<BuildOutlined />}
              loading={props.assembling}
              onClick={props.onAssemble}
            >
              组装图片配方
            </Button>
            <Button
              icon={<CopyOutlined />}
              loading={props.duplicating}
              onClick={props.onDuplicate}
            >
              复制分格
            </Button>
          </div>
          <HistoryList items={props.history} onSelect={props.onSelectHistory} />
        </Form>
      ) : (
        <Empty description="从左侧选择一个分格" />
      )}
    </Card>
  );
}

function PanelReadinessSummary(props: { readiness?: PanelReadiness }) {
  const image = props.readiness?.image;
  const recipe = props.readiness?.recipe;
  if (!props.readiness) {
    return <div className="panel-readiness-summary">正在读取当前分格门闸…</div>;
  }
  return (
    <div className="panel-readiness-summary" aria-label="当前分格门闸">
      <div className={recipe?.ready ? "is-ready" : "is-blocked"}>
        <strong>图片配方</strong>
        <span>{recipe?.ready ? "已就绪" : recipe?.reason || "需要重新组装"}</span>
      </div>
      <div className={image?.ready ? "is-ready" : "is-blocked"}>
        <strong>底板生成</strong>
        <span>{image?.ready ? "可生成" : image?.reason || "尚未满足条件"}</span>
      </div>
      <Typography.Text type="secondary">
        保存规格后再组装配方；门闸失败原因会保留在这里，不会静默禁用。
      </Typography.Text>
    </div>
  );
}

function PanelSpecFields() {
  return (
    <>
      <Form.Item name="title" label="标题">
        <Input placeholder="这一格落在哪个节拍" />
      </Form.Item>
      <Form.Item name="description" label="节拍说明">
        <Input.TextArea rows={3} placeholder="说明这一格在故事节拍中的落点" />
      </Form.Item>
      <Form.Item name="action" label="动作定格">
        <Input.TextArea rows={2} placeholder="写定格姿态，不写连续运镜" />
      </Form.Item>
      <Form.Item name="expression" label="表情">
        <Input.TextArea rows={2} placeholder="写脸部表情与情绪状态" />
      </Form.Item>
      <Form.Item name="image_prompt" label="图像提示词">
        <Input.TextArea rows={3} placeholder="写这一格的生图主干，留空则回退节拍说明或标题" />
      </Form.Item>
      <div className="panel-field-grid">
        {(
          [
            "framing",
            "viewpoint",
            "composition",
            "lighting",
            "mood",
          ] as const
        ).map((name) => (
          <Form.Item key={name} name={name} label={fieldLabel(name)}>
            <Input />
          </Form.Item>
        ))}
      </div>
    </>
  );
}

function AssetSelector(props: {
  assets: ProjectAsset[];
  selectedIds: number[];
  onToggle: (kind: AssetKind, id: number) => void;
}) {
  return (
    <div className="panel-asset-picks">
      {(["character", "scene", "prop"] as AssetKind[]).map((kind) => (
        <div key={kind} className="panel-asset-group">
          <Typography.Text type="secondary">
            {assetLabels[kind]}
          </Typography.Text>
          {props.assets
            .filter((asset) => asset.kind === kind)
            .map((asset) => (
              <Checkbox
                key={asset.id}
                checked={props.selectedIds.includes(asset.id)}
                onChange={() => props.onToggle(kind, asset.id)}
              >
                {asset.name}
                {asset.image_url ? " · 有标准图" : " · 待定妆"}
              </Checkbox>
            ))}
        </div>
      ))}
    </div>
  );
}

function RecipeEditor(props: {
  form: ReturnType<typeof Form.useForm<PanelFormValues>>[0];
  model?: ProviderModel;
  onUploadReference: (file: File) => Promise<boolean>;
  uploading: boolean;
}) {
  const references = Form.useWatch("extra_reference_images", props.form) ?? [];
  return (
    <div className="panel-recipe-editor">
      <Typography.Paragraph type="secondary">
        配方是这一格底板的可编辑最终快照。组装会按资产 ID
        带入标准图和文本，之后可以手工改写。
      </Typography.Paragraph>
      <Form.Item name="image_recipe_prompt" label="最终图片提示词">
        <Input.TextArea rows={7} />
      </Form.Item>
      <Form.Item name="image_recipe_references" label="已写入配方的参考图">
        <Select mode="tags" tokenSeparators={[","]} />
      </Form.Item>
      <RecipeReferences
        label="配方参考图预览"
        values={Form.useWatch("image_recipe_references", props.form) ?? []}
      />
      <ReferenceLimitNotice
        model={props.model}
        count={
          (Form.useWatch("image_recipe_references", props.form) ?? []).length
        }
      />
      <div className="panel-reference-toolbar">
        <Typography.Text type="secondary">
          额外参考图 {references.length} 张
        </Typography.Text>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            void props.onUploadReference(file);
            return false;
          }}
        >
          <Button
            size="small"
            icon={<CloudUploadOutlined />}
            loading={props.uploading}
          >
            上传参考图
          </Button>
        </Upload>
      </div>
      <div className="panel-reference-list">
        {references.map((reference: string) => (
          <div className="panel-reference-item" key={reference}>
            <Image
              src={mediaUrl(reference)}
              width={58}
              height={58}
              preview
              alt="额外参考图"
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              aria-label="移除额外参考图"
              onClick={() =>
                props.form.setFieldValue(
                  "extra_reference_images",
                  references.filter((item: string) => item !== reference),
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function GenerationControls(props: {
  form: ReturnType<typeof Form.useForm<PanelFormValues>>[0];
  aspectRatio?: string;
  aspectOptions: string[];
  gateReason?: string;
  imageBusy: boolean;
  uploading: boolean;
  onGenerate: () => void;
  onUpload: (file: File) => Promise<boolean>;
  onClear: () => void;
  onConfirmReview: () => void;
  selected?: Panel;
  imageTrack?: {
    status: string;
    message?: string;
    startedAt?: string;
    finishedAt?: string;
    progress?: number;
  };
}) {
  return (
    <div className="panel-generation-gate">
      <Typography.Text strong>手选当前图片模型画幅</Typography.Text>
      <Select
        value={props.aspectRatio}
        onChange={(value) => props.form?.setFieldValue?.("aspect_ratio", value)}
        placeholder="选择模型目录声明的画幅"
        options={props.aspectOptions.map((value) => ({ value, label: value }))}
        disabled={!props.aspectOptions.length}
      />
      <Typography.Text type={props.gateReason ? "warning" : "secondary"}>
        {props.gateReason || "规格和配方就绪"}
      </Typography.Text>
      {props.imageTrack ? (
        <GenerationElapsedTime
          startedAt={props.imageTrack.startedAt}
          finishedAt={props.imageTrack.finishedAt}
          active={
            props.imageTrack.status === "pending" ||
            props.imageTrack.status === "processing"
          }
          progress={props.imageTrack.progress}
          message={props.imageTrack.message}
        />
      ) : null}
      <Space className="panel-generation-actions" wrap>
        <Button
          type="primary"
          disabled={Boolean(props.gateReason || props.imageBusy)}
          onClick={props.onGenerate}
        >
          生成底板
        </Button>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            void props.onUpload(file);
            return false;
          }}
        >
          <Button icon={<CloudUploadOutlined />} loading={props.uploading}>
            上传底板
          </Button>
        </Upload>
        <Button
          icon={<DeleteOutlined />}
          disabled={!props.selected?.image_url}
          onClick={props.onClear}
        >
          清除当前
        </Button>
        <Button
          icon={<CheckCircleOutlined />}
          disabled={!props.selected?.image_needs_review}
          onClick={props.onConfirmReview}
        >
          确认复核
        </Button>
      </Space>
    </div>
  );
}

function RecipeReferences(props: { label: string; values: string[] }) {
  return (
    <div className="director-recipe-references panel-recipe-reference-preview">
      <div className="panel-reference-toolbar">
        <Typography.Text strong>{props.label}</Typography.Text>
        <Typography.Text type="secondary">
          {props.values.length} 张
        </Typography.Text>
      </div>
      {props.values.length ? (
        <div className="panel-reference-list">
          {props.values.map((value) => (
            <Image
              key={value}
              src={mediaUrl(value)}
              width={58}
              height={58}
              preview
              alt="配方参考图"
            />
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary">暂无参考图</Typography.Text>
      )}
    </div>
  );
}

function ReferenceLimitNotice(props: { model?: ProviderModel; count: number }) {
  if (!props.model)
    return (
      <Typography.Text type="secondary">
        请先在 AI 配置手选图片模型后核对参考图上限
      </Typography.Text>
    );
  const limit = props.model.capabilities.maxReferenceImages;
  if (limit === null)
    return (
      <Typography.Text type="secondary">
        当前模型参考图上限未知，提交时由供应商校验（已组装 {props.count} 张）
      </Typography.Text>
    );
  return (
    <Typography.Text type={props.count > limit ? "danger" : "secondary"}>
      当前模型最多 {limit} 张参考图，已组装 {props.count} 张
    </Typography.Text>
  );
}

function HistoryList(props: {
  items: MediaGenerationHistory[];
  onSelect: (item: MediaGenerationHistory) => void;
}) {
  return (
    <Collapse
      className="panel-history"
      items={[
        {
          key: "history",
          label: (
            <span>
              <HistoryOutlined /> 历史底板 ({props.items.length})
            </span>
          ),
          children: props.items.length ? (
            <List
              size="small"
              dataSource={props.items}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="select"
                      size="small"
                      disabled={!item.available}
                      onClick={() => props.onSelect(item)}
                    >
                      选用
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      item.image_url ? (
                        <Image
                          width={44}
                          height={44}
                          src={mediaUrl(item.image_url)}
                          preview
                          alt=""
                        />
                      ) : undefined
                    }
                    title={item.prompt}
                    description={`${item.status}${item.model ? ` · ${item.model}` : ""}`}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无生成历史"
            />
          ),
        },
      ]}
    />
  );
}

function ModelSummary(props: { model?: ProviderModel; label: string }) {
  return (
    <Popover
      trigger="click"
      content={
        <div className="workspace-model-details">
          <section>
            <span>当前图片模型</span>
            <strong>{props.label}</strong>
            <p>
              {props.model
                ? modelCapabilitySummary(props.model)
                : "请到 AI 配置手动选择图片预设"}
            </p>
          </section>
        </div>
      }
    >
      <button
        type="button"
        className="workspace-model-trigger"
        aria-label="查看当前图片模型能力"
      >
        <span>
          <small>底板图片模型</small>
          <strong>{props.label}</strong>
        </span>
        <DownOutlined />
      </button>
    </Popover>
  );
}

function panelPayload(values: PanelFormValues): Partial<Panel> {
  const {
    character_asset_ids,
    scene_asset_ids,
    prop_asset_ids,
    aspect_ratio: _aspect,
    captions: _captions,
    audio: _audio,
    ...rest
  } = values;
  return {
    ...rest,
    project_asset_ids: [
      ...(character_asset_ids ?? []),
      ...(scene_asset_ids ?? []),
      ...(prop_asset_ids ?? []),
    ],
  };
}

function filterAssetIds(
  ids: number[] | undefined,
  assets: ProjectAsset[],
  kind: AssetKind,
): number[] {
  return (ids ?? []).filter((id) =>
    assets.some((asset) => asset.id === id && asset.kind === kind),
  );
}

function fieldLabel(name: string): string {
  return (
    (
      {
        framing: "取景",
        viewpoint: "视角",
        composition: "构图",
        lighting: "光线",
        mood: "氛围",
      } as Record<string, string>
    )[name] ?? name
  );
}
