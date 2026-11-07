import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';
import { authenticate, errorHandler, validate } from './http/middleware.js';
import { notFound } from './lib/errors.js';
import { contactRoutes } from './modules/contacts/contactRoutes.js';
import { tripRoutes } from './modules/trips/tripRoutes.js';
import { userRoutes } from './modules/users/userRoutes.js';
import { staffRoutes } from './modules/alerts/staffRoutes.js';
import { safePointRoutes, staffSafePointRoutes } from './modules/safePoints/safePointRoutes.js';
import { sosRoutes } from './modules/sos/sosRoutes.js';

/** Builds the Express application. All dependencies are injected for testing. */
export function createApp(deps) {
  const { config, logger, pool, trackingService } = deps;
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '200kb' }));
  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  app.get('/health', async (_req, res) => {
    await pool.query('select 1');
    res.json({ status: 'ok' });
  });

  // Public, unauthenticated: trusted-contact tracking link (rate limited per IP).
  app.get(
    '/api/track/:token',
    rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }),
    validate({ params: z.object({ token: z.string().max(128) }) }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      res.json(await trackingService.getTrackingView(req.valid.params.token));
    },
  );

  const auth = authenticate(deps);
  app.use('/api/me', auth, userRoutes(deps));
  app.use('/api/contacts', auth, contactRoutes(deps));
  app.use('/api/trips', auth, tripRoutes(deps));
  app.use('/api/sos', auth, sosRoutes(deps));
  app.use('/api/safe-points', auth, safePointRoutes(deps));
  app.use('/api/staff/safe-points', auth, staffSafePointRoutes(deps));
  app.use('/api/staff', auth, staffRoutes(deps));

  app.use((_req, _res, next) => next(notFound('Route not found')));
  app.use(errorHandler(logger));
  return app;
}
