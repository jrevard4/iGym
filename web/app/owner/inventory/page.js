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

const cls = 'w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition';

export default function OwnerInventoryPage() {
  const { owner, persistOwner } = useOwnerContext();
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [uploadingField, setUploadingField] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const equipment = owner.equipment || [];
  const alerts = computeEquipmentAlerts(equipment);
  const alertsByItem = alerts.reduce((acc, a) => {
    (acc[a.id] = acc[a.id] || []).push(a);
    return acc;
  }, {});

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startEdit = (eq) => { setEditingId(eq.id); setForm({ ...BLANK, ...eq }); setScanError(''); setImportError(''); };
  const cancelEdit = () => { setEditingId(null); setForm(BLANK); setScanError(''); setImportError(''); };

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
    if (!confirm('Remove this equipment item? This can\'t be undone.')) return;
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

  // Drag-and-drop: accepts either an equipment card dragged from the
  // Supplier Catalog (carries a full item as JSON) or a product link dragged
  // in from an external site/browser tab (just a URL) — either way it lands
  // straight in the add-equipment form below, ready to review and save.
  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    setImportError('');

    const equipJson = e.dataTransfer.getData('application/x-igym-equipment');
    if (equipJson) {
      try {
        const item = JSON.parse(equipJson);
        const { id: _drop, ...rest } = item;
        setEditingId(null);
        setForm({ ...BLANK, ...rest });
        return;
      } catch { /* fall through to URL handling below */ }
    }

    const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
    const url = raw.split('\n').map((l) => l.trim()).find((l) => /^https?:\/\//i.test(l));
    if (!url) return;

    setImporting(true);
    try {
      const res = await fetch('/api/import-equipment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not import that link.');
      setEditingId(null);
      setForm((f) => ({
        ...BLANK,
        ...f,
        name: data.name || f.name,
        image: data.imageUrl || f.image,
        description: data.description || f.description,
      }));
    } catch (err) {
      setImportError(err.message || 'Could not import that link.');
    } finally {
      setImporting(false);
    }
  };

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  return (
    <div>
      <div className="flex justify-between items-start mb-8 flex-wrap gap-2">
        <div>
          <h1 className="text-4xl font-black mb-2">Inventory</h1>
          <p className="text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{equipment.length}</span> {equipment.length === 1 ? 'item' : 'items'} in your gym.
          </p>
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

      <div className="grid lg:grid-cols-[400px_1fr] gap-6 items-start">
        {/* ── Add / edit form ──────────────────────────────────────────── */}
        <form
          onSubmit={save}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={
            'bg-white dark:bg-gray-900 border rounded-2xl p-5 space-y-3 lg:sticky lg:top-6 transition ' +
            (dragOver ? 'border-brand border-2 ring-4 ring-brand/10' : 'border-gray-200 dark:border-gray-800')
          }
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Edit equipment' : 'Add equipment'}</h2>
            {!editingId && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500">Drop a catalog card or product link here</span>
            )}
          </div>

          {(importing || importError) && (
            <div className={'text-xs rounded-lg px-3 py-2 ' + (importError ? 'bg-red-50 dark:bg-red-950 text-danger' : 'bg-brand/10 text-brand-text dark:text-blue-400')}>
              {importing ? '📥 Importing from link...' : importError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Photo</label>
            <div className="flex items-center gap-3">
              {form.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600 text-xl shrink-0">📷</div>
              )}
              <input type="file" accept="image/*" onChange={onPhotoPicked} className="text-xs text-gray-700 dark:text-gray-300" />
            </div>
            {uploadingField === 'image' && <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">Uploading photo...</p>}
            {scanning && <p className="text-xs text-brand-text dark:text-blue-400 mt-1">✨ Scanning with AI to auto-fill fields below...</p>}
            {scanError && <p className="text-xs text-danger mt-1">{scanError}</p>}
          </div>

          <input className={cls} placeholder="Name" value={form.name} onChange={update('name')} />
          <input className={cls} placeholder="Brand (optional)" value={form.brand} onChange={update('brand')} />
          <div className="grid grid-cols-2 gap-3">
            <select className={cls + ' bg-white dark:bg-gray-900'} aria-label="Equipment category" value={form.category} onChange={update('category')}>
              {EQUIP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className={cls} placeholder="Target area" value={form.targetArea} onChange={update('targetArea')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={cls} placeholder="Min weight (lbs)" value={form.minWeight} onChange={update('minWeight')} />
            <input className={cls} placeholder="Max weight (lbs)" value={form.maxWeight} onChange={update('maxWeight')} />
          </div>
          <textarea className={cls} rows={2} placeholder="Usage instructions" value={form.instructions} onChange={update('instructions')} />
          <textarea className={cls} rows={2} placeholder="Description (optional)" value={form.description} onChange={update('description')} />
          <input className={cls} placeholder="How-to-use video link" value={form.videoUrl} onChange={update('videoUrl')} />

          <details className="group pt-1">
            <summary className="text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none list-none flex items-center gap-1.5">
              <span className="transition group-open:rotate-90">▸</span> More details (muscle diagram, dates, service status)
            </summary>
            <div className="mt-3 space-y-3 pl-0.5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Muscle diagram (optional)</label>
                <div className="flex items-center gap-3">
                  {form.muscleDiagramImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.muscleDiagramImage} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                  )}
                  <input type="file" accept="image/*" onChange={(e) => uploadPhoto('muscleDiagramImage', e.target.files?.[0])} className="text-xs text-gray-700 dark:text-gray-300" />
                </div>
                {uploadingField === 'muscleDiagramImage' && <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">Uploading...</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Purchased / manufactured</label>
                  <input type="date" className={cls} value={form.mfgDate} onChange={update('mfgDate')} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Last serviced</label>
                  <input type="date" className={cls} value={form.serviceDate} onChange={update('serviceDate')} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Warranty expires</label>
                <input type="date" className={cls} value={form.warrantyExpiresDate} onChange={update('warrantyExpiresDate')} />
              </div>

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
                <div>
                  <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Expected repair date</label>
                  <input type="date" className={cls} value={form.expectedRepairDate} onChange={update('expectedRepairDate')} />
                </div>
              )}
            </div>
          </details>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-60" disabled={!form.name.trim()}>
              {editingId ? 'Save changes' : '+ Add to inventory'}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-semibold px-4 py-2.5 transition">Cancel</button>
            )}
          </div>
        </form>

        {/* ── Equipment list ───────────────────────────────────────────── */}
        {equipment.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
            <div className="text-5xl mb-3" aria-hidden="true">🏋️</div>
            <h2 className="text-lg font-bold mb-1 text-gray-900 dark:text-gray-100">No equipment yet</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Add your first item using the form, or browse real equipment from major brands.</p>
            <Link href="/owner/inventory/repository" className="inline-block bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg transition text-sm">
              🌐 Browse supplier catalog
            </Link>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {equipment.map((eq) => (
              <li key={eq.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden hover:shadow-md transition">
                {eq.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={eq.image} alt={eq.name} className="w-full h-32 object-cover bg-gray-50 dark:bg-gray-800" />
                ) : (
                  <div className="w-full h-32 bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-600 text-3xl">📷</div>
                )}
                <div className="p-4">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{eq.name}</div>
                    <span className="bg-brand/10 text-brand-text dark:text-blue-400 text-xs font-bold px-2 py-0.5 rounded shrink-0">{eq.category}</span>
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
                  <div className="flex gap-3 text-xs font-semibold pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                    <button onClick={() => startEdit(eq)} className="text-brand-text dark:text-blue-400 hover:underline">Edit</button>
                    <button onClick={() => remove(eq.id)} className="text-danger hover:underline">Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
