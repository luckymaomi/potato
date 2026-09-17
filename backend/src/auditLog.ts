import fs from 'node:fs';
import path from 'node:path';

export type AuditLevel = 'INFO' | 'WARN' | 'ERROR' | 'AUDIT';

export interface AuditRecord {
  timestamp: string;
  level: AuditLevel;
  event: string;
  message?: string;
  details?: unknown;
}

const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_DEPTH = 8;
const SECRET_KEY = /(?:^|[_-])(api[_-]?key|generation[_-]?key|key|token|authorization|cookie|secret|password)(?:$|[_-])/iu;
let auditLogFile: string | undefined;

export function defaultAuditLogFile(): string {
  return path.resolve(__dirname, '..', 'logs', 'everything.log');
}

export function configureAuditLog(filePath = defaultAuditLogFile()): string {
  auditLogFile = path.resolve(filePath);
  fs.mkdirSync(path.dirname(auditLogFile), { recursive: true });
  return auditLogFile;
}

export function currentAuditLogFile(): string | undefined {
  return auditLogFile;
}

export function appendAuditRecord(record: AuditRecord): void {
  if (!auditLogFile) return;
  try {
    const safe = sanitizeAuditValue(record) as AuditRecord;
    fs.appendFileSync(auditLogFile, `${JSON.stringify(safe)}\n`, 'utf8');
  } catch {
    // 审计日志故障不能改变业务请求、任务或媒体归档结果。
  }
}

export function sanitizeAuditValue(value: unknown, key = '', seen = new WeakSet<object>(), depth = 0): unknown {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'function') return `[FUNCTION ${value.name || 'anonymous'}]`;
  if (typeof value === 'symbol') return value.toString();
  if (Buffer.isBuffer(value)) return `[BINARY ${value.byteLength} bytes]`;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: safeString(value.message),
      stack: value.stack ? safeString(value.stack) : undefined,
      cause: value.cause === undefined ? undefined : sanitizeAuditValue(value.cause, 'cause', seen, depth + 1),
    };
  }
  if (typeof value !== 'object') return safeString(String(value));
  if (seen.has(value)) return '[CIRCULAR]';
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeAuditValue(item, key, seen, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[TRUNCATED ${value.length - MAX_ARRAY_ITEMS} items]`);
    return items;
  }
  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  const result = Object.fromEntries(entries.map(([childKey, childValue]) => [
    childKey,
    sanitizeAuditValue(childValue, childKey, seen, depth + 1),
  ]));
  if (Object.keys(value).length > MAX_OBJECT_KEYS) result.__truncated_keys__ = Object.keys(value).length - MAX_OBJECT_KEYS;
  return result;
}

function safeString(value: string): string {
  const trimmed = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]');
  if (/^data:[^;,]+[;,]/iu.test(trimmed)) return `[DATA_URL ${trimmed.length} chars]`;
  const withoutQuery = redactUrlQuery(trimmed);
  return withoutQuery.length <= MAX_STRING_LENGTH
    ? withoutQuery
    : `${withoutQuery.slice(0, MAX_STRING_LENGTH)}[TRUNCATED ${withoutQuery.length - MAX_STRING_LENGTH} chars]`;
}

function redactUrlQuery(value: string): string {
  if (!/^https?:\/\//iu.test(value)) return value;
  try {
    const url = new URL(value);
    const suffix = url.search || url.hash ? '[QUERY_REDACTED]' : '';
    return `${url.origin}${url.pathname}${suffix}`;
  } catch {
    return value;
  }
}
