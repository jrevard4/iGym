'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EQUIP_CATEGORIES } from '../../../../lib/constants';
import { uniqueId, computeEquipmentAlerts } from '../../../../lib/helpers';
import { uploadEquipmentPhoto } from '../../../../lib/supabase';
import { useOwnerContext } from '@/lib/ownerContext';

const BLANK = {
  name: '', brand: '', category: EQUIP_CATEGORIES[0], targetArea: '',
  minWeight: '', maxWeight: '', instructions: '', description: '',
  image: '', muscleDiagramImage: '', videoUrl: '',
  mfgDate: '', serviceDate: '', warrantyExpiresDate: '',
  outOfService: false, expectedRepairDate: '',
};

const cls = 'w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';

export default function OwnerInventoryPage() {
  const { owner, persistOwner } = useOwnerContext();
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [uploadingField, setUploadingField] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const equipment = owner.equipment || [];
  const alerts = computeEquipmentAlerts(equipment);
  const alertsByItem = alerts.reduce((acc, a) => {
    (acc[a.id] = acc[a.id] || []).push(a);
    return acc;
  }, {});

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startEdit = (eq) => { setEditingId(eq.id); setForm({ ...BLANK, ...eq }); setScanError(''); };
  const cancelEdit = () => { setEditingId(null); setForm(BLANK); setScanError(''); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    let next;
    if (editingId) {
      next = equipment.map((eq) => (eq.id === editingId ? { ...form, id: editingId } : eq));
    } else {
      next = [{ ...form, id: uniqueId('e_') }, ...equipment];
    }
    await persistOwner({ ...owner, equipment: next });
    cancelEdit();
  };

  const remove = async (id) => {
    await persistOwner({ ...owner, equipment: equipment.filter((eq) => eq.id !== id) });
    if (editingId === id) cancelEdit();
  };

  const uploadPhoto = async (field, file) => {
    if (!file) return;
    setUploadingField(field);
    try {
      const url = await uploadEquipmentPhoto(file);
      if (url) setForm((f) => ({ ...f, [field]: url }));
    } finally {
      setUploadingField(null);
    }
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const scanWithAI = async (file) => {
    if (!file) return;
    setScanning(true);
    setScanError('');
    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type || 'image/jpeg';
      const res = await fetch('/api/identify-equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI scan failed.');
      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        brand: data.brand && data.brand !== 'Unknown' ? data.brand : f.brand,
        category: data.category || f.category,
        targetArea: data.targetArea || f.targetArea,
        minWeight: data.minWeight ?? f.minWeight,
        maxWeight: data.maxWeight ?? f.maxWeight,
        instructions: data.instructions || f.instructions,
        description: data.description || f.description,
      }));
    } catch (err) {
      setScanError(err.message || 'AI scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const onPhotoPicked = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadPhoto('image', file);
    scanWithAI(file);
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-8 flex-wrap gap-2">
        <div>
          <h1 className="text-4xl font-black mb-2">Inventory</h1>
          <p className="text-gray-600 dark:text-gray-400">{equipment.length} {equipment.length === 1 ? 'item' : 'items'}.</p>
        </div>
        <Link href="/owner/inventory/repository" className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-semibold px-4 py-2 rounded-lg transition">
          🌐 Browse supplier catalog →
        </Link>
      </div>

      {alerts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl p-4 mb-6">
          <div className="font-bold text-sm text-amber-800 dark:text-amber-400 mb-1.5">⚠ {alerts.length} equipment item{alerts.length === 1 ? '' : 's'} need{alerts.length === 1 ? 's' : ''} attention</div>
          <ul className="text-xs text-amber-700 dark:text-amber-500 space-y-0.5">
            {alerts.map((a, i) => <li key={i}>• {a.message}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={save} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 mb-8 max-w-xl space-y-3">
        <h2 className="font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Edit equipment' : 'Add equipment'}</h2>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-500 mb-1.5">Photo</label>
          <div className="flex items-center gap-3">
            {form.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.image} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
            )}
            <input type="file" accept="image/*" onChange={onPhotoPicked} className="text-xs text-gray-700 dark:text-gray-300" />
          </div>
          {uploadingField === 'image' && <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Uploading photo...</p>}
          {scanning && <p className="text-xs text-brand-text mt-1">✨ Scanning with AI to auto-fill fields below...</p>}
          {scanError && <p className="text-xs text-danger mt-1">{scanError}</p>}
        </div>

        <input className={cls} placeholder="Name" value={form.name} onChange={update('name')} />
        <input className={cls} placeholder="Brand (optional)" value={form.brand} onChange={update('brand')} />
        <div className="grid grid-cols-2 gap-3">
          <select className={cls + ' bg-white'} value={form.category} onChange={update('category')}>
            {EQUIP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className={cls} placeholder="Target area (e.g. Chest)" value={form.targetArea} onChange={update('targetArea')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={cls} placeholder="Min weight (lbs)" value={form.minWeight} onChange={update('minWeight')} />
          <input className={cls} placeholder="Max weight (lbs)" value={form.maxWeight} onChange={update('maxWeight')} />
        </div>
        <textarea className={cls} rows={2} placeholder="Usage instructions" value={form.instructions} onChange={update('instructions')} />
        <textarea className={cls} rows={2} placeholder="Description (optional)" value={form.description} onChange={update('description')} />
        <input className={cls} placeholder="How-to-use video link (YouTube, etc.)" value={form.videoUrl} onChange={update('videoUrl')} />

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-500 mb-1.5">Muscle diagram (optional)</label>
          <div className="flex items-center gap-3">
            {form.muscleDiagramImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.muscleDiagramImage} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
            )}
            <input type="file" accept="image/*" onChange={(e) => uploadPhoto('muscleDiagramImage', e.target.files?.[0])} className="text-xs text-gray-700 dark:text-gray-300" />
          </div>
          {uploadingField === 'muscleDiagramImage' && <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Uploading...</p>}
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-500 mb-1.5">Ownership dates</label>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-400 dark:text-gray-600 mb-1">Purchased / manufactured</label>
              <input type="date" className={cls} value={form.mfgDate} onChange={update('mfgDate')} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 dark:text-gray-600 mb-1">Last serviced</label>
              <input type="date" className={cls} value={form.serviceDate} onChange={update('serviceDate')} />
            </div>
          </div>
          <label className="block text-xs text-gray-400 dark:text-gray-600 mb-1">Warranty expires</label>
          <input type="date" className={cls} value={form.warrantyExpiresDate} onChange={update('warrantyExpiresDate')} />
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.outOfService}
              onChange={(e) => setForm((f) => ({ ...f, outOfService: e.target.checked }))}
              className="w-4 h-4 accent-danger"
            />
            Currently out of service
          </label>
          {form.outOfService && (
            <div className="mt-2">
              <label className="block text-xs text-gray-400 dark:text-gray-600 mb-1">Expected repair date</label>
              <input type="date" className={cls} value={form.expectedRepairDate} onChange={update('expectedRepairDate')} />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg transition">
            {editingId ? 'Save changes' : '+ Add to inventory'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-semibold px-4 py-2.5 transition">Cancel</button>
          )}
        </div>
      </form>

      {equipment.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-600 italic">No equipment yet.</p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {equipment.map((eq) => (
            <li key={eq.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              {eq.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={eq.image} alt={eq.name} className="w-full h-32 object-cover bg-gray-50 dark:bg-gray-800" />
              )}
              <div className="p-4">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{eq.name}</div>
                  <span className="bg-brand/10 text-brand-text text-xs font-bold px-2 py-0.5 rounded shrink-0">{eq.category}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Target: {eq.targetArea || '—'}</div>
                {eq.outOfService && (
                  <div className="text-xs font-bold text-danger mb-2">
                    ⚠ Out of service{eq.expectedRepairDate ? ` — back ${new Date(eq.expectedRepairDate).toLocaleDateString()}` : ''}
                  </div>
                )}
                {(alertsByItem[eq.id] || []).map((a, i) => (
                  <div key={i} className="text-xs font-bold text-amber-700 dark:text-amber-500 mb-2">⚠ {a.message.split(': ')[1]}</div>
                ))}
                <div className="flex gap-3 text-xs font-semibold">
                  <button onClick={() => startEdit(eq)} className="text-brand-text hover:underline">Edit</button>
                  <button onClick={() => remove(eq.id)} className="text-danger hover:underline">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
