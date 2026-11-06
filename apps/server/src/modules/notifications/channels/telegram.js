// Telegram Bot API. The contact must have started a chat with the bot so that
// their chat id is known (stored in trusted_contact.telegram_chat_id).
export function createTelegramChannel(config, fetchImpl = fetch) {
  return {
    name: 'telegram',
    configured: Boolean(config.TELEGRAM_BOT_TOKEN),
    canReach: (contact) => Boolean(contact.telegram_chat_id),
    async send(contact, message, signal) {
      const res = await fetchImpl(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: contact.telegram_chat_id, text: message.text, disable_web_page_preview: true }),
      });
      if (!res.ok) throw new Error(`Telegram responded ${res.status}`);
    },
  };
}
