import './globals.css';
import SiteChrome from '@/components/SiteChrome';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'iGym — Find the right gym for you',
    template: '%s',
  },
  description:
    'Browse gyms near you, compare equipment and classes, buy day-passes, and check in with a QR code. Powered by AI-driven matching.',
  openGraph: {
    title: 'iGym',
    description: 'Find the right gym for you.',
    type: 'website',
    siteName: 'iGym',
  },
  twitter: {
    card: 'summary',
    title: 'iGym',
    description: 'Find the right gym for you.',
  },
  // TODO: add a real /public/og-image.png and reference it under openGraph.images
  // once brand assets exist — omitted rather than pointing at a 404.
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
