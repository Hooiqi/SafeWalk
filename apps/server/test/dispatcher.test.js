import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pino from 'pino';
import { createDispatcher } from '../src/modules/notifications/dispatcher.js';

const logger = pino({ level: 'silent' });
const contacts = [
  { contact_name: 'Ali', phone_number: '+60111111111', email: 'ali@example.com' },
  { contact_name: 'Mei', telegram_chat_id: '12345' },
];
const message = { subject: 's', text: 't' };

describe('parallel notification dispatcher', () => {
  it('sends over every reachable channel in parallel and reports unconfigured channels as skipped', async () => {
    const started = [];
    const slow = (name, field) => ({
      name,
      configured: true,
      canReach: (c) => Boolean(c[field]),
      send: async (c) => {
        started.push(`${name}:${c.contact_name}`);
        await new Promise((r) => setTimeout(r, 50));
      },
    });
    const dispatcher = createDispatcher({
      logger,
      timeoutMs: 1000,
      channels: [slow('sms', 'phone_number'), slow('email', 'email'), { name: 'telegram', configured: false, canReach: () => true, send: async () => {} }],
    });
    const t0 = Date.now();
    const results = await dispatcher.toContacts(contacts, message);
    // Three 50 ms sends in parallel finish well under 3 x 50 ms.
    assert.ok(Date.now() - t0 < 140, 'deliveries should run concurrently');
    assert.deepEqual(started.sort(), ['email:Ali', 'sms:Ali']);
    assert.equal(results.filter((r) => r.status === 'sent').length, 2);
    assert.deepEqual(results.find((r) => r.channel === 'telegram'), {
      channel: 'telegram', recipient: 'all contacts', status: 'skipped', reason: 'not configured',
    });
  });

  it('a failing or hanging channel does not block the others', async () => {
    const dispatcher = createDispatcher({
      logger,
      timeoutMs: 100,
      channels: [
        { name: 'sms', configured: true, canReach: () => true, send: () => new Promise(() => {}) },
        { name: 'email', configured: true, canReach: () => true, send: async () => { throw new Error('smtp down'); } },
        { name: 'telegram', configured: true, canReach: () => true, send: async () => {} },
      ],
    });
    const results = await dispatcher.toContacts([contacts[0]], message);
    const byChannel = Object.fromEntries(results.map((r) => [r.channel, r]));
    assert.equal(byChannel.sms.status, 'failed');
    assert.equal(byChannel.sms.reason, 'timed out');
    assert.equal(byChannel.email.reason, 'smtp down');
    assert.equal(byChannel.telegram.status, 'sent');
  });
});
