import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config';
import { closeDb, getDb } from '../src/db';
import { initializeDatabase } from '../src/db/schema';
import logger, { configureAuditLog, currentAuditLogFile } from '../src/logger';
import { parseProductionCommand } from '../src/production/commands';
import { providerRegistry } from '../src/providers';
import { createServices, type ServiceContainer } from '../src/services/container';
import type { TaskRecord } from '../src/services/taskService';
import type { Drama } from '../src/types/domain';
import type { CanvasNode, CanvasWorkspaceSnapshot } from '../../frontend/src/features/canvas/canvasTypes';
import { createCanvasSnapshot, normalizeCanvasNodes } from '../../frontend/src/features/canvas/canvasSnapshot';
import { orderByConnections } from '../../frontend/src/features/canvas/canvasGraph';
import { productionPlugin, type ProductionNodeResult } from '../../frontend/src/features/production/catalog';
import { resolveNodeContext } from '../../frontend/src/features/production/contextResolver';
import { isReusableProductionNode, mediaLifecycleState } from '../../frontend/src/features/production/lifecycle';
import { RAINY_NIGHT_DEMO } from '../../frontend/src/features/production/rainyNightDemoDefinition';
import { initializeRainyNightDemo } from './rainyNightDemoRuntime';

const MAX_NODE_ATTEMPTS = 3;
const TASK_POLL_INTERVAL_MS = 2_000;
const TASK_POLL_LIMIT = 3_600;

class TaskFailedError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'TaskFailedError';
  }
}

async function main(): Promise<void> {
  configureAuditLog(process.env.TOMATO_AUDIT_LOG_PATH?.trim() || undefined);
  const runId = `rainy-night-${randomUUID()}`;
  const config = loadConfig();
  const db = getDb(config.database);
  logger.audit?.('acceptance.rainy-night.started', { runId, logFile: currentAuditLogFile() });
  try {
    initializeDatabase(db);
    const services = createServices(db, config, providerRegistry, logger);
    let project = initializeRainyNightDemo(db, services, logger);
    await verifyProviderModels(services);

    const snapshot = readWorkspace(project);
    const nodes = normalizeCanvasNodes(snapshot.workspace_nodes, project);
    const runIds = nodes
      .filter((node) => ['character-asset', 'scene-asset', 'prop-asset', 'storyboard-image', 'shot-video', 'episode-compose'].includes(node.data.role))
      .map((node) => node.id);
    const ordered = orderByConnections(nodes, snapshot.edges, runIds);
    let skipped = 0;
    let completed = 0;

    for (const orderedNode of ordered) {
      const node = nodes.find((item) => item.id === orderedNode.id);
      if (!node) continue;
      project = services.projects.require(project.id);
      if (nodeReady(node, project)) {
        skipped += 1;
        logger.audit?.('acceptance.rainy-night.node.skipped', { runId, nodeId: node.id, role: node.data.role, generationId: node.data.result.generationId });
        console.log(`[跳过] ${node.data.title || node.id} 已有可用本地结果`);
        continue;
      }
      await executeWithRetry(node, nodes, snapshot, project, services, runId, async () => {
        project = persistWorkspace(services, project, nodes, snapshot);
      });
      completed += 1;
      project = persistWorkspace(services, project, nodes, snapshot);
      console.log(`[完成] ${node.data.title || node.id}`);
    }

    project = services.projects.require(project.id);
    const unavailable = ordered.filter((node) => !nodeReady(nodes.find((item) => item.id === node.id) as CanvasNode, project));
    if (unavailable.length) throw new Error(`仍有节点没有可用本地结果：${unavailable.map((node) => node.data.title || node.id).join('、')}`);
    logger.audit?.('acceptance.rainy-night.completed', { runId, projectId: project.id, completed, skipped });
    console.log(`《雨夜外卖》真实全链验收完成：本次生成 ${completed} 个节点，复用 ${skipped} 个节点。`);
    console.log(`Everything 日志：${currentAuditLogFile() || '未配置'}`);
  } catch (error) {
    logger.audit?.('acceptance.rainy-night.failed', { runId, error });
    throw error;
  } finally {
    closeDb();
  }
}

