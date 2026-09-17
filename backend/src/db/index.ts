import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { SQLiteDatabase } from '../types/core';

let db: SQLiteDatabase | null = null;

export interface DatabaseConfig {
  path: string;
  type?: string;
}

export function getDb(config: DatabaseConfig): SQLiteDatabase {
  if (db) return db;
  const dbPath = path.resolve(config.path);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

export function closeDb(): void {
  if (!db) return;
  db.close();
  db = null;
}
