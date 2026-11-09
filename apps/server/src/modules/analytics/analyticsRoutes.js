import { Router } from 'express';
import { z } from 'zod';
import { requireSecurityStaff, validate } from '../../http/middleware.js';
import { ANALYTICS_RANGES } from './analyticsService.js';

/** Security dashboard: campus safety analytics. */
export function staffAnalyticsRoutes({ analyticsService }) {
  const router = Router();
  router.use(requireSecurityStaff);
  router.get(
    '/',
    validate({
      query: z.object({
        days: z.coerce.number().int().refine((d) => ANALYTICS_RANGES.includes(d), `days must be one of ${ANALYTICS_RANGES.join(', ')}`).default(30),
      }),
    }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await analyticsService.summary({ days: req.valid.query.days }));
    },
  );
  return router;
}
