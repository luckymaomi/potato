import {
  BuildOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  HistoryOutlined,
  SaveOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
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
  Typography,
  Upload,
} from "antd";
import type { MediaGenerationHistory } from "../../../api/media";
import type { PanelReadiness } from "../../../api/workspace";
import { GenerationElapsedTime } from "../../generation/GenerationElapsedTime";
import { modelCapabilitySummary } from "../../providers/catalog";
import type {
  AssetKind,
  Panel,
  ProjectAsset,
  ProviderModel,
} from "../../../types/domain";
import { mediaUrl } from "../../../utils/mediaUrl";
import {
  autoSaveLabel,
  type AutoSaveStatus,
} from "../useDebouncedAutoSave";
import { assetLabels, type PanelFormValues } from "./panelForm";

export function PanelInspector(props: {
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
  autoSaveStatus: AutoSaveStatus;
  onValuesChange: (changed: Partial<PanelFormValues>) => void;
  onToggleAsset: (kind: AssetKind, id: number) => void;
  onAssemble: () => void;
  onGenerate: () => void;
  onStop: () => void;
  onUpload: (file: File) => Promise<boolean>;
  onUploadReference: (file: File) => Promise<boolean>;
  onClear: () => void;
  onSelectHistory: (item: MediaGenerationHistory) => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="panel-inspector"
      title="分镜检查器"
      extra={
        props.selected ? (
          <Space size={8}>
            <span
              className={`auto-save-hint is-${props.autoSaveStatus}`}
              aria-live="polite"
            >
              <SaveOutlined style={{ marginRight: 4 }} />
              {autoSaveLabel(props.autoSaveStatus)}
            </span>
            <Popconfirm
              title="删除这一镜？"
              description="会重新整理阅读序，历史媒体仍保留。"
              onConfirm={props.onDelete}
              okButtonProps={{ danger: true }}
            >
              <Button danger type="text" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ) : null
      }
    >
      {props.selected ? (
        <Form
          form={props.form}
          layout="vertical"
          className="panel-inspector-form"
          onValuesChange={props.onValuesChange}
        >
          <Collapse
            activeKey={props.activeCollapse}
            onChange={(keys) => props.setActiveCollapse(keys as string[])}
            items={[
              {
                key: "spec",
                label: "分镜规格",
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
                label: "图片配方（提示词 + 参考图）",
                children: (
                  <RecipeEditor
                    form={props.form}
                    model={props.imageModel}
                    onUploadReference={props.onUploadReference}
                    uploading={props.referenceUploading}
                  />
                ),
              },
            ]}
          />
          <PanelReadinessSummary readiness={props.readiness} />
          <div className="panel-inspector-actions">
            <Button
              icon={<BuildOutlined />}
              loading={props.assembling}
              onClick={props.onAssemble}
            >
              组装图片配方
            </Button>
          </div>
          <section className="panel-generation-section" aria-label="画幅与生成">
            <div className="asset-panel-heading">
              <strong>画幅与生成</strong>
            </div>
            <GenerationControls {...props} />
          </section>
          <HistoryList items={props.history} onSelect={props.onSelectHistory} />
        </Form>
      ) : (
        <Empty description="从左侧选择一个分镜" />
      )}
    </Card>
  );
}

function PanelReadinessSummary(props: { readiness?: PanelReadiness }) {
  const image = props.readiness?.image;
  if (!props.readiness) {
    return (
      <div className="panel-readiness-summary">正在读取当前分镜状态…</div>
    );
  }
  return (
    <div className="panel-readiness-summary" aria-label="当前分镜状态">
      <div className="is-ready">
        <strong>图片配方</strong>
        <span>
          点「生成底板」会按当前规格自动组装；也可先点「组装图片配方」预览
        </span>
      </div>
      <div className={image?.ready ? "is-ready" : "is-blocked"}>
        <strong>底板</strong>
        <span>
          {image?.ready ? "已有底板" : image?.reason || "尚未生成或上传"}
        </span>
      </div>
    </div>
  );
}

