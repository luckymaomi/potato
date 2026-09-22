import {
  AudioOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExportOutlined,
  HolderOutlined,
  LayoutOutlined,
  PlusOutlined,
  SaveOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Select,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workspaceApi, type PageExportResult } from "../../api/workspace";
import { notifyAppError, notifyAppSuccess } from "../../errors/appError";
import type { Panel, PanelAudio, PanelCaption } from "../../types/domain";
import { mediaUrl } from "../../utils/mediaUrl";
import { useProjectWorkspace } from "./workspaceContext";

type Template = "single" | "grid_2x2" | "vertical_4";
type EditableCaption = Omit<
  PanelCaption,
  "id" | "panel_id" | "created_at" | "updated_at"
> & { id?: number; panel_id?: number };
const slotCount: Record<Template, number> = {
  single: 1,
  grid_2x2: 4,
  vertical_4: 4,
};

export function ComposeWorkspace() {
  const { message, modal } = App.useApp();
  const { project, episode, setHeaderTools } = useProjectWorkspace();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [template, setTemplate] = useState<Template>("grid_2x2");
  const [slots, setSlots] = useState<Array<number | undefined>>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [captions, setCaptions] = useState<Record<number, EditableCaption[]>>(
    {},
  );
  const [audio, setAudio] = useState<Record<number, PanelAudio | null>>({});
  const [savingCaptions, setSavingCaptions] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [exportResult, setExportResult] = useState<PageExportResult>();
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [dragging, setDragging] = useState<number>();
  const canvasRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await workspaceApi.compose(project.id, episode.id);
      const nextPanels = result.panels ?? result.items ?? [];
      setPanels(nextPanels);
      setCaptions(
        Object.fromEntries(
          nextPanels.map((panel) => [
            panel.id,
            (panel.captions ?? []).map(toEditableCaption),
          ]),
        ),
      );
      setAudio(
        Object.fromEntries(
          nextPanels.map((panel) => [panel.id, panel.audio ?? null]),
        ),
      );
      setSelectedId((current) =>
        current && nextPanels.some((panel) => panel.id === current)
          ? current
          : nextPanels.find((panel) => panel.image_url)?.id,
      );
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    }
  }, [episode.id, message, modal, project.id]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSlots((current) =>
      Array.from({ length: slotCount[template] }, (_, index) => current[index]),
    );
    setExportResult(undefined);
  }, [template]);
  useEffect(() => {
    setHeaderTools(<Tag color="gold">页组装：拼页 → 气泡 → 配音 → 导出</Tag>);
    return () => setHeaderTools(null);
  }, [setHeaderTools]);

  const availablePanels = useMemo(
    () => panels.filter((panel) => Boolean(panel.image_url)),
    [panels],
  );
  const slotPanels = useMemo(
    () => slots.map((id) => panels.find((panel) => panel.id === id)),
    [panels, slots],
  );
  const complete = slots.length === slotCount[template] && slots.every(Boolean);
  const selected = selectedId
    ? panels.find((panel) => panel.id === selectedId)
    : undefined;
  const selectedCaptions = selected ? (captions[selected.id] ?? []) : [];
  const selectedAudio = selected ? audio[selected.id] : undefined;
  const ratioValues = slotPanels
    .filter((panel): panel is Panel => Boolean(panel))
    .map((panel) => ratios[panel.id])
    .filter((value): value is number => Boolean(value));
  const ratioMismatch =
    ratioValues.length > 1 &&
    ratioValues.some((value) => Math.abs(value - ratioValues[0]) > 0.01);
  const missingCount = slots.filter((slot) => !slot).length;

  const assignPanel = (panelId: number) => {
    setSelectedId(panelId);
    setSlots((current) => {
      if (current.includes(panelId)) return current;
      const next = [...current];
      const empty = next.findIndex((value) => !value);
      if (empty >= 0) next[empty] = panelId;
      return next;
    });
  };
  const updateSlot = (index: number, panelId?: number) => {
    setSlots((current) => {
      const next = [...current];
      if (
        panelId &&
        next.some(
          (value, slotIndex) => value === panelId && slotIndex !== index,
        )
      )
        return current;
      next[index] = panelId;
      return next;
    });
    if (panelId) setSelectedId(panelId);
  };
  const clearSlot = (index: number) => updateSlot(index, undefined);
  const swapSlots = () => {
    if (slots.length >= 2)
      setSlots((current) => [current[1], current[0], ...current.slice(2)]);
  };
  const setCaption = (index: number, patch: Partial<EditableCaption>) => {
    if (selected)
      setCaptions((current) => ({
        ...current,
        [selected.id]: (current[selected.id] ?? []).map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item,
        ),
      }));
  };
  const addCaption = () => {
    if (selected)
      setCaptions((current) => ({
        ...current,
        [selected.id]: [
          ...(current[selected.id] ?? []),
          {
            text: "新的气泡",
            bubble_type: "speech",
            x: 0.5,
            y: 0.5,
            scale: 1,
            sort_order: current[selected.id]?.length ?? 0,
          },
        ],
      }));
  };
  const removeCaption = (index: number) => {
    if (selected)
      setCaptions((current) => ({
        ...current,
        [selected.id]: (current[selected.id] ?? [])
          .filter((_item, itemIndex) => itemIndex !== index)
          .map((item, itemIndex) => ({ ...item, sort_order: itemIndex })),
      }));
  };
  const saveCaptions = async () => {
    if (!selected) return;
    setSavingCaptions(true);
    try {
      const result = await workspaceApi.savePanelCaptions(
        project.id,
        selected.id,
        selectedCaptions.map(
          (caption, index) =>
            ({ ...caption, sort_order: index }) as PanelCaption,
        ),
      );
      setCaptions((current) => ({
        ...current,
        [selected.id]: result.captions.map(toEditableCaption),
      }));
      notifyAppSuccess(message, "字层与气泡位置已保存");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setSavingCaptions(false);
    }
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging === undefined || !selected || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setCaption(dragging, {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    });
  };
  const synthesize = async () => {
    if (!selected) return;
    const text =
      selectedCaptions
        .map((caption) => caption.text.trim())
        .filter(Boolean)
        .join("\n");
    setTtsBusy(true);
    try {
      const result = await workspaceApi.panelTts(project.id, selected.id, {
        text,
      });
      setAudio((current) => ({ ...current, [selected.id]: result }));
      notifyAppSuccess(message, "配音已下载并归档到本地");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setTtsBusy(false);
    }
  };
  const exportPage = async () => {
    if (!complete) {
      notifyAppError(
        { message, modal },
        new Error(`还缺 ${missingCount} 个底板槽位`),
      );
      return;
    }
    if (ratioMismatch) {
      notifyAppError(
        { message, modal },
        new Error("槽位底板宽高比不一致，无法拼页"),
      );
      return;
    }
    setExportBusy(true);
    try {
      const result = await workspaceApi.exportPage(
        project.id,
        episode.id,
        template,
        slots as number[],
      );
      setExportResult(result);
      const anchor = document.createElement("a");
      anchor.href = mediaUrl(result.publicUrl);
      anchor.download = `${episode.title}-${template}.png`;
      anchor.click();
      notifyAppSuccess(
        message,
        `合成页已导出（${result.width} × ${result.height}）`,
      );
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setExportBusy(false);
    }
  };
  const downloadPackage = async () => {
    if (!complete) {
      notifyAppError(
        { message, modal },
        new Error("请先填满页模板槽位，再下载含底板的话数包"),
      );
      return;
    }
    setPackageBusy(true);
    try {
      const blob = await workspaceApi.downloadPackage(
        project.id,
        episode.id,
        template,
        slots as number[],
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${episode.title}-话数包.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifyAppSuccess(
        message,
        "话数包已下载，内含底板、字层、阅读序和页面信息",
      );
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setPackageBusy(false);
    }
  };

  return (
    <div className="compose-workspace">
      <ComposeHeader
        episodeNumber={episode.episode_number}
        template={template}
        complete={complete}
        exportBusy={exportBusy}
        packageBusy={packageBusy}
        onExport={() => void exportPage()}
        onPackage={() => void downloadPackage()}
      />
      <div className="compose-layout">
        <PanelLibrary
          panels={panels}
          availablePanels={availablePanels}
          selectedId={selectedId}
          slots={slots}
          onAssign={assignPanel}
          onSelect={setSelectedId}
        />
        <div className="compose-main">
          <PageTemplateCard
            template={template}
            slots={slots}
            slotPanels={slotPanels}
            availablePanels={availablePanels}
            complete={complete}
            ratioMismatch={ratioMismatch}
            exportResult={exportResult}
            onTemplate={setTemplate}
            onSlot={updateSlot}
            onClear={clearSlot}
            onSwap={swapSlots}
            onRatio={(id, ratio) =>
              setRatios((current) => ({ ...current, [id]: ratio }))
            }
          />
          <CaptionEditor
            selected={selected}
            captions={selectedCaptions}
            audio={selectedAudio}
            saving={savingCaptions}
            ttsBusy={ttsBusy}
            dragging={dragging}
            canvasRef={canvasRef}
            onCaption={setCaption}
            onAdd={addCaption}
            onRemove={removeCaption}
            onSave={() => void saveCaptions()}
            onTts={() => void synthesize()}
            onDragStart={setDragging}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragging(undefined)}
          />
        </div>
      </div>
    </div>
  );
}

