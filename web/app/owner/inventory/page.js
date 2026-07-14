'use client';

import { useState } from 'react';
import { EQUIP_CATEGORIES } from '../../../../lib/constants';
import { uniqueId } from '../../../../lib/helpers';
import { useOwnerContext } from '@/lib/ownerContext';

const BLANK = { name: '', category: EQUIP_CATEGORIES[0], targetArea: '', minWeight: '', maxWeight: '', instructions: '' };

export default function OwnerInventoryPage() {
  const { owner, persistOwner } = useOwnerContext();
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const equipment = owner.equipment || [];

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startEdit = (eq) => { setEditingId(eq.id); setForm(eq); };
  const cancelEdit = () => { setEditingId(null); setForm(BLANK); };

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

  const cls = 'w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';

  return (
    <div>
      <h1 className="text-4xl font-black mb-2">Inventory</h1>
      <p className="text-gray-600 mb-8">
        {equipment.length} {equipment.length === 1 ? 'item' : 'items'}. Need the AI photo identifier or the global brand catalog? Those stay in the iGym mobile app for now — add items manually here.
      </p>

      <form onSubmit={save} className="bg-white border border-gray-200 rounded-2xl p-5 mb-8 max-w-xl space-y-3">
        <h2 className="font-bold">{editingId ? 'Edit equipment' : 'Add equipment'}</h2>
        <input className={cls} placeholder="Name" value={form.name} onChange={update('name')} />
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
        <div className="flex gap-2">
          <button type="submit" className="bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg transition">
            {editingId ? 'Save changes' : '+ Add to inventory'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="text-gray-500 hover:text-gray-700 font-semibold px-4 py-2.5 transition">Cancel</button>
          )}
        </div>
      </form>

      {equipment.length === 0 ? (
        <p className="text-gray-400 italic">No equipment yet.</p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {equipment.map((eq) => (
            <li key={eq.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between items-start gap-2 mb-1">
                <div className="font-bold text-sm">{eq.name}</div>
                <span className="bg-brand/10 text-brand text-xs font-bold px-2 py-0.5 rounded shrink-0">{eq.category}</span>
              </div>
              <div className="text-xs text-gray-600 mb-3">Target: {eq.targetArea || '—'}</div>
              <div className="flex gap-3 text-xs font-semibold">
                <button onClick={() => startEdit(eq)} className="text-brand hover:underline">Edit</button>
                <button onClick={() => remove(eq.id)} className="text-danger hover:underline">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
