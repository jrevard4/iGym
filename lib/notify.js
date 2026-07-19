// Thin wrapper around lib/push.js that resolves a userId/gymId to its saved
// Expo push token before sending — every notify* call here is a no-op if
// the recipient never registered a device (guest, web-only owner, etc.),
// consistent with the rest of this app's "degrade quietly" posture.

import { sendPushNotifications } from './push';
import { getUserById, getGymById } from './supabase';

export async function notifyUser(userId, title, body, data = {}) {
  if (!userId) return;
  const user = await getUserById(userId);
  if (!user?.pushToken) return;
  await sendPushNotifications([{ to: user.pushToken, title, body, data }]);
}

export async function notifyGym(gymId, title, body, data = {}) {
  if (!gymId) return;
  const gym = await getGymById(gymId);
  if (!gym?.pushToken) return;
  await sendPushNotifications([{ to: gym.pushToken, title, body, data }]);
}
