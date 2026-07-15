'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
      <h1 className="text-3xl font-black mb-2">Something went wrong</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        An unexpected error occurred. Try again, or head back to safety.
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={reset}
          className="bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          Try again
        </button>
        <Link
          href="/gyms"
          className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold px-6 py-3 rounded-lg transition"
        >
          Find a Gym
        </Link>
      </div>
    </div>
  );
}
