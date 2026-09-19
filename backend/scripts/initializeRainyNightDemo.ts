import { loadConfig } from '../src/config';
import { closeDb, getDb } from '../src/db';
import { initializeDatabase } from '../src/db/schema';
import logger, { configureAuditLog } from '../src/logger';
import { providerRegistry } from '../src/providers';
import { createServices } from '../src/services/container';
import { initializeRainyNightDemo } from './rainyNightDemoRuntime';

async function main(): Promise<void> {
  const config = loadConfig();
  configureAuditLog(process.env.TOMATO_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  try {
    initializeDatabase(db);
    const services = createServices(db, config, providerRegistry, logger);
    const project = initializeRainyNightDemo(db, services, logger);
    console.log(`《红女王》Demo 已初始化：项目 ID ${project.id}`);
    console.log('故事总览、项目资产和五条完整分镜规格已写入；未调用供应商或生成媒体。');
  } finally {
    closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
