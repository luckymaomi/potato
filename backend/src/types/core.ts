import type Database from 'better-sqlite3';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface AppConfig {
  app: { name: string; version: string; debug?: boolean; language?: string };
  server: {
    port?: number;
    host?: string;
    cors_origins?: string[];
    insecure_tls?: boolean | string | number;
  };
  database: { type?: string; path: string };
  storage?: { type?: string; local_path?: string; base_url?: string };
  ai?: {
    providers?: Record<string, {
      enabled?: boolean;
      base_url?: string;
      api_key?: string;
      settings?: Record<string, JsonValue>;
    }>;
  };
}

export type SQLiteDatabase = Database.Database;

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  audit?(event: string, details?: unknown): void;
}

export interface AppContext {
  app: import('express').Express;
  config: AppConfig;
  db: SQLiteDatabase;
}

export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
