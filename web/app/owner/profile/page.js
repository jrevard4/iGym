'use client';

import { useState } from 'react';
import { CLASS_TYPES, PRESET_PASSES, PRESET_MEMBERSHIPS, AMENITIES } from '../../../../lib/constants';
import { uniqueId, getActivePromotion } from '../../../../lib/helpers';
import { useOwnerContext } from '@/lib/ownerContext';

const cls = 'w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';
const chipCls = (active) => 'px-3 py-1.5 rounded-full text-xs font-semibold transition ' + (active ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300');

export default function OwnerProfilePage() {
  const { owner, persistOwner } = useOwnerContext();
  const [form, setForm] = useState(owner);
  const [saving, setSaving] = useState(false);
  const [customClass, setCustomClass] = useState('');
  const [syncingBrand, setSyncingBrand] = useState(false);
  const [brandError, setBrandError] = useState('');

  const [newPromo, setNewPromo] = useState({ title: '', detail: '', days: '7' });
  const [newPass, setNewPass] = useState({ label: '', price: '', type: 'TIME', value: '', features: [] });
  const [newFeature, setNewFeature] = useState('');

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

  const toggleAmenity = (a) => {
    const active = (form.amenities || []).includes(a);
    const next = active ? form.amenities.filter((x) => x !== a) : [...(form.amenities || []), a];
    setForm((f) => ({ ...f, amenities: next }));
  };

  const syncBranding = async () => {
    if (!form.website?.trim()) return;
    setSyncingBrand(true);
    setBrandError('');
    try {
      const res = await fetch('/api/sync-branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.website.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not sync branding.');
      setForm((f) => ({
        ...f,
        branding: {
          primaryColor: data.primaryColor || f.branding?.primaryColor || null,
          logoUrl: data.logoUrl || f.branding?.logoUrl || null,
          heroImageUrl: data.heroImageUrl || f.branding?.heroImageUrl || null,
        },
      }));
    } catch (err) {
      setBrandError(err.message || 'Could not sync branding.');
    } finally {
      setSyncingBrand(false);
    }
  };

  const clearBranding = () => setForm((f) => ({ ...f, branding: null }));

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
    const passObj = {
      id: uniqueId('p_'), label: newPass.label, price: parseFloat(newPass.price) || 0,
      type: newPass.type, value: parseInt(newPass.value) || 1,
      ...(newPass.type === 'MEMBERSHIP' ? { features: newPass.features } : {}),
    };
    const updated = { ...owner, ...form, passes: [...(form.passes || []), passObj] };
    setForm(updated);
    setNewPass({ label: '', price: '', type: 'TIME', value: '', features: [] });
    setNewFeature('');
    await persistOwner(updated);
  };

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setNewPass((p) => ({ ...p, features: [...(p.features || []), newFeature.trim()] }));
    setNewFeature('');
  };

  const removeFeature = (i) => {
    setNewPass((p) => ({ ...p, features: p.features.filter((_, idx) => idx !== i) }));
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
        <p className="text-gray-600 dark:text-gray-400">Public info, promotions, and pass tiers members see when browsing your gym.</p>
      </div>

      <form onSubmit={save} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500">Public info</h2>
        <input className={cls} placeholder="Gym name" value={form.gymName || ''} onChange={update('gymName')} />
        <input className={cls} placeholder="Full address" value={form.location || ''} onChange={update('location')} />
        <input className={cls} placeholder="Phone" value={form.phone || ''} onChange={update('phone')} />
        <input className={cls} placeholder="Website (e.g. https://yourgym.com)" value={form.website || ''} onChange={update('website')} />
        <input className={cls} placeholder="Display pricing (e.g. $49/mo)" value={form.pricing || ''} onChange={update('pricing')} />
        <input className={cls} placeholder="Numeric monthly price" type="number" value={form.monthlyPrice || ''} onChange={update('monthlyPrice')} />
        <input
          className={cls}
          placeholder="Referral fee % (0 = off) — % of price paid to whoever referred the buyer"
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={form.referralFeeRate ? form.referralFeeRate * 100 : ''}
          onChange={(e) => setForm((f) => ({ ...f, referralFeeRate: e.target.value ? parseFloat(e.target.value) / 100 : 0 }))}
        />
        <input className={cls} placeholder="Hours display (e.g. Mon-Fri 5AM-10PM)" value={form.hoursDisplay || ''} onChange={update('hoursDisplay')} />
        <div className="grid grid-cols-2 gap-3">
          <input className={cls} placeholder="Open hour (0-23)" type="number" value={form.openHour ?? ''} onChange={update('openHour')} />
          <input className={cls} placeholder="Close hour (0-23)" type="number" value={form.closeHour ?? ''} onChange={update('closeHour')} />
        </div>
        <textarea className={cls} rows={3} placeholder="Tell members about your facility..." value={form.description || ''} onChange={update('description')} />

        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 pt-2">Classes offered</h2>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...CLASS_TYPES, ...(form.classes || [])])].map((c) => {
            const active = (form.classes || []).includes(c);
            return (
              <button type="button" key={c} onClick={() => toggleClass(c)} className={chipCls(active)}>
                {c}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input className={cls} placeholder="Add custom class..." value={customClass} onChange={(e) => setCustomClass(e.target.value)} />
          <button type="button" onClick={addCustomClass} className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 rounded-lg text-sm font-semibold shrink-0">Add</button>
        </div>

        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 pt-2">Amenities</h2>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => {
            const active = (form.amenities || []).includes(a);
            return (
              <button type="button" key={a} onClick={() => toggleAmenity(a)} className={chipCls(active)}>
                {a}
              </button>
            );
          })}
        </div>

        <button type="submit" disabled={saving} className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-lg transition disabled:opacity-60">
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 mb-1">🎨 Gym branding</h2>
        <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
          Pull your brand color, logo, and hero image from your website so your iGym listing looks like your own site.
        </p>
        {form.website?.trim() ? (
          <button
            type="button"
            onClick={syncBranding}
            disabled={syncingBrand}
            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-60"
          >
            {syncingBrand ? 'Syncing...' : '🔄 Sync branding from website'}
          </button>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-600 italic">Add a website URL above, then save, to enable this.</p>
        )}
        {brandError && <p className="text-xs text-danger mt-2">{brandError}</p>}
        {form.branding && (form.branding.primaryColor || form.branding.logoUrl || form.branding.heroImageUrl) && (
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            {form.branding.primaryColor && (
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700" style={{ backgroundColor: form.branding.primaryColor }} />
                <span className="text-xs font-mono text-gray-500 dark:text-gray-500">{form.branding.primaryColor}</span>
              </div>
            )}
            {form.branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.branding.logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain border border-gray-200 dark:border-gray-700 bg-white" />
            )}
            {form.branding.heroImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.branding.heroImageUrl} alt="Hero" className="w-20 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
            )}
            <button type="button" onClick={clearBranding} className="text-xs font-semibold text-danger hover:underline">Remove</button>
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">Click "Save profile" above to apply changes.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 mb-1">🔥 Promotions</h2>
        <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">Time-boxed offers shown to members browsing your gym.</p>
        {(form.promotions || []).map((p) => {
          const active = getActivePromotion({ promotions: [p] });
          return (
            <div key={p.id} className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-3 mb-3">
              <div>
                <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{p.title}</div>
                {p.detail && <div className="text-xs text-gray-500 dark:text-gray-500">{p.detail}</div>}
                <div className={'text-xs font-bold mt-1 ' + (active ? 'text-success' : 'text-gray-400 dark:text-gray-600')}>
                  {active ? `Live until ${new Date(p.endDate).toLocaleDateString()}` : 'Expired'}
                </div>
              </div>
              <button onClick={() => removePromotion(p.id)} className="text-danger text-xs font-semibold">Remove</button>
            </div>
          );
        })}
        {(form.promotions || []).length === 0 && <p className="text-gray-400 dark:text-gray-600 italic text-sm mb-3">No active promotions.</p>}
        <div className="space-y-2">
          <input className={cls} placeholder='Title, e.g. "20% off day passes this week"' value={newPromo.title} onChange={(e) => setNewPromo((p) => ({ ...p, title: e.target.value }))} />
          <input className={cls} placeholder="Details (optional)" value={newPromo.detail} onChange={(e) => setNewPromo((p) => ({ ...p, detail: e.target.value }))} />
          <input className={cls} placeholder="Runs for how many days?" type="number" value={newPromo.days} onChange={(e) => setNewPromo((p) => ({ ...p, days: e.target.value }))} />
          <button onClick={addPromotion} className="w-full bg-warning text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition">+ Launch promotion</button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 mb-1">🎟️ Passes & memberships</h2>
        <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">Day-passes and punch cards are one-time access. Memberships are recurring plans members compare side by side.</p>
        {(form.passes || []).map((p) => (
          <div key={p.id} className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-3 mb-3">
            <div>
              <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{p.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-500">
                {p.type === 'PUNCH' ? `${p.value} scans` : p.type === 'MEMBERSHIP' ? `Billed every ${p.value} days` : `${p.value} days valid`}
              </div>
              {p.type === 'MEMBERSHIP' && p.features?.length > 0 && (
                <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">{p.features.join(' · ')}</div>
              )}
            </div>
            <div className="text-right shrink-0 ml-3">
              <div className="text-success font-bold">${Number(p.price).toFixed(2)}</div>
              <button onClick={() => removePass(p.id)} className="text-danger text-xs font-semibold">Remove</button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESET_PASSES.map((preset) => (
            <button key={preset.label} type="button"
              onClick={() => setNewPass({ label: preset.label, price: preset.price, type: preset.type, value: preset.value, features: [] })}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700">
              {preset.label}
            </button>
          ))}
          {PRESET_MEMBERSHIPS.map((preset) => (
            <button key={preset.label} type="button"
              onClick={() => setNewPass({ label: preset.label, price: preset.price, type: preset.type, value: preset.value, features: [...preset.features] })}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-accent/10 text-accent hover:bg-accent/20">
              {preset.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <input className={cls} placeholder="Name" value={newPass.label} onChange={(e) => setNewPass((p) => ({ ...p, label: e.target.value }))} />
          <input className={cls} placeholder="Price ($)" type="number" value={newPass.price} onChange={(e) => setNewPass((p) => ({ ...p, price: e.target.value }))} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setNewPass((p) => ({ ...p, type: 'TIME' }))} className={'flex-1 py-2 rounded-lg text-xs font-semibold ' + (newPass.type === 'TIME' ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100')}>⏳ Time-based</button>
            <button type="button" onClick={() => setNewPass((p) => ({ ...p, type: 'PUNCH' }))} className={'flex-1 py-2 rounded-lg text-xs font-semibold ' + (newPass.type === 'PUNCH' ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100')}>🎫 Punch card</button>
            <button type="button" onClick={() => setNewPass((p) => ({ ...p, type: 'MEMBERSHIP' }))} className={'flex-1 py-2 rounded-lg text-xs font-semibold ' + (newPass.type === 'MEMBERSHIP' ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100')}>🏷️ Membership</button>
          </div>
          <input
            className={cls}
            placeholder={newPass.type === 'PUNCH' ? 'Scans allowed (e.g. 10)' : newPass.type === 'MEMBERSHIP' ? 'Billing period in days (e.g. 30)' : 'Days valid (e.g. 7)'}
            type="number"
            value={newPass.value}
            onChange={(e) => setNewPass((p) => ({ ...p, value: e.target.value }))}
          />
          {newPass.type === 'MEMBERSHIP' && (
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-2">What's included</div>
              {(newPass.features || []).map((f, i) => (
                <div key={i} className="flex justify-between items-center text-sm mb-1.5">
                  <span>✓ {f}</span>
                  <button type="button" onClick={() => removeFeature(i)} className="text-danger text-xs font-semibold">×</button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  className={cls}
                  placeholder="e.g. Bring a guest for free"
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
                />
                <button type="button" onClick={addFeature} className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 rounded-lg text-sm font-semibold shrink-0">Add</button>
              </div>
            </div>
          )}
          <button onClick={addPass} className="w-full bg-accent text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition">+ Add to menu</button>
        </div>
      </div>
    </div>
  );
}
