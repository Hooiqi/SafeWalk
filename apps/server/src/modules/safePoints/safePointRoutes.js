import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { SAFE_POINT_CATEGORY } from '@safewalk/shared';
import { requireAppUser, requireSecurityStaff, validate } from '../../http/middleware.js';
import { latLngSchema } from '../../lib/geo.js';
import { scheduleSchema } from './openingHours.js';

const coordsQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
const idParams = z.object({ safePointId: z.uuid() });

const optionalText = (max) => z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

const safePointFields = {
  name: z.string().trim().min(1).max(160),
  category: z.enum(Object.values(SAFE_POINT_CATEGORY)),
  location: latLngSchema.nullable(),
  location_description: optionalText(300),
  operating_hours: z.string().trim().min(1).max(300),
  opening_schedule: scheduleSchema,
  contact_phone: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().regex(/^\+[1-9][0-9]{6,14}$/, 'Use international format, e.g. +6046534999').nullable().optional(),
  ),
  contact_notes: optionalText(500),
  notes: optionalText(500),
  data_source: optionalText(300),
  is_active: z.boolean(),
};

/** Student / staff app: navigator endpoints. */
export function safePointRoutes({ safePointService }) {
  const router = Router();
  router.use(requireAppUser);
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    keyGenerator: (req) => req.identity.userId,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  router.get('/', async (_req, res) => {
    res.json(await safePointService.listActive());
  });

  router.get(
    '/nearest',
    limiter,
    validate({ query: coordsQuery.extend({ limit: z.coerce.number().int().min(1).max(10).default(5) }) }),
    async (req, res) => {
      const { lat, lng, limit } = req.valid.query;
      res.json({ safe_points: await safePointService.nearest({ lat, lng }, { limit }) });
    },
  );

  router.get('/:safePointId/directions', limiter, validate({ params: idParams, query: coordsQuery }), async (req, res) => {
    res.json(await safePointService.directions(req.valid.params.safePointId, req.valid.query));
  });

  return router;
}

/** Security dashboard: safe haven and campus resource management. */
export function staffSafePointRoutes({ safePointService }) {
  const router = Router();
  router.use(requireSecurityStaff);

  router.get('/', async (_req, res) => {
    res.json({ safe_points: await safePointService.listAll() });
  });

  router.post('/', validate({ body: z.object(safePointFields).strict() }), async (req, res) => {
    res.status(201).json(await safePointService.save(req.identity.staffId, req.valid.body));
  });

  router.patch(
    '/:safePointId',
    validate({ params: idParams, body: z.object(safePointFields).partial().strict() }),
    async (req, res) => {
      res.json(await safePointService.save(req.identity.staffId, req.valid.body, req.valid.params.safePointId));
    },
  );

  return router;
}