function ComposeHeader(props: {
  episodeNumber: number;
  template: Template;
  complete: boolean;
  exportBusy: boolean;
  packageBusy: boolean;
  onExport: () => void;
  onPackage: () => void;
}) {
  return (
    <div className="workspace-section-heading">
      <div>
        <Typography.Title level={2}>页组装</Typography.Title>
        <Typography.Text type="secondary">
          话 {props.episodeNumber} · 先拼已有底板，再贴气泡、配音和导出
        </Typography.Text>
      </div>
      <Space wrap>
        <Tag color={props.complete ? "success" : "warning"}>
          {props.complete ? `${props.template} 可导出` : "槽位未填满"}
        </Tag>
        <Button
          icon={<ExportOutlined />}
          type="primary"
          loading={props.exportBusy}
          onClick={props.onExport}
        >
          导出合成页
        </Button>
        <Button
          icon={<DownloadOutlined />}
          loading={props.packageBusy}
          onClick={props.onPackage}
        >
          下载话数包
        </Button>
      </Space>
    </div>
  );
}

function PanelLibrary(props: {
  panels: Panel[];
  availablePanels: Panel[];
  selectedId?: number;
  slots: Array<number | undefined>;
  onAssign: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  return (
    <Card
      className="compose-panel-library"
      title="底板库"
      extra={
        <Tag>
          {props.availablePanels.length}/{props.panels.length} 张可用
        </Tag>
      }
    >
      <Typography.Paragraph type="secondary">
        点击底板会按阅读序填入下一个空槽位；同一张底板不会重复占槽。
      </Typography.Paragraph>
      <div className="compose-panel-list">
        {props.panels.map((panel) => {
          const occupied = props.slots.includes(panel.id);
          return (
            <button
              type="button"
              key={panel.id}
              className={`compose-panel-item${panel.id === props.selectedId ? " is-active" : ""}`}
              onClick={() => panel.image_url && props.onAssign(panel.id)}
              onDoubleClick={() => props.onSelect(panel.id)}
              disabled={!panel.image_url}
            >
              <div>
                {panel.image_url ? (
                  <img src={mediaUrl(panel.image_url)} alt="" />
                ) : (
                  <span>缺底板</span>
                )}
                {occupied ? (
                  <em>槽位 {props.slots.indexOf(panel.id) + 1}</em>
                ) : null}
              </div>
              <strong>分格 {panel.panel_number}</strong>
              <small>{panel.title || panel.description || "未命名分格"}</small>
              <span>{panel.image_url ? "可组装" : "先去分格台生产"}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function PageTemplateCard(props: {
  template: Template;
  slots: Array<number | undefined>;
  slotPanels: Array<Panel | undefined>;
  availablePanels: Panel[];
  complete: boolean;
  ratioMismatch: boolean;
  exportResult?: PageExportResult;
  onTemplate: (value: Template) => void;
  onSlot: (index: number, id?: number) => void;
  onClear: (index: number) => void;
  onSwap: () => void;
  onRatio: (id: number, ratio: number) => void;
}) {
  const options = props.availablePanels.map((panel) => ({
    value: panel.id,
    label: `分格 ${panel.panel_number}`,
  }));
  return (
    <Card
      className="compose-template-card"
      title={
        <Space>
          <LayoutOutlined />
          页模板与槽位
        </Space>
      }
      extra={
        <Space wrap>
          <Segmented
            value={props.template}
            onChange={(value) => props.onTemplate(value as Template)}
            options={[
              { label: "单格", value: "single" },
              { label: "四格 2×2", value: "grid_2x2" },
              { label: "竖四格", value: "vertical_4" },
            ]}
          />
          <Tooltip title="交换前两个阅读槽位">
            <Button
              icon={<SwapOutlined />}
              disabled={props.slots.length < 2}
              onClick={props.onSwap}
            />
          </Tooltip>
        </Space>
      }
    >
      <div className={`compose-canvas compose-${props.template}`}>
        {props.slotPanels.map((panel, index) => (
          <div
            className={`compose-slot${panel ? " has-panel" : ""}`}
            key={`${props.template}-${index}`}
          >
            <div className="compose-slot-toolbar">
              <span>槽位 {index + 1}</span>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                disabled={!panel}
                onClick={() => props.onClear(index)}
                aria-label={`清除槽位 ${index + 1}`}
              />
            </div>
            <Select
              value={panel?.id}
              placeholder="选择底板"
              options={options.filter(
                (option) =>
                  !props.slots.includes(option.value) ||
                  option.value === panel?.id,
              )}
              onChange={(value) => props.onSlot(index, value)}
              allowClear
            />
            {panel?.image_url ? (
              <img
                src={mediaUrl(panel.image_url)}
                alt={`槽位 ${index + 1}`}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  props.onRatio(
                    panel.id,
                    image.naturalWidth / image.naturalHeight,
                  );
                }}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="选择一个已归档底板"
              />
            )}
          </div>
        ))}
      </div>
      <div className="compose-template-status">
        <span>
          {props.complete ? (
            <CheckCircleOutlined className="is-ok" />
          ) : (
            <HolderOutlined />
          )}
          {props.complete
            ? "槽位已填满"
            : `还缺 ${props.slots.filter((slot) => !slot).length} 个槽位`}
        </span>
        <span>
          {props.ratioMismatch
            ? "比例不一致，导出会被拒绝"
            : "按底板真实像素比例校验"}
        </span>
        {props.exportResult ? (
          <span>
            最近导出 {props.exportResult.width} × {props.exportResult.height}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function CaptionEditor(props: {
  selected?: Panel;
  captions: EditableCaption[];
  audio?: PanelAudio | null;
  saving: boolean;
  ttsBusy: boolean;
  dragging?: number;
  canvasRef: React.RefObject<HTMLDivElement>;
  onCaption: (index: number, patch: Partial<EditableCaption>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onTts: () => void;
  onDragStart: (index: number) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
}) {
  return (
    <Card
      className="compose-caption-card"
      title={
        <Space>
          <HolderOutlined />
          气泡字层与配音
        </Space>
      }
      extra={
        props.selected ? (
          <Tag color="blue">当前：分格 {props.selected.panel_number}</Tag>
        ) : null
      }
    >
      {props.selected ? (
        <>
          <div className="compose-caption-toolbar">
            <Typography.Text type="secondary">
              字层保存到当前分格，拖动不改变底板像素
            </Typography.Text>
            <Space wrap>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={props.onAdd}
              >
                新增气泡
              </Button>
              <Button
                size="small"
                icon={<SaveOutlined />}
                loading={props.saving}
                onClick={props.onSave}
              >
                保存字层
              </Button>
              <Button
                size="small"
                icon={<AudioOutlined />}
                loading={props.ttsBusy}
                onClick={props.onTts}
              >
                按格生成配音
              </Button>
            </Space>
          </div>
          <div className="compose-caption-grid">
            {props.captions.map((caption, index) => (
              <div
                className="compose-caption-row"
                key={caption.id ?? `new-${index}`}
              >
                <Input
                  value={caption.text}
                  onChange={(event) =>
                    props.onCaption(index, { text: event.target.value })
                  }
                  placeholder="气泡文案"
                />
                <Select
                  value={caption.bubble_type}
                  options={[
                    { value: "speech", label: "对白气泡" },
                    { value: "thought", label: "思考气泡" },
                    { value: "narration", label: "旁白框" },
                  ]}
                  onChange={(value) =>
                    props.onCaption(index, { bubble_type: value })
                  }
                />
                <label>
                  <span>X</span>
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.01}
                    value={caption.x}
                    onChange={(value) =>
                      props.onCaption(index, { x: Number(value ?? 0.5) })
                    }
                  />
                </label>
                <label>
                  <span>Y</span>
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.01}
                    value={caption.y}
                    onChange={(value) =>
                      props.onCaption(index, { y: Number(value ?? 0.5) })
                    }
                  />
                </label>
                <label>
                  <span>缩放</span>
                  <InputNumber
                    min={0.1}
                    max={4}
                    step={0.1}
                    value={caption.scale}
                    onChange={(value) =>
                      props.onCaption(index, { scale: Number(value ?? 1) })
                    }
                  />
                </label>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => props.onRemove(index)}
                  aria-label="删除气泡"
                />
              </div>
            ))}
          </div>
          <div
            className="compose-caption-stage"
            ref={props.canvasRef}
            onPointerMove={props.onPointerMove}
            onPointerUp={props.onPointerUp}
            onPointerLeave={props.onPointerUp}
          >
            {props.selected.image_url ? (
              <img
                src={mediaUrl(props.selected.image_url)}
                alt="当前底板字层预览"
              />
            ) : (
              <Empty description="当前分格没有底板" />
            )}
            {props.captions.map((caption, index) => (
              <div
                className={`compose-bubble bubble-${caption.bubble_type}${props.dragging === index ? " is-dragging" : ""}`}
                key={caption.id ?? `bubble-${index}`}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  props.onDragStart(index);
                }}
                style={{
                  left: `${caption.x * 100}%`,
                  top: `${caption.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${caption.scale})`,
                }}
              >
                {caption.text || "空气泡"}
              </div>
            ))}
          </div>
          <div className="compose-audio-status">
            {props.audio?.public_url ? (
              <>
                <Tag color="success">已归档本地音频</Tag>
                <audio controls src={mediaUrl(props.audio.public_url)} />
              </>
            ) : (
              <Typography.Text type="secondary">
                尚未生成当前分格配音，TTS 会使用当前全部气泡文案或分格对白。
              </Typography.Text>
            )}
          </div>
        </>
      ) : (
        <Empty description="先从左侧底板库选择一个分格" />
      )}
    </Card>
  );
}

function toEditableCaption(caption: PanelCaption): EditableCaption {
  return {
    id: caption.id,
    panel_id: caption.panel_id,
    text: caption.text,
    bubble_type: caption.bubble_type,
    x: caption.x,
    y: caption.y,
    scale: caption.scale,
    sort_order: caption.sort_order,
  };
}
function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
