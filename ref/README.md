# potato 第三方参考克隆（只读）

浅克隆（`--depth 1`）的 AI 漫画 / 漫剧 / 小说转漫 / 生图一致性 / 相关工具源码，供对照调研。**不进入业务运行时依赖。**

目录已被 `.gitignore` 的 `ref/*/` 忽略；本 README 可入库。

## 小说 / 漫画 / 漫剧流水线（优先对照）

| 目录 | 主题 |
| --- | --- |
| `novel-comic-maker` | 小说→漫画，角色卡与人工在环 |
| `mq-ai-Novel2Comic` | 小说→漫画（Spring + Vue） |
| `codex-novel-to-comic-studio` | 长篇改编：bible / 分镜 / 整页 / PDF·CBZ |
| `inkstone` | 小说→连载漫画页（含 Agnes 生图一致性） |
| `story-claw` | 小说→分镜面板自动管线 |
| `illustrative` | 公版文学→图文小说（Gemini） |
| `VISUAL-CHAPTER-PLANNER` | 章节→分镜 / 角色圣经 |
| `ai-comic-factory` | LLM + SDXL 分格漫画工厂 |
| `ai-comic-studio` | 漫剧：剧本→分镜→首尾帧→视频 |
| `AnimaHub` | 漫剧/动漫端到端 |
| `frame-fab` / `story-weaver` | 小说→漫剧桌面流水线 |
| `manju` | 漫剧相关（上游仓库可能为空壳） |

## 漫画生成研究

| 目录 | 主题 |
| --- | --- |
| `DiffSensei` | 可控多角色漫画面板（CVPR 2025） |
| `MangaDiffusion` | 纯文本→多格漫画页布局 |
| `StoryDiffusion` | 长序列角色一致性漫画 |

## 身份 / 参考图一致性

| 目录 | 主题 |
| --- | --- |
| `InstantID` / `ComfyUI_InstantID` | 人脸身份 |
| `PuLID` | ID 保持生图 |
| `PhotoMaker` | 人像定制 |
| `IP-Adapter` / `ComfyUI_IPAdapter_plus` | 图像条件适配 |
| `insightface` / `facefusion` / `roop` | 人脸分析与换脸（只读调研） |

## 生图 UI / 节点 / 控制

| 目录 | 主题 |
| --- | --- |
| `ComfyUI` + `ComfyUI-*` / `comfyui_*` | 节点工作流 |
| `Fooocus` / `stable-diffusion-webui` / `stable-diffusion-webui-forge` / `InvokeAI` | 生图前端 |
| `ControlNet` / `sd-webui-controlnet` | 条件控制 |
| `flux` / `stability-generative-models` / `Kandinsky-2` | 模型侧参考 |

## 漫画工具 / 多模态 / 编排

| 目录 | 主题 |
| --- | --- |
| `manga-image-translator` / `BallonsTranslator` / `manga-ocr` | 漫画翻译与 OCR |
| `MiniCPM-V` | 多模态理解 |
| `langgraph` / `autogen` | Agent 编排参考 |
| `SillyTavern` / `text-generation-webui` | 文本侧工具 |

## 维护

```powershell
# 示例：补克隆一个仓库
cd ref
git -c core.longpaths=true clone --depth 1 --single-branch <url> <name>
```

失败记录见 `_clone_log.txt`（若存在）。`sd-webui-reactor` 因 GitHub 403 未克隆。