async function verifyProviderModels(services: ServiceContainer): Promise<void> {
  await services.aiConfigs.refresh(RAINY_NIGHT_DEMO.media.provider);
  services.aiConfigs.select('image', RAINY_NIGHT_DEMO.media.provider, RAINY_NIGHT_DEMO.media.imageModel, {
    mode: 'text-to-image', referenceImageCount: 0, aspectRatio: RAINY_NIGHT_DEMO.media.aspectRatio, requiresAspectRatio: true,
  });
  services.aiConfigs.select('image', RAINY_NIGHT_DEMO.media.provider, RAINY_NIGHT_DEMO.media.imageModel, {
    mode: 'image-to-image', referenceImageCount: 5, aspectRatio: RAINY_NIGHT_DEMO.media.aspectRatio, requiresAspectRatio: true,
  });
  services.aiConfigs.select('video', RAINY_NIGHT_DEMO.media.provider, RAINY_NIGHT_DEMO.media.videoModel, {
    mode: 'image-to-video', referenceImageCount: 1, aspectRatio: RAINY_NIGHT_DEMO.media.aspectRatio, requiresAspectRatio: true,
  });
  logger.audit?.('acceptance.rainy-night.models.verified', {
    provider: RAINY_NIGHT_DEMO.media.provider,
    imageModel: RAINY_NIGHT_DEMO.media.imageModel,
    videoModel: RAINY_NIGHT_DEMO.media.videoModel,
  });
}

async function executeWithRetry(
  node: CanvasNode,
  nodes: CanvasNode[],
  snapshot: CanvasWorkspaceSnapshot,
  project: Drama,
  services: ServiceContainer,
  runId: string,
  persistFailure: () => Promise<void>,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_NODE_ATTEMPTS; attempt += 1) {
    try {
      await executeNode(node, nodes, snapshot, project, services, runId, attempt);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      node.data.status = 'failed';
      node.data.error = message;
      await persistFailure();
      const retryable = error instanceof TaskFailedError
        ? error.retryable
        : /(?:429|rate.?limit|temporar|timeout|timed out|网络|限流)/iu.test(message);
      logger.audit?.('acceptance.rainy-night.node.failed', { runId, nodeId: node.id, role: node.data.role, attempt, retryable, error });
      if (!retryable || attempt >= MAX_NODE_ATTEMPTS) throw error;
      const waitMs = 15_000 * 2 ** (attempt - 1);
      logger.audit?.('acceptance.rainy-night.node.retrying', { runId, nodeId: node.id, attempt, waitMs });
      console.log(`[重试] ${node.data.title || node.id}：${message}；${waitMs / 1_000} 秒后重试`);
      await delay(waitMs);
    }
  }
}

async function executeNode(
  node: CanvasNode,
  nodes: CanvasNode[],
  snapshot: CanvasWorkspaceSnapshot,
  project: Drama,
  services: ServiceContainer,
  runId: string,
  attempt: number,
): Promise<void> {
  node.data.status = 'running';
  node.data.error = '';
  const plugin = productionPlugin(node.data.role);
  const context = resolveNodeContext(node, nodes, snapshot.edges);
  const rawCommand = plugin.buildCommand({ project, data: node.data, context });
  const command = parseProductionCommand({
    ...rawCommand,
    audit: { run_id: runId, node_id: node.id, node_title: node.data.title, node_role: node.data.role },
  });
  logger.audit?.('acceptance.rainy-night.node.started', { runId, nodeId: node.id, role: node.data.role, attempt });
  console.log(`[运行] ${node.data.title || node.id}（第 ${attempt} 次）`);
  const submission = services.production.execute(command);
  const result = submission.status === 'completed'
    ? submission.result || {}
    : await waitForTask(services, requiredTaskId(submission.task_id), runId, node);
  applyMediaResult(node, result);
  node.data.status = 'completed';
  node.data.error = '';
  logger.audit?.('acceptance.rainy-night.node.completed', {
    runId, nodeId: node.id, role: node.data.role, generationId: node.data.result.generationId, localPath: node.data.result.localPath,
  });
}

