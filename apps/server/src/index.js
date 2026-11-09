import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { attachSocketServer } from './realtime/socketServer.js';

const config = loadConfig();
const deps = await createContainer(config);
const { logger, pool, watchdog, announcementService } = deps;

const httpServer = createServer(createApp(deps));
const io = attachSocketServer(httpServer, deps);

httpServer.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'SafeWalk server listening');
  if (config.devEtaOverrideSeconds) {
    logger.warn({ seconds: config.devEtaOverrideSeconds }, 'DEV_ETA_OVERRIDE_SECONDS is set: trip ETAs are shortened for demonstration');
  }
  watchdog.start();
  announcementService.start();
});

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  watchdog.stop();
  announcementService.stop();
  io.close();
  httpServer.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
