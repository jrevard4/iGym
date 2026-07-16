'use client';

import { useState } from 'react';
import { GLOBAL_EQUIPMENT_DATABASE } from '../../../../../lib/equipment-db';
import { BRAND_WEBSITES } from '../../../../../lib/constants';
import { uniqueId } from '../../../../../lib/helpers';
import { useOwnerContext } from '@/lib/ownerContext';

export default function SupplierRepositoryPage() {
  const { owner, persistOwner } = useOwnerContext();
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [addedIds, setAddedIds] = useState([]);

  const brands = [...new Set(GLOBAL_EQUIPMENT_DATABASE.map((i) => i.brand))];
  const brandItems = selectedBrand ? GLOBAL_EQUIPMENT_DATABASE.filter((i) => i.brand === selectedBrand) : [];

  const addToInventory = async (item) => {
    const newEq = { ...item, id: uniqueId('e_') };
    await persistOwner({ ...owner, equipment: [newEq, ...(owner.equipment || [])] });
    setAddedIds((ids) => [...ids, item.id]);
  };

  if (!selectedBrand) {
    return (
      <div>
        <h1 className="text-4xl font-black mb-2">Supplier Catalog</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">Browse real commercial equipment from major manufacturers — add it with a click, or drag a card straight onto your <a href="/owner/inventory" className="text-brand-text dark:text-blue-400 hover:underline">Inventory page</a>.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => {
            const count = GLOBAL_EQUIPMENT_DATABASE.filter((i) => i.brand === brand).length;
            const site = BRAND_WEBSITES[brand];
            return (
              <div key={brand} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:shadow-md transition">
                <button onClick={() => setSelectedBrand(brand)} className="text-left w-full">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-lg text-gray-900 dark:text-gray-100">{brand}</span>
                    <span className="bg-brand/10 text-brand-text dark:text-blue-400 text-xs font-bold px-2 py-1 rounded shrink-0">{count} items</span>
                  </div>
                  <span className="text-brand-text dark:text-blue-400 text-sm font-semibold">Browse in portal →</span>
                </button>
                {site && (
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-3 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-brand-text dark:hover:text-blue-400 transition"
                  >
                    🌐 Visit website ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setSelectedBrand(null)} className="text-brand-text dark:text-blue-400 hover:underline text-sm font-semibold mb-4 block">
        ← All brands
      </button>
      <div className="flex justify-between items-start mb-8 flex-wrap gap-2">
        <div>
          <h1 className="text-4xl font-black mb-2">{selectedBrand}</h1>
          <p className="text-gray-600 dark:text-gray-400">{brandItems.length} items</p>
        </div>
        {BRAND_WEBSITES[selectedBrand] && (
          <a
            href={BRAND_WEBSITES[selectedBrand].url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            🌐 {BRAND_WEBSITES[selectedBrand].label} ↗
          </a>
        )}
      </div>

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {brandItems.map((item) => {
          const added = addedIds.includes(item.id);
          return (
            <li
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-igym-equipment', JSON.stringify(item));
                e.dataTransfer.setData('text/plain', item.name);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-md transition"
              title="Drag onto the Inventory page to add"
            >
              {item.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.name} className="w-full h-36 object-cover bg-gray-50 dark:bg-gray-800 pointer-events-none" />
              )}
              <div className="p-4">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{item.name}</div>
                  <span className="bg-brand/10 text-brand-text dark:text-blue-400 text-xs font-bold px-2 py-0.5 rounded shrink-0">{item.category}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Target: {item.targetArea}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">⠿ Drag onto Inventory, or</div>
                <button
                  onClick={() => addToInventory(item)}
                  disabled={added}
                  className="w-full bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white text-sm font-semibold py-2 rounded-lg transition"
                >
                  {added ? '✓ Added' : '+ Add to inventory'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