async function waitForTask(
  services: ServiceContainer,
  taskId: string,
  runId: string,
  node: CanvasNode,
): Promise<Record<string, unknown>> {
  let lastProgress = -1;
  for (let attempt = 0; attempt < TASK_POLL_LIMIT; attempt += 1) {
    const task = services.tasks.get(taskId);
    if (!task) throw new Error(`任务不存在：${taskId}`);
    if (task.progress !== lastProgress) {
      lastProgress = task.progress;
      logger.audit?.('acceptance.rainy-night.task.observed', { runId, nodeId: node.id, taskId, status: task.status, progress: task.progress, message: task.message });
      console.log(`[进度] ${node.data.title || node.id} ${task.progress}% ${task.message || ''}`);
    }
    if (task.status === 'completed') return task.result || {};
    if (task.status === 'failed' || task.status === 'cancelled') throw taskError(task);
    await delay(TASK_POLL_INTERVAL_MS);
  }
  throw new TaskFailedError('生产任务轮询超时', true);
}

function applyMediaResult(node: CanvasNode, raw: Record<string, unknown>): void {
  const url = typeof raw.image_url === 'string' ? raw.image_url : typeof raw.video_url === 'string' ? raw.video_url : '';
  const localPath = typeof raw.local_path === 'string' ? raw.local_path : '';
  const generationId = Number(raw.generation_id);
  if (!url.startsWith('/static/') || !localPath || !Number.isInteger(generationId) || generationId <= 0) {
    throw new Error('生产任务没有返回已落盘的本地媒体结果');
  }
  const result: ProductionNodeResult = {
    outputUrl: url,
    localPath,
    generationId,
    mediaAvailable: true,
    assetRefs: { ...node.data.assetRefs },
    createdAt: new Date().toISOString(),
  };
  node.data.result = result;
  node.data.history = [...(node.data.history || []), result];
}

function nodeReady(node: CanvasNode, project: Drama): boolean {
  if (!isReusableProductionNode(node.data)) return false;
  const plugin = productionPlugin(node.data.role);
  if (plugin.material === 'text') return true;
  const state = mediaLifecycleState(project, plugin.material, node.data.result.generationId);
  return Boolean(state?.status === 'completed' && state.available && state.url?.startsWith('/static/') && state.local_path);
}

function persistWorkspace(
  services: ServiceContainer,
  project: Drama,
  nodes: CanvasNode[],
  snapshot: CanvasWorkspaceSnapshot,
): Drama {
  return services.projects.saveCanvas(
    project.id,
    createCanvasSnapshot(nodes, snapshot.edges, snapshot.workflow_groups, snapshot.template),
    project.canvas_revision,
  );
}

function readWorkspace(project: Drama): CanvasWorkspaceSnapshot {
  const value = project.metadata.canvas_layout;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Demo 缺少画布快照');
  const snapshot = value as unknown as CanvasWorkspaceSnapshot;
  if (!Array.isArray(snapshot.workspace_nodes) || !Array.isArray(snapshot.edges) || !Array.isArray(snapshot.workflow_groups)) {
    throw new Error('Demo 画布快照结构无效');
  }
  return snapshot;
}

function taskError(task: TaskRecord): TaskFailedError {
  return new TaskFailedError(task.failure?.message || task.error || task.message || '生产任务失败', task.failure?.retryable === true);
}

function requiredTaskId(value: string | undefined): string {
  if (!value) throw new Error('后端没有返回任务 ID');
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
