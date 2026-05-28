import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'iGym — Find the right gym for you',
  description:
    'Browse gyms near you, compare equipment and classes, buy day-passes, and check in with a QR code. Powered by AI-driven matching.',
  openGraph: {
    title: 'iGym',
    description: 'Find the right gym for you.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
