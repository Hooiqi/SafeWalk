import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { INCIDENT_CATEGORY, INCIDENT_SEVERITY, INCIDENT_STATUS } from '@safewalk/shared';
import { requireAppUser, requireSecurityStaff, validate } from '../../http/middleware.js';
import { badRequest } from '../../lib/errors.js';
import { latLngSchema } from '../../lib/geo.js';

const category = z.enum(Object.values(INCIDENT_CATEGORY));
const severity = z.enum(Object.values(INCIDENT_SEVERITY));
const groupParams = z.object({ groupId: z.uuid() });
const reportParams = z.object({ reportId: z.uuid() });

const reportSchema = z
  .object({
    category,
    severity_level: severity,
    description: z.string().trim().min(1, 'Describe what happened').max(1000),
    location: latLngSchema,
    accuracy_m: z.number().min(0).max(10000).nullable().optional(),
    is_anonymous: z.boolean().default(false),
    client_request_id: z.uuid().optional(),
  })
  .strict();

// The visible map area. Large areas are refused so the app never pulls the
// whole history at once (proposal 5.2.3 3B).
const MAX_SPAN_DEG = 0.5;
const boundsSchema = z
  .object({
    south: z.coerce.number().min(-90).max(90),
    west: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
  })
  .refine((b) => b.north > b.south && b.east > b.west, 'north must be above south and east right of west')
  .refine((b) => b.north - b.south <= MAX_SPAN_DEG && b.east - b.west <= MAX_SPAN_DEG, 'Zoom in to load incidents');

const optionalNote = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));

const photoBody = (maxBytes) => express.raw({ type: ['image/jpeg', 'image/png'], limit: maxBytes });

/** Student / staff app. */
export function incidentRoutes({ incidentService, config }) {
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

  router.post('/', perUser(config.INCIDENT_REQUESTS_PER_MINUTE), validate({ body: reportSchema }), async (req, res) => {
    res.status(201).json(await incidentService.submit(req.identity, req.valid.body));
  });

  router.post(
    '/reports/:reportId/photo',
    perUser(config.INCIDENT_REQUESTS_PER_MINUTE),
    photoBody(config.MAX_PHOTO_BYTES),
    validate({ params: reportParams }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw badRequest('Send the photo as the request body with Content-Type image/jpeg or image/png');
      }
      res.status(201).json(await incidentService.attachPhoto(req.identity, req.valid.params.reportId, req.body));
    },
  );

  router.get('/mine', async (req, res) => {
    res.json({ reports: await incidentService.listMine(req.identity) });
  });

  router.get('/map', perUser(120), validate({ query: boundsSchema }), async (req, res) => {
    res.json(await incidentService.inBounds(req.valid.query));
  });

  router.get('/:groupId', validate({ params: groupParams }), async (req, res) => {
    res.json(await incidentService.getPublic(req.identity, req.valid.params.groupId));
  });

  return router;
}

/** Security dashboard: review, group and close reports. */
export function staffIncidentRoutes({ incidentService }) {
  const router = Router();
  router.use(requireSecurityStaff);

  const statusQuery = z.object({
    status: z
      .enum(['OPEN', 'ALL', ...Object.values(INCIDENT_STATUS)])
      .default('OPEN'),
  });

  router.get('/', validate({ query: statusQuery }), async (req, res) => {
    const { status } = req.valid.query;
    const statuses =
      status === 'OPEN'
        ? [INCIDENT_STATUS.PENDING, INCIDENT_STATUS.VERIFIED]
        : status === 'ALL'
          ? Object.values(INCIDENT_STATUS)
          : [status];
    res.json({ incidents: await incidentService.listForStaff({ statuses }) });
  });

  router.get('/reports/:reportId/photo', validate({ params: reportParams }), async (req, res) => {
    const photo = await incidentService.photoForStaff(req.valid.params.reportId);
    res.set('Cache-Control', 'private, no-store');
    res.type(photo.contentType).send(photo.buffer);
  });

  router.get('/:groupId', validate({ params: groupParams }), async (req, res) => {
    res.json(await incidentService.getForStaff(req.valid.params.groupId));
  });

  const reviewBody = z
    .object({ severity_level: severity.optional(), public_note: optionalNote(300), staff_note: optionalNote(500) })
    .strict();

  for (const action of ['verify', 'reject', 'resolve']) {
    router.post(`/:groupId/${action}`, validate({ params: groupParams, body: reviewBody }), async (req, res) => {
      res.json(await incidentService.review(req.identity.staffId, req.valid.params.groupId, action, req.valid.body));
    });
  }

  router.post(
    '/:groupId/merge',
    validate({ params: groupParams, body: z.object({ into_group_id: z.uuid() }).strict() }),
    async (req, res) => {
      res.json(await incidentService.merge(req.identity.staffId, req.valid.params.groupId, req.valid.body.into_group_id));
    },
  );

  return router;
}
