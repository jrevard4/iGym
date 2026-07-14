import { loadGyms } from '../../../../lib/supabase';
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

export default async function GymDetailPage({ params }) {
  const { id } = await params;
  const gym = await findGym(id);
  return <GymDetailClient gym={gym} />;
}
