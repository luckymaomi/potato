import { ValidationError } from '../errors';
import { asRecord, readNumber, readString } from '../types/core';
import type { EntityKind } from '../types/domain';
import type { TextPromptKey } from '../services/textPromptCatalog';

export interface ProductionAuditContext {
  runId?: string;
  nodeId?: string;
  nodeTitle?: string;
  nodeRole?: string;
}

interface CommandBase {
  projectId: number;
  audit?: ProductionAuditContext;
}

interface AiCommandBase extends CommandBase {
  provider?: string;
  model?: string;
}

export interface ProductionTarget {
  kind: EntityKind | 'storyboard';
  id: number;
}

export type ProductionCommand =
  | (CommandBase & { kind: 'manual-text'; episodeId?: number; text: string; persistAsScript: boolean })
  | (AiCommandBase & { kind: 'ai-text'; action: TextPromptKey; episodeId?: number; sourceText: string; systemPrompt?: string; storyboardCount?: number })
  | (AiCommandBase & { kind: 'image'; mode: 'text-to-image' | 'image-to-image'; prompt: string; aspectRatio?: string; referenceImages: string[]; target?: ProductionTarget })
  | (AiCommandBase & { kind: 'video'; mode: 'text-to-video' | 'image-to-video'; prompt: string; aspectRatio?: string; duration?: number; referenceImages: string[]; storyboardId?: number })
  | (CommandBase & { kind: 'finalize'; episodeId: number; videoUrls: string[] });

export interface ProductionSubmission {
  status: 'pending' | 'completed';
  task_id?: string;
  result?: Record<string, unknown>;
}

export function parseProductionCommand(input: unknown): ProductionCommand {
  const body = asRecord(input) ?? {};
  const kind = readString(body.kind);
  const projectId = requiredId(body.project_id, '项目');
  const audit = auditContext(body.audit);
  if (kind === 'manual-text') {
    return {
      kind,
      projectId,
      audit,
      episodeId: optionalId(body.episode_id),
      text: requiredText(body.text, '文本内容'),
      persistAsScript: body.persist_as_script === true,
    };
  }
  if (kind === 'ai-text') {
    return {
      kind,
      projectId,
      audit,
      episodeId: optionalId(body.episode_id),
      action: textAction(body.action),
      sourceText: requiredText(body.source_text, '上游文本'),
      systemPrompt: readString(body.system_prompt),
      storyboardCount: boundedCount(body.storyboard_count),
      provider: readString(body.provider),
      model: readString(body.model),
    };
  }
  if (kind === 'image') {
    const mode = imageMode(body.mode);
    const referenceImages = stringArray(body.reference_images);
    const target = targetRecord(body.target);
    validateReferences(mode, referenceImages);
    return {
      kind,
      projectId,
      audit,
      mode,
      prompt: readString(body.prompt) ?? '',
      aspectRatio: readString(body.aspect_ratio),
      referenceImages,
      target,
      provider: readString(body.provider),
      model: readString(body.model),
    };
  }
  if (kind === 'video') {
    const mode = videoMode(body.mode);
    const referenceImages = stringArray(body.reference_images);
    const storyboardId = optionalId(body.storyboard_id);
    validateReferences(mode, referenceImages);
    return {
      kind,
      projectId,
      audit,
      mode,
      prompt: readString(body.prompt) ?? '',
      aspectRatio: readString(body.aspect_ratio),
      duration: readNumber(body.duration),
      referenceImages,
      storyboardId,
      provider: readString(body.provider),
      model: readString(body.model),
    };
  }
  if (kind === 'finalize') {
    const videoUrls = stringArray(body.video_urls);
    if (!videoUrls.length) throw new ValidationError('整集合成至少需要一个显式连入的本地视频');
    return { kind, projectId, audit, episodeId: requiredId(body.episode_id, '集数'), videoUrls };
  }
  throw new ValidationError('未知生产命令');
}

function auditContext(value: unknown): ProductionAuditContext | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const audit: ProductionAuditContext = {
    runId: readString(record.run_id),
    nodeId: readString(record.node_id),
    nodeTitle: readString(record.node_title),
    nodeRole: readString(record.node_role),
  };
  return Object.values(audit).some(Boolean) ? audit : undefined;
}

function textAction(value: unknown): TextPromptKey {
  const action = readString(value);
  const supported: TextPromptKey[] = ['generate-text', 'write-script', 'extract-characters', 'extract-scenes', 'extract-props', 'split-storyboards'];
  if (!supported.includes(action as TextPromptKey)) throw new ValidationError('未知 AI 文本操作');
  return action as TextPromptKey;
}

function imageMode(value: unknown): 'text-to-image' | 'image-to-image' {
  const mode = readString(value);
  if (mode !== 'text-to-image' && mode !== 'image-to-image') throw new ValidationError('未知图片生成方式');
  return mode;
}

function videoMode(value: unknown): 'text-to-video' | 'image-to-video' {
  const mode = readString(value);
  if (mode !== 'text-to-video' && mode !== 'image-to-video') throw new ValidationError('未知视频生成方式');
  return mode;
}

function validateReferences(
  mode: 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video',
  references: string[],
): void {
  const requiresReference = mode === 'image-to-image' || mode === 'image-to-video';
  if (requiresReference && references.length === 0) {
    throw new ValidationError(`${mode === 'image-to-image' ? '图生图' : '图生视频'}至少需要一张参考图`);
  }
  if (!requiresReference && references.length > 0) {
    throw new ValidationError(`${mode === 'text-to-image' ? '文生图' : '文生视频'}不能携带参考图`);
  }
}

function targetRecord(value: unknown): ProductionTarget | undefined {
  if (value === undefined || value === null) return undefined;
  const target = asRecord(value);
  const kind = readString(target?.kind);
  const id = readNumber(target?.id);
  if (!target || !id || !['character', 'scene', 'prop', 'storyboard'].includes(kind ?? '')) {
    throw new ValidationError('图片目标记录无效');
  }
  return { kind: kind as ProductionTarget['kind'], id };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
}

function boundedCount(value: unknown): number | undefined {
  const count = readNumber(value);
  return count === undefined ? undefined : Math.max(1, Math.min(20, Math.trunc(count)));
}

function optionalId(value: unknown): number | undefined {
  const id = readNumber(value);
  return id && id > 0 ? id : undefined;
}

function requiredId(value: unknown, label: string): number {
  const id = optionalId(value);
  if (!id) throw new ValidationError(`${label} ID 无效`);
  return id;
}

function requiredText(value: unknown, label: string): string {
  const text = readString(value);
  if (!text) throw new ValidationError(`${label}不能为空`);
  return text;
}
