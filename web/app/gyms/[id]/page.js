import { loadGyms } from '../../../../lib/supabase';
import { getAvgRating, findSimilarGyms } from '../../../../lib/helpers';
import GymDetailClient from './GymDetailClient';

async function findGym(id) {
  const gyms = await loadGyms();
  return gyms.find((g) => g.id === id) || null;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const gym = await findGym(id);
  if (!gym) return { title: 'Gym not found — iGym' };

  const title = `${gym.gymName} — ${gym.location || 'iGym'}`;
  const description =
    gym.description ||
    `See equipment, classes, pricing, and reviews for ${gym.gymName}. Buy a day-pass and check in with a QR code.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

function buildStructuredData(gym) {
  const avg = getAvgRating(gym.gymReviews);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ExerciseGym',
    name: gym.gymName,
    ...(gym.description && { description: gym.description }),
    ...(gym.location && { address: gym.location }),
    ...(gym.phone && { telephone: gym.phone }),
    ...(gym.website && { url: gym.website }),
    ...(gym.pricing && { priceRange: gym.pricing }),
    ...(gym.branding?.heroImageUrl && { image: gym.branding.heroImageUrl }),
    ...(gym.lat && gym.lon && {
      geo: { '@type': 'GeoCoordinates', latitude: gym.lat, longitude: gym.lon },
    }),
    ...(avg > 0 && (gym.gymReviews || []).length > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: avg.toFixed(1),
        reviewCount: gym.gymReviews.length,
      },
    }),
  };
  return JSON.stringify(data);
}

export default async function GymDetailPage({ params }) {
  const { id } = await params;
  const gyms = await loadGyms();
  const gym = gyms.find((g) => g.id === id) || null;
  const similarGyms = gym ? findSimilarGyms(gym, gyms) : [];
  return (
    <>
      {gym && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: buildStructuredData(gym) }}
        />
      )}
      <GymDetailClient gym={gym} similarGyms={similarGyms} />
    </>
  );
}
