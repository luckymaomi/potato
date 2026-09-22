import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import sharp from "sharp";
import { NotFoundError, ValidationError } from "../errors";
import type { AppConfig, SQLiteDatabase } from "../types/core";
import { MediaArchiveService } from "./mediaArchiveService";

export type PageTemplate = "single" | "grid_2x2" | "vertical_4";

export class PageLayoutService {
  private readonly archive: MediaArchiveService;
  constructor(
    private readonly db: SQLiteDatabase,
    config: AppConfig,
  ) {
    this.archive = new MediaArchiveService(config);
  }

  absolutePath(relativePath: string): string {
    return this.archive.absolutePath(relativePath);
  }

  async export(input: {
    projectId: number;
    episodeId: number;
    template: PageTemplate;
    panelIds?: number[];
  }): Promise<{
    id: number;
    publicUrl: string;
    localPath: string;
    width: number;
    height: number;
  }> {
    const episode = this.db
      .prepare("SELECT id FROM episodes WHERE id = ? AND drama_id = ?")
      .get(input.episodeId, input.projectId);
    if (!episode) throw new NotFoundError("话不存在");
    const rows = (
      input.panelIds?.length
        ? this.db
            .prepare(
              `SELECT * FROM panels WHERE episode_id = ? AND id IN (${input.panelIds.map(() => "?").join(",")}) ORDER BY panel_number`,
            )
            .all(input.episodeId, ...input.panelIds)
        : this.db
            .prepare(
              "SELECT * FROM panels WHERE episode_id = ? ORDER BY panel_number",
            )
            .all(input.episodeId)
    ) as Array<{ id: number; image_url: string | null }>;
    if (input.panelIds?.length)
      rows.sort(
        (a, b) => input.panelIds!.indexOf(a.id) - input.panelIds!.indexOf(b.id),
      );
    const expected = input.template === "single" ? 1 : 4;
    if (rows.length !== expected)
      throw new ValidationError(
        `${input.template === "single" ? "单格" : "四格"}导出需要 ${expected} 个分格底板`,
      );
    const paths = rows.map((row) =>
      localImagePath(this.archive, row.image_url),
    );
    if (paths.some((item) => !item || !fs.existsSync(item)))
      throw new ValidationError("导出需要每个槽位都有本地底板");
    const metadata = await Promise.all(
      paths.map((item) => sharp(item as string).metadata()),
    );
    const widths = metadata.map((item) => item.width ?? 0);
    const heights = metadata.map((item) => item.height ?? 0);
    if (widths.some((value) => !value) || heights.some((value) => !value))
      throw new ValidationError("底板尺寸无法读取");
    const ratios = widths.map((width, index) => width / heights[index]);
    if (ratios.some((ratio) => Math.abs(ratio - ratios[0]) > 0.01))
      throw new ValidationError("同一页底板宽高比不一致，无法拼页");
    const cellWidth = Math.max(...widths);
    const cellHeight = Math.round(cellWidth / ratios[0]);
    const width =
      input.template === "single"
        ? cellWidth
        : input.template === "grid_2x2"
          ? cellWidth * 2
          : cellWidth;
    const height =
      input.template === "single"
        ? cellHeight
        : input.template === "grid_2x2"
          ? cellHeight * 2
          : cellHeight * 4;
    const resized = await Promise.all(
      paths.map((item) =>
        sharp(item as string).resize(cellWidth, cellHeight).png().toBuffer(),
      ),
    );
    const composites: Array<{
      input: Buffer;
      left: number;
      top: number;
    }> = [];
    for (const [index, row] of rows.entries()) {
      const left =
        input.template === "grid_2x2" ? (index % 2) * cellWidth : 0;
      const top =
        input.template === "grid_2x2"
          ? Math.floor(index / 2) * cellHeight
          : index * cellHeight;
      composites.push({ input: resized[index], left, top });
      const captions = this.db
        .prepare(
          "SELECT text, bubble_type, x, y, scale FROM panel_captions WHERE panel_id = ? ORDER BY sort_order",
        )
        .all(row.id) as CaptionRow[];
      if (captions.length)
        composites.push({
          input: Buffer.from(captionSvg(cellWidth, cellHeight, captions)),
          left,
          top,
        });
    }
    const generationId = Date.now();
    const relativePath = path.posix.join(
      "projects",
      String(input.projectId),
      "pages",
      `${generationId}-${input.template}.png`,
    );
    const destination = this.archive.absolutePath(relativePath);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await sharp({
      create: { width, height, channels: 4, background: "#ffffff" },
    })
      .composite(composites)
      .png()
      .toFile(destination);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO page_layouts (episode_id, template, panel_ids, output_url, local_path, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.episodeId,
        input.template,
        JSON.stringify(rows.map((row) => row.id)),
        `/static/${relativePath}`,
        relativePath,
        width,
        height,
        now,
        now,
      );
    return {
      id: Number(result.lastInsertRowid),
      publicUrl: `/static/${relativePath}`,
      localPath: relativePath,
      width,
      height,
    };
  }

