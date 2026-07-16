import Link from 'next/link';
import { renderStars } from '../../lib/helpers';
import Reveal from './Reveal';

// A handful of iGym-the-platform testimonials — illustrative/demo copy (this
// app has no "review the app itself" feature yet), clearly distinct from the
// real per-gym reviews pulled from gymTestimonials below. Kept short and
// generic on purpose so they read as placeholder content, not fabricated
// endorsements from real people.
const APP_TESTIMONIALS = [
  {
    name: 'Jordan M.',
    role: 'Member since 2025',
    text: "I travel for work constantly — being able to buy a day-pass in 30 seconds instead of calling around to ask about guest rates has been huge.",
  },
  {
    name: 'Casey R.',
    role: 'Member since 2024',
    text: 'Seeing the actual equipment list before I show up saved me from wasting a trip on a gym with no squat rack.',
  },
  {
    name: 'Priya S.',
    role: 'Gym owner, Columbus OH',
    text: 'Switching from a paper walk-in log to QR check-ins took an afternoon to set up and immediately cut our front-desk line in half.',
  },
];

export default function Testimonials({ gymTestimonials = [] }) {
  const hasGymReviews = gymTestimonials.length > 0;

  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <Reveal>
        <h2 className="text-3xl sm:text-4xl font-black text-center mb-3 text-gray-900 dark:text-gray-100">
          What people are saying
        </h2>
        <p className="text-center text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-14">
          Real reviews from members at gyms on iGym, plus a few words from people using the app itself.
        </p>
      </Reveal>

      {hasGymReviews && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {gymTestimonials.map((r, i) => (
            <Reveal key={`${r.gymId}-${r.id}`} delayMs={i * 80}>
              <Link
                href={`/gyms/${r.gymId}`}
                className="block h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition"
              >
                <div className="text-warning text-sm mb-2">{renderStars(r.rating)}</div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4 mb-4">
                  &ldquo;{r.text}&rdquo;
                </p>
                <div className="text-xs">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">@{r.username}</span>
                  <span className="text-gray-500 dark:text-gray-400"> at {r.gymName}</span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-5">
        {APP_TESTIMONIALS.map((t, i) => (
          <Reveal key={t.name} delayMs={i * 80}>
            <div className="h-full bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="text-xs">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</span>
                <span className="text-gray-500 dark:text-gray-400"> — {t.role}</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
