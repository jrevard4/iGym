import Link from 'next/link';
import { loadGyms } from '../../../../lib/supabase';
import { parseCityState, citySlug } from '../../../../lib/helpers';

export const metadata = {
  title: 'Browse Gyms by City | iGym',
  description: 'Find gyms in your city — compare equipment, classes, and pricing across every city iGym covers.',
};

async function groupByCity() {
  const gyms = await loadGyms();
  const cities = new Map(); // slug -> { city, state, count }
  gyms.forEach((g) => {
    const cs = parseCityState(g.location);
    if (!cs) return;
    const slug = citySlug(cs.city, cs.state);
    const existing = cities.get(slug);
    if (existing) existing.count += 1;
    else cities.set(slug, { slug, city: cs.city, state: cs.state, count: 1 });
  });
  return Array.from(cities.values()).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

export default async function CityIndexPage() {
  const cities = await groupByCity();

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-black mb-2">Browse Gyms by City</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        {cities.length} {cities.length === 1 ? 'city' : 'cities'} on iGym so far.
      </p>

      {cities.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 italic">No cities to show yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {cities.map((c) => (
            <Link
              key={c.slug}
              href={`/gyms/city/${c.slug}`}
              className="block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{c.city}, {c.state}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {c.count} {c.count === 1 ? 'gym' : 'gyms'}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Link href="/gyms" className="text-brand-text dark:text-blue-400 hover:underline font-semibold text-sm">
        Search all gyms with AI matching →
      </Link>
    </div>
  );
}