function PanelSpecFields() {
  return (
    <>
      <Form.Item name="title" label="标题">
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder="例如：分镜1｜晴晨入城"
        />
      </Form.Item>
      <Form.Item
        name="action"
        label="本镜画面"
        extra="写清这一镜要画什么：场景里谁在做什么、怎么站、大致景别与氛围。细节进资产卡；需要连续性时自行上传上一镜到底下「其他参考图」。"
      >
        <Input.TextArea
          autoSize={{ minRows: 4, maxRows: 12 }}
          placeholder="例：王室浴室蒸汽中，女王刚离浴池回眸而立，半身至膝上，暖琥珀灯光，私密奢华"
        />
      </Form.Item>
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
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        勾选本镜出场资产。有标准图的会在组装时进入配方参考图；待定妆需先去资产台出图。
      </Typography.Paragraph>
      {(["character", "scene", "prop"] as AssetKind[]).map((kind) => (
        <div key={kind} className="panel-asset-group">
          <Typography.Text type="secondary">
            {assetLabels[kind]}
          </Typography.Text>
          <div className="panel-asset-pick-list">
            {props.assets
              .filter((asset) => asset.kind === kind)
              .map((asset) => {
                const checked = props.selectedIds.includes(asset.id);
                return (
                  <label
                    key={asset.id}
                    className={`panel-asset-pick${checked ? " is-selected" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => props.onToggle(kind, asset.id)}
                    />
                    {asset.image_url ? (
                      <Image
                        src={mediaUrl(asset.image_url)}
                        width={44}
                        height={44}
                        preview={{ mask: "查看" }}
                        alt={asset.name}
                      />
                    ) : (
                      <span className="panel-asset-pick-empty">待定妆</span>
                    )}
                    <span className="panel-asset-pick-name">{asset.name}</span>
                  </label>
                );
              })}
          </div>
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
  const recipeReferences =
    Form.useWatch("image_recipe_references", props.form) ?? [];
  const extraReferences =
    Form.useWatch("extra_reference_images", props.form) ?? [];
  return (
    <div className="panel-recipe-editor">
      <Typography.Paragraph type="secondary">
        文本只拼本镜画面；图片挂出场资产标准图 + 其他参考图。不注入总览画风锁或资产卡档案。点「生成底板」会按当前规格自动组装；也可先点「组装图片配方」预览。
      </Typography.Paragraph>
      <Form.Item name="image_recipe_prompt" label="最终图片提示词">
        <Input.TextArea rows={7} />
      </Form.Item>
      <Form.Item name="image_recipe_references" hidden>
        <Select mode="tags" open={false} />
      </Form.Item>
      <Form.Item name="extra_reference_images" hidden>
        <Select mode="tags" open={false} />
      </Form.Item>
      <RecipeReferences
        label="配方参考图（组装快照）"
        hint="组装时写入的出场资产标准图 + 当时的其他参考图"
        values={recipeReferences}
        onRemove={(url) => {
          props.form.setFieldsValue({
            image_recipe_references: recipeReferences.filter(
              (item: string) => item !== url,
            ),
          });
        }}
      />
      <ReferenceLimitNotice model={props.model} count={recipeReferences.length} />
      <div className="panel-reference-toolbar">
        <Typography.Text strong>其他参考图</Typography.Text>
        <Typography.Text type="secondary">
          {extraReferences.length} 张 · 下次组装并入配方参考图（含你自行上传的上一镜等）
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
            上传
          </Button>
        </Upload>
      </div>
      <div className="panel-reference-list">
        {extraReferences.length ? (
          extraReferences.map((reference: string) => (
            <div className="panel-reference-item" key={reference}>
              <Image
                src={mediaUrl(reference)}
                width={58}
                height={58}
                preview
                alt="其他参考图"
              />
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label="移除其他参考图"
                onClick={() =>
                  props.form.setFieldsValue({
                    extra_reference_images: extraReferences.filter(
                      (item: string) => item !== reference,
                    ),
                  })
                }
              />
            </div>
          ))
        ) : (
          <Typography.Text type="secondary">暂无其他参考图</Typography.Text>
        )}
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
  onStop: () => void;
  onUpload: (file: File) => Promise<boolean>;
  onClear: () => void;
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
      <Form.Item
        name="aspect_ratio"
        label="手选当前图片模型画幅"
        style={{ marginBottom: 8 }}
      >
        <Select
          allowClear
          placeholder="选择模型目录声明的画幅"
          options={props.aspectOptions.map((value) => ({
            value,
            label: value,
          }))}
          disabled={!props.aspectOptions.length}
        />
      </Form.Item>
      <Typography.Text type={props.gateReason ? "warning" : "secondary"}>
        {props.gateReason || "将按当前规格生成底板"}
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
        {props.imageBusy ? (
          <Button danger icon={<StopOutlined />} onClick={props.onStop}>
            停止生成
          </Button>
        ) : null}
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
      </Space>
    </div>
  );
}

function RecipeReferences(props: {
  label: string;
  hint?: string;
  values: string[];
  onRemove?: (url: string) => void;
}) {
  return (
    <div className="panel-recipe-references panel-recipe-reference-preview">
      <div className="panel-reference-toolbar">
        <Typography.Text strong>{props.label}</Typography.Text>
        <Typography.Text type="secondary">
          {props.values.length} 张
          {props.hint ? ` · ${props.hint}` : ""}
        </Typography.Text>
      </div>
      {props.values.length ? (
        <div className="panel-reference-list">
          {props.values.map((value) => (
            <div className="panel-reference-item" key={value}>
              <Image
                src={mediaUrl(value)}
                width={58}
                height={58}
                preview
                alt="配方参考图"
              />
              {props.onRemove ? (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label="从配方移除参考图"
                  onClick={() => props.onRemove?.(value)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary">
          暂无。勾选已定妆资产并组装后会出现在这里。
        </Typography.Text>
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
                      disabled={
                        !(
                          (item.status === "completed" && item.available) ||
                          (item.status === "remote" && Boolean(item.image_url))
                        )
                      }
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
                    description={`${item.status === "remote" ? "远程预览" : item.status === "completed" && item.available ? "本地已归档" : item.status}${item.model ? ` · ${item.model}` : ""}`}
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

export function ModelSummary(props: { model?: ProviderModel; label: string }) {
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
