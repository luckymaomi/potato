import fs from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../errors';
import type { MediaReferenceResolveOptions } from '../providers/contracts';
import type { AppConfig } from '../types/core';

const MAX_INLINE_IMAGE_BYTES = 16 * 1024 * 1024;

export class MediaReferenceService {
  private readonly storageRoot: string;
  private readonly staticBaseUrl?: string;

  constructor(config: AppConfig) {
    this.storageRoot = path.resolve(config.storage?.local_path ?? './data/storage');
    this.staticBaseUrl = config.storage?.base_url?.replace(/\/+$/u, '');
  }

  readonly resolve = async (
    source: string,
    options: MediaReferenceResolveOptions = {},
  ): Promise<string | undefined> => {
    const value = source.trim();
    if (!value) return undefined;
    const format = options.format ?? 'inline';
    const localRelativePath = this.localRelativePath(value);
    if (localRelativePath !== undefined) {
      if (format === 'public-url') return undefined;
      return this.localImageDataUrl(localRelativePath, options.label);
    }
    if (/^https?:\/\//iu.test(value)) return value;
    if (/^data:image\//iu.test(value)) return format === 'inline' ? value : undefined;
    return undefined;
  };

  private localRelativePath(source: string): string | undefined {
    const withoutQuery = source.split(/[?#]/u, 1)[0] ?? '';
    if (withoutQuery.startsWith('/static/')) return decodePath(withoutQuery.slice('/static/'.length));
    if (this.staticBaseUrl && withoutQuery.startsWith(`${this.staticBaseUrl}/`)) {
      return decodePath(withoutQuery.slice(this.staticBaseUrl.length + 1));
    }
    return undefined;
  }

  private async localImageDataUrl(relativePath: string, label = '参考图'): Promise<string> {
    const candidate = path.resolve(this.storageRoot, relativePath.replace(/[\\/]+/gu, path.sep));
    if (!isInside(this.storageRoot, candidate)) throw new ValidationError(`${label}路径越界`);

    let realRoot: string;
    let realFile: string;
    try {
      [realRoot, realFile] = await Promise.all([
        fs.promises.realpath(this.storageRoot),
        fs.promises.realpath(candidate),
      ]);
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) throw new ValidationError(`${label}文件不存在`);
      throw error;
    }
    if (!isInside(realRoot, realFile)) throw new ValidationError(`${label}路径越界`);

    const stats = await fs.promises.stat(realFile);
    if (!stats.isFile()) throw new ValidationError(`${label}不是有效文件`);
    if (stats.size > MAX_INLINE_IMAGE_BYTES) throw new ValidationError(`${label}超过 16MB 限制`);
    const content = await fs.promises.readFile(realFile);
    const mime = imageMime(content);
    if (!mime) throw new ValidationError(`${label}仅支持 JPEG、PNG、GIF 或 WebP`);
    return `data:${mime};base64,${content.toString('base64')}`;
  }
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ValidationError('参考图路径编码无效');
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function imageMime(content: Buffer): string | undefined {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'image/jpeg';
  }
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  const header = content.subarray(0, 6).toString('ascii');
  if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  if (content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF'
    && content.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}
