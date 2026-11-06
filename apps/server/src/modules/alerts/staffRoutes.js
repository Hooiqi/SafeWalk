import { Router } from 'express';
import { z } from 'zod';
import { requireSecurityStaff, validate } from '../../http/middleware.js';
import { notFound } from '../../lib/errors.js';
import { getAlert, listAlerts } from './alertQueries.js';

/**
 * Security dashboard endpoints. Module 1 needs the dashboard to RECEIVE
 * overdue escalations; the full response workflow (status buttons, SOS,
 * reports, safe points, announcements, analytics) is Module 4.
 */
export function staffRoutes({ pool }) {
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

  return router;
}
