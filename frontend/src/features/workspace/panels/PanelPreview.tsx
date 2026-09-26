import {
  CheckCircleOutlined,
  DownloadOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Image, Space, Tag, Tooltip, Typography } from "antd";
import type { Panel } from "../../../types/domain";
import { mediaUrl } from "../../../utils/mediaUrl";

export function PanelPreview(props: {
  selected?: Panel;
  selectedIndex: number;
  total: number;
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
          ? `分镜 ${props.selected.panel_number} · 底板预览`
          : "底板预览"
      }
      extra={
        props.selected ? (
          <Space>
            <Tooltip title="上一镜">
              <Button
                icon={<LeftOutlined />}
                disabled={props.selectedIndex <= 0}
                onClick={props.onPrevious}
              />
            </Tooltip>
            <Tooltip title="下一镜">
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
          alt={props.selected.title || "分镜底板"}
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
            在右侧编辑规格后生成，或上传本地文件
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
              {props.selected.image_recipe_prompt?.trim()
                ? "已保存"
                : "点生成时自动组装"}
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
