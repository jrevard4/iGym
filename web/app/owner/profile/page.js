'use client';

import { useState } from 'react';
import { CLASS_TYPES, PRESET_PASSES } from '../../../../lib/constants';
import { uniqueId, getActivePromotion } from '../../../../lib/helpers';
import { useOwnerContext } from '@/lib/ownerContext';

const cls = 'w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';

export default function OwnerProfilePage() {
  const { owner, persistOwner } = useOwnerContext();
  const [form, setForm] = useState(owner);
  const [saving, setSaving] = useState(false);
  const [customClass, setCustomClass] = useState('');

  const [newPromo, setNewPromo] = useState({ title: '', detail: '', days: '7' });
  const [newPass, setNewPass] = useState({ label: '', price: '', type: 'TIME', value: '' });

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    await persistOwner({ ...owner, ...form });
    setSaving(false);
  };

  const toggleClass = (c) => {
    const active = (form.classes || []).includes(c);
    const next = active ? form.classes.filter((x) => x !== c) : [...(form.classes || []), c];
    setForm((f) => ({ ...f, classes: next }));
  };

  const addCustomClass = () => {
    if (!customClass.trim()) return;
    if (!(form.classes || []).includes(customClass.trim())) {
      setForm((f) => ({ ...f, classes: [...(f.classes || []), customClass.trim()] }));
    }
    setCustomClass('');
  };

  const addPromotion = async () => {
    if (!newPromo.title.trim()) return;
    const days = parseInt(newPromo.days) || 7;
    const promo = {
      id: uniqueId('promo_'),
      title: newPromo.title.trim(),
      detail: newPromo.detail.trim(),
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + days * 86400000).toISOString(),
    };
    const updated = { ...owner, ...form, promotions: [promo, ...(form.promotions || [])] };
    setForm(updated);
    setNewPromo({ title: '', detail: '', days: '7' });
    await persistOwner(updated);
  };

  const removePromotion = async (id) => {
    const updated = { ...owner, ...form, promotions: (form.promotions || []).filter((p) => p.id !== id) };
    setForm(updated);
    await persistOwner(updated);
  };

  const addPass = async () => {
    if (!newPass.label || !newPass.price || !newPass.value) return;
    const passObj = { id: uniqueId('p_'), label: newPass.label, price: parseFloat(newPass.price) || 0, type: newPass.type, value: parseInt(newPass.value) || 1 };
    const updated = { ...owner, ...form, passes: [...(form.passes || []), passObj] };
    setForm(updated);
    setNewPass({ label: '', price: '', type: 'TIME', value: '' });
    await persistOwner(updated);
  };

  const removePass = async (id) => {
    const updated = { ...owner, ...form, passes: (form.passes || []).filter((p) => p.id !== id) };
    setForm(updated);
    await persistOwner(updated);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-4xl font-black mb-2">Gym Profile</h1>
        <p className="text-gray-600">Public info, promotions, and pass tiers members see when browsing your gym.</p>
      </div>

      <form onSubmit={save} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-sm uppercase text-gray-500">Public info</h2>
        <input className={cls} placeholder="Gym name" value={form.gymName || ''} onChange={update('gymName')} />
        <input className={cls} placeholder="Full address" value={form.location || ''} onChange={update('location')} />
        <input className={cls} placeholder="Phone" value={form.phone || ''} onChange={update('phone')} />
        <input className={cls} placeholder="Display pricing (e.g. $49/mo)" value={form.pricing || ''} onChange={update('pricing')} />
        <input className={cls} placeholder="Numeric monthly price" type="number" value={form.monthlyPrice || ''} onChange={update('monthlyPrice')} />
        <input className={cls} placeholder="Hours display (e.g. Mon-Fri 5AM-10PM)" value={form.hoursDisplay || ''} onChange={update('hoursDisplay')} />
        <div className="grid grid-cols-2 gap-3">
          <input className={cls} placeholder="Open hour (0-23)" type="number" value={form.openHour ?? ''} onChange={update('openHour')} />
          <input className={cls} placeholder="Close hour (0-23)" type="number" value={form.closeHour ?? ''} onChange={update('closeHour')} />
        </div>
        <textarea className={cls} rows={3} placeholder="Tell members about your facility..." value={form.description || ''} onChange={update('description')} />

        <h2 className="font-bold text-sm uppercase text-gray-500 pt-2">Classes offered</h2>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...CLASS_TYPES, ...(form.classes || [])])].map((c) => {
            const active = (form.classes || []).includes(c);
            return (
              <button type="button" key={c} onClick={() => toggleClass(c)}
                className={'px-3 py-1.5 rounded-full text-xs font-semibold transition ' + (active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700')}>
                {c}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input className={cls} placeholder="Add custom class..." value={customClass} onChange={(e) => setCustomClass(e.target.value)} />
          <button type="button" onClick={addCustomClass} className="bg-gray-100 px-4 rounded-lg text-sm font-semibold shrink-0">Add</button>
        </div>

        <button type="submit" disabled={saving} className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-lg transition disabled:opacity-60">
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 mb-1">🔥 Promotions</h2>
        <p className="text-xs text-gray-500 mb-4">Time-boxed offers shown to members browsing your gym.</p>
        {(form.promotions || []).map((p) => {
          const active = getActivePromotion({ promotions: [p] });
          return (
            <div key={p.id} className="flex justify-between items-start border-b border-gray-100 pb-3 mb-3">
              <div>
                <div className="font-bold text-sm">{p.title}</div>
                {p.detail && <div className="text-xs text-gray-500">{p.detail}</div>}
                <div className={'text-xs font-bold mt-1 ' + (active ? 'text-success' : 'text-gray-400')}>
                  {active ? `Live until ${new Date(p.endDate).toLocaleDateString()}` : 'Expired'}
                </div>
              </div>
              <button onClick={() => removePromotion(p.id)} className="text-danger text-xs font-semibold">Remove</button>
            </div>
          );
        })}
        {(form.promotions || []).length === 0 && <p className="text-gray-400 italic text-sm mb-3">No active promotions.</p>}
        <div className="space-y-2">
          <input className={cls} placeholder='Title, e.g. "20% off day passes this week"' value={newPromo.title} onChange={(e) => setNewPromo((p) => ({ ...p, title: e.target.value }))} />
          <input className={cls} placeholder="Details (optional)" value={newPromo.detail} onChange={(e) => setNewPromo((p) => ({ ...p, detail: e.target.value }))} />
          <input className={cls} placeholder="Runs for how many days?" type="number" value={newPromo.days} onChange={(e) => setNewPromo((p) => ({ ...p, days: e.target.value }))} />
          <button onClick={addPromotion} className="w-full bg-warning text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition">+ Launch promotion</button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 mb-4">🎟️ Pass tiers</h2>
        {(form.passes || []).map((p) => (
          <div key={p.id} className="flex justify-between items-center border-b border-gray-100 pb-3 mb-3">
            <div>
              <div className="font-bold text-sm">{p.label}</div>
              <div className="text-xs text-gray-500">{p.type === 'TIME' ? `${p.value} days valid` : `${p.value} scans`}</div>
            </div>
            <div className="text-right">
              <div className="text-success font-bold">${Number(p.price).toFixed(2)}</div>
              <button onClick={() => removePass(p.id)} className="text-danger text-xs font-semibold">Remove</button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESET_PASSES.map((preset) => (
            <button key={preset.label} type="button"
              onClick={() => setNewPass({ label: preset.label, price: preset.price, type: preset.type, value: preset.value })}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 hover:bg-gray-200">
              {preset.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <input className={cls} placeholder="Pass name" value={newPass.label} onChange={(e) => setNewPass((p) => ({ ...p, label: e.target.value }))} />
          <input className={cls} placeholder="Price ($)" type="number" value={newPass.price} onChange={(e) => setNewPass((p) => ({ ...p, price: e.target.value }))} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setNewPass((p) => ({ ...p, type: 'TIME' }))} className={'flex-1 py-2 rounded-lg text-sm font-semibold ' + (newPass.type === 'TIME' ? 'bg-brand text-white' : 'bg-gray-100')}>⏳ Time-based</button>
            <button type="button" onClick={() => setNewPass((p) => ({ ...p, type: 'PUNCH' }))} className={'flex-1 py-2 rounded-lg text-sm font-semibold ' + (newPass.type === 'PUNCH' ? 'bg-brand text-white' : 'bg-gray-100')}>🎫 Punch card</button>
          </div>
          <input className={cls} placeholder={newPass.type === 'TIME' ? 'Days valid (e.g. 7)' : 'Scans allowed (e.g. 10)'} type="number" value={newPass.value} onChange={(e) => setNewPass((p) => ({ ...p, value: e.target.value }))} />
          <button onClick={addPass} className="w-full bg-accent text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition">+ Add to menu</button>
        </div>
      </div>
    </div>
  );
}
