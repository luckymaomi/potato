import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import sharp from "sharp";
import { initializeDatabase } from "../src/db/schema";
import { CaptionService } from "../src/services/captionService";
import { PageLayoutService } from "../src/services/pageLayoutService";
import { MediaArchiveService } from "../src/services/mediaArchiveService";
import { FreedubService } from "../src/services/freedubService";
import type { AppConfig } from "../src/types/core";

test("分格字层保存后可重读，且保留底板当前指针", async () => {
  const db = new Database(":memory:");
  try {
    initializeDatabase(db);
    const { dramaId, panelId } = seedPanel(db);
    const archive = new MediaArchiveService(config());
    const image = await archive.archiveRemote({
      projectId: dramaId,
      generationId: 1,
      kind: "image",
      sourceUrl: await pngData("red"),
    });
    db.prepare(
      "UPDATE panels SET image_url = ?, current_image_generation_id = 1 WHERE id = ?",
    ).run(image.publicUrl, panelId);
    const captions = new CaptionService(db).replace(panelId, [
      { text: "别回头", bubble_type: "speech", x: -1, y: 2, scale: 1.2 },
      { text: "我在想", bubble_type: "thought", x: 0.25, y: 0.75, scale: 0.5 },
      { text: "三天后", bubble_type: "narration", x: 0.8, y: 0.1, scale: 9 },
    ]);
    assert.equal(captions.length, 3);
    assert.deepEqual(new CaptionService(db).list(panelId).map((item) => item.bubble_type), [
      "speech", "thought", "narration",
    ]);
    assert.deepEqual(
      [captions[0].x, captions[0].y, captions[2].scale],
      [0, 1, 4],
    );
    assert.equal(new CaptionService(db).list(panelId)[0].text, "别回头");
    assert.equal(
      (
        db
          .prepare("SELECT image_url FROM panels WHERE id = ?")
          .get(panelId) as { image_url: string }
      ).image_url,
      image.publicUrl,
    );
  } finally {
    db.close();
  }
});

