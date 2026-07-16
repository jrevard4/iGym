'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadGyms, upsertGym } from '../../../../lib/supabase';
import { renderStars } from '../../../../lib/helpers';

export default function AdminReviewsPage() {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setGyms(await loadGyms());
      setLoading(false);
    })();
  }, []);

  const removeReview = async (gym, reviewId) => {
    if (!confirm('Remove this review? This cannot be undone.')) return;
    const updated = { ...gym, gymReviews: (gym.gymReviews || []).filter((r) => r.id !== reviewId) };
    setGyms((prev) => prev.map((g) => (g.id === gym.id ? updated : g)));
    await upsertGym(updated);
  };

  const allReviews = gyms
    .flatMap((g) => (g.gymReviews || []).map((r) => ({ ...r, gym: g })))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (loading) return <div className="text-center text-gray-400 py-20">Loading reviews...</div>;

  return (
    <div>
      <h1 className="text-4xl font-black mb-2">Reviews</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">{allReviews.length} reviews across every gym on the platform.</p>

      {allReviews.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No reviews yet.</p>
      ) : (
        <ul className="space-y-3">
          {allReviews.map((r) => (
            <li key={r.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">@{r.username}</span>
                    <span className="text-warning text-sm">{renderStars(r.rating)}</span>
                    <Link href={`/gyms/${r.gym.id}`} className="text-xs text-brand-text dark:text-blue-400 hover:underline">{r.gym.gymName}</Link>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{r.text}</p>
                </div>
                <button onClick={() => removeReview(r.gym, r.id)} className="text-xs font-semibold text-danger hover:underline shrink-0">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
