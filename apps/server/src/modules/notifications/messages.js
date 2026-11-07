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

export function sosMessage({ userName, silent, lastLocation, trackingUrl }) {
  const where = lastLocation
    ? `Location: ${osmLink(lastLocation)}`
    : 'Their phone had not found a GPS position yet; the live link updates as soon as it does.';
  return {
    subject: `EMERGENCY: ${userName} sent an SOS (SafeWalk)`,
    text:
      `EMERGENCY: ${userName} triggered ${silent ? 'a silent' : 'an'} SOS in SafeWalk. ` +
      `USM Security has been alerted. ${where}. Live location: ${trackingUrl}` +
      (silent ? ' They may not be able to talk: do not call unless you are sure it is safe.' : ''),
  };
}

export function sosSafeMessage({ userName }) {
  return {
    subject: `${userName} is safe (SafeWalk)`,
    text: `Update: ${userName} has marked themselves safe in SafeWalk after their SOS.`,
  };
}

const RESPONSE_TEXT = {
  RECEIVED: 'USM Security has received your alert.',
  ON_THE_WAY: 'USM Security is on the way to you.',
  ARRIVED: 'USM Security has arrived at your location.',
  RESOLVED: 'USM Security has marked your alert as resolved.',
};

export function responseUpdateMessage(status, note) {
  return {
    subject: 'SafeWalk: update from USM Security',
    text: `${RESPONSE_TEXT[status] ?? 'Your alert was updated.'}${note ? ` ${note}` : ''}`,
    data: { type: 'ALERT_STATUS', status },
  };
}
