import { Router } from 'express';
import { z } from 'zod';
import { ANNOUNCEMENT_PRIORITY } from '@safewalk/shared';
import { requireAppUser, requireSecurityStaff, validate } from '../../http/middleware.js';

const params = z.object({ announceId: z.uuid() });
const priority = z.enum(Object.values(ANNOUNCEMENT_PRIORITY));
const title = z.string().trim().min(3, 'Write a title of at least 3 characters').max(120);
const message = z.string().trim().min(1, 'Write the message').max(2000);
const time = z.iso.datetime({ offset: true });

const createSchema = z
  .object({
    title,
    message_body: message,
    priority: priority.default('INFO'),
    published_at: time.nullable().optional(), // empty = publish now
    expires_at: time.nullable().optional(), // empty = until withdrawn
  })
  .strict();

const updateSchema = z
  .object({
    title: title.optional(),
    message_body: message.optional(),
    priority: priority.optional(),
    published_at: time.optional(),
    expires_at: time.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to change');

/** Student / staff app: live announcements only. */
export function announcementRoutes({ announcementService }) {
  const router = Router();
  router.use(requireAppUser);
  router.get('/', async (_req, res) => {
    res.json({ announcements: await announcementService.listLive() });
  });
  router.get('/:announceId', validate({ params }), async (req, res) => {
    res.json(await announcementService.getLive(req.valid.params.announceId));
  });
  return router;
}

/** Security dashboard. */
export function staffAnnouncementRoutes({ announcementService }) {
  const router = Router();
  router.use(requireSecurityStaff);
  router.get(
    '/',
    validate({ query: z.object({ state: z.enum(['SCHEDULED', 'LIVE', 'EXPIRED', 'WITHDRAWN']).optional() }) }),
    async (req, res) => {
      res.json({ announcements: await announcementService.listForStaff({ state: req.valid.query.state }) });
    },
  );
  router.post('/', validate({ body: createSchema }), async (req, res) => {
    res.status(201).json(await announcementService.create(req.identity.staffId, req.valid.body));
  });
  router.get('/:announceId', validate({ params }), async (req, res) => {
    res.json(await announcementService.getForStaff(req.valid.params.announceId));
  });
  router.patch('/:announceId', validate({ params, body: updateSchema }), async (req, res) => {
    res.json(await announcementService.update(req.identity.staffId, req.valid.params.announceId, req.valid.body));
  });
  router.post('/:announceId/withdraw', validate({ params }), async (req, res) => {
    res.json(await announcementService.withdraw(req.identity.staffId, req.valid.params.announceId));
  });
  return router;
}
