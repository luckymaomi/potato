import { NotFoundError, ValidationError } from "../errors";
import type { SQLiteDatabase } from "../types/core";

export type CaptionBubbleType = "speech" | "thought" | "narration";

export interface PanelCaption {
  id: number;
  panel_id: number;
  text: string;
  bubble_type: CaptionBubbleType;
  x: number;
  y: number;
  scale: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PanelCaptionInput {
  text: string;
  bubble_type?: CaptionBubbleType;
  x?: number;
  y?: number;
  scale?: number;
  sort_order?: number;
}

export class CaptionService {
  constructor(private readonly db: SQLiteDatabase) {}

  list(panelId: number): PanelCaption[] {
    return this.db
      .prepare(
        "SELECT * FROM panel_captions WHERE panel_id = ? ORDER BY sort_order, id",
      )
      .all(panelId) as PanelCaption[];
  }

  replace(panelId: number, value: unknown): PanelCaption[] {
    if (!this.db.prepare("SELECT id FROM panels WHERE id = ?").get(panelId))
      throw new NotFoundError("分格不存在");
    if (!Array.isArray(value)) throw new ValidationError("字层必须是数组");
    const rows = value.map((item, index) => {
      const record =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text)
        throw new ValidationError(`第 ${index + 1} 个字层文案不能为空`);
      const bubbleType = bubbleTypeValue(record.bubble_type);
      const x = boundedNumber(record.x, 0.5);
      const y = boundedNumber(record.y, 0.5);
      const scale = Math.max(0.1, Math.min(4, number(record.scale, 1)));
      return { text, bubbleType, x, y, scale, sortOrder: index };
    });
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM panel_captions WHERE panel_id = ?")
        .run(panelId);
      const insert = this.db.prepare(
        `INSERT INTO panel_captions (panel_id, text, bubble_type, x, y, scale, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of rows)
        insert.run(
          panelId,
          row.text,
          row.bubbleType,
          row.x,
          row.y,
          row.scale,
          row.sortOrder,
          now,
          now,
        );
    })();
    return this.list(panelId);
  }
}

function number(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(1, number(value, fallback)));
}

function bubbleTypeValue(value: unknown): CaptionBubbleType {
  if (value === undefined || value === null || value === "") return "speech";
  if (value === "speech" || value === "thought" || value === "narration")
    return value;
  throw new ValidationError("字层气泡类型必须是 speech、thought 或 narration");
}
