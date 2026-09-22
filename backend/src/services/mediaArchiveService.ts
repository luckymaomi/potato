import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig, Logger } from '../types/core';

export type ArchivedMediaKind = 'image' | 'video' | 'audio';

export interface ArchivedMedia {
  publicUrl: string;
  relativePath: string;
  mediaType: string;
  fileSize: number;
}

export class MediaArchiveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MediaArchiveError';
  }
}

export class MediaArchiveService {
  private readonly storageRoot: string;

  constructor(config: AppConfig, private readonly log?: Logger) {
    this.storageRoot = path.resolve(config.storage?.local_path ?? './data/storage');
  }

  async archiveRemote(input: {
    projectId: number;
    generationId: number;
    kind: ArchivedMediaKind;
    sourceUrl: string;
    signal?: AbortSignal;
  }): Promise<ArchivedMedia> {
    this.log?.audit?.('media.archive.started', input);
    try {
      const limit = input.kind === 'image' ? 32 * 1024 * 1024 : input.kind === 'audio' ? 64 * 1024 * 1024 : 512 * 1024 * 1024;
      const bytes = input.sourceUrl.startsWith('data:')
        ? decodeDataUrl(input.sourceUrl)
        : await download(input.sourceUrl, input.kind, limit, input.signal);
      if (!bytes.length) throw new MediaArchiveError('本地归档失败：下载到的媒体为空');
      if (bytes.length > limit) throw new MediaArchiveError(`本地归档失败：媒体超过 ${Math.round(limit / 1024 / 1024)}MB 限制`);
      const archived = await this.archiveBytes(input.projectId, input.generationId, input.kind, bytes);
      this.log?.audit?.('media.archive.completed', { ...input, ...archived });
      return archived;
    } catch (error) {
      this.log?.audit?.('media.archive.failed', { ...input, error });
      throw error;
    }
  }

  async importFile(input: { projectId: number; generationId: number; kind: ArchivedMediaKind; sourcePath: string }): Promise<ArchivedMedia> {
    const handle = await fs.promises.open(input.sourcePath, 'r');
    const header = Buffer.alloc(16);
    let bytesRead = 0;
    try {
      ({ bytesRead } = await handle.read(header, 0, header.length, 0));
    } finally {
      await handle.close();
    }
    const detected = detectMedia(header.subarray(0, bytesRead), input.kind);
    if (!detected) throw new MediaArchiveError(`本地归档失败：内容不是有效${input.kind === 'image' ? '图片' : input.kind === 'audio' ? '音频' : '视频'}`);
    const stat = await fs.promises.stat(input.sourcePath);
    if (!stat.isFile() || stat.size === 0) throw new MediaArchiveError('本地归档失败：媒体文件为空');
    return this.archiveFile(input.projectId, input.generationId, input.kind, input.sourcePath, detected, stat.size);
  }

