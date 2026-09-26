import { PlusOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Typography } from "antd";
import type { Panel } from "../../../types/domain";
import { mediaUrl } from "../../../utils/mediaUrl";

export function PanelHeader(props: { episodeNumber: number; count: number }) {
  return (
    <div className="workspace-section-heading panel-heading">
      <div>
        <Typography.Title level={2}>分镜台</Typography.Title>
        <Typography.Text type="secondary">
          话 {props.episodeNumber}
          {props.count > 0 ? ` · ${props.count} 镜` : ""}
        </Typography.Text>
      </div>
    </div>
  );
}

export function PanelTrack(props: {
  items: Panel[];
  selectedId?: number;
  onSelect: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <Card className="panel-track" title="分镜列表">
      {props.items.length ? (
        <>
          <div className="panel-track-list">
            {props.items.map((item) => {
              const label =
                item.title?.trim() ||
                item.action?.trim() ||
                item.description?.trim() ||
                "未命名";
              return (
                <button
                  key={item.id}
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
                    <strong>
                      {item.panel_number}. {label}
                    </strong>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="panel-track-add">
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={props.onCreate}
            >
              新增分镜
            </Button>
          </div>
        </>
      ) : (
        <Empty description="还没有分镜">
          <Button type="primary" icon={<PlusOutlined />} onClick={props.onCreate}>
            新增第一镜
          </Button>
        </Empty>
      )}
    </Card>
  );
}
