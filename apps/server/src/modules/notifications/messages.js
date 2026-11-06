import { osmLink } from '../../lib/geo.js';

const timeFormat = new Intl.DateTimeFormat('en-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  hour: '2-digit',
  minute: '2-digit',
});

const formatTime = (date) => timeFormat.format(new Date(date));

export function trackingLinkMessage({ userName, destinationLabel, etaDeadline, trackingUrl }) {
  const where = destinationLabel ? ` to ${destinationLabel}` : '';
  return {
    subject: `${userName} is sharing a SafeWalk journey with you`,
    text:
      `${userName} started a walk${where} on the USM campus and chose you as a trusted contact. ` +
      `Expected arrival ${formatTime(etaDeadline)} (Malaysia time). Follow the live journey: ${trackingUrl}`,
  };
}

export function gracePromptMessage({ graceExpiresAt }) {
  return {
    subject: 'SafeWalk check-in: are you safe?',
    text: `Your estimated arrival time has passed. Open SafeWalk and confirm you are safe or extend your time before ${formatTime(graceExpiresAt)}, otherwise your contacts and USM Security will be alerted.`,
    data: { type: 'GRACE_PROMPT' },
  };
}

export function escalationMessage({ userName, destinationLabel, lastLocation, lastSeenAt, trackingUrl }) {
  const where = lastLocation
    ? `Last known location (${formatTime(lastSeenAt)}): ${osmLink(lastLocation)}`
    : 'No GPS position was received during the journey.';
  const to = destinationLabel ? ` to ${destinationLabel}` : '';
  return {
    subject: `URGENT: ${userName} has not checked in (SafeWalk)`,
    text:
      `URGENT: ${userName} did not arrive${to} on time and did not respond to the SafeWalk check-in. ` +
      `USM Security has been alerted. ${where}. Route history and live position: ${trackingUrl}`,
  };
}

export function safeConfirmedMessage({ userName }) {
  return {
    subject: `${userName} has confirmed they are safe (SafeWalk)`,
    text: `Update: ${userName} has confirmed in SafeWalk that they are safe. USM Security has been informed through the dashboard.`,
  };
}