  private async archiveBytes(projectId: number, generationId: number, kind: ArchivedMediaKind, bytes: Buffer): Promise<ArchivedMedia> {
    const detected = detectMedia(bytes, kind);
    if (!detected) throw new MediaArchiveError(`本地归档失败：内容不是有效${kind === 'image' ? '图片' : kind === 'audio' ? '音频' : '视频'}`);
    const relativePath = path.posix.join('projects', String(projectId), `${kind}s`, `${generationId}.${detected.extension}`);
    const destination = path.resolve(this.storageRoot, ...relativePath.split('/'));
    const root = path.resolve(this.storageRoot);
    if (!inside(root, destination)) throw new MediaArchiveError('本地归档失败：目标路径越界');
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp`;
    try {
      await fs.promises.writeFile(temporary, bytes, { flag: 'wx' });
      await fs.promises.rename(temporary, destination);
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      throw new MediaArchiveError('本地归档失败：无法写入项目媒体目录', { cause: error });
    }
    return {
      publicUrl: `/static/${relativePath}`,
      relativePath,
      mediaType: detected.mediaType,
      fileSize: bytes.length,
    };
  }

  private async archiveFile(
    projectId: number,
    generationId: number,
    kind: ArchivedMediaKind,
    sourcePath: string,
    detected: { extension: string; mediaType: string },
    fileSize: number,
  ): Promise<ArchivedMedia> {
    const relativePath = path.posix.join('projects', String(projectId), `${kind}s`, `${generationId}.${detected.extension}`);
    const destination = path.resolve(this.storageRoot, ...relativePath.split('/'));
    if (!inside(this.storageRoot, destination)) throw new MediaArchiveError('本地归档失败：目标路径越界');
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp`;
    try {
      await fs.promises.copyFile(sourcePath, temporary, fs.constants.COPYFILE_EXCL);
      await fs.promises.rename(temporary, destination);
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      throw new MediaArchiveError('本地归档失败：无法写入项目媒体目录', { cause: error });
    }
    return { publicUrl: `/static/${relativePath}`, relativePath, mediaType: detected.mediaType, fileSize };
  }

  absolutePath(relativePath: string): string {
    const target = path.resolve(this.storageRoot, ...relativePath.replace(/\\/gu, '/').split('/'));
    if (!inside(this.storageRoot, target)) throw new MediaArchiveError('媒体路径越界');
    return target;
  }

  async remove(relativePath: string): Promise<void> {
    await fs.promises.rm(this.absolutePath(relativePath), { force: true });
    this.log?.audit?.('media.archive.removed', { relativePath });
  }

  isAvailable(relativePath: string | null | undefined): boolean {
    if (!relativePath) return false;
    try { return fs.statSync(this.absolutePath(relativePath)).isFile(); } catch { return false; }
  }
}

async function download(sourceUrl: string, kind: ArchivedMediaKind, limit: number, signal?: AbortSignal): Promise<Buffer> {
  if (!/^https?:\/\//iu.test(sourceUrl)) throw new MediaArchiveError('本地归档失败：供应商没有返回可下载的 HTTP 媒体地址');
  let response: Response;
  try {
    response = await fetch(sourceUrl, { signal });
  } catch (error) {
    throw new MediaArchiveError(`本地归档失败：无法下载供应商${kind === 'image' ? '图片' : '视频'}`, { cause: error });
  }
  if (!response.ok) throw new MediaArchiveError(`本地归档失败：媒体下载返回 HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new MediaArchiveError(`本地归档失败：媒体超过 ${Math.round(limit / 1024 / 1024)}MB 限制`);
  return Buffer.from(await response.arrayBuffer());
}

function decodeDataUrl(source: string): Buffer {
  const match = /^data:[^;,]+;base64,([a-z0-9+/=]+)$/iu.exec(source);
  if (!match?.[1]) throw new MediaArchiveError('本地归档失败：供应商内联媒体格式无效');
  return Buffer.from(match[1], 'base64');
}

function detectMedia(bytes: Buffer, kind: ArchivedMediaKind): { extension: string; mediaType: string } | undefined {
  if (kind === 'image') {
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: 'png', mediaType: 'image/png' };
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: 'jpg', mediaType: 'image/jpeg' };
    if (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a') return { extension: 'gif', mediaType: 'image/gif' };
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return { extension: 'webp', mediaType: 'image/webp' };
    return undefined;
  }
  if (kind === 'audio') {
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE') return { extension: 'wav', mediaType: 'audio/wav' };
    if (bytes.subarray(0, 3).toString('ascii') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { extension: 'mp3', mediaType: 'audio/mpeg' };
    if (bytes.subarray(0, 4).toString('ascii') === 'OggS') return { extension: 'ogg', mediaType: 'audio/ogg' };
    return undefined;
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') return { extension: 'mp4', mediaType: 'video/mp4' };
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { extension: 'webm', mediaType: 'video/webm' };
  return undefined;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}
