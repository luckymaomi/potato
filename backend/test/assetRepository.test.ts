import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema";
import { AssetRepository } from "../src/services/assetRepository";

function setup() {
  const db = new Database(":memory:");
  initializeDatabase(db);
  const now = new Date().toISOString();
  const projectId = Number(
    db
      .prepare(
        `
    INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('资产测试', '{}', ?, ?)
  `,
      )
      .run(now, now).lastInsertRowid,
  );
  const episodeId = Number(
    db
      .prepare(
        `
    INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第 1 集', ?, ?)
  `,
      )
      .run(projectId, now, now).lastInsertRowid,
  );
  return { db, projectId, episodeId, assets: new AssetRepository(db) };
}

test("项目资产库保存三类结构化卡和各自的生成输入参考图", () => {
  const { db, projectId, assets } = setup();
  try {
    const character = assets.createProjectAsset(projectId, {
      kind: "character",
      name: "红女王（加冕）",
      text_profile: {
        age: "32岁",
        gender: "女",
        occupation: "夜城女王",
        faction: "王党",
        face_shape: "冷峻鹅蛋脸",
        facial_features: "细长眼与高鼻梁",
        hairstyle: "黑色盘发",
        body_type: "高挑",
        skin_tone: "冷白",
        default_outfit: "深红加冕礼服",
        personality: "克制锋利",
        common_expressions: "审视",
        aura: "威严",
      },
      output_type: "character-layout-d",
      output_prompt: "红女王七图身份锚点组，保持同一造型。",
      input_reference_images: [
        "/static/uploads/queen-face.png",
        "/static/uploads/queen-dress.png",
      ],
    });
    const scene = assets.createProjectAsset(projectId, {
      kind: "scene",
      name: "烛光王座厅",
      text_profile: {
        location_type: "王宫大厅",
        layout: "长厅尽头设王座",
        time_of_day: "深夜",
        light_source: "烛火",
        weather: "暴雨",
      },
      output_type: "scene-detail",
      output_prompt: "烛光王座厅局部材质与光影特写。",
      input_reference_images: ["/static/uploads/throne-hall.png"],
    });
    const prop = assets.createProjectAsset(projectId, {
      kind: "prop",
      name: "血色王冠",
      text_profile: {
        category: "王权信物",
        material: "暗金与红宝石",
        condition: "边缘有旧裂痕",
        default_state: "闭合完整",
      },
      output_type: "prop-state-variant",
      output_prompt: "血色王冠破损状态标准资产图。",
      input_reference_images: ["/static/uploads/crown.png"],
    });

    assert.deepEqual(
      assets.listProjectAssets(projectId).map((item) => ({
        id: item.id,
        kind: item.kind,
        name: item.name,
        text_profile: item.text_profile,
        output_type: item.output_type,
        output_prompt: item.output_prompt,
        input_reference_images: item.input_reference_images,
      })),
      [
        {
          id: character.id,
          kind: "character",
          name: "红女王（加冕）",
          text_profile: character.text_profile,
          output_type: "character-layout-d",
          output_prompt: "红女王七图身份锚点组，保持同一造型。",
          input_reference_images: [
            "/static/uploads/queen-face.png",
            "/static/uploads/queen-dress.png",
          ],
        },
        {
          id: scene.id,
          kind: "scene",
          name: "烛光王座厅",
          text_profile: scene.text_profile,
          output_type: "scene-detail",
          output_prompt: "烛光王座厅局部材质与光影特写。",
          input_reference_images: ["/static/uploads/throne-hall.png"],
        },
        {
          id: prop.id,
          kind: "prop",
          name: "血色王冠",
          text_profile: prop.text_profile,
          output_type: "prop-state-variant",
          output_prompt: "血色王冠破损状态标准资产图。",
          input_reference_images: ["/static/uploads/crown.png"],
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("同项目各话复用同一资产 ID，分格关系只保存当前项目资产", () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const now = new Date().toISOString();
    const secondEpisodeId = Number(
      db
        .prepare(
          `
      INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 2, '第 2 集', ?, ?)
    `,
        )
        .run(projectId, now, now).lastInsertRowid,
    );
    const queen = assets.createProjectAsset(projectId, {
      kind: "character",
      name: "红女王（加冕）",
    });
    const crown = assets.createProjectAsset(projectId, {
      kind: "prop",
      name: "血色王冠",
    });
    const otherProjectId = Number(
      db
        .prepare(
          `
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('其他项目', '{}', ?, ?)
    `,
        )
        .run(now, now).lastInsertRowid,
    );
    const foreign = assets.createProjectAsset(otherProjectId, {
      kind: "scene",
      name: "其他项目王宫",
    });

    const firstShot = assets.createPanel({
      episode_id: episodeId,
      title: "加冕",
      project_asset_ids: [queen.id, crown.id, foreign.id],
    });
    const secondShot = assets.createPanel({
      episode_id: secondEpisodeId,
      title: "归来",
      project_asset_ids: [queen.id],
    });

    assert.deepEqual(firstShot.project_asset_ids, [queen.id, crown.id]);
    assert.deepEqual(secondShot.project_asset_ids, [queen.id]);
  } finally {
    db.close();
  }
});

test("新建资产卡等待用户显式组装，并保留之后保存的用户文本", () => {
  const { db, projectId, assets } = setup();
  try {
    const card = assets.createProjectAsset(projectId, {
      kind: "character",
      name: "林岚",
      text_profile: { hairstyle: "短发" },
    });
    assert.equal(card.output_prompt, "");
    const prompt = "  用户手写的构图\n保持雀斑、短发和深蓝外套。\n";
    assets.updateProjectAsset(card.id, { output_prompt: prompt });
    const updated = assets.updateProjectAsset(card.id, {
      name: "林岚（雨夜）",
      text_profile: { hairstyle: "湿润短发" },
    });
    assert.equal(updated.output_prompt, prompt);
    assert.equal(assets.listProjectAssets(projectId)[0]?.output_prompt, prompt);
  } finally {
    db.close();
  }
});

test("更新资产卡会规范化结构化文本和参考图数组", () => {
  const { db, projectId, assets } = setup();
  try {
    const card = assets.createProjectAsset(projectId, {
      kind: "prop",
      name: "王冠",
    });
    const updated = assets.updateProjectAsset(card.id, {
      name: "血色王冠",
      text_profile: {
        material: " 暗金 ",
        color: "",
        interaction_states: "手持、放置",
      },
      output_type: "prop-state-variant",
      output_prompt: "  暗金王冠破损状态，多角度清晰呈现。  ",
      input_reference_images: [
        " /static/uploads/crown.png ",
        "/static/uploads/crown.png",
        "",
      ],
    });

    assert.equal(updated.name, "血色王冠");
    assert.deepEqual(updated.text_profile, {
      material: "暗金",
      interaction_states: "手持、放置",
    });
    assert.equal(updated.output_type, "prop-state-variant");
    assert.equal(
      updated.output_prompt,
      "  暗金王冠破损状态，多角度清晰呈现。  ",
    );
    assert.deepEqual(updated.input_reference_images, [
      "/static/uploads/crown.png",
    ]);
  } finally {
    db.close();
  }
});

test("分格保存漫画规格、项目资产和本格额外参考图", () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const queen = assets.createProjectAsset(projectId, {
      kind: "character",
      name: "红女王（加冕）",
    });
    const shot = assets.createPanel({
      episode_id: episodeId,
      title: "扶正王冠",
      description: "红女王在王座前扶正王冠",
      framing: "半身人物",
      viewpoint: "正面略低视角",
      composition: "人物居中，王座位于后景",
      action: "抬手扶正王冠",
      expression: "冷静、威严",
      lighting: "烛光侧逆光",
      mood: "冷静、威严",
      image_prompt: "电影感宫廷近景",
      image_recipe_prompt: "用户确认的宫廷近景图片配方",
      image_recipe_references: [
        "/static/assets/queen.png",
        "/static/uploads/pose.png",
      ],
      project_asset_ids: [queen.id],
      extra_reference_images: [
        "/static/uploads/pose.png",
        "/static/uploads/light.png",
      ],
    });

    assert.deepEqual(assets.getPanel(shot.id), shot);
    assert.deepEqual(shot.project_asset_ids, [queen.id]);
    assert.deepEqual(shot.extra_reference_images, [
      "/static/uploads/pose.png",
      "/static/uploads/light.png",
    ]);
    assert.deepEqual(shot.image_recipe_references, [
      "/static/assets/queen.png",
      "/static/uploads/pose.png",
    ]);
  } finally {
    db.close();
  }
});

test("删除项目资产后分格托盘保留仍存在的资产", () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const queen = assets.createProjectAsset(projectId, {
      kind: "character",
      name: "红女王",
    });
    const crown = assets.createProjectAsset(projectId, {
      kind: "prop",
      name: "王冠",
    });
    const shot = assets.createPanel({
      episode_id: episodeId,
      title: "王座",
      project_asset_ids: [queen.id, crown.id],
    });
    assets.deleteProjectAsset(queen.id);

    assert.deepEqual(assets.getPanel(shot.id)?.project_asset_ids, [crown.id]);
  } finally {
    db.close();
  }
});

test("删除分格后按现有顺序生成连续编号", () => {
  const { db, episodeId, assets } = setup();
  try {
    const first = assets.createPanel({ episode_id: episodeId, title: "一" });
    const second = assets.createPanel({ episode_id: episodeId, title: "二" });
    const third = assets.createPanel({ episode_id: episodeId, title: "三" });
    assets.deletePanel(second.id);

    assert.deepEqual(
      assets
        .listPanels(episodeId)
        .map((item) => [item.id, item.panel_number, item.title]),
      [
        [first.id, 1, "一"],
        [third.id, 2, "三"],
      ],
    );
  } finally {
    db.close();
  }
});
