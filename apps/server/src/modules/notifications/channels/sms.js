// SMS through the Twilio REST API (proposal Diagram 12.7). Uses fetch rather
// than the Twilio SDK to keep the dependency footprint small.
export function createSmsChannel(config, fetchImpl = fetch) {
  const configured = Boolean(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER);
  return {
    name: 'sms',
    configured,
    canReach: (contact) => Boolean(contact.phone_number),
    async send(contact, message, signal) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`;
      const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
      const res = await fetchImpl(url, {
        method: 'POST',
        signal,
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: config.TWILIO_FROM_NUMBER, To: contact.phone_number, Body: message.text }),
      });
      if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
    },
  };
}
