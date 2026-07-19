import './globals.css';
import SiteChrome from '@/components/SiteChrome';
import PWARegister from '@/components/PWARegister';
import { PreferencesProvider } from '@/lib/PreferencesContext';

const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('igym_theme');
  var dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
  var lang = localStorage.getItem('igym_lang');
  if (lang) document.documentElement.lang = lang;
} catch (e) {}
`;

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
    // suppressHydrationWarning: the inline script below intentionally sets the
    // `dark` class/`lang` attribute on this element before React hydrates (to
    // avoid a light-mode flash), so its attributes legitimately differ from
    // what was server-rendered — that's a false-positive mismatch, not a bug.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#007AFF" />
        {/* Applies the saved/system theme before first paint to avoid a light-mode flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <PreferencesProvider>
          <SiteChrome>{children}</SiteChrome>
        </PreferencesProvider>
        <PWARegister />
      </body>
    </html>
  );
}
