import { Router } from 'express';
import { z } from 'zod';
import { requireAppUser, validate } from '../../http/middleware.js';
import { notFound } from '../../lib/errors.js';

const PROFILE_COLUMNS = 'user_id, full_name, matric_or_staff_id, phone_number, email, created_at';

const updateSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120).optional(),
    matric_or_staff_id: z.string().trim().max(32).nullable().optional(),
    phone_number: z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/, 'Use international format, e.g. +60123456789')
      .nullable()
      .optional(),
    device_fcm_token: z.string().max(4096).nullable().optional(),
  })
  .strict();

export function userRoutes({ pool }) {
  const router = Router();
  router.use(requireAppUser);

  async function loadProfile(userId) {
    const { rows } = await pool.query(`select ${PROFILE_COLUMNS} from public.app_user where user_id = $1`, [userId]);
    if (!rows[0]) throw notFound('Profile not found');
    return rows[0];
  }

  router.get('/', async (req, res) => {
    res.json(await loadProfile(req.identity.userId));
  });

  router.patch('/', validate({ body: updateSchema }), async (req, res) => {
    const entries = Object.entries(req.valid.body);
    if (entries.length === 0) return res.json(await loadProfile(req.identity.userId));
    const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `update public.app_user set ${sets} where user_id = $1 returning ${PROFILE_COLUMNS}`,
      [req.identity.userId, ...entries.map(([, v]) => v)],
    );
    res.json(rows[0]);
  });

  return router;
}
