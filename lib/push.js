// Sends Expo push notifications directly from the client, the same way
// lib/ai.js talks to Claude directly with a user-held key — this app's
// existing pattern for third-party API calls, not a compromise unique
// to this feature. See README "Known limitations" for the tradeoffs.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// messages: [{ to: expoPushToken, title, body, data? }, ...]
// Expo accepts up to 100 messages per request; never throws — a failed
// notification should never break the action that triggered it.
export async function sendPushNotifications(messages) {
  const valid = (messages || []).filter(m => m?.to);
  if (valid.length === 0) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(valid),
    });
  } catch (e) {
    console.warn('[push] send failed', e.message || e);
  }
}