  async exportPackage(input: {
    projectId: number;
    episodeId: number;
    template?: PageTemplate;
    panelIds?: number[];
  }): Promise<{ publicUrl: string; localPath: string; panelCount: number }> {
    const rows = (
      input.panelIds?.length
        ? this.db
            .prepare(
              `SELECT * FROM panels WHERE episode_id = ? AND id IN (${input.panelIds.map(() => "?").join(",")}) ORDER BY panel_number`,
            )
            .all(input.episodeId, ...input.panelIds)
        : this.db
            .prepare(
              "SELECT * FROM panels WHERE episode_id = ? ORDER BY panel_number",
            )
            .all(input.episodeId)
    ) as Array<{
      id: number;
      panel_number: number;
      title: string | null;
      image_url: string | null;
    }>;
    if (input.panelIds?.length)
      rows.sort(
        (a, b) => input.panelIds!.indexOf(a.id) - input.panelIds!.indexOf(b.id),
      );
    if (!rows.length) throw new ValidationError("话数包至少需要一个分格");
    const missing = rows.filter(
      (row) =>
        !localImagePath(this.archive, row.image_url) ||
        !fs.existsSync(localImagePath(this.archive, row.image_url) as string),
    );
    if (missing.length)
      throw new ValidationError(
        `话数包缺少 ${missing.length} 张本地底板，请先完成并选用底板`,
      );
    if (input.template) {
      await this.export({
        projectId: input.projectId,
        episodeId: input.episodeId,
        template: input.template,
        panelIds: rows.map((row) => row.id),
      });
    }
    const root = this.archive.absolutePath(
      path.posix.join("projects", String(input.projectId), "packages"),
    );
    await fs.promises.mkdir(root, { recursive: true });
    const relativePath = path.posix.join(
      "projects",
      String(input.projectId),
      "packages",
      `${Date.now()}-episode.zip`,
    );
    const destination = this.archive.absolutePath(relativePath);
    const output = fs.createWriteStream(destination);
    const archive = archiver("zip", { zlib: { level: 9 } });
    const done = new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      output.on("error", reject);
      archive.on("error", reject);
    });
    archive.pipe(output);
    const readingOrder = rows.map((row, index) => ({
      panel_id: row.id,
      order: index + 1,
      panel_number: row.panel_number,
      title: row.title,
    }));
    archive.append(
      JSON.stringify(
        {
          episode_id: input.episodeId,
          template_history: this.db
            .prepare(
              "SELECT * FROM page_layouts WHERE episode_id = ? ORDER BY id",
            )
            .all(input.episodeId),
          panels: readingOrder,
        },
        null,
        2,
      ),
      { name: "page_info.json" },
    );
    archive.append(JSON.stringify(readingOrder, null, 2), {
      name: "reading_order.json",
    });
    for (const row of rows) {
      const imagePath = localImagePath(this.archive, row.image_url);
      archive.file(imagePath as string, {
        name: `panels/${String(row.panel_number).padStart(2, "0")}/panel${path.extname(imagePath as string) || ".png"}`,
      });
      const captions = this.db
        .prepare(
          "SELECT * FROM panel_captions WHERE panel_id = ? ORDER BY sort_order",
        )
        .all(row.id);
      const audio = this.db
        .prepare(
          "SELECT id, text, role, style, public_url, local_path, status FROM panel_audio WHERE panel_id = ? ORDER BY id DESC",
        )
        .all(row.id);
      archive.append(
        JSON.stringify({ panel_id: row.id, captions, audio }, null, 2),
        {
          name: `panels/${String(row.panel_number).padStart(2, "0")}/layers.json`,
        },
      );
      for (const item of audio as Array<{ local_path?: string }>) {
        if (item.local_path) {
          const audioPath = this.archive.absolutePath(item.local_path);
          if (fs.existsSync(audioPath))
            archive.file(audioPath, {
              name: `panels/${String(row.panel_number).padStart(2, "0")}/audio${path.extname(audioPath)}`,
            });
        }
      }
    }
    const pages = this.db
      .prepare(
        "SELECT local_path FROM page_layouts WHERE episode_id = ? AND local_path IS NOT NULL ORDER BY id",
      )
      .all(input.episodeId) as Array<{ local_path: string }>;
    for (const [index, page] of pages.entries()) {
      const pagePath = this.archive.absolutePath(page.local_path);
      if (fs.existsSync(pagePath))
        archive.file(pagePath, {
          name: `pages/page_${String(index + 1).padStart(2, "0")}${path.extname(pagePath)}`,
        });
    }
    await archive.finalize();
    await done;
    return {
      publicUrl: `/static/${relativePath}`,
      localPath: relativePath,
      panelCount: rows.length,
    };
  }
}

