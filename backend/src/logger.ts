import {
  appendAuditRecord,
  configureAuditLog,
  currentAuditLogFile,
  sanitizeAuditValue,
} from './auditLog';
import type { Logger } from './types/core';

function stringify(value: unknown): string {
  const safe = sanitizeAuditValue(value);
  if (typeof safe === 'string') return safe;
  try { return JSON.stringify(safe); } catch { return String(safe); }
}

function write(level: string, message: string, args: unknown[]): void {
  const suffix = args.length ? ` ${args.map(stringify).join(' ')}` : '';
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}`;
  console.log(line);
  appendAuditRecord({
    timestamp: new Date().toISOString(),
    level: level === 'WARN' || level === 'ERROR' ? level : 'INFO',
    event: 'application.log',
    message,
    details: args.length ? sanitizeAuditValue(args) : undefined,
  });
}

const logger: Logger & { audit(event: string, details?: unknown): void } = {
  info: (message, ...args) => write('INFO', message, args),
  warn: (message, ...args) => write('WARN', message, args),
  error: (message, ...args) => write('ERROR', message, args),
  audit: (event, details) => {
    appendAuditRecord({
      timestamp: new Date().toISOString(),
      level: 'AUDIT',
      event,
      details: sanitizeAuditValue(details),
    });
  },
};

export { configureAuditLog, currentAuditLogFile };
export default logger;
