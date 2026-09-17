import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from './types/core';

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function write(level: string, message: string, args: unknown[]): void {
  const suffix = args.length ? ` ${args.map(stringify).join(' ')}` : '';
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}`;
  console.log(line);
  const logFile = process.env.LOG_FILE;
  if (!logFile) return;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`, 'utf8');
  } catch { /* 日志写盘失败不能打断请求。 */ }
}

const logger: Logger = {
  info: (message, ...args) => write('INFO', message, args),
  warn: (message, ...args) => write('WARN', message, args),
  error: (message, ...args) => write('ERROR', message, args),
};

export default logger;