function localImagePath(
  archive: MediaArchiveService,
  url: string | null,
): string | undefined {
  if (!url?.startsWith("/static/")) return undefined;
  try {
    return archive.absolutePath(url.slice("/static/".length));
  } catch {
    return undefined;
  }
}

interface CaptionRow {
  text: string;
  bubble_type: string;
  x: number;
  y: number;
  scale: number;
}

function captionSvg(width: number, height: number, captions: CaptionRow[]): string {
  const body = captions
    .map((caption) => {
      const x = clamp(caption.x) * width;
      const y = clamp(caption.y) * height;
      const scale = Math.max(0.1, Math.min(4, Number(caption.scale) || 1));
      const fontSize = Math.max(12, Math.round(22 * scale));
      const escaped = escapeXml(caption.text);
      const bubbleWidth = Math.min(width * 0.72, Math.max(92, escaped.length * fontSize * 0.62 + 28));
      const bubbleHeight = Math.max(42, fontSize + 22);
      const left = Math.max(4, Math.min(width - bubbleWidth - 4, x - bubbleWidth / 2));
      const top = Math.max(4, Math.min(height - bubbleHeight - 4, y - bubbleHeight / 2));
      const shape =
        caption.bubble_type === "thought"
          ? `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(bubbleWidth / 2).toFixed(1)}" ry="${(bubbleHeight / 2).toFixed(1)}" />`
          : `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${bubbleWidth.toFixed(1)}" height="${bubbleHeight.toFixed(1)}" rx="${caption.bubble_type === "narration" ? 4 : 18}" />`;
      return `<g class="caption caption-${escapeXml(caption.bubble_type)}"><g fill="${caption.bubble_type === "narration" ? "#fff3c4" : "#ffffff"}" stroke="#172229" stroke-width="2">${shape}</g><text x="${x.toFixed(1)}" y="${(y + fontSize * 0.35).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#172229">${escaped}</text></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
      character
    ] ?? character,
  );
}