test("四格页按真实底板像素比例导出并写入页布局历史", async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "potato-pages-"));
  const db = new Database(":memory:");
  try {
    initializeDatabase(db);
    const { dramaId, episodeId } = seedPanel(db);
    for (let index = 0; index < 4; index += 1) {
      const panel =
        index === 0
          ? {
              lastInsertRowid: (
                db
                  .prepare(
                    "SELECT id FROM panels WHERE episode_id = ? AND panel_number = 1",
                  )
                  .get(episodeId) as { id: number }
              ).id,
            }
          : db
              .prepare(
                "INSERT INTO panels (episode_id, panel_number, image_recipe_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
              )
              .run(
                episodeId,
                index + 1,
                "panel",
                new Date().toISOString(),
                new Date().toISOString(),
              );
      const archive = new MediaArchiveService({
        ...config(),
        storage: { local_path: storage },
      });
      const image = await archive.archiveRemote({
        projectId: dramaId,
        generationId: index + 1,
        kind: "image",
        sourceUrl: await pngData(index % 2 ? "blue" : "green", 120, 80),
      });
      db.prepare("UPDATE panels SET image_url = ? WHERE id = ?").run(
        image.publicUrl,
        Number(panel.lastInsertRowid),
      );
      if (index === 0) {
        db.prepare(
          "INSERT INTO panel_captions (panel_id, text, bubble_type, x, y, scale, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          Number(panel.lastInsertRowid),
          "别回头",
          "speech",
          0.5,
          0.5,
          1,
          0,
          new Date().toISOString(),
          new Date().toISOString(),
        );
      }
    }
    const directPackage = await new PageLayoutService(db, {
      ...config(),
      storage: { local_path: storage },
    }).exportPackage({
      projectId: dramaId,
      episodeId,
      template: "grid_2x2",
    });
    const directPackageBytes = fs
      .readFileSync(path.join(storage, directPackage.localPath))
      .toString("binary");
    assert.match(directPackageBytes, /pages\/page_01\.png/);
    const result = await new PageLayoutService(db, {
      ...config(),
      storage: { local_path: storage },
    }).export({ projectId: dramaId, episodeId, template: "grid_2x2" });
    assert.equal(result.width, 240);
    assert.equal(result.height, 160);
    assert.equal(fs.existsSync(path.join(storage, result.localPath)), true);
    const exportedPixels = await sharp(path.join(storage, result.localPath))
      .raw()
      .toBuffer();
    const firstCellCenter = (40 * result.width + 60) * 4;
    assert.notDeepEqual(
      [...exportedPixels.subarray(firstCellCenter, firstCellCenter + 3)],
      [0, 128, 0],
      "导出页应叠加第一格字层，而不是只拼底板",
    );
    assert.equal(
      (
        db
          .prepare("SELECT template FROM page_layouts WHERE id = ?")
          .get(result.id) as { template: string }
      ).template,
      "grid_2x2",
    );
    const packageResult = await new PageLayoutService(db, {
      ...config(),
      storage: { local_path: storage },
    }).exportPackage({ projectId: dramaId, episodeId });
    const packageBytes = fs
      .readFileSync(path.join(storage, packageResult.localPath))
      .toString("binary");
    assert.match(packageBytes, /panels\/01\/panel\.png/);
    assert.match(packageBytes, /panels\/01\/layers\.json/);
    assert.match(packageBytes, /reading_order\.json/);
    assert.match(packageBytes, /page_info\.json/);
    assert.match(packageBytes, /pages\/page_01\.png/);
  } finally {
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

test("页组装按槽位顺序拒绝不一致比例", async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "potato-ratio-"));
  const db = new Database(":memory:");
  try {
    initializeDatabase(db);
    const { dramaId, episodeId } = seedPanel(db);
    for (let index = 0; index < 4; index += 1) {
      const panelId =
        index === 0
          ? (
              db
                .prepare(
                  "SELECT id FROM panels WHERE episode_id = ? AND panel_number = 1",
                )
                .get(episodeId) as { id: number }
            ).id
          : Number(
              db
                .prepare(
                  "INSERT INTO panels (episode_id, panel_number, image_recipe_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                )
                .run(
                  episodeId,
                  index + 1,
                  "panel",
                  new Date().toISOString(),
                  new Date().toISOString(),
                ).lastInsertRowid,
            );
      const archive = new MediaArchiveService({
        ...config(),
        storage: { local_path: storage },
      });
      const image = await archive.archiveRemote({
        projectId: dramaId,
        generationId: index + 10,
        kind: "image",
        sourceUrl: await pngData(
          index === 0 ? "red" : "blue",
          index === 0 ? 100 : 120,
          index === 0 ? 100 : 80,
        ),
      });
      db.prepare("UPDATE panels SET image_url = ? WHERE id = ?").run(
        image.publicUrl,
        panelId,
      );
    }
    await assert.rejects(
      () =>
        new PageLayoutService(db, {
          ...config(),
          storage: { local_path: storage },
        }).export({
          projectId: dramaId,
          episodeId,
          template: "grid_2x2",
          panelIds: [4, 3, 2, 1],
        }),
      /宽高比不一致/u,
    );
  } finally {
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

test("页组装按自定义槽位顺序记录阅读序", async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "potato-order-"));
  const db = new Database(":memory:");
  try {
    initializeDatabase(db);
    const { dramaId, episodeId } = seedPanel(db);
    const panelIds: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const panelId =
        index === 0
          ? (
              db
                .prepare("SELECT id FROM panels WHERE episode_id = ? AND panel_number = 1")
                .get(episodeId) as { id: number }
            ).id
          : Number(
              db
                .prepare("INSERT INTO panels (episode_id, panel_number, image_recipe_prompt, created_at, updated_at) VALUES (?, ?, 'panel', ?, ?)")
                .run(episodeId, index + 1, new Date().toISOString(), new Date().toISOString()).lastInsertRowid,
            );
      panelIds.push(panelId);
      const image = await new MediaArchiveService({ ...config(), storage: { local_path: storage } }).archiveRemote({
        projectId: dramaId,
        generationId: index + 30,
        kind: "image",
        sourceUrl: await pngData("purple", 100, 100),
      });
      db.prepare("UPDATE panels SET image_url = ? WHERE id = ?").run(image.publicUrl, panelId);
    }
    const order = [panelIds[2], panelIds[0], panelIds[3], panelIds[1]];
    const result = await new PageLayoutService(db, { ...config(), storage: { local_path: storage } }).export({
      projectId: dramaId,
      episodeId,
      template: "grid_2x2",
      panelIds: order,
    });
    const stored = db.prepare("SELECT panel_ids FROM page_layouts WHERE id = ?").get(result.id) as { panel_ids: string };
    assert.deepEqual(JSON.parse(stored.panel_ids), order);
  } finally {
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

test("TTS 适配器返回音频后归档为本地业务指针", async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "potato-tts-"));
  const db = new Database(":memory:");
  const previousFetch = globalThis.fetch;
  try {
    initializeDatabase(db);
    const { dramaId, panelId } = seedPanel(db);
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO tts_configs (id, provider, base_url, api_key, role, style, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)",
    ).run("freedub", "https://tts.test", "secret", "narrator", "clear", now);
    const wav = Buffer.alloc(44);
    wav.write("RIFF", 0, "ascii");
    wav.write("WAVE", 8, "ascii");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          audio_url: `data:audio/wav;base64,${wav.toString("base64")}`,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const result = await new FreedubService(db, {
      ...config(),
      storage: { local_path: storage },
    }).synthesize({ projectId: dramaId, panelId, text: "请停下" });
    assert.equal(typeof result.public_url, "string");
    assert.equal(String(result.public_url).startsWith("http"), false);
    assert.equal(
      fs.existsSync(path.join(storage, String(result.local_path))),
      true,
    );
  } finally {
    globalThis.fetch = previousFetch;
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

function seedPanel(db: Database.Database): {
  dramaId: number;
  episodeId: number;
  panelId: number;
} {
  const now = new Date().toISOString();
  const dramaId = Number(
    db
      .prepare(
        "INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('漫画', '{}', ?, ?)",
      )
      .run(now, now).lastInsertRowid,
  );
  const episodeId = Number(
    db
      .prepare(
        "INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第一话', ?, ?)",
      )
      .run(dramaId, now, now).lastInsertRowid,
  );
  const panelId = Number(
    db
      .prepare(
        "INSERT INTO panels (episode_id, panel_number, image_recipe_prompt, created_at, updated_at) VALUES (?, 1, 'panel', ?, ?)",
      )
      .run(episodeId, now, now).lastInsertRowid,
  );
  return { dramaId, episodeId, panelId };
}

function config(): AppConfig {
  return {
    app: { name: "test", version: "1" },
    server: {},
    database: { path: ":memory:" },
    storage: {
      local_path: fs.mkdtempSync(path.join(os.tmpdir(), "potato-media-")),
    },
  };
}

async function pngData(
  color: string,
  width = 100,
  height = 100,
): Promise<string> {
  return `data:image/png;base64,${(
    await sharp({ create: { width, height, channels: 3, background: color } })
      .png()
      .toBuffer()
  ).toString("base64")}`;
}
