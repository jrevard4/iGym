import { loadGyms } from '../../lib/supabase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default async function sitemap() {
  const gyms = await loadGyms();

  const staticRoutes = ['', '/gyms', '/login', '/register'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));

  const gymRoutes = gyms.map((gym) => ({
    url: `${SITE_URL}/gyms/${gym.id}`,
    lastModified: gym.updated_at ? new Date(gym.updated_at) : new Date(),
  }));

  return [...staticRoutes, ...gymRoutes];
}
