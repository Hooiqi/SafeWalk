import { Router } from 'express';
import { z } from 'zod';
import { requireAppUser, validate } from '../../http/middleware.js';
import { badRequest, notFound } from '../../lib/errors.js';

const MAX_CONTACTS = 10;
const COLUMNS = 'contact_id, contact_name, phone_number, telegram_chat_id, email, created_at';

// Empty form fields arrive as "" and mean "not provided".
const optionalText = (schema) => z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());

const fields = {
  contact_name: z.string().trim().min(1).max(120),
  phone_number: optionalText(z.string().regex(/^\+[1-9][0-9]{6,14}$/, 'Use international format, e.g. +60123456789')),
  telegram_chat_id: optionalText(z.string().regex(/^-?[0-9]{3,32}$/, 'Telegram chat id is numeric')),
  email: optionalText(z.email().max(254)),
};

const hasChannel = (c) => Boolean(c.phone_number || c.telegram_chat_id || c.email);

const createSchema = z
  .object(fields)
  .strict()
  .refine(hasChannel, { message: 'Provide at least a phone number, Telegram chat id or email' });
const updateSchema = z.object(fields).partial().strict();
const idParams = z.object({ contactId: z.uuid() });

export function contactRoutes({ pool }) {
  const router = Router();
  router.use(requireAppUser);

  router.get('/', async (req, res) => {
    const { rows } = await pool.query(
      `select ${COLUMNS} from public.trusted_contact where user_id = $1 order by contact_name`,
      [req.identity.userId],
    );
    res.json(rows);
  });

  router.post('/', validate({ body: createSchema }), async (req, res) => {
    const c = req.valid.body;
    const { rows } = await pool.query(
      `insert into public.trusted_contact (user_id, contact_name, phone_number, telegram_chat_id, email)
       select $1, $2, $3, $4, $5
        where (select count(*) from public.trusted_contact where user_id = $1) < $6
       returning ${COLUMNS}`,
      [req.identity.userId, c.contact_name, c.phone_number ?? null, c.telegram_chat_id ?? null, c.email ?? null, MAX_CONTACTS],
    );
    if (!rows[0]) throw badRequest(`You can save up to ${MAX_CONTACTS} trusted contacts`);
    res.status(201).json(rows[0]);
  });

  router.patch('/:contactId', validate({ params: idParams, body: updateSchema }), async (req, res) => {
    const entries = Object.entries(req.valid.body);
    if (entries.length === 0) throw badRequest('Nothing to update');
    const sets = entries.map(([k], i) => `${k} = $${i + 3}`).join(', ');
    let rows;
    try {
      ({ rows } = await pool.query(
        `update public.trusted_contact set ${sets} where contact_id = $1 and user_id = $2 returning ${COLUMNS}`,
        [req.valid.params.contactId, req.identity.userId, ...entries.map(([, v]) => v ?? null)],
      ));
    } catch (err) {
      if (err.constraint === 'trusted_contact_has_channel') {
        throw badRequest('A contact needs at least a phone number, Telegram chat id or email');
      }
      throw err;
    }
    if (!rows[0]) throw notFound('Contact not found');
    res.json(rows[0]);
  });

  router.delete('/:contactId', validate({ params: idParams }), async (req, res) => {
    const { rowCount } = await pool.query('delete from public.trusted_contact where contact_id = $1 and user_id = $2', [
      req.valid.params.contactId,
      req.identity.userId,
    ]);
    if (rowCount === 0) throw notFound('Contact not found');
    res.status(204).end();
  });

  return router;
}
