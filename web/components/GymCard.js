import Link from 'next/link';
import { getAvgRating, isOpenNow, getActivePromotion } from '../../lib/helpers';

export default function GymCard({ gym, distanceMi, match }) {
  const avg = getAvgRating(gym.gymReviews);
  const open = isOpenNow(gym);
  const promo = getActivePromotion(gym);

  return (
    <Link
      href={`/gyms/${gym.id}`}
      className={
        'block bg-white rounded-2xl border transition hover:shadow-lg hover:-translate-y-0.5 p-5 ' +
        (gym.featured ? 'border-warning border-2' : 'border-gray-200')
      }
    >
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {gym.featured && (
            <span className="bg-warning text-white text-xs font-extrabold px-2 py-1 rounded shrink-0">
              ⭐ FEATURED
            </span>
          )}
          <h3 className="text-lg font-bold truncate">{gym.gymName}</h3>
        </div>
        {typeof distanceMi === 'number' && (
          <span className="text-brand font-bold shrink-0">{distanceMi.toFixed(1)} mi</span>
        )}
      </div>

      <p className="text-sm text-gray-600 mb-3 truncate">{gym.location}</p>

      {promo && (
        <div className="bg-brand/10 text-brand text-xs font-bold px-2.5 py-1.5 rounded-lg mb-3">
          🔥 {promo.title}
        </div>
      )}

      {match && (
        <div className="bg-violet-50 text-violet-700 text-xs rounded-lg px-2.5 py-1.5 mb-3">
          <span className="font-bold">✨ {match.score}% match</span>
          {match.reason && <p className="mt-0.5 text-violet-600 line-clamp-2">{match.reason}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {open !== null && (
          <span
            className={
              'text-xs font-bold px-2 py-1 rounded ' +
              (open ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')
            }
          >
            {open ? '● Open Now' : '● Closed'}
          </span>
        )}
        {avg > 0 && (
          <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-1 rounded">
            ★ {avg.toFixed(1)} ({gym.gymReviews?.length || 0})
          </span>
        )}
        {gym.pricing && (
          <span className="bg-green-50 text-green-700 text-xs font-bold px-2 py-1 rounded">
            {gym.pricing}
          </span>
        )}
      </div>

      {(gym.classes || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {gym.classes.slice(0, 5).map((c) => (
            <span
              key={c}
              className="bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded-full"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
