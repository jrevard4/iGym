import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">🏋️‍♂️</div>
      <h1 className="text-3xl font-black mb-2">Page not found</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        We couldn&apos;t find what you were looking for. It may have moved, or the link might be off.
      </p>
      <Link
        href="/gyms"
        className="inline-block bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-3 rounded-lg transition"
      >
        Find a Gym
      </Link>
    </div>
  );
}
