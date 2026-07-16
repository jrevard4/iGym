'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { loadGyms, incrementMatchImpressions, upsertUser } from '../../../lib/supabase';
import { getDistanceMiles, getAvgRating, isOpenNow, runLocalMatch } from '../../../lib/helpers';
import { CLASS_TYPES, EQUIP_CATEGORIES, AMENITIES, DEFAULT_LOCATION } from '../../../lib/constants';
import { getSession, setSession } from '@/lib/auth';
import { useT } from '@/lib/PreferencesContext';
import GymCard from '@/components/GymCard';

// Leaflet touches `window` at import time — must be client-only, no SSR.
const GymMap = dynamic(() => import('@/components/GymMap'), { ssr: false });

export default function GymsListPage() {
  const t = useT();
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Filters
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [equipCategory, setEquipCategory] = useState('All');
  const [targetMuscle, setTargetMuscle] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [sortBy, setSortBy] = useState('DISTANCE');
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [viewMode, setViewMode] = useState('LIST');

  // AI matchmaker
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiMatches, setAiMatches] = useState(null); // null = no AI search active yet
  const [lastSearchTurn, setLastSearchTurn] = useState(null); // { prompt, summary } — for refinement
  const [recentSearches, setRecentSearches] = useState([]);

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
    setRecentSearches(getSession()?.savedSearches || []);
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
      if (minPrice && g.monthlyPrice < Number(minPrice)) return false;
      if (maxPrice && g.monthlyPrice > Number(maxPrice)) return false;
      if (openNowOnly && isOpenNow(g) === false) return false;
      if (selectedAmenities.length > 0 && !selectedAmenities.every((a) => (g.amenities || []).includes(a))) return false;
      if (equipCategory !== 'All' || targetMuscle) {
        const hasMatch = (g.equipment || []).some((eq) => {
          if (equipCategory !== 'All' && eq.category !== equipCategory) return false;
          if (targetMuscle && !(eq.targetArea || '').toLowerCase().includes(targetMuscle.toLowerCase())) return false;
          return true;
        });
        if (!hasMatch) return false;
      }
      if (aiMatches && !aiMatches[g.id]) return false;
      return true;
    });

    list = list.sort((a, b) => {
      if (aiMatches) return (aiMatches[b.id]?.score || 0) - (aiMatches[a.id]?.score || 0);
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
  }, [gyms, query, classFilter, equipCategory, targetMuscle, minPrice, maxPrice, openNowOnly, selectedAmenities, sortBy, userLoc, aiMatches]);

  const toggleAmenity = (a) => {
    setSelectedAmenities((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  };

  const saveRecentSearch = (prompt) => {
    const session = getSession();
    if (!session) return; // recent-search history is a logged-in perk, same as mobile
    const updated = [prompt, ...(session.savedSearches || []).filter((s) => s.toLowerCase() !== prompt.toLowerCase())].slice(0, 5);
    setRecentSearches(updated);
    const nextSession = { ...session, savedSearches: updated };
    setSession(nextSession);
    upsertUser(nextSession);
  };

  // isRefine carries the previous search's context forward (via lastSearchTurn)
  // instead of resetting — powers the "Refine" suggestion chips.
  const runAISearch = async (promptOverride, isRefine = false) => {
    const prompt = (promptOverride ?? aiPrompt).trim();
    if (!prompt) return;
    setAiPrompt(prompt);
    setIsAiSearching(true);
    setAiError('');
    if (!isRefine) { setAiSummary(''); setAiSuggestions([]); setLastSearchTurn(null); }
    try {
      const res = await fetch('/api/matchmaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, gyms, previousTurn: isRefine ? lastSearchTurn : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI search failed.');
      const matchMap = {};
      (data.matches || []).forEach((m) => {
        matchMap[m.gymId] = { score: m.score, reason: m.reason, highlights: m.highlights || [] };
      });
      setAiMatches(matchMap);
      setAiSummary(data.summary || '');
      setAiSuggestions(data.suggestions || []);
      setLastSearchTurn({ prompt, summary: data.summary || '' });
    } catch (err) {
      setAiError(`${err.message} Showing local results instead.`);
      setAiMatches(runLocalMatch(prompt, gyms));
      setLastSearchTurn({ prompt, summary: '' });
    } finally {
      setIsAiSearching(false);
      saveRecentSearch(prompt);
    }
  };

  // Fire-and-forget: log which gyms surfaced in this AI search as a search-interest signal.
  useEffect(() => {
    if (!aiMatches) return;
    Object.keys(aiMatches).forEach((gymId) => incrementMatchImpressions(gymId));
  }, [aiMatches]);

  const clearAISearch = () => {
    setAiMatches(null);
    setAiPrompt('');
    setAiSummary('');
    setAiSuggestions([]);
    setAiError('');
    setLastSearchTurn(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-black mb-2">{t('findGymTitle')}</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        {loading ? 'Loading...' : `${filtered.length} ${filtered.length === 1 ? t('gymFound') : t('gymsFound')}`}
      </p>

      {/* ── AI matchmaker ────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-violet-600 to-brand rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-white">
          <span className="text-xl" aria-hidden="true">✨</span>
          <h2 className="font-bold">{t('aiMatchmakerTitle')}</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runAISearch()}
            placeholder={t('aiMatchmakerPlaceholder')}
            aria-label={t('aiMatchmakerTitle')}
            className="flex-1 px-4 py-3 rounded-lg border-0 outline-none focus:ring-2 focus:ring-white/50"
          />
          <button
            onClick={() => runAISearch()}
            disabled={isAiSearching || !aiPrompt.trim()}
            className="bg-white text-brand-text font-bold px-6 py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-60 shrink-0"
          >
            {isAiSearching ? t('searching') : t('findMyGym')}
          </button>
          {aiMatches && (
            <button
              onClick={clearAISearch}
              className="bg-white/15 text-white font-semibold px-4 py-3 rounded-lg hover:bg-white/25 transition shrink-0"
            >
              {t('clear')}
            </button>
          )}
        </div>
        {aiError && <p className="text-white/90 text-sm mt-2">{aiError}</p>}
        {aiSummary && <p className="text-white text-sm mt-3 font-medium">{aiSummary}</p>}
        {aiSuggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-white/70 text-xs font-semibold uppercase mb-2">🔄 Refine</p>
            <div className="flex flex-wrap gap-2">
              {aiSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => runAISearch(s, true)}
                  disabled={isAiSearching}
                  className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {!aiMatches && recentSearches.length > 0 && (
          <div className="mt-3">
            <p className="text-white/70 text-xs font-semibold uppercase mb-2">Recent searches</p>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((s) => (
                <button
                  key={s}
                  onClick={() => runAISearch(s, false)}
                  disabled={isAiSearching}
                  className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 mb-8 sticky top-[73px] z-30 shadow-sm">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg mb-4 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
        />

        <div className="grid sm:grid-cols-4 gap-3 mb-3">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label={t('allClasses')}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg bg-white"
          >
            <option value="All">{t('allClasses')}</option>
            {CLASS_TYPES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input
            type="number"
            placeholder={t('minMonthly')}
            aria-label={t('minMonthly')}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg"
          />
          <input
            type="number"
            placeholder={t('maxMonthly')}
            aria-label={t('maxMonthly')}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort by"
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg bg-white"
          >
            <option value="DISTANCE">📍 {t('nearestFirst')}</option>
            <option value="RATING">⭐ {t('topRated')}</option>
            <option value="PRICE">💲 {t('cheapestFirst')}</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by amenities">
          {AMENITIES.map((a) => {
            const active = selectedAmenities.includes(a);
            return (
              <button
                type="button"
                key={a}
                onClick={() => toggleAmenity(a)}
                aria-pressed={active}
                className={'px-3 py-1.5 rounded-full text-xs font-semibold transition ' + (active ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')}
              >
                {a}
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select
            value={equipCategory}
            onChange={(e) => setEquipCategory(e.target.value)}
            aria-label="Filter by equipment category"
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg bg-white"
          >
            <option value="All">Any equipment category</option>
            {EQUIP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input
            type="text"
            placeholder="Target muscle (e.g. Chest, Quads)"
            aria-label="Filter by target muscle"
            value={targetMuscle}
            onChange={(e) => setTargetMuscle(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={openNowOnly}
            onChange={(e) => setOpenNowOnly(e.target.checked)}
            className="w-4 h-4 accent-brand"
          />
          {t('openNowOnly')}
        </label>
      </div>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {err}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex justify-end gap-2 mb-4" role="group" aria-label="Switch between list and map view">
          <button
            onClick={() => setViewMode('LIST')}
            aria-pressed={viewMode === 'LIST'}
            className={'px-3 py-1.5 rounded-lg text-sm font-semibold transition ' + (viewMode === 'LIST' ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')}
          >
            ☰ {t('list')}
          </button>
          <button
            onClick={() => setViewMode('MAP')}
            aria-pressed={viewMode === 'MAP'}
            className={'px-3 py-1.5 rounded-lg text-sm font-semibold transition ' + (viewMode === 'MAP' ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')}
          >
            🗺️ {t('map')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mb-4" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">🔍</div>
          <h2 className="text-xl font-bold mb-2">{t('noGymsMatch')}</h2>
          <p className="text-gray-600 dark:text-gray-400">{t('tryWidening')}</p>
        </div>
      ) : viewMode === 'MAP' ? (
        <GymMap gyms={filtered} userLoc={userLoc} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((gym) => (
            <GymCard
              key={gym.id}
              gym={gym}
              distanceMi={getDistanceMiles(userLoc.latitude, userLoc.longitude, gym.lat, gym.lon)}
              match={aiMatches?.[gym.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
