'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getPassById, updatePass, recordCheckin } from '../../../lib/supabase';
import { computeEquipmentAlerts } from '../../../lib/helpers';
import { useOwnerContext } from '@/lib/ownerContext';

export default function OwnerDeskPage() {
  const { owner } = useOwnerContext();
  const alertCount = computeEquipmentAlerts(owner.equipment || []).length;
  const [code, setCode] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const scan = async (e) => {
    e.preventDefault();
    const passId = code.trim().toUpperCase();
    if (!passId) return;
    setCode('');
    setBusy(true);
    const pass = await getPassById(passId);

    const entry = (status, note) => ({ passId, status, note, time: new Date().toLocaleTimeString() });

    if (!pass) {
      setLog((l) => [entry('INVALID', 'QR code not found'), ...l].slice(0, 50));
    } else if (pass.gymId !== owner.id) {
      setLog((l) => [entry('WRONG_GYM', `Valid for ${pass.gymName}`), ...l].slice(0, 50));
    } else if (pass.startsAt && new Date(pass.startsAt) > new Date()) {
      setLog((l) => [entry('NOT_YET_ACTIVE', `Starts ${new Date(pass.startsAt).toLocaleDateString()}`), ...l].slice(0, 50));
    } else if (pass.expiresAt && new Date(pass.expiresAt) < new Date()) {
      setLog((l) => [entry('EXPIRED', 'Pass expired'), ...l].slice(0, 50));
    } else if (pass.remainingPunches != null && pass.remainingPunches <= 0) {
      setLog((l) => [entry('EMPTY', 'No scans remaining'), ...l].slice(0, 50));
    } else {
      if (pass.remainingPunches != null) {
        const next = pass.remainingPunches - 1;
        await updatePass(pass.id, { remainingPunches: next });
        setLog((l) => [entry('GRANTED', `${next} scans remaining`), ...l].slice(0, 50));
      } else {
        setLog((l) => [entry('GRANTED', 'Time pass'), ...l].slice(0, 50));
      }
      recordCheckin(pass.userId, pass.gymId);
    }
    setBusy(false);
  };

  return (
    <div>
      <h1 className="text-4xl font-black mb-2">Front Desk</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Verify a member's pass to grant access.</p>

      {alertCount > 0 && (
        <Link
          href="/owner/inventory"
          className="block bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 mb-6 max-w-lg text-sm font-semibold text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900 transition"
        >
          ⚠ {alertCount} equipment item{alertCount === 1 ? '' : 's'} need{alertCount === 1 ? 's' : ''} attention →
        </Link>
      )}

      <form onSubmit={scan} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 mb-8 max-w-lg">
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 text-center">Scan or type the pass code from a member's QR.</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Awaiting scan..."
          className="w-full text-center text-2xl font-mono px-4 py-5 border-2 border-brand rounded-xl bg-blue-50 dark:bg-blue-950 dark:text-gray-100 outline-none mb-4"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-success text-white font-bold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-60"
        >
          Verify
        </button>
      </form>

      <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Today's check-ins ({log.filter((e) => e.status === 'GRANTED').length})</h2>
      {log.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-400 italic">No scans this session.</p>
      ) : (
        <ul className="space-y-2 max-w-lg">
          {log.map((e, i) => {
            const granted = e.status === 'GRANTED';
            return (
              <li key={i} className={'bg-white dark:bg-gray-900 border-l-4 rounded-lg px-4 py-3 ' + (granted ? 'border-success' : 'border-danger')}>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-900 dark:text-gray-100">{granted ? '🟢' : '🔴'} {e.passId}</span>
                  <span className="text-gray-400 dark:text-gray-400">{e.time}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{e.note}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
