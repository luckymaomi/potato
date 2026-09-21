import { createApp } from './app';
import { closeDb } from './db/index';
import logger from './logger';

const { app, config } = createApp();
const port = Number(process.env.PORT) || config.server.port || 5679;
const host = config.server.host || '0.0.0.0';
const server = app.listen(port, host, () => {
  logger.info(`potato API 已启动：http://localhost:${port}/api/v1`);
});

function shutdown(): void {
  logger.info('正在关闭服务');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
