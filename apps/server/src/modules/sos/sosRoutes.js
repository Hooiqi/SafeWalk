import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireAppUser, validate } from '../../http/middleware.js';
import { latLngSchema } from '../../lib/geo.js';
import { locationSampleSchema } from '../trips/tripRoutes.js';

export const createSosSchema = z
  .object({
    trigger_type: z.enum(['HOLD', 'SILENT']),
    // Generated once per SOS press and reused on every retry (idempotency key).
    client_request_id: z.uuid(),
    // Optional: the SOS must go through even before the phone has a GPS fix.
    location: latLngSchema.optional(),
    accuracy_m: z.number().min(0).max(10000).optional(),
    battery_level: z.number().int().min(0).max(100).optional(),
    recorded_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

const alertParams = z.object({ alertId: z.uuid() });

export function sosRoutes({ sosService }) {
  const router = Router();
  router.use(requireAppUser);

  router.post(
    '/',
    // Generous: retries reuse the same request id and never create a second alert.
    rateLimit({ windowMs: 60_000, limit: 20, keyGenerator: (req) => req.identity.userId, standardHeaders: 'draft-8', legacyHeaders: false }),
    validate({ body: createSosSchema }),
    async (req, res) => {
      const alert = await sosService.create(req.identity, req.valid.body);
      res.status(alert.existing ? 200 : 201).json(alert);
    },
  );

  router.get('/active', async (req, res) => {
    res.json({ alert: await sosService.getActive(req.identity) });
  });

  router.get('/:alertId', validate({ params: alertParams }), async (req, res) => {
    res.json(await sosService.get(req.identity, req.valid.params.alertId));
  });

  router.post(
    '/:alertId/locations',
    validate({ params: alertParams, body: z.object({ samples: z.array(locationSampleSchema).min(1).max(500) }).strict() }),
    async (req, res) => {
      res.json(await sosService.recordLocations(req.identity, req.valid.params.alertId, req.valid.body.samples));
    },
  );

  router.post('/:alertId/safe', validate({ params: alertParams }), async (req, res) => {
    res.json(await sosService.markSafe(req.identity, req.valid.params.alertId));
  });

  return router;
}
