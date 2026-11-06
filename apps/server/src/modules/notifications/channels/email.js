import nodemailer from 'nodemailer';

// Email through any SMTP server (Nodemailer, proposal Diagram 12.7).
export function createEmailChannel(config) {
  const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;
  return {
    name: 'email',
    configured: Boolean(transport),
    canReach: (contact) => Boolean(contact.email),
    async send(contact, message) {
      await transport.sendMail({
        from: config.SMTP_FROM,
        to: contact.email,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}
