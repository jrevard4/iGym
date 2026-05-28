import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative">
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.55)), url('https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=2070')",
          }}
        />
        <div className="max-w-6xl mx-auto px-6 py-32 sm:py-44 text-white">
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-tight">
            Finding the right gym,
            <br />
            <span className="text-brand">for you.</span>
          </h1>
          <p className="mt-6 text-xl text-gray-200 max-w-xl">
            Compare local gyms by equipment, price, classes, and reviews. Buy a day-pass in 30 seconds and check in by QR.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/gyms"
              className="bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-3.5 rounded-xl text-lg transition shadow-lg shadow-brand/30"
            >
              Find a Gym Near You →
            </Link>
            <Link
              href="/register"
              className="bg-white/15 backdrop-blur hover:bg-white/25 text-white font-semibold px-6 py-3.5 rounded-xl text-lg transition"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Value props ────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl sm:text-4xl font-black text-center mb-3">
          Built for people who actually train.
        </h2>
        <p className="text-center text-gray-600 max-w-2xl mx-auto mb-14">
          No long contracts, no guesswork. See exactly what equipment each gym has before you walk in.
        </p>

        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: '🔍',
              title: 'Equipment-level search',
              desc: 'Filter by squat racks, cable machines, Echo bikes — find a gym that has the gear you actually need.',
            },
            {
              icon: '🎟️',
              title: 'Day-passes & punch cards',
              desc: 'Try a gym for a day, week, or buy a 10-class pack. No membership lock-in.',
            },
            {
              icon: '✨',
              title: 'AI Matchmaker',
              desc: 'Tell us your goal — "build legs for sprinting" — and Claude finds the best fit nearby.',
            },
          ].map((v) => (
            <div
              key={v.title}
              className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition"
            >
              <div className="text-4xl mb-3">{v.icon}</div>
              <h3 className="font-bold text-lg mb-2">{v.title}</h3>
              <p className="text-gray-600 leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Call to action ─────────────────────────────────────────────────── */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Ready to train somewhere new?</h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto">
            10+ gyms near Westerville, OH already on iGym — with 250+ pieces of equipment catalogued.
          </p>
          <Link
            href="/gyms"
            className="inline-block bg-brand hover:bg-brand-dark font-semibold px-8 py-4 rounded-xl text-lg transition"
          >
            Browse Gyms
          </Link>
        </div>
      </section>
    </>
  );
}
