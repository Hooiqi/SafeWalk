import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireAppUser, validate } from '../../http/middleware.js';
import { latLngSchema } from '../../lib/geo.js';
import { TRIP_EVENTS } from './tripStateMachine.js';

const startSchema = z
  .object({
    origin: latLngSchema,
    destination: latLngSchema,
    destination_label: z.string().trim().min(1).max(120).optional(),
    contact_ids: z.array(z.uuid()).min(1, 'Choose at least one trusted contact').max(10),
    battery_level: z.number().int().min(0).max(100).optional(),
    accuracy_m: z.number().min(0).max(10000).optional(),
  })
  .strict();

export const locationSampleSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    recorded_at: z.iso.datetime({ offset: true }),
    battery_level: z.number().int().min(0).max(100).nullable().optional(),
    accuracy_m: z.number().min(0).max(10000).nullable().optional(),
    is_heartbeat: z.boolean().optional(),
  })
  .strict();

const tripParams = z.object({ tripId: z.uuid() });
const extendSchema = z.object({ minutes: z.union([z.literal(5), z.literal(10), z.literal(15)]) }).strict();

export function tripRoutes({ tripService, routing, incidentService }) {
  const router = Router();
  router.use(requireAppUser);

  const perUser = (limit) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      keyGenerator: (req) => req.identity.userId,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please wait a moment' } },
    });

  // Walking route and ETA preview before the user starts (OSRM).
  router.post(
    '/route-preview',
    perUser(30),
    validate({ body: z.object({ origin: latLngSchema, destination: latLngSchema }).strict() }),
    async (req, res) => {
      const route = await routing.walkingRoute(req.valid.body.origin, req.valid.body.destination);
      // Hazard check before walking (Module 3 integration): verified incidents near the route.
      const hazards = incidentService ? await incidentService.alongRoute(route.geometry?.coordinates) : [];
      res.json({ ...route, hazards });
    },
  );

  router.post('/', perUser(10), validate({ body: startSchema }), async (req, res) => {
    res.status(201).json(await tripService.startTrip(req.identity, req.valid.body));
  });

  router.get('/active', async (req, res) => {
    res.json({ trip: await tripService.getOpenTrip(req.identity) });
  });

  router.get(
    '/',
    validate({
      query: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        before: z.iso.datetime({ offset: true }).optional(),
      }),
    }),
    async (req, res) => {
      res.json({ trips: await tripService.listTrips(req.identity, req.valid.query) });
    },
  );

  router.get('/:tripId', validate({ params: tripParams }), async (req, res) => {
    res.json(await tripService.getTrip(req.identity, req.valid.params.tripId));
  });

  // HTTP fallback for location upload, used to flush samples buffered while offline.
  router.post(
    '/:tripId/locations',
    perUser(120),
    validate({ params: tripParams, body: z.object({ samples: z.array(locationSampleSchema).min(1).max(500) }).strict() }),
    async (req, res) => {
      res.json(await tripService.recordLocations(req.identity, req.valid.params.tripId, req.valid.body.samples));
    },
  );

  const transition = (event, bodySchema) => [
    validate({ params: tripParams, ...(bodySchema ? { body: bodySchema } : {}) }),
    async (req, res) => {
      const extendMinutes = req.valid.body?.minutes;
      res.json(await tripService.applyUserEvent(req.identity, req.valid.params.tripId, event, { extendMinutes }));
    },
  ];

  router.post('/:tripId/extend', ...transition(TRIP_EVENTS.EXTEND, extendSchema));
  router.post('/:tripId/arrive', ...transition(TRIP_EVENTS.ARRIVE));
  router.post('/:tripId/confirm-safe', ...transition(TRIP_EVENTS.CONFIRM_SAFE));
  router.post('/:tripId/cancel', ...transition(TRIP_EVENTS.CANCEL));

  return router;
}
