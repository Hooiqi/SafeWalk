import { createTokenVerifier } from './auth/tokenVerifier.js';
import { createPool } from './db/pool.js';
import { createLogger } from './lib/logger.js';
import { createEmailChannel } from './modules/notifications/channels/email.js';
import { createPushChannel } from './modules/notifications/channels/push.js';
import { createSmsChannel } from './modules/notifications/channels/sms.js';
import { createTelegramChannel } from './modules/notifications/channels/telegram.js';
import { createDispatcher } from './modules/notifications/dispatcher.js';
import { createRoutingService } from './modules/routing/osrmClient.js';
import { createTrackingService } from './modules/tracking/trackingService.js';
import { createSafePointService } from './modules/safePoints/safePointService.js';
import { createSosService } from './modules/sos/sosService.js';
import { createAlertStatusService } from './modules/alerts/alertStatusService.js';
import { createTripService } from './modules/trips/tripService.js';
import { createEtaWatchdog } from './modules/watchdog/etaWatchdog.js';
import { createPublisher } from './realtime/publisher.js';

/**
 * Wires the server's services together. Tests pass overrides (clock,
 * fetch for OSRM, notification channels) instead of real external services.
 */
export async function createContainer(config, overrides = {}) {
  const logger = overrides.logger ?? createLogger(config.LOG_LEVEL);
  const pool = overrides.pool ?? createPool(config);
  const clock = overrides.clock ?? (() => new Date());
  const verifyToken = overrides.verifyToken ?? createTokenVerifier(config);
  const publisher = createPublisher();
  const routing = createRoutingService(config, { fetchImpl: overrides.fetch ?? fetch, logger });

  const channels = overrides.channels ?? [
    await createPushChannel(config, logger),
    createSmsChannel(config),
    createTelegramChannel(config),
    createEmailChannel(config),
  ];
  const dispatcher = createDispatcher({ channels, logger, timeoutMs: config.NOTIFICATION_TIMEOUT_MS });

  const base = { config, logger, pool, clock, publisher, dispatcher, routing, verifyToken };
  const tripService = createTripService(base);
  const trackingService = createTrackingService(base);
  const watchdog = createEtaWatchdog({ ...base, tripService });
  const safePointService = createSafePointService(base);
  const sosService = createSosService(base);
  const alertStatusService = createAlertStatusService({ ...base, tripService });

  for (const c of channels) {
    if (!c.configured) logger.info(`notification channel "${c.name}" not configured: deliveries will be reported as skipped`);
  }

  return { ...base, tripService, trackingService, watchdog, safePointService, sosService, alertStatusService };
}
