'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';

// The /owner/* section has its own header (OwnerHeader, rendered by
// app/owner/layout.js) — skip the member Header/Footer there so the two
// don't stack.
export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const isOwnerRoute = pathname?.startsWith('/owner');

  if (isOwnerRoute) return <main id="main-content" className="flex-1">{children}</main>;

  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
