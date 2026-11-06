// Firebase Cloud Messaging push to the SafeWalk app user (grace-period
// check-in, proposal Table 5.1). Requires a Firebase service account.
export async function createPushChannel(config, logger) {
  if (!config.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return { name: 'push', configured: false, canReach: () => false, send: async () => {} };
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = initializeApp({ credential: cert(JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON)) }, 'safewalk');
  const messaging = getMessaging(app);
  logger?.info('FCM push channel enabled');
  return {
    name: 'push',
    configured: true,
    canReach: (user) => Boolean(user.device_fcm_token),
    async send(user, message) {
      await messaging.send({
        token: user.device_fcm_token,
        notification: { title: message.subject, body: message.text },
        data: message.data ?? {},
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
      });
    },
  };
}
