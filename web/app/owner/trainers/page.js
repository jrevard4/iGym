'use client';

import { useState } from 'react';
import { uniqueId } from '../../../../lib/helpers';
import { getUserById } from '../../../../lib/supabase';
import { sendPushNotifications } from '../../../../lib/push';
import { useOwnerContext } from '@/lib/ownerContext';

const cls = 'w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';

export default function OwnerTrainersPage() {
  const { owner, persistOwner } = useOwnerContext();
  const [newTrainer, setNewTrainer] = useState({ name: '', fee: '', bio: '' });
  const trainers = owner.trainers || [];
  const bookingRequests = owner.bookingRequests || [];

  const addTrainer = async () => {
    if (!newTrainer.name || !newTrainer.fee) return;
    const trainerObj = { id: uniqueId('t_'), name: newTrainer.name, fee: parseFloat(newTrainer.fee), bio: newTrainer.bio };
    await persistOwner({ ...owner, trainers: [...trainers, trainerObj] });
    setNewTrainer({ name: '', fee: '', bio: '' });
  };

  const removeTrainer = async (id) => {
    await persistOwner({ ...owner, trainers: trainers.filter((t) => t.id !== id) });
  };

  const notifyMember = async (userId, title, body) => {
    const member = await getUserById(userId);
    if (member?.pushToken) sendPushNotifications([{ to: member.pushToken, title, body }]);
  };

  const confirmBooking = async (req) => {
    await persistOwner({ ...owner, bookingRequests: bookingRequests.map((r) => (r.id === req.id ? { ...r, status: 'CONFIRMED' } : r)) });
    notifyMember(req.userId, 'Booking confirmed! 🎉', `${req.trainerName} confirmed your session at ${owner.gymName}.`);
  };

  const declineBooking = async (req) => {
    await persistOwner({ ...owner, bookingRequests: bookingRequests.filter((r) => r.id !== req.id) });
    notifyMember(req.userId, 'Booking update', `${req.trainerName} at ${owner.gymName} couldn't confirm your requested session.`);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-4xl font-black mb-2">Trainers</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your roster and respond to member booking requests.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 mb-4">Roster</h2>
        {trainers.map((t) => (
          <div key={t.id} className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-3 mb-3">
            <div>
              <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{t.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-500">${t.fee}/hr • {t.bio}</div>
            </div>
            <button onClick={() => removeTrainer(t.id)} className="text-danger text-xs font-semibold">Remove</button>
          </div>
        ))}
        {trainers.length === 0 && <p className="text-gray-400 dark:text-gray-600 italic text-sm mb-3">No trainers added yet.</p>}
        <div className="space-y-2">
          <input className={cls} placeholder="Trainer name" value={newTrainer.name} onChange={(e) => setNewTrainer((p) => ({ ...p, name: e.target.value }))} />
          <input className={cls} placeholder="Hourly fee ($)" type="number" value={newTrainer.fee} onChange={(e) => setNewTrainer((p) => ({ ...p, fee: e.target.value }))} />
          <textarea className={cls} rows={2} placeholder="Bio & specialties" value={newTrainer.bio} onChange={(e) => setNewTrainer((p) => ({ ...p, bio: e.target.value }))} />
          <button onClick={addTrainer} className="w-full bg-success text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition">+ Add trainer</button>
        </div>
      </div>

      {bookingRequests.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
          <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 mb-4">📅 Booking requests ({bookingRequests.length})</h2>
          {bookingRequests.map((req) => {
            const isPending = req.status === 'PENDING';
            return (
              <div key={req.id} className={'border-l-4 rounded-lg px-4 py-3 mb-3 ' + (isPending ? 'border-warning bg-orange-50 dark:bg-orange-950' : 'border-success bg-green-50 dark:bg-green-950')}>
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm text-gray-900 dark:text-gray-100">@{req.username}</span>
                  {isPending ? (
                    <div className="flex gap-2">
                      <button onClick={() => confirmBooking(req)} className="bg-success text-white text-xs font-bold px-3 py-1 rounded hover:opacity-90 transition">Confirm</button>
                      <button onClick={() => declineBooking(req)} className="bg-danger text-white text-xs font-bold px-3 py-1 rounded hover:opacity-90 transition">Decline</button>
                    </div>
                  ) : (
                    <span className="text-success text-xs font-bold">✓ Confirmed</span>
                  )}
                </div>
                <div className="text-brand-text text-xs font-semibold mt-1">{req.trainerName}</div>
                <div className="text-gray-600 dark:text-gray-400 text-sm mt-1">{req.message}</div>
                <div className="text-gray-400 dark:text-gray-600 text-xs mt-2">{new Date(req.requestedAt).toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
