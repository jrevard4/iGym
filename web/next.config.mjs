/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next.js to import from `../lib` (shared with the mobile app).
  // transpilePackages tells Next to compile JS in our shared folder rather than
  // treating it as a published npm module.
  transpilePackages: [],

  // Let Next bundle files outside the web/ folder.
  experimental: {
    externalDir: true,
  },

  // Permit images from Unsplash + manufacturer CDNs used by the equipment catalog.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'assets.roguefitness.com' },
      { protocol: 'https', hostname: 'shop.lifefitness.com' },
    ],
  },
};

export default nextConfig;
