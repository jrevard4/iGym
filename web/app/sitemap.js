import { loadGyms } from '../../lib/supabase';
import { parseCityState, citySlug } from '../../lib/helpers';

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

  const citySlugs = new Set();
  gyms.forEach((gym) => {
    const cs = parseCityState(gym.location);
    if (cs) citySlugs.add(citySlug(cs.city, cs.state));
  });
  const cityRoutes = Array.from(citySlugs).map((slug) => ({
    url: `${SITE_URL}/gyms/city/${slug}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...gymRoutes, ...cityRoutes];
}
