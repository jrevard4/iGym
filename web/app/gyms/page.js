'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadGyms } from '../../../lib/supabase';
import { getDistanceMiles, getAvgRating, isOpenNow } from '../../../lib/helpers';
import { CLASS_TYPES, DEFAULT_LOCATION } from '../../../lib/constants';
import GymCard from '@/components/GymCard';

export default function GymsListPage() {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Filters
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [maxPrice, setMaxPrice] = useState('');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [sortBy, setSortBy] = useState('DISTANCE');

  // Location (uses browser geo if available, falls back to DEFAULT_LOCATION)
  const [userLoc, setUserLoc] = useState(DEFAULT_LOCATION);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => { /* user denied — stick with default */ },
        { timeout: 4000 }
      );
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await loadGyms();
        setGyms(data);
      } catch (e) {
        setErr(e.message || 'Could not load gyms.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = gyms.filter((g) => {
      if (!g.lat || !g.lon) return false;
      if (q) {
        const text = `${g.gymName} ${g.location} ${g.description || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (classFilter !== 'All' && !(g.classes || []).includes(classFilter)) return false;
      if (maxPrice && g.monthlyPrice > Number(maxPrice)) return false;
      if (openNowOnly && isOpenNow(g) === false) return false;
      return true;
    });

    list = list.sort((a, b) => {
      // Featured always first when sorting by distance
      if (sortBy === 'DISTANCE') {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return (
          getDistanceMiles(userLoc.latitude, userLoc.longitude, a.lat, a.lon) -
          getDistanceMiles(userLoc.latitude, userLoc.longitude, b.lat, b.lon)
        );
      }
      if (sortBy === 'RATING') return getAvgRating(b.gymReviews) - getAvgRating(a.gymReviews);
      if (sortBy === 'PRICE') return (a.monthlyPrice || 0) - (b.monthlyPrice || 0);
      return 0;
    });

    return list;
  }, [gyms, query, classFilter, maxPrice, openNowOnly, sortBy, userLoc]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-black mb-2">Find a Gym</h1>
      <p className="text-gray-600 mb-8">
        {loading ? 'Loading...' : `${filtered.length} ${filtered.length === 1 ? 'gym' : 'gyms'} found near you`}
      </p>

      {/* ── Filter bar ────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-8 sticky top-[73px] z-30 shadow-sm">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, location, or description..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
        />

        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white"
          >
            <option value="All">All classes</option>
            {CLASS_TYPES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input
            type="number"
            placeholder="Max monthly $"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white"
          >
            <option value="DISTANCE">📍 Nearest first</option>
            <option value="RATING">⭐ Top rated</option>
            <option value="PRICE">💲 Cheapest first</option>
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={openNowOnly}
            onChange={(e) => setOpenNowOnly(e.target.checked)}
            className="w-4 h-4 accent-brand"
          />
          Show only gyms open right now
        </label>
      </div>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {err}
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-xl font-bold mb-2">No gyms match your filters</h2>
          <p className="text-gray-600">Try widening your search or clearing a filter.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((gym) => (
            <GymCard
              key={gym.id}
              gym={gym}
              distanceMi={getDistanceMiles(userLoc.latitude, userLoc.longitude, gym.lat, gym.lon)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
