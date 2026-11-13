/**
 * Parallel asynchronous dispatch (proposal 5.2.3 2B): every delivery runs at
 * the same time with its own timeout, so a slow or failing channel never
 * delays the others. Results are returned for logging and for the UI; a
 * channel without credentials is reported as "skipped", never as "sent".
 */
export function createDispatcher({ channels, logger, timeoutMs, retryDelaysMs = [500, 2000] }) {
  const byName = Object.fromEntries(channels.map((c) => [c.name, c]));

  async function attempt(channel, recipient, message) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await Promise.race([
        channel.send(recipient, message, controller.signal),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timed out')))),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function deliver(channel, recipient, label, message) {
    // Only report channels this recipient could actually be reached on.
    if (!channel.canReach(recipient)) return null;
    if (!channel.configured) return { channel: channel.name, recipient: label, status: 'skipped', reason: 'not configured' };
    // A connection that breaks before the provider answers (e.g. a kept-alive
    // socket closed while the server was idle) is retried: the request never
    // reached the provider, and an emergency message must not be lost to it.
    // Refusals (HTTP errors) and timeouts are not retried.
    for (let i = 0; ; i += 1) {
      try {
        await attempt(channel, recipient, message);
        return { channel: channel.name, recipient: label, status: 'sent', ...(i ? { attempts: i + 1 } : {}) };
      } catch (err) {
        if (isNetworkError(err) && i < retryDelaysMs.length) {
          logger.info({ channel: channel.name, recipient: label, reason: describe(err) }, 'notification retry after network error');
          await new Promise((r) => setTimeout(r, retryDelaysMs[i]));
          continue;
        }
        return { channel: channel.name, recipient: label, status: 'failed', reason: describe(err), ...(i ? { attempts: i + 1 } : {}) };
      }
    }
  }

  return {
    /** Send `message` to each trusted contact over every channel they can be reached on. */
    async toContacts(contacts, message, context = {}) {
      const contactChannels = ['sms', 'telegram', 'email'].map((n) => byName[n]).filter(Boolean);
      const jobs = contacts.flatMap((contact) =>
        contactChannels.map((channel) => deliver(channel, contact, contact.contact_name, message)),
      );
      const results = (await Promise.all(jobs)).filter(Boolean);
      // De-duplicate "not configured" rows so the summary stays readable.
      const seen = new Set();
      const summary = results.filter((r) => {
        if (r.status !== 'skipped') return true;
        const key = `${r.channel}:${r.status}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const r of summary) {
        const level = r.status === 'failed' ? 'warn' : 'info';
        logger[level]({ ...context, ...r }, `contact notification ${r.status}`);
      }
      return summary.map((r) => (r.status === 'skipped' ? { ...r, recipient: 'all contacts' } : r));
    },

    /** Push notification to the SafeWalk user themself (FCM). */
    async toUser(user, message, context = {}) {
      const push = byName.push;
      if (!push) return null;
      const result = await deliver(push, user, 'user', message);
      if (result) logger.info({ ...context, ...result }, `push notification ${result.status}`);
      return result;
    },
  };
}

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNABORTED']);

/** fetch() rejects with TypeError "fetch failed" when the connection itself fails. */
export function isNetworkError(err) {
  if (!err) return false;
  if (NETWORK_CODES.has(err.code) || NETWORK_CODES.has(err.cause?.code)) return true;
  return err.name === 'TypeError' && /fetch failed/i.test(err.message);
}

/** "fetch failed" alone does not say why; add the underlying cause to the log. */
function describe(err) {
  const cause = err.cause?.code ?? err.cause?.message;
  return cause ? `${err.message} (${cause})` : err.message;
}
