'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { loadGyms, loadAllClassBookings, bookClass } from '../../../lib/supabase';
import { getUpcomingClassOccurrences, countBookedForOccurrence } from '../../../lib/helpers';
import { getSession } from '@/lib/auth';
import Reveal from '@/components/Reveal';

export default function ClassesPage() {
  const [gyms, setGyms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingKey, setBookingKey] = useState(null);
  const [query, setQuery] = useState('');
  const [session, setSessionState] = useState(null);

  useEffect(() => {
    setSessionState(getSession());
    (async () => {
      try {
        const [g, b] = await Promise.all([loadGyms(), loadAllClassBookings()]);
        setGyms(g);
        setBookings(b);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const occurrences = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gyms
      .flatMap((gym) => getUpcomingClassOccurrences(gym, 2).map((occ) => ({ ...occ, gym })))
      .filter((occ) => !q || occ.className.toLowerCase().includes(q) || occ.gym.gymName.toLowerCase().includes(q))
      .sort((a, b) => (a.classDate + a.startTime).localeCompare(b.classDate + b.startTime));
  }, [gyms, query]);

  const myBookedKeys = useMemo(() => new Set(
    bookings
      .filter((b) => b.userId === session?.id && b.status !== 'cancelled')
      .map((b) => `${b.gymId}|${b.classScheduleId}|${b.classDate}`)
  ), [bookings, session]);

  const book = async (occ) => {
    if (!session) { window.location.href = '/login?next=/classes'; return; }
    const key = `${occ.gym.id}|${occ.id}|${occ.classDate}`;
    setBookingKey(key);
    try {
      const booking = await bookClass({
        gymId: occ.gym.id, classScheduleId: occ.id, className: occ.className, classDate: occ.classDate,
        capacity: occ.capacity, userId: session.id, username: session.username,
      });
      setBookings((prev) => [...prev, booking]);
    } finally {
      setBookingKey(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-black mb-2">Upcoming Classes</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Every class scheduled in the next two weeks, across every gym on iGym.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by class or gym name..."
        aria-label="Search classes"
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg mb-8 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : occurrences.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">🧘</div>
          <h2 className="text-xl font-bold mb-2">No classes match yet</h2>
          <p className="text-gray-600 dark:text-gray-400">Try a different search, or check back — gyms add new classes regularly.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {occurrences.map((occ, i) => {
            const key = `${occ.gym.id}|${occ.id}|${occ.classDate}`;
            const booked = countBookedForOccurrence(bookings.filter((b) => b.gymId === occ.gym.id), occ.id, occ.classDate);
            const full = occ.capacity > 0 && booked >= occ.capacity;
            const alreadyBooked = myBookedKeys.has(key);
            return (
              <Reveal key={key} delayMs={(i % 6) * 60}>
                <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
                  <div className="font-bold text-gray-900 dark:text-gray-100">{occ.className}</div>
                  <Link href={`/gyms/${occ.gym.id}`} className="text-xs font-semibold text-brand-text dark:text-blue-400 hover:underline">
                    {occ.gym.gymName}
                  </Link>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Date(occ.classDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {occ.startTime}
                    {occ.instructor && ` · ${occ.instructor}`}
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <span className={'text-xs font-bold ' + (full ? 'text-danger' : 'text-gray-500 dark:text-gray-400')}>
                      {occ.capacity > 0 ? `${booked}/${occ.capacity} booked` : `${booked} booked`}
                    </span>
                    {alreadyBooked ? (
                      <span className="text-xs font-bold text-success">✓ Booked</span>
                    ) : (
                      <button
                        onClick={() => book(occ)}
                        disabled={bookingKey === key}
                        className="bg-brand hover:bg-brand-dark text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
                      >
                        {bookingKey === key ? '...' : full ? 'Join waitlist' : 'Book'}
                      </button>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
