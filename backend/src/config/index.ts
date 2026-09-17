import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { AppConfig } from '../types/core';

function isConfig(value: unknown): value is AppConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppConfig>;
  return Boolean(candidate.app && typeof candidate.app.name === 'string' && candidate.database && typeof candidate.database.path === 'string');
}

export function loadConfig(): AppConfig {
  const explicitPath = process.env.TOMATO_CONFIG_PATH?.trim();
  const configPaths = explicitPath
    ? [path.resolve(explicitPath)]
    : [
        path.join(process.cwd(), '..', 'config.yaml'),
        path.join(__dirname, '..', '..', '..', 'config.yaml'),
        path.join(process.cwd(), 'configs', 'config.yaml'),
        path.join(process.cwd(), 'config.yaml'),
        path.join(__dirname, '..', '..', 'configs', 'config.yaml'),
      ];
  let raw: string | undefined;
  let sourcePath: string | undefined;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      raw = fs.readFileSync(configPath, 'utf8');
      sourcePath = configPath;
      break;
    }
  }
  if (!raw) throw new Error(explicitPath ? `Config file not found: ${path.resolve(explicitPath)}` : 'Config file not found: config.yaml');
  const parsed: unknown = yaml.load(raw);
  if (!isConfig(parsed)) throw new Error('Invalid config: missing app or database section');
  const configDirectory = path.dirname(sourcePath as string);
  parsed.database.path = resolveLocalPath(configDirectory, parsed.database.path);
  if (parsed.storage?.local_path) {
    parsed.storage.local_path = resolveLocalPath(configDirectory, parsed.storage.local_path);
  }
  return parsed;
}

function resolveLocalPath(baseDirectory: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDirectory, value);
}
