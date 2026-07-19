// Sends a "starts soon" push to every member with a confirmed class booking
// starting within the next 90 minutes. Not triggered by user action — meant
// to be hit by an external cron (Vercel Cron, or any scheduler) every 15-30
// minutes; see README for setup. Idempotent via classBookings.reminderSent,
// so it's safe to call more often than that without double-notifying anyone.
import { NextResponse } from 'next/server';
import { loadGyms, loadBookingsNeedingReminder, markReminderSent } from '@shared/supabase';
import { notifyUser } from '@shared/notify';

export const runtime = 'nodejs';

const REMINDER_WINDOW_MS = 90 * 60 * 1000;

export async function POST(request) {
  // Optional shared-secret so this endpoint isn't wide open to anyone who
  // finds the URL — only enforced if the operator set CRON_SECRET.
  const configuredSecret = process.env.CRON_SECRET;
  if (configuredSecret) {
    const provided = request.headers.get('x-cron-secret');
    if (provided !== configuredSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const [gyms, bookings] = await Promise.all([loadGyms(), loadBookingsNeedingReminder()]);
  const gymById = new Map(gyms.map((g) => [g.id, g]));
  const now = Date.now();

  let sent = 0;
  for (const booking of bookings) {
    const gym = gymById.get(booking.gymId);
    const schedule = (gym?.classSchedule || []).find((s) => s.id === booking.classScheduleId);
    if (!gym || !schedule) continue;

    const startsAt = new Date(`${booking.classDate}T${schedule.startTime}`);
    const msUntilStart = startsAt.getTime() - now;
    if (msUntilStart <= 0 || msUntilStart > REMINDER_WINDOW_MS) continue;

    await notifyUser(
      booking.userId,
      `${booking.className} starts soon`,
      `Starts at ${schedule.startTime} at ${gym.gymName}.`
    );
    await markReminderSent(booking.id);
    sent++;
  }

  return NextResponse.json({ ok: true, checked: bookings.length, sent });
}
