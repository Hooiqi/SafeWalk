import { ZodError } from 'zod';
import { HttpError, badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { resolveIdentity } from '../auth/identity.js';

export function authenticate({ pool, config, verifyToken }) {
  return async (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(unauthorized());
    let claims;
    try {
      claims = await verifyToken(token);
    } catch {
      return next(unauthorized('Session is invalid or has expired'));
    }
    try {
      req.identity = await resolveIdentity(pool, config, claims);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAppUser = (req, _res, next) =>
  req.identity?.isAppUser
    ? next()
    : next(forbidden('This account is not registered as a SafeWalk student or staff user'));

export const requireSecurityStaff = (req, _res, next) =>
  req.identity?.isStaff ? next() : next(forbidden('Security staff access only'));

/** Parse req.body / req.params / req.query with zod schemas. */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.valid = { ...req.valid, [part]: schemas[part].parse(req[part] ?? {}) };
    }
    next();
  } catch (err) {
    next(err);
  }
};

export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (err instanceof ZodError) {
      err = badRequest(
        'Request validation failed',
        err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    if (err?.type === 'entity.parse.failed') err = badRequest('Malformed JSON body');
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    logger.error({ err, path: req.path }, 'unhandled request error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server' } });
  };
}
