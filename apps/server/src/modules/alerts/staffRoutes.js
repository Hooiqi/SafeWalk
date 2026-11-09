import { Router } from 'express';
import { z } from 'zod';
import { ALERT_STATUS_ORDER } from '@safewalk/shared';
import { requireSecurityStaff, validate } from '../../http/middleware.js';
import { notFound } from '../../lib/errors.js';
import { getAlert, listAlerts } from './alertQueries.js';

/**
 * Security dashboard: emergency alerts (overdue journeys and SOS) and the
 * response workflow. Safe point management is in safePointRoutes.js.
 */
export function staffRoutes({ pool, alertStatusService }) {
  const router = Router();
  router.use(requireSecurityStaff);

  router.get('/me', async (req, res) => {
    const { rows } = await pool.query(
      `update public.security_staff set last_login = now()
        where staff_id = $1
        returning staff_id, admin_email, full_name, role, badge_no, last_login`,
      [req.identity.staffId],
    );
    res.json(rows[0]);
  });

  router.get(
    '/alerts',
    validate({
      query: z.object({
        scope: z.enum(['open', 'all']).default('open'),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
    }),
    async (req, res) => {
      const { scope, limit } = req.valid.query;
      res.json({ alerts: await listAlerts(pool, { openOnly: scope === 'open', limit }) });
    },
  );

  router.get('/alerts/:alertId', validate({ params: z.object({ alertId: z.uuid() }) }), async (req, res) => {
    const alert = await getAlert(pool, req.valid.params.alertId);
    if (!alert) throw notFound('Alert not found');
    res.json(alert);
  });

  router.post(
    '/alerts/:alertId/status',
    validate({
      params: z.object({ alertId: z.uuid() }),
      body: z
        .object({
          status: z.enum(ALERT_STATUS_ORDER.slice(1)),
          note: z.string().trim().max(500).optional(),
        })
        .strict(),
    }),
    async (req, res) => {
      res.json(await alertStatusService.update(req.identity, req.valid.params.alertId, req.valid.body));
    },
  );

  return router;
}
