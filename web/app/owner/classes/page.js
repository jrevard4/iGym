'use client';

import { useEffect, useState } from 'react';
import { useOwnerContext } from '@/lib/ownerContext';
import { DAYS_OF_WEEK } from '../../../../lib/constants';
import { uniqueId, getUpcomingClassOccurrences, countBookedForOccurrence } from '../../../../lib/helpers';
import { loadGymClassBookings } from '../../../../lib/supabase';

const cls = 'w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';

export default function OwnerClassesPage() {
  const { owner, persistOwner } = useOwnerContext();
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [form, setForm] = useState({ className: (owner.classes || [])[0] || '', dayOfWeek: '1', startTime: '06:00', durationMinutes: '45', capacity: '15', instructor: '' });

  useEffect(() => {
    (async () => {
      setBookings(await loadGymClassBookings(owner.id));
      setLoadingBookings(false);
    })();
  }, [owner.id]);

  const schedule = owner.classSchedule || [];
  const occurrences = getUpcomingClassOccurrences(owner, 2);

  const addSlot = async () => {
    if (!form.className.trim()) return;
    const slot = {
      id: uniqueId('cs_'),
      className: form.className.trim(),
      dayOfWeek: parseInt(form.dayOfWeek),
      startTime: form.startTime,
      durationMinutes: parseInt(form.durationMinutes) || 45,
      capacity: parseInt(form.capacity) || 0,
      instructor: form.instructor.trim(),
    };
    const updated = { ...owner, classSchedule: [...schedule, slot] };
    await persistOwner(updated);
    setForm((f) => ({ ...f, instructor: '' }));
  };

  const removeSlot = async (id) => {
    if (!confirm('Remove this class from your schedule? Members who already booked it keep their spot, but no new bookings can be made.')) return;
    const updated = { ...owner, classSchedule: schedule.filter((s) => s.id !== id) };
    await persistOwner(updated);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-4xl font-black mb-2">Class Schedule</h1>
        <p className="text-gray-600 dark:text-gray-400">Set up recurring weekly classes members can book a seat in — shown on your public gym page.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-1">+ Add a weekly class</h2>
        <input className={cls} placeholder="Class name (e.g. Morning Yoga)" value={form.className} onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))} list="class-name-options" />
        <datalist id="class-name-options">
          {(owner.classes || []).map((c) => <option key={c} value={c} />)}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <select className={cls} value={form.dayOfWeek} onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: e.target.value }))}>
            {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <input className={cls} type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={cls} type="number" min="5" placeholder="Duration (min)" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
          <input className={cls} type="number" min="1" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
        </div>
        <input className={cls} placeholder="Instructor (optional)" value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} />
        <button onClick={addSlot} className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg transition">+ Add to schedule</button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-3">This week&apos;s schedule</h2>
        {schedule.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No recurring classes yet — add one above.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {[...schedule].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)).map((s) => (
              <li key={s.id} className="py-3 flex justify-between items-center gap-3">
                <div>
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{s.className}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {DAYS_OF_WEEK[s.dayOfWeek]}s · {s.startTime} · {s.durationMinutes} min · cap {s.capacity}
                    {s.instructor && ` · ${s.instructor}`}
                  </div>
                </div>
                <button onClick={() => removeSlot(s.id)} className="text-danger text-xs font-semibold shrink-0">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-3">Upcoming roster (next 2 weeks)</h2>
        {loadingBookings ? (
          <p className="text-sm text-gray-400 italic">Loading bookings...</p>
        ) : occurrences.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Add a class above to see who&apos;s booked in.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {occurrences.map((occ) => {
              const booked = countBookedForOccurrence(bookings, occ.id, occ.classDate);
              const roster = bookings.filter((b) => b.classScheduleId === occ.id && b.classDate === occ.classDate && b.status !== 'cancelled');
              return (
                <li key={`${occ.id}-${occ.classDate}`} className="py-3">
                  <div className="flex justify-between items-center gap-3">
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{occ.className}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {new Date(occ.classDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {occ.startTime}
                      </div>
                    </div>
                    <span className={'text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ' + (booked >= occ.capacity ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>
                      {booked} / {occ.capacity || '∞'}
                    </span>
                  </div>
                  {roster.length > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {roster.map((r) => r.username).join(', ')}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
