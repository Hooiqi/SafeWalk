/**
 * Parallel asynchronous dispatch (proposal 5.2.3 2B): every delivery runs at
 * the same time with its own timeout, so a slow or failing channel never
 * delays the others. Results are returned for logging and for the UI; a
 * channel without credentials is reported as "skipped", never as "sent".
 */
export function createDispatcher({ channels, logger, timeoutMs }) {
  const byName = Object.fromEntries(channels.map((c) => [c.name, c]));

  async function deliver(channel, recipient, label, message) {
    // Only report channels this recipient could actually be reached on.
    if (!channel.canReach(recipient)) return null;
    if (!channel.configured) return { channel: channel.name, recipient: label, status: 'skipped', reason: 'not configured' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await Promise.race([
        channel.send(recipient, message, controller.signal),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timed out')))),
      ]);
      return { channel: channel.name, recipient: label, status: 'sent' };
    } catch (err) {
      return { channel: channel.name, recipient: label, status: 'failed', reason: err.message };
    } finally {
      clearTimeout(timer);
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
