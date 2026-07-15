'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getOwnerSession, setOwnerSession } from '@/lib/ownerAuth';
import { upsertGym } from '../../../lib/supabase';
import { OwnerContext } from '@/lib/ownerContext';
import OwnerHeader from '@/components/OwnerHeader';

export default function OwnerLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [owner, setOwner] = useState(null);
  const [checked, setChecked] = useState(false);
  const isPublicRoute = pathname === '/owner/login' || pathname.startsWith('/owner/claim/');

  useEffect(() => {
    if (isPublicRoute) { setChecked(true); return; }
    const session = getOwnerSession();
    if (!session) {
      router.replace('/owner/login');
      return;
    }
    setOwner(session);
    setChecked(true);
  }, [isPublicRoute, router]);

  if (isPublicRoute) return children;

  if (!checked || !owner) {
    return <div className="max-w-6xl mx-auto px-6 py-20 text-center text-gray-400">Loading owner console...</div>;
  }

  const persistOwner = async (updated) => {
    setOwner(updated);
    setOwnerSession(updated);
    await upsertGym(updated);
  };

  return (
    <OwnerContext.Provider value={{ owner, persistOwner }}>
      <OwnerHeader gymName={owner.gymName} />
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </OwnerContext.Provider>
  );
}
