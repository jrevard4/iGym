import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadGyms } from '../../../../../lib/supabase';
import { parseCityState, citySlug, getAvgRating } from '../../../../../lib/helpers';
import GymCard from '@/components/GymCard';

// Static params generated once at build time from whatever cities the
// current gym dataset covers — new gyms in a not-yet-seen city won't get a
// dedicated page until the next build/deploy, which is fine for an SEO
// landing page (it isn't part of the live search flow).
export async function generateStaticParams() {
  const gyms = await loadGyms();
  const slugs = new Set();
  gyms.forEach((g) => {
    const cs = parseCityState(g.location);
    if (cs) slugs.add(citySlug(cs.city, cs.state));
  });
  return Array.from(slugs).map((slug) => ({ citySlug: slug }));
}

async function findCity(slug) {
  const gyms = await loadGyms();
  const matches = gyms
    .map((gym) => ({ gym, cs: parseCityState(gym.location) }))
    .filter(({ cs }) => cs && citySlug(cs.city, cs.state) === slug);
  return matches;
}

export async function generateMetadata({ params }) {
  const matches = await findCity(params.citySlug);
  if (matches.length === 0) return { title: 'Gyms | iGym' };
  const { city, state } = matches[0].cs;
  return {
    title: `Best Gyms in ${city}, ${state} | iGym`,
    description: `Compare ${matches.length} ${matches.length === 1 ? 'gym' : 'gyms'} in ${city}, ${state} by equipment, classes, and price. Buy a day-pass instantly on iGym.`,
  };
}

export default async function CityGymsPage({ params }) {
  const matches = await findCity(params.citySlug);
  if (matches.length === 0) notFound();

  const { city, state } = matches[0].cs;
  const gyms = matches
    .map((m) => m.gym)
    .sort((a, b) => (b.featured - a.featured) || (getAvgRating(b.gymReviews) - getAvgRating(a.gymReviews)));

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-black mb-2">Best Gyms in {city}, {state}</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        {gyms.length} {gyms.length === 1 ? 'gym' : 'gyms'} in {city} — compare equipment, classes, and pricing, then buy a day-pass instantly.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {gyms.map((gym) => <GymCard key={gym.id} gym={gym} />)}
      </div>

      <Link href="/gyms" className="text-brand hover:underline font-semibold text-sm">
        Search all gyms with AI matching →
      </Link>
    </div>
  );
}
